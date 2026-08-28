"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Ellipsis } from "lucide-react";
import {
  APP_MENU_GROUPS,
  PRIMARY_TABS,
  isMorePath,
  menuItemIsActive,
  type AppMenuBadge,
  type AppMenuIcon,
} from "@/lib/app-menu";
import { AppMenuGlyph, AppMenuIconBadge } from "@/components/app-menu-icons";
import { ContactAvatar } from "@/components/apple-ui";
import { TERMS } from "@/lib/terminology";

function tabIcon(name: AppMenuIcon, selected: boolean) {
  return (
    <span className={selected ? "text-[var(--system-blue)]" : ""}>
      <AppMenuGlyph name={name} />
    </span>
  );
}

export function AppNavigation({
  messageBadge,
  phoneBadge,
  notificationCount,
  ownerName,
  ownerPhotoUrl,
}: {
  messageBadge: number;
  phoneBadge: number;
  notificationCount: number;
  ownerName: string;
  ownerPhotoUrl: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const badgeFor = (type: AppMenuBadge) => {
    if (type === "phone") return phoneBadge;
    if (type === "messages") return messageBadge;
    if (type === "notifications") return notificationCount;
    return 0;
  };

  return (
    <>
      <aside className="hidden w-72 shrink-0 border-r border-black/10 bg-white/90 backdrop-blur-xl md:block">
        <div className="sticky top-0 flex max-h-screen flex-col overflow-y-auto p-4">
          <Link href="/messages" className="block px-3 py-3 text-xl font-bold">
            Personal Phone
          </Link>
          <Link
            href="/me/share"
            className="mb-4 flex items-center gap-3 rounded-2xl bg-black/[0.04] px-3 py-3"
          >
            <ContactAvatar name={ownerName} photoUrl={ownerPhotoUrl} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{ownerName}</p>
              <p className="text-[13px] text-[var(--secondary-label)]">
                Dela kontakt · QR
              </p>
            </div>
          </Link>
          <nav aria-label="Huvudnavigering" className="space-y-5">
            <div className="space-y-1">
              {PRIMARY_TABS.map((item) => {
                const selected =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const count = badgeFor(item.badge);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={selected ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition ${
                      selected
                        ? "bg-[var(--system-blue)] text-white"
                        : "text-black hover:bg-black/[0.05]"
                    }`}
                  >
                    <AppMenuGlyph name={item.icon} />
                    {item.label}
                    {count > 0 ? (
                      <span
                        className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                          selected
                            ? "bg-white text-[var(--system-blue)]"
                            : "bg-[var(--system-red)] text-white"
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
            {APP_MENU_GROUPS.map((group) => (
              <div key={group.id}>
                <p className="mb-1.5 px-3 text-[12px] font-medium uppercase tracking-wide text-[var(--secondary-label)]">
                  {group.title}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const selected = menuItemIsActive(item.href, pathname, search);
                    const count = badgeFor(item.badge ?? null);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={selected ? "page" : undefined}
                        className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition ${
                          selected
                            ? "bg-[var(--system-blue)] text-white"
                            : "text-black hover:bg-black/[0.05]"
                        }`}
                      >
                        <AppMenuIconBadge name={item.icon} className="h-7 w-7" />
                        <span className="min-w-0 truncate">{item.label}</span>
                        {count > 0 ? (
                          <span
                            className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                              selected
                                ? "bg-white text-[var(--system-blue)]"
                                : "bg-[var(--system-red)] text-white"
                            }`}
                          >
                            {count}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <nav
        aria-label="Flikfält"
        className="ios-safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-black/10 bg-white/90 px-2 pt-2 backdrop-blur-xl md:hidden"
      >
        {[
          ...PRIMARY_TABS,
          {
            href: "/more",
            label: TERMS.more,
            icon: "settings" as const,
            badge: null,
          },
        ].map((item) => {
          const selected =
            item.href === "/more"
              ? isMorePath(pathname)
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const count = badgeFor(item.badge);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={selected ? "page" : undefined}
              className={`relative flex min-h-28 flex-col items-center justify-center gap-1 text-xl font-medium ${
                selected
                  ? "text-[var(--system-blue)]"
                  : "text-[var(--system-gray)]"
              }`}
            >
              {item.href === "/more" ? (
                <Ellipsis
                  className="h-12 w-12"
                  strokeWidth={selected ? 2.5 : 2}
                />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center [&>svg]:h-12 [&>svg]:w-12">
                  {tabIcon(item.icon, selected)}
                </span>
              )}
              {item.label}
              {count > 0 ? (
                <span className="absolute right-[15%] top-1 rounded-full bg-[var(--system-red)] px-2 py-0.5 text-base font-bold text-white">
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
