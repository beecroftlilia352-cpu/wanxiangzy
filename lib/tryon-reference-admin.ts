import {
  normalizeTryOnReferenceScene,
  type TryOnReferenceScene,
} from "@/lib/tryon-reference-config";

export type TryOnReferenceSceneValidationIssue = {
  sceneKey: string;
  field: string;
  message: string;
};

export function isAllowedTryOnReferenceImageUrl(value: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    const allowedHosts = [
      ...(process.env.TRYON_REFERENCE_IMAGE_ALLOWED_HOSTS || "").split(","),
      ...(process.env.NEXT_PUBLIC_ALIYUN_OSS_IMAGE_HOSTS || "").split(","),
      "vasthk.oss-cn-hongkong.aliyuncs.com",
    ].map((item) => item.trim().toLowerCase()).filter(Boolean);
    return allowedHosts.includes(host)
      || host.includes(".oss-")
      || host.endsWith(".aliyuncs.com")
      || host.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

export function validateTryOnReferenceSceneRows(input: {
  rows: unknown[];
  enabledCategoryCodes: Set<string>;
  requireActiveOnly?: boolean;
}) {
  const issues: TryOnReferenceSceneValidationIssue[] = [];
  const scenes = input.rows
    .map((row) => normalizeTryOnReferenceScene(row))
    .filter(Boolean) as TryOnReferenceScene[];

  for (const scene of scenes) {
    if (input.requireActiveOnly && scene.status !== "active") continue;
    if (!scene.sceneKey) {
      issues.push({ sceneKey: scene.sceneKey || "(unknown)", field: "scene_key", message: "scene_key 必填" });
    }
    if (!scene.name.trim()) {
      issues.push({ sceneKey: scene.sceneKey, field: "name", message: "name 必填" });
    }
    if (!isAllowedTryOnReferenceImageUrl(scene.imageUrl)) {
      issues.push({ sceneKey: scene.sceneKey, field: "image_url", message: "图片地址不在允许域名或 OSS 域名内" });
    }
    if (scene.status === "active" && !scene.clothCategories.length && !scene.sceneTags.length && !scene.styleTags.length) {
      issues.push({ sceneKey: scene.sceneKey, field: "status", message: "active 场景至少需要绑定类目或标签" });
    }

    const invalidCategories = scene.clothCategories.filter((code) => !input.enabledCategoryCodes.has(code));
    if (invalidCategories.length) {
      issues.push({
        sceneKey: scene.sceneKey,
        field: "cloth_categories",
        message: `类目不存在或未启用：${invalidCategories.join(", ")}`,
      });
    }
  }

  return {
    ok: issues.length === 0,
    scenes,
    issues,
  };
}
