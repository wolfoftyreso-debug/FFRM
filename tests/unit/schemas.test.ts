import { describe, expect, it } from "vitest";
import { extractionSchema, triageDecisionSchema } from "@/lib/ai/schemas";

describe("triageDecisionSchema", () => {
  it("parses a valid AUTO_REPLY decision", () => {
    const parsed = triageDecisionSchema.parse({
      decision: "AUTO_REPLY",
      confidence: 0.94,
      risk: "LOW",
      reason: "Simple social acknowledgement",
      reply: "Ja verkligen 😄 Vi hörs snart!",
      requiresUser: false,
    });
    expect(parsed.decision).toBe("AUTO_REPLY");
  });

  it("parses a valid ESCALATE decision with null reply", () => {
    const parsed = triageDecisionSchema.parse({
      decision: "ESCALATE",
      confidence: 0.98,
      risk: "HIGH",
      reason: "The contact asks the user to commit to a date.",
      reply: null,
      requiresUser: true,
    });
    expect(parsed.requiresUser).toBe(true);
  });

  it("rejects unknown decisions", () => {
    expect(() =>
      triageDecisionSchema.parse({
        decision: "DO_WHATEVER",
        confidence: 1,
        risk: "LOW",
        reason: "",
        reply: null,
        requiresUser: false,
      }),
    ).toThrow();
  });

  it("rejects out-of-range confidence", () => {
    expect(() =>
      triageDecisionSchema.parse({
        decision: "AUTO_REPLY",
        confidence: 1.4,
        risk: "LOW",
        reason: "x",
        reply: "y",
        requiresUser: false,
      }),
    ).toThrow();
  });
});

describe("extractionSchema", () => {
  it("parses facts and commitments", () => {
    const parsed = extractionSchema.parse({
      facts: [
        {
          type: "LIFE_EVENT",
          fact: "Travelling to Spain",
          date: "2026-09-12",
          confidence: 0.89,
        },
      ],
      commitments: [
        {
          description: "Call next week",
          madeBy: "USER",
          dueAt: null,
          confidence: 0.8,
        },
      ],
    });
    expect(parsed.facts).toHaveLength(1);
    expect(parsed.commitments).toHaveLength(1);
  });

  it("accepts empty arrays", () => {
    const parsed = extractionSchema.parse({ facts: [], commitments: [] });
    expect(parsed.facts).toHaveLength(0);
  });
});
