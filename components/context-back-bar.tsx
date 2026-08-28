"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { TERMS } from "@/lib/terminology";

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
    return { href: "/messages", label: TERMS.messages };
  }
  if (pathname === "/people/new") {
    return { href: "/people", label: TERMS.contacts };
  }
  if (pathname === "/apollo") {
    return { href: "/people", label: TERMS.contacts };
  }
  if (/^\/apollo\/[^/]+$/.test(pathname)) {
    return { href: "/apollo", label: "Apollo" };
  }
  const editContact = pathname.match(/^\/people\/([^/]+)\/edit$/);
  if (editContact) {
    return { href: `/people/${editContact[1]}`, label: TERMS.contact };
  }
  if (/^\/people\/[^/]+$/.test(pathname)) {
    return { href: "/people", label: TERMS.contacts };
  }
  if (/^\/phone\/[^/]+$/.test(pathname)) {
    return { href: "/phone", label: TERMS.phone };
  }
  if (pathname === "/review" || pathname === "/notifications") {
    return { href: "/more", label: TERMS.more, mobileOnly: true };
  }
  if (/^\/review\/[^/]+$/.test(pathname)) {
    return { href: "/review", label: TERMS.insights };
  }
  if (
    pathname === "/calendar/new" ||
    /^\/calendar\/[^/]+$/.test(pathname)
  ) {
    return { href: "/calendar", label: TERMS.calendar };
  }
  if (pathname === "/automations/new") {
    return { href: "/automations", label: TERMS.automations };
  }
  if (/^\/automations\/[^/]+$/.test(pathname)) {
    return { href: "/automations", label: TERMS.automations };
  }
  const secondary: Record<string, string> = {
    "/chat": TERMS.more,
    "/me/share": TERMS.more,
    "/calendar": TERMS.more,
    "/tasks": TERMS.more,
    "/automations": TERMS.more,
    "/activity": TERMS.more,
    "/settings": TERMS.more,
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
        aria-label={`Tillbaka till ${target.label}`}
        className="flex min-h-11 items-center gap-0.5 rounded-xl pr-3 text-[15px] font-medium text-[var(--system-blue)]"
      >
        <ChevronLeft className="h-5 w-5" />
        {target.label}
      </button>
    </div>
  );
}
