import { describe, expect, it } from "vitest";
import { alignTryOnReferenceAnalyses, buildTryOnReferenceAnalysisRule, decideTryOnFaceMode } from "@/lib/tryon-reference-analysis";

describe("try-on reference analysis alignment", () => {
  it("reorders unique explicit indexes and fills missing references", () => {
    const analyses = alignTryOnReferenceAnalyses([
      { index: 3, bodyCrop: "lower_body", confidence: 0.8 },
      { index: 1, bodyCrop: "full_body", confidence: 0.9 },
    ], 4);

    expect(analyses.map((item) => item.index)).toEqual([1, 2, 3, 4]);
    expect(analyses.map((item) => item.bodyCrop)).toEqual([
      "full_body",
      "partial_unknown",
      "lower_body",
      "partial_unknown",
    ]);
  });

  it("uses array order when model returns duplicate indexes", () => {
    const analyses = alignTryOnReferenceAnalyses([
      { index: 1, bodyCrop: "full_body", confidence: 0.9 },
      { index: 1, bodyCrop: "lower_body", confidence: 0.9 },
      { index: 2, bodyCrop: "upper_body", confidence: 0.9 },
      { index: 3, bodyCrop: "scene_only", confidence: 0.9 },
    ], 5);

    expect(analyses.map((item) => item.index)).toEqual([1, 2, 3, 4, 5]);
    expect(analyses.map((item) => item.bodyCrop)).toEqual([
      "full_body",
      "lower_body",
      "upper_body",
      "scene_only",
      "partial_unknown",
    ]);
  });

  it("creates conservative fallbacks for empty analysis results", () => {
    const analyses = alignTryOnReferenceAnalyses([], 3);

    expect(analyses).toHaveLength(3);
    expect(analyses.map((item) => item.index)).toEqual([1, 2, 3]);
    expect(analyses.every((item) => item.bodyCrop === "partial_unknown")).toBe(true);
  });

  it("does not present fallback unknown analysis as real face visibility", () => {
    const [analysis] = alignTryOnReferenceAnalyses([], 1);
    const rule = buildTryOnReferenceAnalysisRule(analysis, 2);

    expect(rule).toContain("fallback crop preservation");
    expect(rule).toContain("exact face/head visibility is unknown");
    expect(rule).toContain("do not infer any head/face/body identity from the clothing source image");
    expect(rule).not.toContain("face visible");
    expect(rule).not.toContain("head visible");
  });

  it("normalizes reference confidence labels from vision models", () => {
    const analyses = alignTryOnReferenceAnalyses([
      { index: 1, bodyCrop: "upper_body", confidence: "high" },
      { index: 2, bodyCrop: "lower_body", confidence: "82%" },
    ], 2);

    expect(analyses[0].confidence).toBeGreaterThan(0.8);
    expect(analyses[1].confidence).toBe(0.82);
  });

  it("locks lower-body references against full-body expansion", () => {
    const rule = buildTryOnReferenceAnalysisRule({
      index: 1,
      bodyCrop: "lower_body",
      personVisible: true,
      faceVisible: false,
      headVisible: false,
      upperBodyVisible: false,
      lowerBodyVisible: true,
      handsVisible: false,
      feetVisible: true,
      detailFocus: ["pants", "leg stance"],
      promptNotes: "Keep a waist-to-feet crop and do not add a head or full torso.",
      confidence: 0.92,
    }, 2);

    expect(rule).toContain("Crop lock - HARD");
    expect(rule).toContain("lower-body target frame");
    expect(rule).toContain("Do not zoom out");
    expect(rule).toContain("do not convert it into a full-body portrait");
    expect(rule).toContain("do not add a head, face, shoulders, or full torso");
    expect(rule).toContain("Do not invent or reveal missing head, face, upper torso");
  });
});

describe("decideTryOnFaceMode", () => {
  const fullBody = {
    index: 1,
    bodyCrop: "full_body" as const,
    personVisible: true,
    faceVisible: true,
    headVisible: true,
    upperBodyVisible: true,
    lowerBodyVisible: true,
    handsVisible: true,
    feetVisible: true,
    detailFocus: ["outfit"],
    promptNotes: "Full body.",
    confidence: 0.9,
  };

  it("returns must_use_model_face when model face is uploaded and reference is full_body", () => {
    expect(decideTryOnFaceMode({ hasModelFace: true, referenceAnalysis: fullBody }))
      .toBe("must_use_model_face");
  });

  it("returns must_use_model_face when reference is partial_unknown (recognition failed)", () => {
    expect(decideTryOnFaceMode({ hasModelFace: true, referenceAnalysis: null }))
      .toBe("must_use_model_face");
  });

  it("returns preserve_reference_face when model face is not uploaded", () => {
    expect(decideTryOnFaceMode({ hasModelFace: false, referenceAnalysis: fullBody }))
      .toBe("preserve_reference_face");
  });

  it("returns preserve_reference_face when reference is lower_body", () => {
    expect(decideTryOnFaceMode({
      hasModelFace: true,
      referenceAnalysis: { ...fullBody, bodyCrop: "lower_body" },
    })).toBe("preserve_reference_face");
  });

  it("returns preserve_reference_face when reference is scene_only", () => {
    expect(decideTryOnFaceMode({
      hasModelFace: true,
      referenceAnalysis: { ...fullBody, bodyCrop: "scene_only" },
    })).toBe("preserve_reference_face");
  });

  it("returns preserve_reference_face for closeup without head/face", () => {
    expect(decideTryOnFaceMode({
      hasModelFace: true,
      referenceAnalysis: {
        ...fullBody,
        bodyCrop: "closeup",
        faceVisible: false,
        headVisible: false,
      },
    })).toBe("preserve_reference_face");
  });
});
