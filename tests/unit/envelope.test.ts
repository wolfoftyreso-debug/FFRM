import { describe, expect, it } from "vitest";
import { canAutoReply } from "@/lib/ai/policy";
import { defaultEnvelope, resolveEnvelope } from "@/lib/ai/relationship";
import type { TriageDecision } from "@/lib/ai/schemas";

const base: TriageDecision = {
  decision: "AUTO_REPLY",
  confidence: 0.95,
  risk: "LOW",
  policyMatch: "SMALL_TALK",
  reason: "small talk",
  reply: "Haha ja verkligen 😄",
  requiresUser: false,
};

describe("confidence envelope", () => {
  it("defaults allow social categories only at autonomy 4", () => {
    const e4 = defaultEnvelope(4);
    expect(e4.SMALL_TALK).toBe("AUTO");
    expect(e4.JOKES).toBe("AUTO");
    expect(e4.AGREE_SPECIFIC_MEETING).toBe("ESCALATE");
    expect(e4.MONEY_OR_PAYMENT).toBe("BLOCK");

    const e2 = defaultEnvelope(2);
    expect(e2.SMALL_TALK).toBe("ESCALATE");
  });

  it("explicit configuration overrides defaults", () => {
    const resolved = resolveEnvelope(4, { SMALL_TALK: "ESCALATE" });
    expect(resolved.SMALL_TALK).toBe("ESCALATE");
    expect(resolved.JOKES).toBe("AUTO"); // untouched default
  });

  it("gates auto-replies by category", () => {
    // SMALL_TALK AUTO at autonomy 4 → allowed.
    expect(
      canAutoReply({
        decision: base,
        contactAutonomyLevel: 4,
        conversationState: "AI",
      }).allowed,
    ).toBe(true);

    // Same message classified as a specific meeting agreement → blocked.
    expect(
      canAutoReply({
        decision: { ...base, policyMatch: "AGREE_SPECIFIC_MEETING" },
        contactAutonomyLevel: 4,
        conversationState: "AI",
      }).allowed,
    ).toBe(false);

    // Money is BLOCK by default — never auto.
    expect(
      canAutoReply({
        decision: { ...base, policyMatch: "MONEY_OR_PAYMENT" },
        contactAutonomyLevel: 4,
        conversationState: "AI",
      }).allowed,
    ).toBe(false);

    // Per-contact envelope can revoke a default AUTO.
    expect(
      canAutoReply({
        decision: base,
        contactAutonomyLevel: 4,
        conversationState: "AI",
        envelope: { SMALL_TALK: "ESCALATE" },
      }).allowed,
    ).toBe(false);

    // Per-contact envelope can grant SUGGEST_MEETING.
    expect(
      canAutoReply({
        decision: { ...base, policyMatch: "SUGGEST_MEETING" },
        contactAutonomyLevel: 4,
        conversationState: "AI",
        envelope: { SUGGEST_MEETING: "AUTO" },
      }).allowed,
    ).toBe(true);
  });
});
