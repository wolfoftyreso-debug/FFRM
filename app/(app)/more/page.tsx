import Link from "next/link";
import { QrCode } from "lucide-react";
import { AppleRow, ContactAvatar, InsetSection } from "@/components/apple-ui";
import { AppMenuIconBadge } from "@/components/app-menu-icons";
import { APP_MENU_GROUPS } from "@/lib/app-menu";
import { getOwner } from "@/lib/queries";
import { getNotificationCount } from "@/lib/review";
import { getAttentionSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "More" };

export default async function MorePage() {
  const [owner, notifications, attention] = await Promise.all([
    getOwner(),
    getNotificationCount(),
    getAttentionSummary(),
  ]);
  const badges = {
    messages: attention.escalated.length + attention.draftCount,
    phone: attention.voicemailNeedsYou,
    notifications,
  };

  return (
    <>
      <h1 className="mb-6 text-[34px] font-bold tracking-tight">More</h1>
      {owner ? (
        <Link
          href="/me/share"
          className="ios-inset-group mb-6 flex items-center gap-3 px-4 py-3"
        >
          <ContactAvatar
            name={owner.name}
            size="lg"
            photoUrl={owner.photoDataBase64 ? "/api/profile/photo" : null}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-semibold">{owner.name}</p>
            <p className="truncate text-[14px] text-[var(--secondary-label)]">
              {[owner.jobTitle, owner.company, owner.phoneNumber]
                .filter(Boolean)
                .join(" · ") || "Dela QR, vCard, SMS och mail"}
            </p>
          </div>
          <QrCode className="h-6 w-6 text-[var(--system-blue)]" />
        </Link>
      ) : null}

      <div className="space-y-6">
        {APP_MENU_GROUPS.map((group) => (
          <InsetSection key={group.id} title={group.title}>
            {group.items.map((item) => {
              const count =
                item.badge === "messages"
                  ? badges.messages
                  : item.badge === "phone"
                    ? badges.phone
                    : item.badge === "notifications"
                      ? badges.notifications
                      : 0;
              return (
                <AppleRow
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  subtitle={item.subtitle}
                  leading={<AppMenuIconBadge name={item.icon} />}
                  trailing={
                    count > 0 ? (
                      <span className="rounded-full bg-[var(--system-red)] px-2 py-0.5 text-[13px] font-semibold text-white">
                        {count}
                      </span>
                    ) : null
                  }
                />
              );
            })}
          </InsetSection>
        ))}
      </div>
    </>
  );
}
