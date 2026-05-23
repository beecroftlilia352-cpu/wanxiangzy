import { AdminPageHeader } from "@/components/admin/AdminPrimitives";
import {
  AdminTryOnReferenceConsole,
  type TryOnAdminCategoryRow,
  type TryOnAdminConfigVersionRow,
  type TryOnAdminSceneRow,
} from "@/components/admin/AdminTryOnReferenceConsole";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const CATEGORY_SELECT = [
  "id",
  "code",
  "parent_code",
  "level",
  "name_zh",
  "name_en",
  "slot",
  "is_intimate",
  "aliases",
  "recognition_labels",
  "default_view_tags",
  "default_crop_tags",
  "enabled",
  "sort_order",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

const SCENE_SELECT = [
  "id",
  "scene_key",
  "external_scene_id",
  "name",
  "image_url",
  "status",
  "priority",
  "sort_order",
  "cloth_categories",
  "gender",
  "age_ranges",
  "view_tags",
  "crop_tags",
  "scene_tags",
  "style_tags",
  "lens",
  "posture",
  "prompt_tags",
  "raw_config",
  "created_at",
  "updated_at",
].join(",");

export default async function AdminTryOnPage() {
  const warnings: string[] = [];
  const admin = getAdminClient();

  const [categories, scenes, versions] = await Promise.all([
    safeQuery<TryOnAdminCategoryRow[]>(
      admin
        .from("tryon_clothing_categories")
        .select(CATEGORY_SELECT)
        .order("sort_order", { ascending: true }),
      "服装分类表",
      warnings,
    ),
    safeQuery<TryOnAdminSceneRow[]>(
      admin
        .from("tryon_reference_scenes")
        .select(SCENE_SELECT)
        .order("sort_order", { ascending: true })
        .order("priority", { ascending: false })
        .limit(240),
      "系统参考图表",
      warnings,
    ),
    safeQuery<TryOnAdminConfigVersionRow[]>(
      admin
        .from("admin_config_versions")
        .select("id,config_key,status,value,created_by,published_at,created_at")
        .eq("config_key", "tryon.reference_config")
        .order("created_at", { ascending: false })
        .limit(50),
      "配置版本表",
      warnings,
    ),
  ]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Try-on Config"
        title="试衣参考图配置"
        description="后台统一管理服装分类、系统参考图、子图集导入、推荐预览和发布版本。前台上传服装后会读取这里的 active 配置进行推荐排序。"
      />
      <AdminTryOnReferenceConsole
        initialCategories={categories}
        initialScenes={scenes}
        initialVersions={versions}
        warnings={warnings}
      />
    </div>
  );
}

async function safeQuery<T>(
  query: PromiseLike<{ data: unknown; error?: { message?: string } | null }>,
  label: string,
  warnings: string[],
): Promise<T> {
  try {
    const { data, error } = await query;
    if (error) {
      warnings.push(`${label}: ${error.message || "query failed"}`);
      return [] as T;
    }
    return (data || []) as T;
  } catch (error) {
    warnings.push(`${label}: ${error instanceof Error ? error.message : "query failed"}`);
    return [] as T;
  }
}
