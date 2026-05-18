import { Search } from "lucide-react";
import {
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  ThumbnailStrip,
  formatDateTime,
} from "@/components/admin/AdminPrimitives";
import { listAdminAssets, type AdminAssetListItem } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const moduleOptions = [
  { value: "", label: "全部资产" },
  { value: "tryon", label: "服装上身" },
  { value: "pose", label: "姿势裂变" },
  { value: "model", label: "专属模特" },
  { value: "modelBackground", label: "模特换背景" },
  { value: "grass", label: "种草图" },
  { value: "productSet", label: "商品套图" },
  { value: "garment3d", label: "服装 3D" },
  { value: "faceSwap", label: "换脸" },
];

export default async function AdminAssetsPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const q = getSearchParam(params.q);
  const module = getSearchParam(params.module);
  const assets = await listAdminAssets({ q, module, limit: 80 });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Assets"
        title="资产与作品"
        description="统一查看生成结果、输入图、预设参考图和商品套图收藏方案。删除、隐藏和资产归档会在下一阶段接入审计后开放。"
      />

      {assets.warnings.length > 0 && <AdminNotice>资产数据源提示：{assets.warnings.slice(0, 3).join("；")}</AdminNotice>}

      <AdminSection
        title="资产列表"
        description="生成结果来自 generations，参考图来自 reference_images，商品方案来自 product_set_favorite_plans。"
        actions={
          <form action="/admin/assets" className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={q}
                placeholder="搜索资产 / 用户 / 状态"
                className="h-9 w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm font-semibold outline-none focus:border-slate-400"
              />
            </div>
            <select name="module" defaultValue={module} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700">
              {moduleOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <button className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-black text-white" type="submit">
              筛选
            </button>
          </form>
        }
      >
        <AdminTable<AdminAssetListItem>
          rows={assets.rows}
          rowKey={(row) => `${row.sourceType}:${row.id}`}
          empty="暂无资产"
          columns={[
            {
              key: "preview",
              label: "预览",
              render: (row) => <ThumbnailStrip urls={row.urls.length ? row.urls : row.inputUrls} />,
            },
            {
              key: "asset",
              label: "资产",
              render: (row) => (
                <div className="min-w-[260px]">
                  <div className="flex items-center gap-2">
                    <AdminStatusBadge status={row.status} />
                    <span className="rounded-md bg-slate-100 px-1.5 py-1 text-[10px] font-black text-slate-500">{row.sourceType}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-black text-slate-950">{row.title}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{row.id}</p>
                </div>
              ),
            },
            { key: "module", label: "模块", render: (row) => <span className="whitespace-nowrap text-sm font-bold text-slate-700">{row.moduleLabel}</span> },
            { key: "count", label: "图片", render: (row) => <span className="font-mono text-sm font-bold text-slate-700">{row.urls.length}/{row.inputUrls.length}</span> },
            { key: "user", label: "用户", render: (row) => <code className="text-xs text-slate-500">{row.userId || "-"}</code> },
            { key: "time", label: "时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.updatedAt || row.createdAt)}</span> },
          ]}
        />
      </AdminSection>
    </div>
  );
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
