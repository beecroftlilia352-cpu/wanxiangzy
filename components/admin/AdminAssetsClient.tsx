"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button, Card, Image, Input, Select, Space, Table, Tag, Typography } from "@/components/ui/shadcn-compat";
import type { ColumnsType } from "@/components/ui/shadcn-compat";
import { DatabaseOutlined, SearchOutlined } from "@/components/ui/ant-icons-compat";
import { AdminAssetModerationForm } from "@/components/admin/AdminAssetModerationForm";
import type { AdminAssetList, AdminAssetListItem } from "@/lib/admin/data";

type AdminAssetsClientProps = {
  assets: AdminAssetList;
  q: string;
  module: string;
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

export function AdminAssetsClient({ assets, q, module }: AdminAssetsClientProps) {
  const [moduleValue, setModuleValue] = useState(module);

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
    { title: "操作", width: 250, render: (_, row) => <AdminAssetModerationForm sourceId={row.id} sourceType={row.sourceType} /> },
  ], []);

  return (
    <Space orientation="vertical" size={16} className="w-full">
      <div className="admin-page-hero">
        <div>
          <Typography.Text className="admin-page-eyebrow">Assets</Typography.Text>
          <Typography.Title level={2} className="!mb-1 !mt-1">资产与作品</Typography.Title>
          <Typography.Paragraph className="!mb-0 !text-[var(--admin-muted)]">
            统一查看生成结果、输入图、预设参考图和商品套图收藏方案。
          </Typography.Paragraph>
        </div>
        <Link
          href="/admin/assets/lifecycle"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold text-[var(--admin-fg)] shadow-sm transition-colors hover:border-[var(--admin-border-strong)] hover:text-[var(--admin-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-fg)] focus-visible:ring-offset-2"
        >
          <DatabaseOutlined aria-hidden="true" />
          生命周期
        </Link>
      </div>

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
        <Table<AdminAssetListItem>
          size="small"
          rowKey={(row) => `${row.sourceType}:${row.id}`}
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
