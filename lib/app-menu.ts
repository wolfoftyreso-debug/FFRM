export type AppMenuBadge = "messages" | "phone" | "notifications" | null;

export interface AppMenuItem {
  href: string;
  label: string;
  icon: AppMenuIcon;
  subtitle?: string;
  badge?: AppMenuBadge;
}

export type AppMenuIcon =
  | "phone"
  | "missed"
  | "voicemail"
  | "callback"
  | "message"
  | "compose"
  | "broadcast"
  | "needsYou"
  | "unread"
  | "contacts"
  | "addContact"
  | "share"
  | "editProfile"
  | "apollo"
  | "calendar"
  | "newEvent"
  | "tasks"
  | "automations"
  | "quotes"
  | "notifications"
  | "assistant"
  | "receptionist"
  | "activity"
  | "integrations"
  | "diagnostics"
  | "settings"
  | "profile";

export interface AppMenuGroup {
  id: string;
  title: string;
  items: AppMenuItem[];
}

export const PRIMARY_TABS = [
  { href: "/phone", label: "Phone", icon: "phone" as const, badge: "phone" as const },
  {
    href: "/messages",
    label: "Messages",
    icon: "message" as const,
    badge: "messages" as const,
  },
  { href: "/people", label: "Contacts", icon: "contacts" as const, badge: null },
];

export const APP_MENU_GROUPS: AppMenuGroup[] = [
  {
    id: "communicate",
    title: "Kommunikation",
    items: [
      { href: "/messages/new", label: "Nytt meddelande", icon: "compose" },
      {
        href: "/messages/broadcast",
        label: "Massmeddelande",
        icon: "broadcast",
        subtitle: "Skicka till många",
      },
      {
        href: "/messages?view=needs-you",
        label: "Behöver dig",
        icon: "needsYou",
        badge: "messages",
      },
      { href: "/messages?view=unread", label: "Olästa", icon: "unread" },
      { href: "/phone?view=missed", label: "Missade samtal", icon: "missed" },
      { href: "/phone?view=voicemail", label: "Röstbrevlåda", icon: "voicemail" },
      {
        href: "/phone?view=callback",
        label: "Återuppringning",
        icon: "callback",
        badge: "phone",
      },
    ],
  },
  {
    id: "people",
    title: "Personer",
    items: [
      { href: "/people/new", label: "Ny kontakt", icon: "addContact" },
      {
        href: "/settings?section=profile",
        label: "Min kontakt",
        icon: "editProfile",
        subtitle: "Foto, logga, uppgifter",
      },
      {
        href: "/me/share",
        label: "Dela min kontakt",
        icon: "share",
        subtitle: "QR, vCard, SMS, mail",
      },
      {
        href: "/apollo",
        label: "Apollo",
        icon: "apollo",
        subtitle: "Målgrupp och geografi",
      },
    ],
  },
  {
    id: "work",
    title: "Planering",
    items: [
      { href: "/calendar", label: "Calendar", icon: "calendar" },
      { href: "/calendar/new", label: "Ny aktivitet", icon: "newEvent" },
      { href: "/tasks", label: "Tickets", icon: "tasks" },
      {
        href: "/automations",
        label: "Automations",
        icon: "automations",
        subtitle: "Regler som körs åt dig",
      },
      { href: "/review", label: "Quotes", icon: "quotes" },
      {
        href: "/notifications",
        label: "Notiser",
        icon: "notifications",
        badge: "notifications",
      },
    ],
  },
  {
    id: "system",
    title: "AI och system",
    items: [
      { href: "/chat", label: "Assistant", icon: "assistant" },
      {
        href: "/settings?section=calls",
        label: "AI-växel",
        icon: "receptionist",
        subtitle: "Grind, ajour, callbacks",
      },
      { href: "/activity", label: "Activity", icon: "activity" },
      {
        href: "/settings?section=integrations",
        label: "Integrationer",
        icon: "integrations",
        subtitle: "46elks, Twilio, Apollo",
      },
      {
        href: "/settings?section=diagnostics",
        label: "Diagnostik",
        icon: "diagnostics",
      },
      { href: "/settings", label: "Settings", icon: "settings" },
    ],
  },
];

export function allMenuItems(): AppMenuItem[] {
  return APP_MENU_GROUPS.flatMap((group) => group.items);
}

export function isPrimaryPath(pathname: string): boolean {
  return PRIMARY_TABS.some(
    (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`),
  );
}

export function isMorePath(pathname: string): boolean {
  if (pathname === "/more") return true;
  if (isPrimaryPath(pathname)) return false;
  return allMenuItems().some((item) => {
    const path = item.href.split("?")[0];
    return pathname === path || pathname.startsWith(`${path}/`);
  });
}

export function menuItemIsActive(
  href: string,
  pathname: string,
  search: string,
): boolean {
  const [path, query] = href.split("?");
  const params = new URLSearchParams(search);
  if (query) {
    const wanted = new URLSearchParams(query);
    return (
      pathname === path &&
      [...wanted.entries()].every(([key, value]) => params.get(key) === value)
    );
  }
  if (path === "/settings") {
    return pathname === "/settings" && !params.get("section");
  }
  if (path === "/phone" || path === "/messages" || path === "/people") {
    return pathname === path && !search;
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}
