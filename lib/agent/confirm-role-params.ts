import type { ChatImage, ChatImageRole } from "@/lib/agent/types";

type ImageLike = Pick<ChatImage, "index" | "url" | "hostedUrl" | "role">;

export type ConfirmRoleUpdate = {
  params: Record<string, unknown>;
  jobPayload: Record<string, unknown>;
};

export type ConfirmRoleIssue = {
  severity: "error" | "warning";
  message: string;
};

export function applyConfirmImageRoles(
  module: string,
  params: Record<string, unknown>,
  jobPayload: Record<string, unknown>,
  images: ImageLike[]
): ConfirmRoleUpdate {
  const nextParams = { ...params };
  const nextPayload = { ...jobPayload };
  const roles = collectRoleUrls(images);

  const first = (...keys: ChatImageRole[]) => {
    for (const key of keys) {
      const url = roles[key][0];
      if (url) return url;
    }
    return "";
  };

  switch (module) {
    case "tryon": {
      if (roles.clothing.length) {
        nextParams.clothing_urls = roles.clothing;
        nextPayload.clothingUrls = roles.clothing;
        nextPayload.clothingMode = roles.clothing.length > 1 ? "multi" : "single";
      }
      const referenceUrl = first("reference", "source");
      if (referenceUrl) {
        nextParams.reference_url = referenceUrl;
        nextPayload.referenceUrl = referenceUrl;
      }
      const faceUrl = first("face");
      if (faceUrl) {
        nextParams.model_face_url = faceUrl;
        nextPayload.modelFaceUrl = faceUrl;
      }
      break;
    }
    case "grass": {
      const garmentUrl = first("clothing", "source");
      if (garmentUrl) {
        nextParams.garment_url = garmentUrl;
        nextPayload.garmentUrl = garmentUrl;
      }
      const referenceUrl = first("reference", "background");
      if (referenceUrl) {
        nextParams.reference_url = referenceUrl;
        nextPayload.referenceUrl = referenceUrl;
      }
      break;
    }
    case "garment_3d": {
      const garmentUrl = first("clothing", "source");
      if (garmentUrl) {
        nextParams.garment_url = garmentUrl;
        nextPayload.garmentUrl = garmentUrl;
      }
      break;
    }
    case "model": {
      const referenceUrls = [...roles.face, ...roles.reference].filter(Boolean).slice(0, 3);
      if (referenceUrls.length) {
        nextParams.reference_urls = referenceUrls;
        nextPayload.referenceUrls = referenceUrls;
      }
      break;
    }
    case "model_background": {
      const sourceUrl = first("source", "clothing", "reference");
      if (sourceUrl) {
        nextParams.source_url = sourceUrl;
        nextPayload.sourceUrl = sourceUrl;
      }
      const backgroundUrl = first("background", "reference");
      if (backgroundUrl && backgroundUrl !== sourceUrl) {
        nextParams.background_reference_url = backgroundUrl;
        nextPayload.backgroundReferenceUrl = backgroundUrl;
      }
      const modelUrl = first("face");
      if (modelUrl) {
        nextParams.model_reference_url = modelUrl;
        nextPayload.modelReferenceUrl = modelUrl;
      }
      break;
    }
    case "pose": {
      const mainUrl = first("source", "reference", "clothing");
      if (mainUrl) {
        nextParams.main_image_url = mainUrl;
        nextPayload.mainImageUrl = mainUrl;
      }
      break;
    }
    case "face_swap": {
      const sourceUrl = first("source", "reference", "clothing");
      if (sourceUrl) {
        nextParams.source_image = sourceUrl;
        nextPayload.sourceUrl = sourceUrl;
      }
      const faceUrl = first("face", "reference");
      if (faceUrl && faceUrl !== sourceUrl) {
        nextParams.face_image = faceUrl;
        nextPayload.faceUrl = faceUrl;
      }
      break;
    }
    default:
      break;
  }

  return { params: nextParams, jobPayload: nextPayload };
}

