import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";
import { setDbForTests, type Db } from "@/lib/db";
import {
  setMessagingProviderForTests,
  type MessagingProvider,
  type SendSmsInput,
} from "@/lib/sms/provider";
import { setAiForTests } from "@/lib/ai/client";
import type { TriageDecision, Extraction } from "@/lib/ai/schemas";

process.env.DATABASE_URL = "pglite://:memory:";
process.env.APP_PASSWORD = "test-password";
process.env.AUTH_SECRET = "test-secret-test-secret-test";
process.env.ELKS46_USERNAME = "u_test";
process.env.ELKS46_PASSWORD = "p_test";
process.env.ELKS46_FROM_NUMBER = "+46766861234";
process.env.OWNER_PHONE_NUMBER = "+46700000099";
process.env.CRON_SECRET = "cron-test-secret";

export async function createTestDb(): Promise<Db> {
  const client = new PGlite();
  const pgliteDb = drizzle(client, { schema });
  await migrate(pgliteDb, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  const db = pgliteDb as unknown as Db;
  setDbForTests(db);
  return db;
}

export async function seedOwner(db: Db) {
  const [owner] = await db
    .insert(schema.users)
    .values({ name: "Testowner", preferredLanguage: "sv" })
    .returning();
  return owner;
}

export async function seedContact(
  db: Db,
  ownerId: string,
  overrides: Partial<typeof schema.contacts.$inferInsert> = {},
) {
  const [contact] = await db
    .insert(schema.contacts)
    .values({
      userId: ownerId,
      firstName: "Johan",
      lastName: "Testsson",
      phoneNumber: "+46700000001",
      birthday: "1988-03-15",
      relationshipType: "FRIEND",
      importance: "HIGH",
      preferredLanguage: "sv",
      timezone: "Europe/Stockholm",
      autonomyLevel: 4,
      ...overrides,
    })
    .returning();
  return contact;
}

export interface SentSms extends SendSmsInput {
  id: string;
  imageDataUrl?: string;
}

export class MockMessagingProvider implements MessagingProvider {
  readonly name = "46elks";
  sent: SentSms[] = [];
  failNext = false;
  private counter = 0;

  async sendSms(input: SendSmsInput) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("simulated provider failure");
    }
    const id = `sTEST${++this.counter}`;
    this.sent.push({ ...input, id });
    return { providerMessageId: id, status: "created" };
  }

  async sendMms(input: SendSmsInput & { imageDataUrl: string }) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("simulated provider failure");
    }
    const id = `mTEST${++this.counter}`;
    this.sent.push({ ...input, id });
    return { providerMessageId: id, status: "created" };
  }
}

export function installMockProvider(): MockMessagingProvider {
  const provider = new MockMessagingProvider();
  setMessagingProviderForTests(provider);
  return provider;
}

export function uninstallMocks(): void {
  setMessagingProviderForTests(null);
  setAiForTests(null, null);
}

const emptyExtraction: Extraction = { facts: [], commitments: [] };

/** Install a deterministic AI mock. */
export function installMockAi(options: {
  triage?: TriageDecision;
  extraction?: Extraction;
  generatedText?: string;
  failStructured?: boolean;
  imageUnderstanding?: unknown;
  imageCaption?: string;
  styleProfile?: unknown;
}): { structuredCalls: string[]; textCalls: string[] } {
  const structuredCalls: string[] = [];
  const textCalls: string[] = [];

  setAiForTests(
    async <T,>(args: {
      purpose: string;
      model: string;
      schema: { parse: (v: unknown) => T };
    }) => {
      structuredCalls.push(args.purpose);
      if (options.failStructured) throw new Error("simulated AI failure");
      const value = args.purpose.startsWith("triage")
        ? (options.triage ?? defaultEscalate)
        : args.purpose.startsWith("extract")
          ? (options.extraction ?? emptyExtraction)
          : { shouldReachOut: false, reason: "test", suggestion: null };
      return {
        output: args.schema.parse(value),
        usage: {
          model: args.model,
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 5,
        },
      };
    },
    async (args: { purpose: string; model: string }) => {
      textCalls.push(args.purpose);
      return {
        text: options.generatedText ?? "Hej! Hoppas allt är bra med dig!",
        usage: {
          model: args.model,
          inputTokens: 100,
          outputTokens: 30,
          durationMs: 5,
        },
      };
    },
    {
      multimodal: async <T,>(args: {
        purpose: string;
        model: string;
        schema: { parse: (v: unknown) => T };
      }) => {
        structuredCalls.push(args.purpose);
        const value =
          args.purpose === "image-message-draft"
            ? { message: options.imageCaption ?? "Kolla den här 😄" }
            : args.purpose === "style-extraction"
              ? (options.styleProfile ?? {
                  ownerStyle: {
                    language: "sv",
                    formality: 0.1,
                    averageLength: "short",
                    humor: 0.9,
                    sarcasm: 0.5,
                    emojiFrequency: 0.3,
                    emojiTypes: ["😂"],
                    swearing: 0.2,
                    questionStyle: "direct",
                    greetingStyle: "usually_none",
                    signOffStyle: "none",
                    usesNames: false,
                  },
                  contactStyle: {
                    language: "sv",
                    formality: 0.1,
                    averageLength: "short",
                    humor: 0.8,
                    sarcasm: 0.4,
                    emojiFrequency: 0.2,
                    emojiTypes: ["😄"],
                    swearing: 0.1,
                    questionStyle: "direct",
                    greetingStyle: "usually_none",
                    signOffStyle: "none",
                    usesNames: false,
                  },
                  commonTopics: ["cars"],
                  avoidedTopics: [],
                  recurringExpressions: ["haha"],
                  whoUsuallyInitiates: "BALANCED",
                  notes: "Informal and playful",
                })
            : (options.imageUnderstanding ?? {
                observation: {
                  caption: "A red car parked outside a workshop",
                  objects: ["car", "workshop"],
                  visibleText: [],
                  peopleDescription: [],
                  sceneDescription: "Outdoor parking area",
                  safetyClassification: "SAFE",
                },
                contextualInterpretation:
                  "Likely a car the contact is showing the owner",
                confidence: 0.91,
              });
        return {
          output: args.schema.parse(value),
          usage: {
            model: args.model,
            inputTokens: 200,
            outputTokens: 80,
            durationMs: 8,
          },
        };
      },
    },
  );

  return { structuredCalls, textCalls };
}

export const defaultEscalate: TriageDecision = {
  decision: "ESCALATE",
  confidence: 0.97,
  risk: "HIGH",
  policyMatch: "AGREE_SPECIFIC_MEETING",
  reason: "Requires the user's decision",
  reply: null,
  requiresUser: true,
};

export const lowRiskAutoReply: TriageDecision = {
  decision: "AUTO_REPLY",
  confidence: 0.95,
  risk: "LOW",
  policyMatch: "SMALL_TALK",
  reason: "Simple social acknowledgement",
  reply: "Tack, detsamma! 😊",
  requiresUser: false,
};
