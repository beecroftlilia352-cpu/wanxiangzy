"use client";

import { useEffect, useMemo, useState } from "react";
import { Gauge, Loader2, Route, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "next-intl";

type RoutingMode = "stable" | "smart";

export function RoutingPreferenceCard() {
  const locale = useLocale();
  const copy = useMemo(() => locale.toLowerCase().startsWith("zh") ? ZH_COPY : EN_COPY, [locale]);
  const [mode, setMode] = useState<RoutingMode>("stable");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/routing-preference", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || copy.loadFailed);
        if (!active) return;
        setMode(payload.routingMode === "smart" ? "smart" : "stable");
        setAvailable(payload.available !== false);
      })
      .catch(() => { if (active) setAvailable(false); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [copy.loadFailed]);

  async function select(next: RoutingMode) {
    if (next === mode || saving || !available) return;
    const previous = mode;
    setMode(next);
    setSaving(true);
    try {
      const response = await fetch("/api/routing-preference", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routingMode: next, allowCrossModelFallback: false }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || copy.saveFailed);
      toast.success(next === "smart" ? copy.smartSaved : copy.stableSaved);
    } catch (error) {
      setMode(previous);
      toast.error(error instanceof Error ? error.message : copy.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-[var(--codex-border)] bg-white/75 p-5 shadow-sm dark:bg-[var(--codex-surface)]" aria-labelledby="routing-preference-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-[#5b7cff]" aria-hidden="true" />
            <h2 id="routing-preference-title" className="text-base font-semibold text-codex-ink">{copy.title}</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-codex-muted">{copy.description}</p>
        </div>
        {saving && <span className="inline-flex items-center gap-2 text-xs font-semibold text-codex-muted"><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />{copy.saving}</span>}
      </div>
      {loading ? (
        <div className="mt-4 h-20 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none dark:bg-slate-800" />
      ) : !available ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{copy.unavailable}</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ModeButton active={mode === "stable"} currentLabel={copy.current} title={copy.stableTitle} description={copy.stableDescription} icon={<ShieldCheck className="h-5 w-5" />} onClick={() => void select("stable")} />
          <ModeButton active={mode === "smart"} currentLabel={copy.current} title={copy.smartTitle} description={copy.smartDescription} icon={<Gauge className="h-5 w-5" />} onClick={() => void select("smart")} />
        </div>
      )}
    </section>
  );
}

function ModeButton({ active, currentLabel, title, description, icon, onClick }: { active: boolean; currentLabel: string; title: string; description: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`cursor-pointer rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b7cff]/40 motion-reduce:transition-none ${active ? "border-[#5b7cff] bg-[#eef2ff] dark:bg-[#28304d]" : "border-[var(--codex-border)] bg-white/70 hover:bg-slate-50 dark:bg-[var(--codex-surface-soft)] dark:hover:bg-slate-800"}`}>
      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${active ? "bg-[#5b7cff] text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{icon}</span>
      <span className="mt-3 block text-sm font-semibold text-codex-ink">{title}{active ? ` · ${currentLabel}` : ""}</span>
      <span className="mt-1 block text-xs leading-5 text-codex-muted">{description}</span>
    </button>
  );
}

const ZH_COPY = {
  title: "模型调用路由",
  description: "只在你已选择的同一个模型下切换供应商，不会把香蕉 2 暗中替换成 Pro 或 GPT，也不会改变灵点价格。",
  saving: "保存中",
  unavailable: "路由偏好尚不可用，当前继续使用稳定路由。",
  stableTitle: "稳定路由",
  stableDescription: "遵循管理员优先级，在同级供应商池内按容量和权重分流。",
  smartTitle: "智能路由",
  smartDescription: "综合近期成功率、速度、容量、成本与质量，在同级池中动态选择。",
  current: "当前",
  loadFailed: "路由偏好加载失败",
  saveFailed: "路由偏好保存失败",
  smartSaved: "已开启智能路由",
  stableSaved: "已切换为稳定路由",
};

const EN_COPY = {
  title: "Model routing",
  description: "Routing only changes the provider behind the same model. It never silently upgrades or substitutes the model, and it does not change the credit price.",
  saving: "Saving",
  unavailable: "Routing preferences are temporarily unavailable. Stable routing remains active.",
  stableTitle: "Stable routing",
  stableDescription: "Follow admin priority, then distribute within the same-priority pool by capacity and weight.",
  smartTitle: "Smart routing",
  smartDescription: "Choose dynamically within the same pool using reliability, speed, capacity, cost, and quality.",
  current: "Current",
  loadFailed: "Failed to load routing preferences",
  saveFailed: "Failed to save routing preferences",
  smartSaved: "Smart routing enabled",
  stableSaved: "Stable routing enabled",
};
