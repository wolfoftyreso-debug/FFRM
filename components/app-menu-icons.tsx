import type { ReactNode } from "react";
import {
  Activity,
  Bell,
  Bot,
  CalendarDays,
  CalendarPlus,
  ContactRound,
  Headset,
  ListChecks,
  Megaphone,
  MessageCircle,
  Phone,
  PhoneMissed,
  Plug,
  Quote,
  Radar,
  Settings,
  SquarePen,
  Stethoscope,
  UserRoundPen,
  UserPlus,
  Users,
  Voicemail,
  Workflow,
} from "lucide-react";
import type { AppMenuIcon } from "@/lib/app-menu";

const ICONS: Record<AppMenuIcon, ReactNode> = {
  phone: <Phone className="h-4 w-4" />,
  missed: <PhoneMissed className="h-4 w-4" />,
  voicemail: <Voicemail className="h-4 w-4" />,
  callback: <Phone className="h-4 w-4" />,
  message: <MessageCircle className="h-4 w-4" />,
  compose: <SquarePen className="h-4 w-4" />,
  broadcast: <Megaphone className="h-4 w-4" />,
  needsYou: <MessageCircle className="h-4 w-4" />,
  unread: <MessageCircle className="h-4 w-4" />,
  contacts: <Users className="h-4 w-4" />,
  addContact: <UserPlus className="h-4 w-4" />,
  share: <ContactRound className="h-4 w-4" />,
  editProfile: <UserRoundPen className="h-4 w-4" />,
  apollo: <Radar className="h-4 w-4" />,
  calendar: <CalendarDays className="h-4 w-4" />,
  newEvent: <CalendarPlus className="h-4 w-4" />,
  tasks: <ListChecks className="h-4 w-4" />,
  automations: <Workflow className="h-4 w-4" />,
  quotes: <Quote className="h-4 w-4" />,
  notifications: <Bell className="h-4 w-4" />,
  assistant: <Bot className="h-4 w-4" />,
  receptionist: <Headset className="h-4 w-4" />,
  activity: <Activity className="h-4 w-4" />,
  integrations: <Plug className="h-4 w-4" />,
  diagnostics: <Stethoscope className="h-4 w-4" />,
  settings: <Settings className="h-4 w-4" />,
  profile: <Users className="h-4 w-4" />,
};

const TINTS: Record<AppMenuIcon, string> = {
  phone: "bg-emerald-500",
  missed: "bg-red-500",
  voicemail: "bg-amber-500",
  callback: "bg-orange-500",
  message: "bg-[var(--system-blue)]",
  compose: "bg-[var(--system-blue)]",
  broadcast: "bg-violet-500",
  needsYou: "bg-[var(--system-red)]",
  unread: "bg-sky-500",
  contacts: "bg-[var(--system-blue)]",
  addContact: "bg-emerald-500",
  share: "bg-cyan-500",
  editProfile: "bg-[var(--system-blue)]",
  apollo: "bg-indigo-500",
  calendar: "bg-rose-500",
  newEvent: "bg-pink-500",
  tasks: "bg-amber-500",
  automations: "bg-fuchsia-500",
  quotes: "bg-violet-500",
  notifications: "bg-red-500",
  assistant: "bg-[var(--system-blue)]",
  receptionist: "bg-teal-500",
  activity: "bg-stone-500",
  integrations: "bg-indigo-500",
  diagnostics: "bg-stone-600",
  settings: "bg-stone-500",
  profile: "bg-[var(--system-blue)]",
};

export function AppMenuIconBadge({
  name,
  className = "h-8 w-8",
}: {
  name: AppMenuIcon;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg text-white ${TINTS[name]} ${className}`}
    >
      {ICONS[name]}
    </span>
  );
}

export function AppMenuGlyph({ name }: { name: AppMenuIcon }) {
  return ICONS[name];
}
