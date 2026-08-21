import { describe, expect, it } from "vitest";

import {
  CURATED_MULTI_IMAGE_UPLOAD_LIMIT,
  STANDARD_MULTI_IMAGE_UPLOAD_LIMIT,
} from "@/lib/multi-image-upload-limits";
import { MAX_MODEL_REFERENCE_IMAGES } from "@/lib/model-upload-rules";
import { MAX_PRODUCT_SET_SOURCE_IMAGES } from "@/lib/product-set";
import { MAX_POSE_REFERENCE_IMAGES } from "@/lib/pose-reference";
import { MAX_GARMENT_ANGLE_IMAGES } from "@/lib/garment-angle-references";
import { MAX_GARMENT_DETAIL_IMAGES } from "@/lib/garment-detail-references";
import { PRODUCT_RETOUCH_MAX_SOURCES } from "@/lib/product-retouch";
import { MAX_FACE_SWAP_SOURCE_IMAGES } from "@/lib/face-swap";
import { MAX_MODEL_BACKGROUND_SOURCE_IMAGES } from "@/lib/model-background";
import { MAX_IMAGE_TRANSLATION_IMAGES } from "@/lib/image-translation";

describe("multi-image upload limits", () => {
  it("keeps semantic reference workflows on the curated four-image tier", () => {
    expect(CURATED_MULTI_IMAGE_UPLOAD_LIMIT).toBe(4);
    expect([
      MAX_MODEL_REFERENCE_IMAGES,
      MAX_PRODUCT_SET_SOURCE_IMAGES,
      MAX_POSE_REFERENCE_IMAGES,
      MAX_GARMENT_ANGLE_IMAGES,
      MAX_GARMENT_DETAIL_IMAGES,
    ]).toEqual([4, 4, 4, 4, 4]);
  });

  it("keeps independent batch workflows on the eight-image tier", () => {
    expect(STANDARD_MULTI_IMAGE_UPLOAD_LIMIT).toBe(8);
    expect([
      PRODUCT_RETOUCH_MAX_SOURCES,
      MAX_FACE_SWAP_SOURCE_IMAGES,
      MAX_MODEL_BACKGROUND_SOURCE_IMAGES,
      MAX_IMAGE_TRANSLATION_IMAGES,
    ]).toEqual([8, 8, 8, 8]);
  });
});
