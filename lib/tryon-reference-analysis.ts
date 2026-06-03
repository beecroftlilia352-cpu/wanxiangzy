export type TryOnReferenceBodyCrop =
  | "full_body"
  | "three_quarter"
  | "upper_body"
  | "lower_body"
  | "closeup"
  | "scene_only"
  | "partial_unknown";

export type TryOnReferenceAnalysis = {
  index: number;
  bodyCrop: TryOnReferenceBodyCrop;
  personVisible: boolean;
  faceVisible: boolean;
  headVisible: boolean;
  upperBodyVisible: boolean;
  lowerBodyVisible: boolean;
  handsVisible: boolean;
  feetVisible: boolean;
  detailFocus: string[];
  promptNotes: string;
  confidence: number;
};

export function normalizeTryOnReferenceAnalysis(input: unknown, fallbackIndex = 1): TryOnReferenceAnalysis {
  const record = toRecord(input);
  const bodyCrop = normalizeBodyCrop(readString(record, "bodyCrop") || readString(record, "body_crop"));
  const confidence = Number(record.confidence);

  return {
    index: normalizeIndex(record.index, fallbackIndex),
    bodyCrop,
    personVisible: readBoolean(record, "personVisible", "person_visible") ?? bodyCrop !== "scene_only",
    faceVisible: readBoolean(record, "faceVisible", "face_visible") ?? (bodyCrop === "full_body" || bodyCrop === "three_quarter" || bodyCrop === "upper_body"),
    headVisible: readBoolean(record, "headVisible", "head_visible") ?? (bodyCrop !== "lower_body" && bodyCrop !== "scene_only"),
    upperBodyVisible: readBoolean(record, "upperBodyVisible", "upper_body_visible") ?? (bodyCrop !== "lower_body" && bodyCrop !== "scene_only"),
    lowerBodyVisible: readBoolean(record, "lowerBodyVisible", "lower_body_visible") ?? (bodyCrop !== "upper_body" && bodyCrop !== "scene_only"),
    handsVisible: readBoolean(record, "handsVisible", "hands_visible") ?? false,
    feetVisible: readBoolean(record, "feetVisible", "feet_visible") ?? (bodyCrop === "full_body"),
    detailFocus: normalizeStringArray(record.detailFocus ?? record.detail_focus),
    promptNotes: readString(record, "promptNotes") || readString(record, "prompt_notes"),
    confidence: Number.isFinite(confidence) ? clamp(confidence, 0, 1) : 0.5,
  };
}

export function normalizeTryOnReferenceAnalyses(input: unknown): TryOnReferenceAnalysis[] {
  const record = toRecord(input);
  const values = Array.isArray(input)
    ? input
    : Array.isArray(record.items)
      ? record.items
      : Array.isArray(record.analyses)
        ? record.analyses
        : [];
  return values.map((item, index) => normalizeTryOnReferenceAnalysis(item, index + 1));
}

export function createFallbackTryOnReferenceAnalysis(index: number): TryOnReferenceAnalysis {
  return {
    index,
    bodyCrop: "partial_unknown",
    personVisible: true,
    faceVisible: true,
    headVisible: true,
    upperBodyVisible: true,
    lowerBodyVisible: true,
    handsVisible: false,
    feetVisible: false,
    detailFocus: [],
    promptNotes: "Preserve the target reference's visible body range, crop boundaries, pose family, camera distance, background, lighting, and photo mood.",
    confidence: 0.35,
  };
}

export function alignTryOnReferenceAnalyses(input: unknown, expectedCount: number): TryOnReferenceAnalysis[] {
  const count = Math.max(0, Math.floor(Number(expectedCount) || 0));
  if (!count) return [];

  const analyses = normalizeTryOnReferenceAnalyses(input).slice(0, count);
  const explicitIndexes = analyses.map((analysis) => analysis.index);
  const canTrustExplicitIndexes = analyses.length > 0
    && explicitIndexes.every((index) => index >= 1 && index <= count)
    && new Set(explicitIndexes).size === explicitIndexes.length;

  const aligned: Array<TryOnReferenceAnalysis | null> = Array.from({ length: count }, () => null);

  if (canTrustExplicitIndexes) {
    for (const analysis of analyses) {
      aligned[analysis.index - 1] = { ...analysis, index: analysis.index };
    }
  } else {
    analyses.forEach((analysis, index) => {
      aligned[index] = { ...analysis, index: index + 1 };
    });
  }

  return aligned.map((analysis, index) => analysis || createFallbackTryOnReferenceAnalysis(index + 1));
}

export function buildTryOnReferenceAnalysisRule(
  analysis: TryOnReferenceAnalysis | null | undefined,
  referenceImageNumber: number
) {
  if (!analysis) return "";
  const ref = `image ${referenceImageNumber}`;
  const bodyCropRule = getBodyCropRule(analysis.bodyCrop, ref);
  const cropLockRule = buildTryOnReferenceCropLockRule(analysis, referenceImageNumber);
  const visibility = [
    analysis.faceVisible ? "face visible" : "face not visible",
    analysis.headVisible ? "head visible" : "head not visible",
    analysis.upperBodyVisible ? "upper body visible" : "upper body not visible",
    analysis.lowerBodyVisible ? "lower body visible" : "lower body not visible",
    analysis.feetVisible ? "feet visible" : "feet not visible",
  ].join(", ");
  const details = analysis.detailFocus.length ? ` Detail focus: ${analysis.detailFocus.join(", ")}.` : "";
  const notes = analysis.promptNotes ? ` Reference notes: ${analysis.promptNotes}` : "";
  return `Reference visual analysis: ${ref} body crop=${analysis.bodyCrop}; ${visibility}. ${bodyCropRule} ${cropLockRule}${details}${notes}`;
}

