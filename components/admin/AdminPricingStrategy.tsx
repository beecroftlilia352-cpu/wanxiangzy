"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeDollarSign, CheckCircle2, CircleDollarSign, Loader2, RefreshCw, Save, SlidersHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AdminMetricCard, AdminNotice, AdminSection, AdminStatusBadge } from "@/components/admin/AdminPrimitives";
import type { AdminBillingPrice, AdminBillingProduct } from "@/lib/admin/billing";

type ControlPlaneSnapshot = {
  config?: {
    models?: Array<{
      id: string;
      displayName: string;
      modality: string;
      enabled: boolean;
      userVisible: boolean;
      creditPrices?: Record<string, number>;
    }>;
  };
};

type EditableModel = NonNullable<NonNullable<ControlPlaneSnapshot["config"]>["models"]>[number] & { creditPrices: Record<string, number> };

export function AdminPricingStrategy({ products, prices, canManage = false }: { products: AdminBillingProduct[]; prices: AdminBillingPrice[]; canManage?: boolean }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<ControlPlaneSnapshot | null>(null);
  const [models, setModels] = useState<EditableModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const activePrices = prices.filter((price) => price.active);
  const activeWalletPrices = activePrices.filter((price) => price.type !== "recurring" && price.recurringInterval !== "month");
  const averageYuanPer100 = useMemo(() => {
    const samples = activeWalletPrices.filter((price) => price.credits > 0).map((price) => price.unitAmount / price.credits * 100 / 100);
    return samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : null;
  }, [activeWalletPrices]);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/model-control", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as ControlPlaneSnapshot & { error?: string };
      if (!response.ok) throw new Error(payload.error || "无法加载模型扣点策略");
      setSnapshot(payload);
      setModels((payload.config?.models || []).map((model) => ({ ...model, creditPrices: { ...(model.creditPrices || {}) } })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法加载模型扣点策略");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function setCreditPrice(modelId: string, dimension: string, value: string) {
    if (!canManage) return;
    const next = Number(value);
    setModels((current) => current.map((model) => model.id !== modelId ? model : {
      ...model,
      creditPrices: {
        ...model.creditPrices,
        [dimension]: Number.isFinite(next) && next >= 0 ? Math.floor(next) : 0,
      },
    }));
  }

  async function saveModelCredits(action: "save-draft" | "publish") {
    if (!canManage || !snapshot?.config) return;
    setSaving(true);
    try {
      const config = {
        ...snapshot.config,
        models: (snapshot.config.models || []).map((model) => {
          const edited = models.find((item) => item.id === model.id);
          return edited ? { ...model, creditPrices: edited.creditPrices } : model;
        }),
      };
      const response = await fetch("/api/admin/model-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, config }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "保存模型扣点失败");
      toast.success(action === "publish" ? "模型扣点已发布" : "模型扣点草稿已保存");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存模型扣点失败");
    } finally {
      setSaving(false);
    }
  }

  async function retirePrice(price: AdminBillingPrice) {
    if (!canManage) return;
    if (!window.confirm(`停用 ${price.nickname || price.id}？已创建的订单不受影响，新的结账将不再展示该价格。`)) return;
    try {
      const response = await fetch(`/api/admin/billing/prices/${encodeURIComponent(price.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "停用价格失败");
      toast.success("价格已停用");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "停用价格失败");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="有效售卖价格" value={activePrices.length} hint="已启用的 Stripe / 钱包价格" icon={<BadgeDollarSign className="h-4 w-4" />} tone={activePrices.length ? "good" : "warning"} />
        <AdminMetricCard label="一次性套餐" value={activeWalletPrices.length} hint="可用于即时充值的售卖 SKU" icon={<CircleDollarSign className="h-4 w-4" />} />
        <AdminMetricCard label="平均每 100 灵点" value={averageYuanPer100 == null ? "-" : `¥${averageYuanPer100.toFixed(2)}`} hint="按当前一次性有效套餐加权前均值" icon={<SlidersHorizontal className="h-4 w-4" />} />
        <AdminMetricCard label="可配置模型扣点" value={models.filter((model) => model.enabled && (model.userVisible || model.modality === "video")).length} hint="图片可见模型与视频服务模型" icon={<Sparkles className="h-4 w-4" />} tone={models.length ? "good" : "warning"} />
      </div>

      <AdminNotice tone="info">
        定价分为三个独立层：套餐决定现金售价与发放灵点；模型扣点决定每次使用消耗；供应商成本与容量在模型控制台管理。修改已同步到 Stripe 的金额时请新建价格并停用旧价格，Stripe Price 不可原地改价。
      </AdminNotice>

      <AdminSection title="售卖套餐" description="用套餐矩阵检查每档到账灵点、赠送比例和单位价格。新增或修改 SKU 后，再执行 Stripe 同步。">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left text-sm">
            <thead className="bg-[var(--admin-surface-soft)] text-xs font-black uppercase tracking-[0.08em] text-[var(--admin-faint)]">
              <tr>{["套餐", "售价", "到账灵点", "赠送", "每 100 灵点", "结算方式", "状态", "操作"].map((label) => <th key={label} className="border-b border-[var(--admin-border)] px-4 py-3">{label}</th>)}</tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const productPrices = prices.filter((price) => price.stripeProductId === product.stripeProductId || price.productName === product.name);
                const price = productPrices.find((item) => item.active && item.recurringInterval !== "month") || productPrices[0];
                const granted = price?.credits || product.creditAmount + product.bonusCredits;
                const bonus = product.bonusCredits > 0
                  ? product.bonusCredits
                  : Math.max(0, granted - product.creditAmount);
                return <tr key={product.id} className="border-b border-[var(--admin-border)] last:border-0 hover:bg-[var(--admin-surface-soft)]">
                  <td className="px-4 py-3"><p className="font-black text-[var(--admin-fg)]">{product.name}</p><p className="mt-1 text-xs font-semibold text-[var(--admin-muted)]">{product.description || "未填写套餐说明"}</p></td>
                  <td className="px-4 py-3 font-mono font-black text-[var(--admin-fg)]">{price ? formatMoney(price.unitAmount, price.currency) : "未定价"}</td>
                  <td className="px-4 py-3 font-mono font-black text-[var(--admin-fg)]">{granted.toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-[var(--admin-muted)]">{bonus > 0 ? `+${bonus.toLocaleString()}` : "-"}</td>
                  <td className="px-4 py-3 font-mono font-bold text-[var(--admin-fg)]">{price && granted ? `¥${(price.unitAmount / granted).toFixed(2)}` : "-"}</td>
                  <td className="px-4 py-3 text-xs font-bold text-[var(--admin-muted)]">{price?.recurringInterval === "month" ? "月订阅" : "一次性"}</td>
                  <td className="px-4 py-3"><AdminStatusBadge status={product.active && price?.active ? "active" : "inactive"} /></td>
                  <td className="px-4 py-3">{canManage && price?.active ? <button type="button" onClick={() => void retirePrice(price)} className="text-xs font-black text-[var(--admin-danger)] hover:underline">停用价格</button> : <span className="text-xs font-bold text-[var(--admin-faint)]">{canManage ? "-" : "只读"}</span>}</td>
                </tr>;
              })}
              {!products.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-sm font-bold text-[var(--admin-muted)]">尚无售卖套餐。先在下方创建商品和价格，再同步 Stripe。</td></tr>}
            </tbody>
          </table>
        </div>
      </AdminSection>

      <AdminSection
        title="各模块扣点"
        description="这里决定用户生成时实际扣除的灵点。保存草稿不会改变线上结算；发布后新任务立即使用新扣点，历史订单与已创建任务不回写。"
        actions={<><button type="button" onClick={() => void load()} disabled={loading || saving} className={secondaryButton}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</button>{canManage && <><button type="button" onClick={() => void saveModelCredits("save-draft")} disabled={loading || saving} className={secondaryButton}><Save className="h-4 w-4" />保存草稿</button><button type="button" onClick={() => void saveModelCredits("publish")} disabled={loading || saving} className={primaryButton}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}发布扣点</button></>}</>}
      >
        {!canManage && <AdminNotice tone="info">当前角色可以查看套餐和模块扣点，但不能修改价格、停用 SKU 或发布扣点配置。</AdminNotice>}
        {loading ? <div className="flex h-36 items-center justify-center text-sm font-bold text-[var(--admin-muted)]"><Loader2 className="mr-2 h-4 w-4 animate-spin" />加载定价策略…</div> : <div className="divide-y divide-[var(--admin-border)]">
          {models.filter((model) => model.userVisible || model.modality === "video").map((model) => <ModelCreditRow key={model.id} model={model} onChange={setCreditPrice} canManage={canManage} />)}
          {!models.filter((model) => model.userVisible || model.modality === "video").length && <p className="px-4 py-12 text-center text-sm font-bold text-[var(--admin-muted)]">没有可配置的用户可见模型或视频服务。</p>}
        </div>}
      </AdminSection>
    </div>
  );
}

function ModelCreditRow({ model, onChange, canManage }: { model: EditableModel; onChange: (modelId: string, dimension: string, value: string) => void; canManage: boolean }) {
  const fallbackDimensions = defaultDimensions(model.modality, model.id);
  const dimensions = model.modality === "video"
    ? Array.from(new Set([...fallbackDimensions, ...Object.keys(model.creditPrices)]))
    : Object.keys(model.creditPrices).length ? Object.keys(model.creditPrices) : fallbackDimensions;
  return <div className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(190px,1fr)_minmax(0,2fr)_auto] lg:items-center">
    <div><div className="flex items-center gap-2"><p className="font-black text-[var(--admin-fg)]">{model.displayName}</p><AdminStatusBadge status={model.enabled ? "active" : "inactive"} /></div><p className="mt-1 font-mono text-xs text-[var(--admin-faint)]">{model.id} · {model.modality}</p></div>
    <div className="grid gap-2 sm:grid-cols-3">{dimensions.map((dimension) => <label key={dimension} className="grid grid-cols-[1fr_86px] items-center gap-2 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-2 py-1.5"><span className="truncate text-xs font-black text-[var(--admin-muted)]">{dimension}</span><input aria-label={`${model.displayName} ${dimension} 扣点`} disabled={!canManage} type="number" min="0" step="1" value={model.creditPrices[dimension] ?? 0} onChange={(event) => onChange(model.id, dimension, event.target.value)} className="h-8 min-w-0 rounded border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-right font-mono text-sm font-black text-[var(--admin-fg)] outline-none focus:ring-2 focus:ring-[var(--admin-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60" /></label>)}</div>
    <p className="text-xs font-semibold text-[var(--admin-muted)]">每次请求</p>
  </div>;
}

function defaultDimensions(modality: string, modelId?: string) {
  if (modality === "image") return ["1K", "2K", "4K"];
  if (modality === "video") {
    const combinations = modelId === "video-seedance"
      ? ["mini:720p", "fast:480p", "fast:720p", "pro:720p", "pro:1080p"]
      : ["pro:768p", "pro:2k"];
    return combinations.flatMap((combination) => [`${combination}:minimum`, `${combination}:perSecond`]);
  }
  return ["每次"];
}
function formatMoney(amount: number, currency: string) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: (currency || "CNY").toUpperCase(), maximumFractionDigits: 2 }).format(amount / 100); }
const secondaryButton = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-xs font-black text-[var(--admin-fg)] transition-colors hover:bg-[var(--admin-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[var(--admin-fg)] px-3 text-xs font-black text-[var(--admin-surface)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
