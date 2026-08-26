import { AppleRow, InsetSection } from "@/components/apple-ui";
import {
  Bot,
  CalendarDays,
  ContactRound,
  ListChecks,
  Quote,
  Settings,
} from "lucide-react";

export const metadata = { title: "More" };
const moreNavigation = [
  { href: "/chat", label: "Assistant", icon: Bot },
  { href: "/me/share", label: "Dela min kontakt", icon: ContactRound },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/tasks", label: "Tickets", icon: ListChecks },
  { href: "/review", label: "Quotes", icon: Quote },
  { href: "/activity", label: "Activity", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function MorePage() {
  return (
    <>
      <h1 className="mb-6 text-[34px] font-bold tracking-tight">More</h1>
      <InsetSection>
        {moreNavigation.map((item) => (
          <AppleRow
            key={item.href}
            href={item.href}
            title={item.label}
            leading={
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--system-blue)] text-white">
                <item.icon className="h-4 w-4" />
              </span>
            }
          />
        ))}
      </InsetSection>
    </>
  );
}
