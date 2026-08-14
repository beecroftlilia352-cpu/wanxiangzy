import { AdminPageHeader } from "@/components/admin/AdminPrimitives";
import {
  AdminProductRetouchSkillConsole,
  type ProductRetouchSkillVersionRow,
} from "@/components/admin/AdminProductRetouchSkillConsole";
import {
  BUILTIN_PRODUCT_RETOUCH_SKILL,
  PRODUCT_RETOUCH_CONFIG_KEY,
} from "@/lib/product-retouch";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const VERSION_SELECT = [
  "id",
  "config_key",
  "status",
  "value",
  "created_by",
  "published_at",
  "created_at",
].join(",");

export default async function AdminProductRetouchSkillPage() {
  const warnings: string[] = [];
  const admin = getAdminClient();

  const versions = await safeQuery<ProductRetouchSkillVersionRow[]>(
    admin
      .from("admin_config_versions")
      .select(VERSION_SELECT)
      .eq("config_key", PRODUCT_RETOUCH_CONFIG_KEY)
      .order("created_at", { ascending: false })
      .limit(50),
    "商品精修 Skill 配置版本",
    warnings,
  );

  const activeVersion = versions.find((row) => row.status === "published") || null;
  const builtIn = BUILTIN_PRODUCT_RETOUCH_SKILL;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="商品精修"
        title="商品精修 Skill 配置"
        description="统一管理商品精修 Skill 的运行时版本。草稿用于内部评审，发布后会立即在 /product-retouch 前台生效，并在审计日志留下操作原因。"
      />
      <AdminProductRetouchSkillConsole
        versions={versions}
        activeVersionId={activeVersion?.id ?? null}
        builtIn={builtIn}
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
    warnings.push(
      `${label}: ${error instanceof Error ? error.message : "query failed"}`,
    );
    return [] as T;
  }
}
