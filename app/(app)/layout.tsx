import { Suspense } from "react";
import { getAttentionSummary, getOwner } from "@/lib/queries";
import { getNotificationCount } from "@/lib/review";
import { AppNavigation } from "@/components/app-navigation";
import { NotificationBell } from "@/components/notification-bell";
import { ensureOwner } from "@/lib/auth/owner";
import { ContextBackBar } from "@/components/context-back-bar";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";
import { LiveRefresh } from "@/components/live-refresh";
import { getLiveVersion } from "@/lib/live";
import { photoUrl } from "@/lib/photo-url";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let messageBadge = 0;
  let phoneBadge = 0;
  let notificationCount = 0;
  let ownerName = "Personal Phone";
  let ownerPhotoUrl: string | null = null;
  let liveVersion = "";
  try {
    await ensureOwner();
    const [attention, reviewCount, owner, version] = await Promise.all([
      getAttentionSummary(),
      getNotificationCount(),
      getOwner(),
      getLiveVersion(),
    ]);
    liveVersion = version;
    messageBadge = attention.escalatedCount + attention.draftCount;
    phoneBadge = attention.voicemailNeedsYou;
    notificationCount = reviewCount;
    if (owner?.name) ownerName = owner.name;
    ownerPhotoUrl = photoUrl(
      "/api/profile/photo",
      owner?.photoDataBase64,
      owner?.updatedAt,
    );
  } catch {
    // Database may be unavailable during first-time setup; render anyway.
  }

  return (
    <div className="flex min-h-screen">
      <PresenceHeartbeat />
      <LiveRefresh version={liveVersion} />
      <Suspense fallback={null}>
        <AppNavigation
          messageBadge={messageBadge}
          phoneBadge={phoneBadge}
          notificationCount={notificationCount}
          ownerName={ownerName}
          ownerPhotoUrl={ownerPhotoUrl}
        />
      </Suspense>
      <div className="min-w-0 flex-1 pb-40 md:pb-0">
        <main className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8">
          <div className="mb-2 flex items-start justify-end">
            <NotificationBell count={notificationCount} />
          </div>
          <ContextBackBar />
          {children}
        </main>
      </div>
    </div>
  );
}
