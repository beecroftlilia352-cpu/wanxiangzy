"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  type ColumnsType,
} from "@/components/ui/shadcn-compat";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@/components/ui/ant-icons-compat";
import { AdminPageHeader } from "@/components/admin/AdminPrimitives";
import {
  SHOWCASE_AUTHOR_AVATAR_URL,
  SHOWCASE_AUTHOR_NAME,
  type StudioShowcaseExample,
  type StudioShowcaseRegistry,
} from "@/lib/showcase-examples";

type FormValue = StudioShowcaseExample & { reason: string; referenceImagesText: string };

export function AdminShowcaseExamplesClient({ registry }: { registry: StudioShowcaseRegistry }) {
  const router = useRouter();
  const { message, modal } = AntdApp.useApp();
  const [form] = Form.useForm<FormValue>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StudioShowcaseExample | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const metrics = useMemo(() => ({
    total: registry.items.length,
    enabled: registry.items.filter((item) => item.enabled).length,
    disabled: registry.items.filter((item) => !item.enabled).length,
  }), [registry.items]);

  const columns: ColumnsType<StudioShowcaseExample> = [
    {
      title: "预览",
      width: 82,
      render: (_, row) => (
        <div className="relative h-14 w-14 overflow-hidden rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-soft)]">
          <Image src={row.imageUrl} alt="" fill sizes="56px" className="object-cover" />
        </div>
      ),
    },
    {
      title: "案例",
      dataIndex: "title",
      width: 340,
      render: (_, row) => (
        <Space orientation="vertical" size={1} className="min-w-0">
          <Typography.Text strong className="block max-w-[300px] truncate">{row.title}</Typography.Text>
          <Typography.Text type="secondary" className="block max-w-[300px] truncate text-xs">{row.prompt}</Typography.Text>
          <Typography.Text type="secondary" className="font-mono text-[11px]">{row.id}</Typography.Text>
        </Space>
      ),
    },
    {
      title: "配置",
      width: 190,
      render: (_, row) => (
        <Space wrap size={4}>
          <Tag>{row.model}</Tag>
          <Tag>{row.aspectRatio}</Tag>
          <Tag>{row.imageSize}</Tag>
        </Space>
      ),
    },
    {
      title: "排序",
      dataIndex: "sortOrder",
      width: 80,
      sorter: (a, b) => a.sortOrder - b.sortOrder,
    },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 90,
      filters: [{ text: "启用", value: true }, { text: "停用", value: false }],
      onFilter: (value, row) => row.enabled === value,
      render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "启用" : "停用"}</Tag>,
    },
    {
      title: "操作",
      width: 150,
      fixed: "right",
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<EditOutlined aria-hidden="true" />} onClick={() => startEdit(row)}>编辑</Button>
          <Button size="small" danger icon={<DeleteOutlined aria-hidden="true" />} onClick={() => archive(row)}>归档</Button>
        </Space>
      ),
    },
  ];

  function startCreate() {
    setEditing(null);
    form.setFieldsValue({
      id: `showcase-${Date.now()}`,
      enabled: true,
      sortOrder: registry.items.length,
      title: "",
      imageUrl: "",
      referenceImageUrls: [],
      referenceImagesText: "",
      prompt: "",
      model: "GPT Image 2",
      aspectRatio: "3:4",
      imageSize: "1K",
      authorName: SHOWCASE_AUTHOR_NAME,
      authorAvatarUrl: SHOWCASE_AUTHOR_AVATAR_URL,
      publishedAt: "",
      views: 0,
      createCount: 0,
      sourceId: "",
      reason: "新增创建相似案例",
    });
    setOpen(true);
  }

  function startEdit(item: StudioShowcaseExample) {
    setEditing(item);
    form.setFieldsValue({
      ...item,
      referenceImagesText: item.referenceImageUrls.join("\n"),
      reason: "更新创建相似案例",
    });
    setOpen(true);
  }

  async function submit(values: FormValue) {
    setSubmitting(true);
    try {
      const { reason, referenceImagesText, ...example } = values;
      example.referenceImageUrls = referenceImagesText
        .split(/\r?\n/)
        .map((url) => url.trim())
        .filter(Boolean)
        .slice(0, 3);
      const response = await fetch("/api/admin/showcase-examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upsert", reason, example }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `保存失败 (${response.status})`);
      message.success("案例配置已发布");
      setOpen(false);
      router.refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  function archive(item: StudioShowcaseExample) {
    modal.confirm({
      title: `归档 ${item.title}`,
      content: "归档后前台将不再展示该案例，新版本会立即发布并保留审计记录。",
      okText: "确认归档",
      okButtonProps: { danger: true },
      async onOk() {
        const response = await fetch("/api/admin/showcase-examples", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "archive", id: item.id, reason: `归档案例 ${item.title}` }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "归档失败");
        message.success("案例已归档");
        router.refresh();
      },
    });
  }

  async function toggleRegistry(enabled: boolean) {
    try {
      const response = await fetch("/api/admin/showcase-examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", enabled, reason: enabled ? "启用创建相似案例区" : "停用创建相似案例区" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "状态更新失败");
      message.success(enabled ? "案例区已启用" : "案例区已停用");
      router.refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "状态更新失败");
    }
  }

  return (
    <Space orientation="vertical" size={18} className="w-full">
      <AdminPageHeader
        eyebrow="Content showcase"
        title="创建相似案例"
        description="管理图生图右侧的瀑布流案例。图片请使用已上传至阿里云 OSS 的稳定地址；发布后前台会自动刷新。"
        actions={<Button type="primary" icon={<PlusOutlined aria-hidden="true" />} onClick={startCreate}>新增案例</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="案例总数" value={metrics.total} />
        <Metric label="前台展示" value={metrics.enabled} />
        <Metric label="当前版本" value={registry.activeVersionStatus || "内置兜底"} />
      </div>

      <Card
        title="前台展示配置"
        extra={(
          <Space>
            <Typography.Text type="secondary">显示案例区</Typography.Text>
            <Switch checked={registry.enabled} onChange={toggleRegistry} />
          </Space>
        )}
      >
        <Table<StudioShowcaseExample>
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={registry.items}
          scroll={{ x: 980 }}
          pagination={{ pageSize: 12, showSizeChanger: true }}
        />
      </Card>

      <Modal
        title={editing ? `编辑 ${editing.title}` : "新增创建相似案例"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="发布配置"
        confirmLoading={submitting}
        width={800}
        destroyOnHidden
      >
        <Form<FormValue> form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="id" className="hidden"><Input /></Form.Item>
          <div className="grid gap-3 md:grid-cols-2">
            <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
              <Input maxLength={100} placeholder="镜面唇釉商业大片" />
            </Form.Item>
            <Form.Item name="imageUrl" label="OSS 图片地址" rules={[{ required: true, type: "url", message: "请输入有效 HTTPS 图片地址" }]}>
              <Input placeholder="https://...oss-cn-hongkong.aliyuncs.com/..." />
            </Form.Item>
            <Form.Item
              name="referenceImagesText"
              label="参考图 OSS 地址（最多 3 张）"
              className="md:col-span-2"
              extra="每行一个 HTTPS 地址；聚焦卡片时显示在左下角，创建相似时优先带入第一张。"
            >
              <Input.TextArea rows={3} placeholder={"https://.../reference-1.png\nhttps://.../reference-2.png"} />
            </Form.Item>
            <Form.Item name="model" label="模型"><Select options={[{ label: "GPT Image 2", value: "GPT Image 2" }, { label: "Nano Banana 2", value: "Nano Banana 2" }, { label: "Nano Banana Pro", value: "Nano Banana Pro" }]} /></Form.Item>
            <Form.Item name="aspectRatio" label="比例"><Select options={["1:1", "3:4", "4:3", "4:5", "9:16", "16:9"].map((value) => ({ label: value, value }))} /></Form.Item>
            <Form.Item name="imageSize" label="清晰度"><Select options={["1K", "2K", "4K"].map((value) => ({ label: value, value }))} /></Form.Item>
            <Form.Item name="sortOrder" label="排序"><InputNumber className="!w-full" min={0} max={9999} /></Form.Item>
            <Form.Item name="authorName" label="作者"><Input disabled /></Form.Item>
            <Form.Item name="authorAvatarUrl" label="作者头像 OSS 地址"><Input disabled /></Form.Item>
          </div>
          <Form.Item name="enabled" label="前台展示" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
          <Form.Item name="prompt" label="创建相似描述" rules={[{ required: true, message: "请输入描述" }]}><Input.TextArea rows={7} maxLength={4000} /></Form.Item>
          <Form.Item name="reason" label="发布原因" rules={[{ required: true, min: 4, message: "请填写至少 4 个字" }]}><Input.TextArea rows={2} maxLength={240} /></Form.Item>
          <Form.Item name="publishedAt" className="hidden"><Input /></Form.Item>
          <Form.Item name="views" className="hidden"><InputNumber /></Form.Item>
          <Form.Item name="createCount" className="hidden"><InputNumber /></Form.Item>
          <Form.Item name="sourceId" className="hidden"><Input /></Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <Typography.Text type="secondary">{label}</Typography.Text>
      <div className="mt-2 text-xl font-black text-[var(--admin-fg)]">{value}</div>
    </Card>
  );
}
