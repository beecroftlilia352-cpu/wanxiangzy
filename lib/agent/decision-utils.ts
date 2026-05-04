import type { ChatImageRole } from "@/lib/agent/types";

export type AgentImageInput = {
  index: number;
  url: string;
  role?: ChatImageRole;
  fileName?: string;
};

export function getImageRoleLabel(role?: AgentImageInput["role"]): string | null {
  const labels: Record<ChatImageRole, string> = {
    auto: "自动",
    clothing: "服装图",
    reference: "参考图",
    face: "模特脸图",
    background: "背景参考图",
    source: "原图",
  };
  return role ? labels[role] : null;
}

export function normalizeAgentModule(value: string | null): string | null {
  if (!value) return null;
  const module = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    tryon: "tryon",
    "try-on": "tryon",
    grass: "grass",
    xiaohongshu: "grass",
    garment_3d: "garment_3d",
    "3d": "garment_3d",
    model: "model",
    model_background: "model_background",
    background: "model_background",
    pose: "pose",
    general: "general",
    通用生图: "general",
    服装上身: "tryon",
    换装: "tryon",
    种草图: "grass",
    种草: "grass",
    "3d展示": "garment_3d",
    专属模特: "model",
    换背景: "model_background",
    姿势裂变: "pose",
  };
  return aliases[module] || null;
}

export function applyImageRoleParams(
  module: string,
  params: Record<string, unknown>,
  images: AgentImageInput[]
): Record<string, unknown> {
  const next = { ...params };
  const refs = {
    clothing: roleRefs(images, "clothing"),
    reference: roleRefs(images, "reference"),
    face: roleRefs(images, "face"),
    background: roleRefs(images, "background"),
    source: roleRefs(images, "source"),
  };

  switch (module) {
    case "tryon":
      if (!hasParamRef(next.clothing_urls) && refs.clothing.length) next.clothing_urls = refs.clothing;
      if (!hasParamRef(next.reference_url) && refs.reference[0]) next.reference_url = refs.reference[0];
      if (!hasParamRef(next.model_face_url) && refs.face[0]) next.model_face_url = refs.face[0];
      break;
    case "grass":
      if (!hasParamRef(next.garment_url) && refs.clothing[0]) next.garment_url = refs.clothing[0];
      if (!hasParamRef(next.reference_url) && (refs.reference[0] || refs.background[0])) {
        next.reference_url = refs.reference[0] || refs.background[0];
      }
      break;
    case "garment_3d":
      if (!hasParamRef(next.garment_url) && refs.clothing[0]) next.garment_url = refs.clothing[0];
      break;
    case "model":
      if (!hasParamRef(next.reference_urls)) {
        const modelRefs = [...refs.face, ...refs.reference];
        if (modelRefs.length) next.reference_urls = modelRefs;
      }
      break;
    case "model_background":
      if (!hasParamRef(next.source_url) && (refs.source[0] || refs.clothing[0] || refs.reference[0])) {
        next.source_url = refs.source[0] || refs.clothing[0] || refs.reference[0];
      }
      if (!hasParamRef(next.background_reference_url) && (refs.background[0] || refs.reference[0])) {
        next.background_reference_url = refs.background[0] || refs.reference[0];
      }
      break;
    case "pose":
      if (!hasParamRef(next.main_image_url) && (refs.source[0] || refs.reference[0] || refs.clothing[0])) {
        next.main_image_url = refs.source[0] || refs.reference[0] || refs.clothing[0];
      }
      break;
  }

  return next;
}

export function validateAgentDecision(
  module: string,
  params: Record<string, unknown>,
  imageMap: Map<number, string>
): { ok: boolean; missingFields: string[] } {
  if (module === "general") return { ok: true, missingFields: [] };
  const hasAnyImage = imageMap.size > 0;
  const missing: string[] = [];

  const hasImageRef = (value: unknown) => {
    if (Array.isArray(value)) return value.some((item) => resolveImageUrl(item, imageMap));
    return Boolean(resolveImageUrl(value, imageMap));
  };

  switch (module) {
    case "tryon":
      if (!hasAnyImage && !hasImageRef(params.clothing_urls)) missing.push("服装图");
      break;
    case "grass":
    case "garment_3d":
      if (!hasAnyImage && !hasImageRef(params.garment_url)) missing.push("服装图");
      break;
    case "model":
      if (!hasAnyImage && !hasImageRef(params.reference_urls)) missing.push("模特参考图");
      break;
    case "model_background":
      if (!hasAnyImage && !hasImageRef(params.source_url)) missing.push("原图");
      break;
    case "pose":
      if (!hasAnyImage && !hasImageRef(params.main_image_url)) missing.push("主图");
      break;
    default:
      return { ok: false, missingFields: ["有效功能模块"] };
  }

  return { ok: missing.length === 0, missingFields: missing };
}