export function buildTryOnReferenceCropLockRule(
  analysis: TryOnReferenceAnalysis | null | undefined,
  referenceImageNumber: number
) {
  if (!analysis) return "";
  const ref = `image ${referenceImageNumber}`;
  const missingParts: string[] = [];
  if (!analysis.headVisible) missingParts.push("head");
  if (!analysis.faceVisible) missingParts.push("face");
  if (!analysis.upperBodyVisible) missingParts.push("upper torso");
  if (!analysis.lowerBodyVisible) missingParts.push("lower body");
  if (!analysis.feetVisible) missingParts.push("feet/shoes");
  const missingRule = missingParts.length
    ? ` Do not invent or reveal missing ${missingParts.join(", ")} outside the original frame.`
    : "";

  if (analysis.bodyCrop === "lower_body") {
    return `Crop lock - HARD: keep ${ref} as a lower-body target frame. The best pose must be derived from its visible hips/legs/feet stance, camera height, floor contact, and crop boundaries. Do not zoom out, do not convert it into a full-body portrait, and do not add a head, face, shoulders, or full torso.${missingRule}`;
  }
  if (analysis.bodyCrop === "upper_body") {
    return `Crop lock - HARD: keep ${ref} as an upper-body target frame. The best pose must be derived from its visible head/shoulder/arm/hand placement, camera distance, and crop boundaries. Do not zoom out into a full-body portrait and do not add legs or feet that are outside the original frame.${missingRule}`;
  }
  if (analysis.bodyCrop === "closeup") {
    return `Crop lock - HARD: keep ${ref} as a close-up/detail target frame. The best pose must stay within the same local body/detail region, camera distance, and crop boundaries. Do not zoom out into a half-body or full-body fashion photo.${missingRule}`;
  }
  if (analysis.bodyCrop === "scene_only") {
    return `Crop lock - HARD: use ${ref} only for scene, lighting, camera mood, and background. Do not infer a person pose, body crop, head, face, or full-body portrait from it.${missingRule}`;
  }
  if (analysis.bodyCrop === "three_quarter") {
    return `Crop lock - HARD: keep ${ref}'s three-quarter visible-body range, crop boundary, camera distance, and body scale. Do not force a head-to-toe full-body expansion unless it is already visible in ${ref}.${missingRule}`;
  }
  if (analysis.bodyCrop === "full_body") {
    return `Crop lock - HARD: keep ${ref}'s head-to-feet visible range, body scale, camera distance, and floor contact. Do not crop away visible head, hands, legs, feet, or shoes.${missingRule}`;
  }
  return `Crop lock - HARD: preserve ${ref}'s visible-body range, camera distance, body scale, and crop boundaries. Do not zoom out to reveal body parts that are not visible in the reference.${missingRule}`;
}

function getBodyCropRule(bodyCrop: TryOnReferenceBodyCrop, ref: string) {
  if (bodyCrop === "lower_body") {
    return `Use ${ref} as a lower-body/partial-body target canvas. Preserve its lower-body crop, leg/hip/feet framing, camera distance, background, and visible-body range; do not invent a missing head, face, full torso, or full-body portrait.`;
  }
  if (bodyCrop === "upper_body") {
    return `Use ${ref} as an upper-body/partial-body target canvas. Preserve its upper-body crop, head/shoulder/hand framing, camera distance, background, and visible-body range; do not expand it into an unrelated full-body image.`;
  }
  if (bodyCrop === "closeup") {
    return `Use ${ref} as a close-up composition reference. Preserve its close camera distance, local body/detail framing, background, and visible range; do not turn it into a generic full-body fashion shot.`;
  }
  if (bodyCrop === "scene_only") {
    return `Use ${ref} only for scene, lighting, camera mood, color, and background; do not copy any person, clothing, or body pose from it.`;
  }
  if (bodyCrop === "three_quarter") {
    return `Preserve ${ref}'s three-quarter visible-body range, camera distance, crop boundaries, pose family, and background; do not crop tighter or force a full-body expansion unless the crop already supports it.`;
  }
  if (bodyCrop === "full_body") {
    return `Preserve ${ref}'s full-body range, head-to-feet framing, pose family, camera distance, and background; do not crop away originally visible head, hands, legs, feet, or shoes.`;
  }
  return `Preserve ${ref}'s visible-body range, crop boundaries, pose family, camera distance, and background when applying the clothing.`;
}

function normalizeBodyCrop(value: string): TryOnReferenceBodyCrop {
  if (
    value === "full_body"
    || value === "three_quarter"
    || value === "upper_body"
    || value === "lower_body"
    || value === "closeup"
    || value === "scene_only"
    || value === "partial_unknown"
  ) return value;
  return "partial_unknown";
}

function normalizeIndex(value: unknown, fallback: number) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

function readBoolean(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item.trim().toLowerCase() : "").filter(Boolean)
    : [];
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
