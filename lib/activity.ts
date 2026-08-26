import { getDb } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";

export type Actor =
  | "USER"
  | "AI"
  | "SYSTEM"
  | "46ELKS"
  | "TWILIO"
  | "AUTOMATION";

export interface LogActivityInput {
  actor: Actor;
  action: string;
  summary: string;
  contactId?: string | null;
  conversationId?: string | null;
  entityType?: string;
  entityId?: string;
  detail?: unknown;
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  const db = await getDb();
  await db.insert(activityLog).values({
    actor: input.actor,
    action: input.action,
    summary: input.summary,
    contactId: input.contactId ?? null,
    conversationId: input.conversationId ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    detail: input.detail ?? null,
  });
}
