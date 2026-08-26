import Link from "next/link";
import {
  CalendarDays,
  ListChecks,
  MessageCircle,
  MessagesSquare,
  Phone,
  Settings,
  Users,
  Zap,
} from "lucide-react";
import { getPendingEscalationCount } from "@/lib/queries";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/phone", label: "Phone", icon: Phone },
  { href: "/messages", label: "Messages", icon: MessagesSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/people", label: "People", icon: Users },
  { href: "/automations", label: "Automations", icon: Zap },
  { href: "/activity", label: "Activity", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let escalations = 0;
  try {
    escalations = await getPendingEscalationCount();
  } catch {
    // Database may be unavailable during first-time setup; render anyway.
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-52 shrink-0 border-r border-stone-200 bg-white md:block">
        <div className="sticky top-0 p-4">
          <Link href="/" className="block px-2 py-1 text-sm font-semibold">
            Personal Phone
          </Link>
          <nav className="mt-4 space-y-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.href === "/messages" && escalations > 0 ? (
                  <span className="ml-auto rounded-full bg-red-100 px-1.5 text-[11px] font-semibold text-red-700">
                    {escalations}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-16 md:pb-0">
        <main className="mx-auto max-w-5xl px-4 py-6 md:px-8">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-stone-200 bg-white py-1.5 md:hidden">
        {nav.slice(0, 6).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="relative flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] text-stone-500"
          >
            <item.icon className="h-5 w-5" />
            {item.label}
            {item.href === "/messages" && escalations > 0 ? (
              <span className="absolute -top-0.5 right-0 h-2 w-2 rounded-full bg-red-500" />
            ) : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}
