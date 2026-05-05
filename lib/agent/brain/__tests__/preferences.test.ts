import { describe, expect, it } from "vitest";
import { extractPreferencePatchFromFeedback, mergeAgentUserPreferences } from "@/lib/agent/brain/preferences";

describe("agent preferences", () => {
  it("learns commerce detail guardrails from negative feedback", () => {
    const patch = extractPreferencePatchFromFeedback({
      rating: "bad",
      reason: "我要淘宝详情页，不是种草图，比例也别乱改",
      tags: ["detail"],
    });

    expect(patch.negativeRules?.some((rule) => rule.includes("电商详情页"))).toBe(true);
    expect(patch.negativeRules?.some((rule) => rule.includes("比例"))).toBe(true);
  });

  it("merges learned preferences without duplicating rules", () => {
    const merged = mergeAgentUserPreferences(
      { negativeRules: ["A"], styleNotes: ["B"] },
      { negativeRules: ["A", "C"], styleNotes: ["B", "D"], outputDefaults: { poseOutputMode: "separate" } }
    );

    expect(merged.negativeRules).toEqual(["A", "C"]);
    expect(merged.styleNotes).toEqual(["B", "D"]);
    expect(merged.outputDefaults?.poseOutputMode).toBe("separate");
  });
});
