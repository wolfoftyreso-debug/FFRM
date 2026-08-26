"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  CalendarDays,
  ContactRound,
  Ellipsis,
  ListChecks,
  MessageCircle,
  Phone,
  Settings,
  Users,
  Zap,
} from "lucide-react";

const primary = [
  { href: "/phone", label: "Phone", icon: Phone, badge: "phone" as const },
  {
    href: "/messages",
    label: "Messages",
    icon: MessageCircle,
    badge: "messages" as const,
  },
  { href: "/people", label: "Contacts", icon: Users, badge: null },
];
const secondary = [
  { href: "/chat", label: "Assistant", icon: Bot },
  { href: "/me/share", label: "Dela min kontakt", icon: ContactRound },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/tasks", label: "Tickets", icon: ListChecks },
  { href: "/automations", label: "Automations", icon: Zap },
  { href: "/activity", label: "Activity", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings },
];

function active(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNavigation({
  messageBadge,
  phoneBadge,
}: {
  messageBadge: number;
  phoneBadge: number;
}) {
  const pathname = usePathname();
  const badge = (type: "phone" | "messages" | null) =>
    type === "phone" ? phoneBadge : type === "messages" ? messageBadge : 0;

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-black/10 bg-white/90 backdrop-blur-xl md:block">
        <div className="sticky top-0 p-4">
          <Link href="/messages" className="block px-3 py-3 text-xl font-bold">
            Personal Phone
          </Link>
          <nav aria-label="Main navigation" className="mt-3 space-y-1">
            {[...primary, ...secondary].map((item) => {
              const selected = active(pathname, item.href);
              const count =
                "badge" in item
                  ? badge(item.badge as "phone" | "messages" | null)
                  : 0;
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
                  <item.icon className="h-5 w-5" />
                  {item.label}
                  {count > 0 ? (
                    <span
                      className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                        selected ? "bg-white text-[var(--system-blue)]" : "bg-[var(--system-red)] text-white"
                      }`}
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <nav
        aria-label="Tab bar"
        className="ios-safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-black/10 bg-white/90 px-2 pt-2 backdrop-blur-xl md:hidden"
      >
        {[
          ...primary,
          { href: "/more", label: "More", icon: Ellipsis, badge: null },
        ].map((item) => {
          const selected =
            item.href === "/more"
              ? active(pathname, "/more") ||
                secondary.some((s) => active(pathname, s.href))
              : active(pathname, item.href);
          const count =
            "badge" in item
              ? badge(item.badge as "phone" | "messages" | null)
              : 0;
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
              <item.icon className="h-12 w-12" strokeWidth={selected ? 2.5 : 2} />
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

export const moreNavigation = secondary;
