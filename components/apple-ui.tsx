import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-rose-500",
];

export function ContactAvatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const color =
    AVATAR_COLORS[
      [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) %
        AVATAR_COLORS.length
    ];
  const sizes = {
    sm: "h-8 w-8 text-xs",
    md: "h-11 w-11 text-sm",
    lg: "h-16 w-16 text-lg",
    xl: "h-24 w-24 text-3xl",
  };
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-sm ${color} ${sizes[size]}`}
    >
      {initials || "?"}
    </span>
  );
}

export function InsetSection({
  title,
  footer,
  children,
  className = "",
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {title ? (
        <h2 className="mb-1.5 px-4 text-[13px] font-normal uppercase tracking-wide text-[var(--secondary-label)]">
          {title}
        </h2>
      ) : null}
      <div className="ios-inset-group">{children}</div>
      {footer ? (
        <p className="mt-1.5 px-4 text-xs leading-relaxed text-[var(--secondary-label)]">
          {footer}
        </p>
      ) : null}
    </section>
  );
}

export function AppleRow({
  title,
  subtitle,
  leading,
  trailing,
  href,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  href?: string;
}) {
  const content = (
    <div className="ios-hairline flex min-h-14 items-center gap-3 px-4 py-2.5">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[17px] leading-tight">{title}</div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-[14px] text-[var(--secondary-label)]">
            {subtitle}
          </div>
        ) : null}
      </div>
      {trailing}
      {href ? <ChevronRight className="h-4 w-4 text-[var(--system-gray)]" /> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:bg-black/[0.035] active:bg-black/[0.07]">
      {content}
    </Link>
  ) : (
    content
  );
}

export function SegmentedLinks({
  items,
  active,
}: {
  items: { id: string; label: string; href: string }[];
  active: string;
}) {
  return (
    <div className="flex rounded-lg bg-black/[0.06] p-0.5" role="tablist">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          role="tab"
          aria-selected={active === item.id}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-md px-2 text-[13px] font-medium transition ${
            active === item.id
              ? "bg-white text-black shadow-sm"
              : "text-[var(--secondary-label)]"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export function AppleAction({
  href,
  icon,
  label,
}: {
  href?: string;
  icon: ReactNode;
  label: string;
}) {
  const content = (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--system-blue)] text-white">
        {icon}
      </span>
      <span className="text-xs font-medium text-[var(--system-blue)]">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className="flex min-w-16 flex-col items-center gap-1.5">
      {content}
    </Link>
  ) : (
    <span className="flex min-w-16 flex-col items-center gap-1.5">{content}</span>
  );
}
