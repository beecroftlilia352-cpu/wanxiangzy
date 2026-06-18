import { describe, expect, it } from "vitest";
import {
  buildPoseReferenceImagePrompt,
  getPoseReferenceImageNumberForSlot,
  normalizePoseReferenceCopies,
  normalizePoseReferenceUrls,
} from "@/lib/pose-reference";

describe("pose reference helpers", () => {
  it("normalizes reference urls without duplicates", () => {
    expect(normalizePoseReferenceUrls([" a.png ", "", "b.png", "a.png", 123])).toEqual(["a.png", "b.png"]);
  });

  it("keeps copies per reference uncapped by pose-plan count", () => {
    expect(normalizePoseReferenceCopies(12, 5)).toBe(12);
    expect(normalizePoseReferenceCopies(0, 5)).toBe(1);
  });

  it("maps output slots by reference image groups", () => {
    const params = { referenceCount: 4, startImageNumber: 2, copiesPerReference: 2 };

    expect(getPoseReferenceImageNumberForSlot({ ...params, poseIndex: 1 })).toBe(2);
    expect(getPoseReferenceImageNumberForSlot({ ...params, poseIndex: 2 })).toBe(2);
    expect(getPoseReferenceImageNumberForSlot({ ...params, poseIndex: 3 })).toBe(3);
    expect(getPoseReferenceImageNumberForSlot({ ...params, poseIndex: 8 })).toBe(5);
  });

  it("builds a strict role contract for pose references", () => {
    const prompt = buildPoseReferenceImagePrompt({
      referenceCount: 4,
      startImageNumber: 2,
      outputMode: "grid",
      poseCount: 8,
      copiesPerReference: 2,
    });

    expect(prompt).toContain("image 1 is the only source");
    expect(prompt).toContain("image 2 to image 5 are pose reference images");
    expect(prompt).toContain("Use pose reference images only as a skeletal pose control");
    expect(prompt).toContain("Do not use pose reference images as visual source images");
    expect(prompt).toContain("handbag, jewelry, accessories");
    expect(prompt).toContain("camera distance, crop, lens look");
    expect(prompt).toContain("pose 1 -> image 2");
    expect(prompt).toContain("pose 8 -> image 5");
  });
});
