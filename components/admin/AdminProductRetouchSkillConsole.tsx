"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Eye,
  FilePlus2,
  History,
  Loader2,
  Rocket,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  AdminNotice,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  formatDateTime,
} from "@/components/admin/AdminPrimitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ProductRetouchSkillDefinition } from "@/lib/product-retouch";

const ENDPOINT_BASE = "/api/admin/product-retouch-skill/configs";

export type ProductRetouchSkillVersionRow = {
  id: string;
  config_key: string;
  status: string;
  value: Record<string, unknown>;
  created_by: string | null;
  published_at: string | null;
  created_at: string | null;
};

type Props = {
  versions: ProductRetouchSkillVersionRow[];
  activeVersionId: string | null;
  builtIn: ProductRetouchSkillDefinition;
  warnings: string[];
};

export function AdminProductRetouchSkillConsole({
  versions,
  activeVersionId,
  builtIn,
  warnings,
}: Props) {
  const router = useRouter();
  const builtInJson = useMemo(() => JSON.stringify(builtIn, null, 2), [builtIn]);

  const [draftJson, setDraftJson] = useState(builtInJson);
  const [draftStatus, setDraftStatus] = useState<"draft" | "published">("draft");
  const [submitting, setSubmitting] = useState(false);
  const [previewRow, setPreviewRow] = useState<ProductRetouchSkillVersionRow | null>(null);
  const [pendingAction, setPendingAction] = useState<
    | { id: string; action: "publish" | "archive" }
    | null
  >(null);
  const [actionReason, setActionReason] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const activeVersion = versions.find((row) => row.id === activeVersionId) || null;
  const summary = useMemo(() => summarize(versions, activeVersionId), [versions, activeVersionId]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(draftJson);
      } catch {
        throw new Error("配置内容必须是合法 JSON");
      }
      const reason = draftStatus === "published"
        ? window.prompt("发布配置：请填写至少 6 个字符的操作原因", "") || ""
        : "";
      if (draftStatus === "published" && reason.trim().length < 6) {
        throw new Error("发布配置需要填写至少 6 个字符的原因");
      }
      const res = await fetch(ENDPOINT_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: draftStatus, value: parsed, reason }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `保存失败 (${res.status})`);
      toast.success(draftStatus === "published" ? "Skill 已发布并生效" : "草稿已保存");
      setDraftStatus("draft");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  function openAction(row: ProductRetouchSkillVersionRow, action: "publish" | "archive") {
    setActionReason("");
    setPendingAction({ id: row.id, action });
  }

  async function runAction() {
    if (!pendingAction) return;
    const reason = actionReason.trim();
    if (reason.length < 6) {
      toast.error("请填写至少 6 个字符的操作原因");
      return;
    }
    const { id, action } = pendingAction;
    setActing(`${id}:${action}`);
    try {
      const res = await fetch(`${ENDPOINT_BASE}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `操作失败 (${res.status})`);
      toast.success(action === "publish" ? "Skill 已发布" : "Skill 已归档");
      setPendingAction(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="space-y-5">
      {warnings.length > 0 && (
        <AdminNotice tone="warning">
          配置数据源提示：{warnings.slice(0, 3).join("；")}
        </AdminNotice>
      )}

      <AdminSection
        title="当前生效版本"
        description="运行时会优先使用此处发布的版本；如未发布或校验失败，将自动回退到内置 Skill。"
      >
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <SummaryCard
            icon={<Sparkles aria-hidden="true" />}
            label="内置 Skill 版本"
            value={builtIn.version}
            tone="neutral"
          />
          <SummaryCard
            icon={<Rocket aria-hidden="true" />}
            label="已发布"
            value={activeVersion?.value ? `v${readVersion(activeVersion.value, "—")}` : "未发布"}
            tone={activeVersion ? "good" : "warning"}
          />
          <SummaryCard
            icon={<History aria-hidden="true" />}
            label="历史版本"
            value={`${versions.length} 条 / 草稿 ${summary.drafts} 条 / 归档 ${summary.archived} 条`}
            tone="neutral"
          />
        </div>
        {activeVersion ? (
          <div className="border-t border-[var(--admin-border)] px-4 py-3 text-xs text-[var(--admin-muted)]">
            发布时间 {formatDateTime(activeVersion.published_at)} · 版本号
            v{readVersion(activeVersion.value, "—")} · 操作人
            <span className="ml-1 font-mono">{activeVersion.created_by || "system"}</span>
          </div>
        ) : (
          <div className="border-t border-[var(--admin-border)] px-4 py-3 text-xs text-[var(--admin-warning)]">
            当前没有已发布版本，运行时使用内置 Skill（BUILTIN_PRODUCT_RETOUCH_SKILL v{builtIn.version}）。
          </div>
        )}
      </AdminSection>

      <AdminSection
        title="创建配置版本"
        description="把待发布内容粘贴为 JSON，必须通过严格 Schema 校验才能落地。发布时需填写操作原因。"
        actions={
          <div className="flex items-center gap-2 text-xs text-[var(--admin-muted)]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDraftJson(builtInJson)}
            >
              载入内置 Skill
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreate} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-bold text-[var(--admin-fg)]">
              状态
              <select
                value={draftStatus}
                onChange={(event) => setDraftStatus(event.target.value as "draft" | "published")}
                className="rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-1 text-xs font-semibold text-[var(--admin-fg)] outline-none focus:border-[var(--admin-accent)]"
              >
                <option value="draft">仅保存为草稿</option>
                <option value="published">立即发布</option>
              </select>
            </label>
            <span className="text-xs text-[var(--admin-muted)]">
              选择「立即发布」会弹窗要求填写操作原因（≥6 字符）。
            </span>
          </div>
          <Textarea
            value={draftJson}
            onChange={(event) => setDraftJson(event.target.value)}
            rows={18}
            spellCheck={false}
            className="font-mono text-xs"
            placeholder="粘贴商品精修 Skill JSON"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--admin-muted)]">
              校验规则：id 必须是 product-retouch，schemaVersion 必须为 1，
              必须包含 modes / categoryProfiles / invariants / promptTemplates /
              modelPolicy / limits / hardValidation。
            </p>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FilePlus2 aria-hidden="true" className="h-4 w-4" />}
              {draftStatus === "published" ? "发布新版本" : "保存草稿"}
            </Button>
          </div>
        </form>
      </AdminSection>

      <AdminSection
        title="历史版本"
        description="按创建时间倒序展示。所有 publish / archive 操作会写入审计日志。"
      >
        <AdminTable<ProductRetouchSkillVersionRow>
          rows={versions}
          rowKey={(row) => row.id}
          empty="暂无配置版本"
          columns={[
            {
              key: "version",
              label: "版本号",
              render: (row) => (
                <div className="flex flex-col">
                  <span className="font-mono text-sm font-black text-[var(--admin-fg)]">
                    v{readVersion(row.value, "—")}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--admin-faint)]">
                    {row.id.slice(0, 8)}
                  </span>
                </div>
              ),
            },
            {
              key: "status",
              label: "状态",
              render: (row) => <AdminStatusBadge status={row.status} />,
            },
            {
              key: "created",
              label: "创建",
              render: (row) => (
                <div className="flex flex-col text-xs">
                  <span className="font-semibold text-[var(--admin-fg)]">
                    {formatDateTime(row.created_at)}
                  </span>
                  <span className="text-[var(--admin-faint)]">{row.created_by || "system"}</span>
                </div>
              ),
            },
            {
              key: "published",
              label: "发布时间",
              render: (row) => (
                <span className="whitespace-nowrap text-xs font-semibold text-[var(--admin-muted)]">
                  {formatDateTime(row.published_at)}
                </span>
              ),
            },
            {
              key: "actions",
              label: "操作",
              render: (row) => (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewRow(row)}
                    className="gap-1"
                  >
                    <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                    查看
                  </Button>
                  {row.status !== "published" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openAction(row, "publish")}
                      disabled={Boolean(acting)}
                      className="gap-1"
                    >
                      <Rocket aria-hidden="true" className="h-3.5 w-3.5" />
                      发布
                    </Button>
                  )}
                  {row.status !== "archived" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openAction(row, "archive")}
                      disabled={Boolean(acting)}
                      className="gap-1"
                    >
                      <Archive aria-hidden="true" className="h-3.5 w-3.5" />
                      归档
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </AdminSection>

      <Dialog
        open={Boolean(previewRow)}
        onOpenChange={(open) => {
          if (!open) setPreviewRow(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {previewRow ? `查看 v${readVersion(previewRow.value, "—")}` : "查看"}
            </DialogTitle>
            <DialogDescription>
              仅查看 JSON 内容。修改请通过「创建配置版本」流程。
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] p-3 text-xs text-[var(--admin-fg)]">
            {previewRow ? JSON.stringify(previewRow.value, null, 2) : ""}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewRow(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingAction?.action === "publish" ? "发布 Skill 版本" : "归档 Skill 版本"}
            </DialogTitle>
            <DialogDescription>
              请填写至少 6 个字符的操作原因，将写入审计日志。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={actionReason}
            onChange={(event) => setActionReason(event.target.value)}
            rows={4}
            placeholder="例如：v1.1.0 修复白底阴影溢出"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingAction(null)}>
              取消
            </Button>
            <Button onClick={runAction} disabled={Boolean(acting)} className="gap-2">
              {acting ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : pendingAction?.action === "publish" ? (
                <Rocket aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Archive aria-hidden="true" className="h-4 w-4" />
              )}
              {pendingAction?.action === "publish" ? "确认发布" : "确认归档"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function summarize(
  versions: ProductRetouchSkillVersionRow[],
  activeId: string | null,
) {
  const drafts = versions.filter((row) => row.status === "draft").length;
  const archived = versions.filter((row) => row.status === "archived").length;
  const rollbackable = versions.filter(
    (row) => row.status === "archived" && row.id !== activeId,
  ).length;
  return { drafts, archived, rollbackable };
}

function readVersion(value: Record<string, unknown> | null | undefined, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const raw = (value as { version?: unknown }).version;
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  return raw.trim();
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "neutral" | "good" | "warning";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200/60 bg-emerald-50/60 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
      : tone === "warning"
        ? "border-amber-200/60 bg-amber-50/60 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        : "border-[var(--admin-border)] bg-[var(--admin-surface-soft)] text-[var(--admin-fg)]";
  const Icon =
    tone === "good" ? CheckCircle2 : tone === "warning" ? AlertTriangle : Sparkles;
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${toneClass}`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/60 text-base dark:bg-black/30">
        <Icon aria-hidden="true" className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-[0.1em] opacity-70">{label}</p>
        <p className="mt-1 truncate font-mono text-sm font-black">{value}</p>
      </div>
      <span className="sr-only">{icon ? "icon" : ""}</span>
    </div>
  );
}