export function validateImageRoleConflicts(
  module: string,
  params: Record<string, unknown>,
  images: AgentImageInput[]
): { ok: boolean; issues: string[] } {
  const explicitImages = images.filter((img) => img.role && img.role !== "auto");
  if (explicitImages.length === 0 || module === "general") return { ok: true, issues: [] };

  const issues: string[] = [];
  const roleByRef = new Map(explicitImages.map((img) => [`图${img.index}`, img.role]));
  const refs = {
    clothing: normalizeRefList(params.clothing_urls),
    garment: normalizeRefList(params.garment_url),
    reference: normalizeRefList(params.reference_url),
    face: normalizeRefList(params.model_face_url),
    source: normalizeRefList(params.source_url),
    background: normalizeRefList(params.background_reference_url),
    main: normalizeRefList(params.main_image_url),
    modelRefs: normalizeRefList(params.reference_urls),
  };

  const hasRole = (role: ChatImageRole) => explicitImages.some((img) => img.role === role);
  const checkAllowed = (label: string, values: string[], allowed: ChatImageRole[]) => {
    for (const value of values) {
      const role = roleByRef.get(value);
      if (role && !allowed.includes(role)) {
        issues.push(`${label} 使用了 ${value}（当前标记为${getImageRoleLabel(role)}），请调整图片角色或重新说明。`);
      }
    }
  };

  switch (module) {
    case "tryon":
      if (hasRole("clothing") && refs.clothing.length === 0) issues.push("服装上身缺少已标记的服装图。");
      checkAllowed("服装图", refs.clothing, ["clothing"]);
      checkAllowed("姿势/构图参考图", refs.reference, ["reference", "source"]);
      checkAllowed("模特脸图", refs.face, ["face"]);
      break;
    case "grass":
      checkAllowed("服装硬参考图", refs.garment, ["clothing", "source"]);
      checkAllowed("种草参考图", refs.reference, ["reference", "background"]);
      break;
    case "garment_3d":
      checkAllowed("服装 3D 商品图", refs.garment, ["clothing", "source"]);
      break;
    case "model_background":
      checkAllowed("原图", refs.source, ["source", "reference", "clothing"]);
      checkAllowed("背景参考图", refs.background, ["background", "reference"]);
      if (refs.source[0] && refs.background[0] && refs.source[0] === refs.background[0]) {
        issues.push("换背景的原图和背景参考图不能是同一张。");
      }
      break;
    case "pose":
      checkAllowed("姿势裂变主图", refs.main, ["source", "reference", "clothing"]);
      break;
    case "model":
      checkAllowed("专属模特参考图", refs.modelRefs, ["face", "reference"]);
      break;
  }

  return { ok: issues.length === 0, issues };
}

export function buildPlanLines(module: string, params: Record<string, unknown>, images: AgentImageInput[]): string[] {
  const lines: string[] = [];
  const describe = (label: string, value: unknown) => {
    const refs = normalizeRefList(value);
    if (refs.length) lines.push(`**${label}**：${refs.join("、")}`);
  };

  switch (module) {
    case "tryon":
      describe("服装", params.clothing_urls);
      describe("姿势/构图参考", params.reference_url);
      describe("模特脸", params.model_face_url);
      break;
    case "grass":
      describe("服装硬参考", params.garment_url);
      describe("种草场景参考", params.reference_url);
      break;
    case "model_background":
      describe("原图", params.source_url);
      describe("背景参考", params.background_reference_url);
      describe("模特参考", params.model_reference_url);
      break;
    case "pose":
      describe("主图", params.main_image_url);
      break;
    case "model":
      describe("模特参考", params.reference_urls);
      break;
    case "garment_3d":
      describe("服装", params.garment_url);
      break;
    case "general":
      if (images.length) lines.push(`**参考图片**：${images.map((img) => `图${img.index}`).join("、")}`);
      break;
  }

  const roleLines = images
    .filter((img) => img.role && img.role !== "auto")
    .map((img) => `图${img.index}=${getImageRoleLabel(img.role)}`);
  if (roleLines.length) lines.push(`**图片角色**：${roleLines.join("，")}`);

  return lines;
}

export function resolveImageUrl(ref: unknown, imageMap: Map<number, string>): string | null {
  if (typeof ref === "string") {
    const m = ref.match(/图(\d+)/);
    if (m) return imageMap.get(parseInt(m[1], 10)) || null;
    if (ref.startsWith("http")) return ref;
  }
  if (typeof ref === "number") return imageMap.get(ref) || null;
  return null;
}

export function resolveImageUrls(ref: unknown, imageMap: Map<number, string>): string[] {
  if (Array.isArray(ref)) return ref.map((r) => resolveImageUrl(r, imageMap)).filter(Boolean) as string[];
  const s = resolveImageUrl(ref, imageMap);
  return s ? [s] : [];
}

function roleRefs(images: AgentImageInput[], role: ChatImageRole): string[] {
  return images
    .filter((img) => img.role === role)
    .sort((a, b) => a.index - b.index)
    .map((img) => `图${img.index}`);
}

function hasParamRef(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeRefList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}
