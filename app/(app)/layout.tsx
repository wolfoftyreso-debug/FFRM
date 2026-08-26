import { getAttentionSummary } from "@/lib/queries";
import { getNotificationCount } from "@/lib/review";
import { AppNavigation } from "@/components/app-navigation";
import { NotificationBell } from "@/components/notification-bell";
import { ensureOwner } from "@/lib/auth/owner";
import { ContextBackBar } from "@/components/context-back-bar";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let messageBadge = 0;
  let phoneBadge = 0;
  let notificationCount = 0;
  try {
    await ensureOwner();
    const [attention, reviewCount] = await Promise.all([
      getAttentionSummary(),
      getNotificationCount(),
    ]);
    messageBadge = attention.escalated.length + attention.draftCount;
    phoneBadge = attention.voicemailNeedsYou;
    notificationCount = reviewCount;
  } catch {
    // Database may be unavailable during first-time setup; render anyway.
  }

  return (
    <div className="flex min-h-screen">
      <AppNavigation messageBadge={messageBadge} phoneBadge={phoneBadge} />
      <div className="min-w-0 flex-1 pb-20 md:pb-0">
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
