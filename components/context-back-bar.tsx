"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

type BackTarget = {
  href: string;
  label: string;
  mobileOnly?: boolean;
};

function targetFor(pathname: string): BackTarget | null {
  if (
    pathname === "/messages/new" ||
    pathname === "/messages/broadcast" ||
    /^\/messages\/broadcast\//.test(pathname) ||
    /^\/messages\/[^/]+$/.test(pathname)
  ) {
    return { href: "/messages", label: "Messages" };
  }
  if (pathname === "/people/new") {
    return { href: "/people", label: "Contacts" };
  }
  const editContact = pathname.match(/^\/people\/([^/]+)\/edit$/);
  if (editContact) {
    return { href: `/people/${editContact[1]}`, label: "Contact" };
  }
  if (/^\/people\/[^/]+$/.test(pathname)) {
    return { href: "/people", label: "Contacts" };
  }
  if (/^\/phone\/[^/]+$/.test(pathname)) {
    return { href: "/phone", label: "Phone" };
  }
  if (pathname === "/review" || pathname === "/notifications") {
    return { href: "/more", label: "More", mobileOnly: true };
  }
  if (/^\/review\/[^/]+$/.test(pathname)) {
    return { href: "/review", label: "Quotes" };
  }
  if (pathname === "/automations/new") {
    return { href: "/automations", label: "Automations" };
  }
  if (/^\/automations\/[^/]+$/.test(pathname)) {
    return { href: "/automations", label: "Automations" };
  }
  const secondary: Record<string, string> = {
    "/chat": "More",
    "/me/share": "More",
    "/calendar": "More",
    "/tasks": "More",
    "/automations": "More",
    "/activity": "More",
    "/settings": "More",
  };
  if (secondary[pathname]) {
    return { href: "/more", label: secondary[pathname], mobileOnly: true };
  }
  return null;
}

/**
 * Universal contextual back navigation.
 * Uses browser history only when the referrer belongs to this app; direct
 * deep-links use a deterministic product fallback and never leave a dead end.
 */
export function ContextBackBar() {
  const pathname = usePathname();
  const router = useRouter();
  const target = targetFor(pathname);
  if (!target) return null;

  function goBack() {
    let sameAppReferrer = false;
    try {
      sameAppReferrer =
        !!document.referrer &&
        new URL(document.referrer).origin === window.location.origin;
    } catch {
      sameAppReferrer = false;
    }
    if (sameAppReferrer) router.back();
    else router.push(target!.href);
  }

  return (
    <div className={`mb-2 ${target.mobileOnly ? "md:hidden" : ""}`}>
      <button
        type="button"
        onClick={goBack}
        aria-label={`Back to ${target.label}`}
        className="flex min-h-11 items-center gap-0.5 rounded-xl pr-3 text-[15px] font-medium text-[var(--system-blue)]"
      >
        <ChevronLeft className="h-5 w-5" />
        {target.label}
      </button>
    </div>
  );
}
