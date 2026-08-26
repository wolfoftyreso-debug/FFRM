import Link from "next/link";
import { Bell } from "lucide-react";

export function NotificationBell({ count }: { count: number }) {
  return (
    <Link
      href="/notifications"
      aria-label={
        count > 0 ? `${count} notifications` : "Notification center"
      }
      className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-sm"
    >
      <Bell className="h-5 w-5" />
      {count > 0 ? (
        <span className="absolute right-1 top-1 min-w-4 rounded-full bg-[var(--system-red)] px-1 text-center text-[10px] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
