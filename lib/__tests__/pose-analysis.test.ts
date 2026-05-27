import { describe, expect, it } from "vitest";
import {
  getPoseVisualAnalysisDetailItems,
  getPoseVisualAnalysisSummary,
  type PoseVisualAnalysis,
} from "@/lib/pose-analysis";

const baseAnalysis: PoseVisualAnalysis = {
  personVisible: true,
  personCount: 1,
  genderExpression: "female",
  ageRange: "adult",
  bodyCrop: "full_body",
  bodyOrientation: "front_facing",
  headDirection: "",
  poseBaseline: "",
  cameraFraming: "full_body studio framing",
  cameraAngle: "",
  outfitDescription: "A dark red, spaghetti-strap mini dress with a tiered, ruffled skirt and lace trim.",
  hairDescription: "",
  faceIdentityNotes: "",
  skinToneNotes: "",
  background: "",
  lighting: "soft studio lighting",
  handsVisible: true,
  feetVisible: false,
  occlusionNotes: "",
  generationRisks: ["gender_drift", "hand_distortion"],
  promptNotes: "",
  confidence: 0.82,
};

describe("pose visual analysis display", () => {
  it("localizes compact summary labels", () => {
    expect(getPoseVisualAnalysisSummary(baseAnalysis)).toBe("成人 / 女 / 全身 / 正面 / 手可见");
  });

  it("turns long English outfit facts into compact chips", () => {
    const items = getPoseVisualAnalysisDetailItems(baseAnalysis);
    expect(items.find((item) => item.label === "服装")?.value).toBe("深红 / 吊带 / 多层 / 荷叶边 / 蕾丝");
    expect(items.find((item) => item.label === "风险")?.value).toBe("性别漂移、手部风险");
  });
});
