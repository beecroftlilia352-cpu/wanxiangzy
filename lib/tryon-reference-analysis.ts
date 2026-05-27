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

export function buildTryOnReferenceAnalysisRule(
  analysis: TryOnReferenceAnalysis | null | undefined,
  referenceImageNumber: number
) {
  if (!analysis) return "";
  const ref = `image ${referenceImageNumber}`;
  const bodyCropRule = getBodyCropRule(analysis.bodyCrop, ref);
  const visibility = [
    analysis.faceVisible ? "face visible" : "face not visible",
    analysis.headVisible ? "head visible" : "head not visible",
    analysis.upperBodyVisible ? "upper body visible" : "upper body not visible",
    analysis.lowerBodyVisible ? "lower body visible" : "lower body not visible",
    analysis.feetVisible ? "feet visible" : "feet not visible",
  ].join(", ");
  const details = analysis.detailFocus.length ? ` Detail focus: ${analysis.detailFocus.join(", ")}.` : "";
  const notes = analysis.promptNotes ? ` Reference notes: ${analysis.promptNotes}` : "";
  return `Reference visual analysis: ${ref} body crop=${analysis.bodyCrop}; ${visibility}. ${bodyCropRule}${details}${notes}`;
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
