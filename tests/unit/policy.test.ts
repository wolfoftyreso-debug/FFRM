import { describe, expect, it } from "vitest";
import { canAutoReply, canSendAutomatically, shouldDraft } from "@/lib/ai/policy";
import type { TriageDecision } from "@/lib/ai/schemas";

const okDecision: TriageDecision = {
  decision: "AUTO_REPLY",
  confidence: 0.95,
  risk: "LOW",
  policyMatch: "SMALL_TALK",
  reason: "Simple social acknowledgement",
  reply: "Tack detsamma! 😊",
  requiresUser: false,
};

describe("canAutoReply", () => {
  it("allows low-risk confident replies at autonomy 4 in AI state", () => {
    const verdict = canAutoReply({
      decision: okDecision,
      contactAutonomyLevel: 4,
      conversationState: "AI",
    });
    expect(verdict.allowed).toBe(true);
  });

  it("blocks when the user has taken over", () => {
    for (const state of ["USER", "PAUSED", "ESCALATED"]) {
      expect(
        canAutoReply({
          decision: okDecision,
          contactAutonomyLevel: 4,
          conversationState: state,
        }).allowed,
      ).toBe(false);
    }
  });

  it("blocks below autonomy level 4", () => {
    for (const level of [0, 1, 2, 3]) {
      expect(
        canAutoReply({
          decision: okDecision,
          contactAutonomyLevel: level,
          conversationState: "AI",
        }).allowed,
      ).toBe(false);
    }
  });

  it("blocks ESCALATE decisions", () => {
    expect(
      canAutoReply({
        decision: { ...okDecision, decision: "ESCALATE", reply: null },
        contactAutonomyLevel: 4,
        conversationState: "AI",
      }).allowed,
    ).toBe(false);
  });

  it("blocks medium/high risk", () => {
    for (const risk of ["MEDIUM", "HIGH"] as const) {
      expect(
        canAutoReply({
          decision: { ...okDecision, risk },
          contactAutonomyLevel: 4,
          conversationState: "AI",
        }).allowed,
      ).toBe(false);
    }
  });

  it("blocks low confidence", () => {
    expect(
      canAutoReply({
        decision: { ...okDecision, confidence: 0.7 },
        contactAutonomyLevel: 4,
        conversationState: "AI",
      }).allowed,
    ).toBe(false);
  });

  it("blocks when requiresUser is set", () => {
    expect(
      canAutoReply({
        decision: { ...okDecision, requiresUser: true },
        contactAutonomyLevel: 4,
        conversationState: "AI",
      }).allowed,
    ).toBe(false);
  });

  it("blocks empty replies", () => {
    expect(
      canAutoReply({
        decision: { ...okDecision, reply: "  " },
        contactAutonomyLevel: 4,
        conversationState: "AI",
      }).allowed,
    ).toBe(false);
  });
});

describe("autonomy helpers", () => {
  it("only level 4 sends automatically", () => {
    expect(canSendAutomatically(4)).toBe(true);
    expect(canSendAutomatically(3)).toBe(false);
  });
  it("levels 2-3 draft", () => {
    expect(shouldDraft(2)).toBe(true);
    expect(shouldDraft(3)).toBe(true);
    expect(shouldDraft(1)).toBe(false);
    expect(shouldDraft(4)).toBe(false);
  });
});