export function validateConfirmImageRoles(
  module: string,
  params: Record<string, unknown>,
  images: ImageLike[]
): ConfirmRoleIssue[] {
  if (module === "general") return [];

  const issues: ConfirmRoleIssue[] = [];
  const refRole = new Map<string, ChatImageRole>();
  for (const image of images) {
    const role = image.role || "auto";
    const url = image.hostedUrl || image.url;
    if (role === "auto") continue;
    refRole.set(`图${image.index}`, role);
    refRole.set(`Image ${image.index}`, role);
    if (url) refRole.set(url, role);
  }

  const hasExplicitRoles = refRole.size > 0;
  const requireAny = (label: string, value: unknown) => {
    if (toUrlList(value).length === 0) {
      issues.push({ severity: "error", message: `缺少${label}，请在图片角色里补选。` });
    }
  };
  const check = (label: string, value: unknown, allowed: ChatImageRole[]) => {
    if (!hasExplicitRoles) return;
    for (const ref of toRefList(value)) {
      const role = refRole.get(ref);
      if (role && !allowed.includes(role)) {
        issues.push({
          severity: "error",
          message: `${label}使用了已标记为“${roleLabel(role)}”的图片，请修正角色。`,
        });
      }
    }
  };

  switch (module) {
    case "tryon":
      requireAny("服装图", params.clothing_urls);
      check("服装图", params.clothing_urls, ["clothing"]);
      check("参考图", params.reference_url, ["reference", "source"]);
      check("模特脸图", params.model_face_url, ["face"]);
      break;
    case "grass":
      requireAny("服装硬参考图", params.garment_url);
      check("服装硬参考图", params.garment_url, ["clothing", "source"]);
      check("种草参考图", params.reference_url, ["reference", "background"]);
      break;
    case "garment_3d":
      requireAny("服装图", params.garment_url);
      check("服装图", params.garment_url, ["clothing", "source"]);
      break;
    case "model":
      requireAny("模特参考图", params.reference_urls);
      check("模特参考图", params.reference_urls, ["face", "reference"]);
      break;
    case "model_background": {
      requireAny("原图", params.source_url);
      check("原图", params.source_url, ["source", "clothing", "reference"]);
      check("背景参考图", params.background_reference_url, ["background", "reference"]);
      const sourceUrl = toUrlList(params.source_url)[0];
      const backgroundUrl = toUrlList(params.background_reference_url)[0];
      if (sourceUrl && backgroundUrl && sourceUrl === backgroundUrl) {
        issues.push({ severity: "error", message: "原图和背景参考图不能是同一张。" });
      }
      break;
    }
    case "pose":
      requireAny("主图", params.main_image_url);
      check("主图", params.main_image_url, ["source", "reference", "clothing"]);
      break;
    case "face_swap": {
      requireAny("原始模特图", params.source_image);
      requireAny("目标脸图", params.face_image);
      check("原始模特图", params.source_image, ["source", "reference", "clothing"]);
      check("目标脸图", params.face_image, ["face", "reference"]);
      const sourceUrl = toUrlList(params.source_image)[0];
      const faceUrl = toUrlList(params.face_image)[0];
      if (sourceUrl && faceUrl && sourceUrl === faceUrl) {
        issues.push({ severity: "error", message: "AI 换脸需要原始模特图和目标脸图，不能使用同一张图。" });
      }
      break;
    }
    default:
      break;
  }

  if (images.length > 1 && !hasExplicitRoles) {
    issues.push({
      severity: "warning",
      message: "多图任务建议先标记图片角色，能明显降低图像关系识别错误。",
    });
  }

  return issues;
}

function collectRoleUrls(images: ImageLike[]): Record<ChatImageRole, string[]> {
  const output: Record<ChatImageRole, string[]> = {
    auto: [],
    clothing: [],
    reference: [],
    face: [],
    background: [],
    source: [],
  };

  for (const image of [...images].sort((a, b) => a.index - b.index)) {
    const role = image.role || "auto";
    const url = image.hostedUrl || image.url;
    if (role === "auto" || !url) continue;
    output[role].push(url);
  }

  return output;
}

function toUrlList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

function toRefList(value: unknown): string[] {
  return toUrlList(value).flatMap((item) => {
    const refs = [item];
    const chineseMatch = item.match(/图\s*(\d+)/);
    if (chineseMatch) refs.push(`图${chineseMatch[1]}`);
    const englishMatch = item.match(/Image\s*(\d+)/i);
    if (englishMatch) refs.push(`Image ${englishMatch[1]}`);
    return refs;
  });
}

function roleLabel(role: ChatImageRole): string {
  const labels: Record<ChatImageRole, string> = {
    auto: "自动",
    clothing: "服装",
    reference: "参考",
    face: "脸图",
    background: "背景",
    source: "原图",
  };
  return labels[role];
}
