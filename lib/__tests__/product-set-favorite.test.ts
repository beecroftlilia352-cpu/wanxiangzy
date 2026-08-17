import { describe, expect, it } from "vitest";
import {
  FAVORITE_PLAN_ERRORS,
  FAVORITE_PLAN_TABLE,
  favoritePlanRowToClient,
  isFavoritePlanId,
  normalizeFavoritePlanPayload,
} from "../product-set-favorite";

describe("product set favorite plan payload boundary", () => {
  it("shares API constants and validates Supabase UUID ids", () => {
    expect(FAVORITE_PLAN_TABLE).toBe("product_set_favorite_plans");
    expect(FAVORITE_PLAN_ERRORS).toMatchObject({
      unauthorized: "请先登录",
      invalidPayload: "收藏方案格式无效",
      invalidId: "收藏方案 ID 无效",
      notFound: "收藏方案不存在或无权限删除",
    });
    expect(isFavoritePlanId("not-a-uuid")).toBe(false);
    expect(isFavoritePlanId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects non-object and unnamed favorite plans", () => {
    expect(normalizeFavoritePlanPayload(null)).toBeNull();
    expect(normalizeFavoritePlanPayload([])).toBeNull();
    expect(normalizeFavoritePlanPayload({ name: "   " })).toBeNull();
  });

  it("cleans and clamps a valid favorite plan before database writes", () => {
    const payload = normalizeFavoritePlanPayload({
      name: `  ${"A".repeat(60)}\n`,
      mode: "custom",
      imageType: "details",
      genCount: 99,
      selectedTemplateIds: [1, "2", 2, -1, 0, 100001, Number.NaN, 3],
      customTemplates: [
        {
          id: " custom-1 ",
          name: "  Detail module\r\n",
          imageType: "details",
          typeDescription: `${"x".repeat(1300)}`,
          aspectRatio: "bad-ratio",
          referenceImageUrls: ["https://example.com/a.png", "javascript:alert(1)"],
          copyDensity: "rich",
          moduleRole: " ".repeat(4),
        },
        { id: "missing-description", name: "Broken", imageType: "main" },
      ],
      moduleOverrides: [
        { key: "hero", name: "  Hero override  ", extraDescription: "x".repeat(900) },
        { key: "" },
      ],
      aiModel: "not a real model!",
      aspectRatio: "16:9",
      imageSize: "1K",
      qualityMode: "advanced",
      planPreview: [
        { name: "Hero", moduleRole: "Role", aspectRatio: "1:1", source: "ai", usesModel: 1 },
        { name: "", moduleRole: "Nope", aspectRatio: "1:1", source: "ai" },
        { name: "Bad source", moduleRole: "Nope", aspectRatio: "1:1", source: "local" },
      ],
      settings: {
        country: "  China  ",
        extraDescription: "x".repeat(700),
      },
    });

    expect(payload).not.toBeNull();
    expect(payload?.name).toHaveLength(40);
    expect(payload?.mode).toBe("custom");
    expect(payload?.image_type).toBe("details");
    expect(payload?.gen_count).toBe(8);
    expect(payload?.selected_template_ids).toEqual([1, 2, 3]);
    expect(payload?.custom_templates).toHaveLength(1);
    expect(payload?.custom_templates[0]).toMatchObject({
      id: "custom-1",
      name: "Detail module",
      imageType: "details",
      aspectRatio: "3:4",
      referenceImageUrls: ["https://example.com/a.png"],
      copyDensity: "rich",
    });
    expect(payload?.custom_templates[0].typeDescription).toHaveLength(1200);
    expect(payload?.custom_templates[0].moduleRole).toBeUndefined();
    expect(payload?.module_overrides).toHaveLength(1);
    expect(payload?.module_overrides[0].name).toBe("Hero override");
    expect(payload?.module_overrides[0].extraDescription).toHaveLength(700);
    expect(payload?.ai_model).toBe("nano-banana-2");
    expect(payload?.aspect_ratio).toBe("16:9");
    expect(payload?.image_size).toBe("1K");
    expect(payload?.quality_mode).toBe("advanced");
    expect(payload?.plan_preview).toEqual([
      { name: "Hero", moduleRole: "Role", aspectRatio: "1:1", source: "ai", usesModel: false },
    ]);
    expect(payload?.settings.country).toBe("China");
    expect(payload?.settings.extraDescription).toHaveLength(600);
    expect(payload?.updated_at).toEqual(expect.any(String));
  });

  it("applies safe defaults without changing the existing client contract", () => {
    const payload = normalizeFavoritePlanPayload({ name: "Quick save" });

    expect(payload).toMatchObject({
      name: "Quick save",
      mode: "smart",
      image_type: "main",
      gen_count: 3,
      selected_template_ids: [],
      custom_templates: [],
      module_overrides: [],
      ai_model: "nano-banana-2",
      aspect_ratio: "1:1",
      image_size: "1K",
      quality_mode: "standard",
      plan_preview: [],
    });
  });

  it("preserves a safe administrator-defined model id", () => {
    const payload = normalizeFavoritePlanPayload({
      name: "Dynamic model plan",
      aiModel: "qwen-image-3",
    });

    expect(payload?.ai_model).toBe("qwen-image-3");
  });

  it("normalizes database rows before returning them to the client", () => {
    const client = favoritePlanRowToClient({
      id: "row-1",
      name: " Saved plan\u0000 ",
      created_at: "",
      updated_at: "2026-05-08T00:00:00.000Z",
      mode: "unknown",
      image_type: "details",
      gen_count: "9",
      settings: null,
      selected_template_ids: [5, "6", -2, 5],
      custom_templates: "bad",
      module_overrides: [{ key: "module-1", name: "Module" }],
      ai_model: "bad model!",
      aspect_ratio: "bad",
      image_size: "bad",
      quality_mode: "bad",
      plan_preview: [{ name: "Preview", source: "custom", aspectRatio: "21:9" }],
    });

    expect(client).toMatchObject({
      id: "row-1",
      name: "Saved plan",
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
      mode: "smart",
      imageType: "details",
      genCount: 8,
      selectedTemplateIds: [5, 6],
      customTemplates: [],
      aiModel: "nano-banana-2",
      aspectRatio: "3:4",
      imageSize: "1K",
      qualityMode: "standard",
    });
    expect(client.moduleOverrides).toHaveLength(1);
    expect(client.planPreview).toEqual([
      { name: "Preview", moduleRole: "", aspectRatio: "21:9", source: "custom", usesModel: false },
    ]);
  });
});
