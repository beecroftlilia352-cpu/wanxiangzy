"use client";
import { AdminPageHeader } from "@/components/admin/AdminPrimitives";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Image, Input, Select, Space, Table, Tag, Typography } from "@/components/ui/shadcn-compat";
import type { ColumnsType } from "@/components/ui/shadcn-compat";
import { DatabaseOutlined, SearchOutlined } from "@/components/ui/ant-icons-compat";
import { AdminAssetModerationForm } from "@/components/admin/AdminAssetModerationForm";
import { App } from "@/components/ui/shadcn-compat";
import type { AdminAssetList, AdminAssetListItem } from "@/lib/admin/data";

type AdminAssetsClientProps = {
  assets: AdminAssetList;
  q: string;
  module: string;
  canModerate?: boolean;
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

export function AdminAssetsClient({ assets, q, module, canModerate = false }: AdminAssetsClientProps) {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const [moduleValue, setModuleValue] = useState(module);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [batchReason, setBatchReason] = useState("");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");

  const selectedRows = assets.rows.filter((row) => selectedKeys.includes(`${row.sourceType}:${row.id}`));

  function runBatch(action: "pass" | "hide") {
    if (!canModerate || !selectedRows.length || batchLoading) return;
    const reason = batchReason.trim();
    if (reason.length < 4) {
      setBatchMessage("请先填写至少 4 个字的审核原因。");
      return;
    }
    modal.confirm({
      title: action === "hide" ? "确认批量下架" : "确认批量通过",
      content: `将对当前选中的 ${selectedRows.length} 项资产写入审核记录。原因：${reason}`,
      okText: action === "hide" ? "确认下架" : "确认通过",
      okButtonProps: { danger: action === "hide" },
      async onOk() {
        await executeBatch(action, reason);
      },
    });
  }

  async function executeBatch(action: "pass" | "hide", reason: string) {
    setBatchLoading(true);
    setBatchMessage("");
    const results = await Promise.allSettled(selectedRows.map(async (row) => {
      const res = await fetch(`/api/admin/assets/${encodeURIComponent(row.id)}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: row.sourceType, action, reason }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`);
    }));
    const failed = results.filter((result) => result.status === "rejected").length;
    const succeeded = results.length - failed;
    setBatchLoading(false);
    setBatchReason("");
    if (failed) {
      setBatchMessage(`批量操作完成：成功 ${succeeded} 项，失败 ${failed} 项。失败项未被隐藏，请刷新后单独重试。`);
      message.error(`批量操作有 ${failed} 项失败`);
    } else {
      setBatchMessage(`批量操作已完成：${succeeded} 项已写入审核记录。`);
      message.success(`已处理 ${succeeded} 项资产`);
      setSelectedKeys([]);
    }
    router.refresh();
  }

  const columns = useMemo<ColumnsType<AdminAssetListItem>>(() => [
    { title: "预览", width: 110, render: (_, row) => <Preview urls={row.urls.length ? row.urls : row.inputUrls} /> },
    {
      title: "资产",
      width: 300,
      render: (_, row) => (
        <Space orientation="vertical" size={0} className="min-w-0">
          <Space size={4} wrap><StatusTag status={row.status} /><Tag>{sourceTypeLabel(row.sourceType)}</Tag><Tag>编号 {shortId(row.id)}</Tag></Space>
          <Typography.Text strong className="block truncate">{row.title}</Typography.Text>
        </Space>
      ),
    },
    { title: "模块", dataIndex: "moduleLabel", width: 130 },
    {
      title: "审核",
      width: 160,
      render: (_, row) => row.moderationCase ? (
        <Space orientation="vertical" size={0} className="min-w-0">
          <StatusTag status={row.moderationCase.action} />
          <Typography.Text type="secondary" className="block truncate text-xs" title={row.moderationCase.reason || ""}>
            {row.moderationCase.reason || "-"}
          </Typography.Text>
        </Space>
      ) : <Tag>未处理</Tag>,
    },
    { title: "图片", width: 90, render: (_, row) => <span className="tabular-nums">{`${row.urls.length}/${row.inputUrls.length}`}</span> },
    { title: "归属", dataIndex: "userId", width: 120, render: (value) => value ? <Tag>用户作品</Tag> : <Tag>系统素材</Tag> },
    { title: "时间", width: 130, render: (_, row) => formatDateTime(row.updatedAt || row.createdAt) },
    { title: "操作", width: 250, render: (_, row) => canModerate ? <AdminAssetModerationForm sourceId={row.id} sourceType={row.sourceType} /> : <span className="text-xs font-bold text-[var(--admin-muted)]">只读</span> },
  ], [canModerate]);

  return (
    <Space orientation="vertical" size={16} className="w-full">
      <AdminPageHeader
        eyebrow="内容管理"
        title="资产与作品"
        description="统一查看生成结果、输入图、预设参考图和商品套图收藏方案。"
        actions={
          <Link
            href="/admin/assets/lifecycle"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold text-[var(--admin-fg)] shadow-sm transition-colors hover:border-[var(--admin-border-strong)] hover:text-[var(--admin-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-fg)] focus-visible:ring-offset-2"
          >
            <DatabaseOutlined aria-hidden="true" />
            存储治理（高级）
          </Link>
        }
      />

      {assets.warnings.length > 0 && <Alert type="warning" showIcon message="资产数据源提示" description={assets.warnings.slice(0, 3).join("；")} />}

      <Card
        title="资产列表"
        extra={
          <form action="/admin/assets">
            <Space wrap>
              <Input
                name="q"
                defaultValue={q}
                allowClear
                prefix={<SearchOutlined aria-hidden="true" />}
                placeholder="搜索资产 / 用户 / 状态"
                aria-label="搜索资产"
              />
              <Select className="!w-36" options={moduleOptions} value={moduleValue} onChange={setModuleValue} popupMatchSelectWidth={false} aria-label="按模块筛选" />
              <input type="hidden" name="module" value={moduleValue} />
              <Button htmlType="submit" type="primary">筛选</Button>
            </Space>
          </form>
        }
      >
        {batchMessage && <Alert className="mb-3" type={batchMessage.includes("失败") ? "warning" : "success"} showIcon message={batchMessage} />}
        {canModerate && selectedKeys.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3 py-2">
            <span className="text-xs font-black text-[var(--admin-fg)]">已选 {selectedKeys.length} 项</span>
            <input
              value={batchReason}
              onChange={(event) => setBatchReason(event.target.value)}
              placeholder="批量审核原因（必填）"
              className="h-8 w-56 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-xs font-semibold outline-none"
            />
            <Button size="small" type="primary" disabled={batchLoading} onClick={() => runBatch("pass")}>
              批量通过
            </Button>
            <Button size="small" danger disabled={batchLoading} onClick={() => runBatch("hide")}>
              批量下架
            </Button>
            <Button size="small" onClick={() => { setSelectedKeys([]); setBatchReason(""); }}>
              取消选择
            </Button>
          </div>
        ) : null}
        <Table<AdminAssetListItem>
          size="small"
          rowKey={(row) => `${row.sourceType}:${row.id}`}
          rowSelection={canModerate ? {
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys as string[]),
          } : undefined}
          columns={columns}
          dataSource={assets.rows}
          scroll={{ x: 1250 }}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          locale={{ emptyText: "暂无资产" }}
        />
      </Card>
    </Space>
  );
}

function Preview({ urls }: { urls: string[] }) {
  const clean = urls.filter(Boolean);
  if (!clean.length) return <Typography.Text type="secondary">无图片</Typography.Text>;
  return (
    <Image.PreviewGroup items={clean}>
      <Image width={48} height={48} src={clean[0]} alt="" style={{ objectFit: "cover", borderRadius: 8 }} />
      {clean.length > 1 && <Tag className="ml-1">+{clean.length - 1}</Tag>}
    </Image.PreviewGroup>
  );
}

function StatusTag({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const color = normalized === "hide" || normalized === "failed" ? "red" : normalized === "pass" || normalized === "completed" ? "green" : normalized === "escalate" || normalized === "pending" ? "orange" : "default";
  return <Tag color={color}>{status}</Tag>;
}

function sourceTypeLabel(value: string) {
  if (value === "generation") return "生成结果";
  if (value === "reference") return "参考图";
  if (value === "favorite-plan") return "收藏方案";
  return value;
}

function shortId(value: string) {
  return value ? value.slice(0, 8) : "-";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
