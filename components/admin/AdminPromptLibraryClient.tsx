"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from "@/components/ui/shadcn-compat";
import type { ColumnsType } from "@/components/ui/shadcn-compat";
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@/components/ui/ant-icons-compat";
import {
  PROMPT_LIBRARY_CONTENT_MAX_LENGTH,
  PROMPT_LIBRARY_DEFAULT_CREATION_TYPE,
  PROMPT_LIBRARY_TITLE_MAX_LENGTH,
  type PromptLibraryAdminListResponse,
  type PromptLibraryItem,
} from "@/lib/prompt-library/types";

const PAGE_SIZE = 20;

type PromptFormValue = {
  title: string;
  content: string;
  creationType: string;
  moduleKey?: string;
};

export function AdminPromptLibraryClient({ canManage = false }: { canManage?: boolean }) {
  const { message, modal } = AntdApp.useApp();
  const [form] = Form.useForm<PromptFormValue>();
  const [items, setItems] = useState<PromptLibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PromptLibraryItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/prompt-library?${params.toString()}`, { cache: "no-store" });
      const payload = await res.json().catch(() => null) as (PromptLibraryAdminListResponse & { error?: string }) | null;
      if (!res.ok || !payload) throw new Error(payload?.error || `加载失败 (${res.status})`);
      setItems(payload.items || []);
      setTotal(payload.total || 0);
      setWarning("");
    } catch (error) {
      setItems([]);
      setTotal(0);
      setWarning(error instanceof Error ? error.message : "词库列表加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => {
    void load();
  }, [load]);

  function startCreate() {
    setEditing(null);
    form.setFieldsValue({
      title: "",
      content: "",
      creationType: PROMPT_LIBRARY_DEFAULT_CREATION_TYPE,
      moduleKey: "",
    });
    setOpen(true);
  }

  function startEdit(row: PromptLibraryItem) {
    setEditing(row);
    form.setFieldsValue({
      title: row.title,
      content: row.content,
      creationType: row.creationType || PROMPT_LIBRARY_DEFAULT_CREATION_TYPE,
      moduleKey: row.moduleKey || "",
    });
    setOpen(true);
  }

  async function submit(values: PromptFormValue) {
    setSubmitting(true);
    try {
      const body = {
        title: values.title.trim(),
        content: values.content.trim(),
        creationType: (values.creationType || PROMPT_LIBRARY_DEFAULT_CREATION_TYPE).trim(),
        moduleKey: values.moduleKey?.trim() || null,
      };
      const res = await fetch(
        editing ? `/api/admin/prompt-library/${editing.id}` : "/api/admin/prompt-library",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `保存失败 (${res.status})`);
      message.success(editing ? "词库条目已更新，审计日志已记录" : "词库条目已创建，审计日志已记录");
      setOpen(false);
      setEditing(null);
      form.resetFields();
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  function confirmRemove(row: PromptLibraryItem) {
    modal.confirm({
      title: "删除词库条目？",
      content: (
        <Typography.Paragraph className="!mb-0">
          将软删除「<Typography.Text strong>{row.title}</Typography.Text>」。
          删除后该条目不再出现在任何用户的词库中，操作会写入审计日志。
        </Typography.Paragraph>
      ),
      okText: "确认删除",
      okButtonProps: { danger: true },
      async onOk() {
        try {
          const res = await fetch(`/api/admin/prompt-library/${row.id}`, { method: "DELETE" });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(payload.error || `删除失败 (${res.status})`);
          message.success("词库条目已删除，审计日志已记录");
          await load();
        } catch (error) {
          message.error(error instanceof Error ? error.message : "删除失败");
        }
      },
    });
  }

  const columns: ColumnsType<PromptLibraryItem> = [
    {
      title: "标题",
      dataIndex: "title",
      width: 200,
      render: (_, row) => (
        <Space orientation="vertical" size={0} className="min-w-0">
          <Typography.Text strong className="block truncate">{row.title}</Typography.Text>
          <Typography.Text type="secondary" className="font-mono text-[11px]">{row.creationType}</Typography.Text>
        </Space>
      ),
    },
    {
      title: "内容",
      dataIndex: "content",
      render: (_, row) => (
        <span className="line-clamp-2 block max-w-[520px] text-xs leading-5 text-[var(--admin-fg)]" title={row.content}>
          {row.content}
        </span>
      ),
    },
    {
      title: "创建者",
      dataIndex: "createdByEmail",
      width: 220,
      render: (_, row) => (
        <Typography.Text className="block truncate text-xs">
          {row.createdByEmail || "未知用户"}
        </Typography.Text>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 170,
      render: (_, row) => (
        <span className="whitespace-nowrap text-xs font-semibold text-[var(--admin-muted)]">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 170,
      render: (_, row) => (
        <span className="whitespace-nowrap text-xs font-semibold text-[var(--admin-muted)]">
          {formatDateTime(row.updatedAt)}
        </span>
      ),
    },
    {
      title: "操作",
      dataIndex: "actions",
      width: 150,
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<EditOutlined aria-hidden="true" />} disabled={!canManage} onClick={() => startEdit(row)}>
            编辑
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined aria-hidden="true" />}
            disabled={!canManage}
            onClick={() => confirmRemove(row)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space orientation="vertical" size={16} className="w-full">
      <div className="admin-page-hero">
        <div>
          <Typography.Text className="admin-page-eyebrow">词库管理</Typography.Text>
          <Typography.Title level={2} className="!mb-1 !mt-1">
            共享提示词词库
          </Typography.Title>
          <Typography.Paragraph className="!mb-0 !text-[var(--admin-muted)]">
            管理图生图 / 素材生成「词库」弹窗中的共享提示词。所有已登录用户都能看到这里的条目；
            增、删、改都会写入审计日志。
          </Typography.Paragraph>
        </div>
        {canManage ? (
          <Button type="primary" icon={<PlusOutlined aria-hidden="true" />} onClick={startCreate}>
            新建词条
          </Button>
        ) : (
          <Tag>只读权限</Tag>
        )}
      </div>

      {warning ? <Alert type="warning" showIcon message="词库数据源提示" description={warning} /> : null}

      {!canManage ? (
        <Alert
          type="info"
          showIcon
          message="当前角色只能查看词库"
          description="新增、编辑、删除需要 prompts:write 权限（负责人 / 运营 / 工程师）。"
        />
      ) : null}

      <Card
        title="词库条目"
        extra={
          <Space>
            <Tag>{`共 ${total} 条`}</Tag>
            <Button size="small" icon={<ReloadOutlined aria-hidden="true" />} onClick={() => void load()} loading={loading}>
              刷新
            </Button>
          </Space>
        }
      >
        <Space className="mb-3">
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setPage(1);
                setQ(keyword.trim());
              }
            }}
            placeholder="搜索标题 / 内容 / 创建者邮箱"
            prefix={<SearchOutlined aria-hidden="true" />}
            className="!w-72"
          />
          <Button
            onClick={() => {
              setPage(1);
              setQ(keyword.trim());
            }}
          >
            搜索
          </Button>
          <Button
            onClick={() => {
              setKeyword("");
              setPage(1);
              setQ("");
            }}
          >
            重置
          </Button>
        </Space>

        <Table<PromptLibraryItem>
          size="small"
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          scroll={{ x: 1250 }}
          locale={{ emptyText: "暂无词库条目" }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            onChange: (nextPage: number) => setPage(nextPage),
          }}
        />
      </Card>

      <Modal
        title={editing ? `编辑「${editing.title}」` : "新建词库条目"}
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
        }}
        onOk={() => form.submit()}
        okText="保存"
        confirmLoading={submitting}
        width={720}
        destroyOnHidden
      >
        <Form<PromptFormValue> form={form} layout="vertical" onFinish={submit}>
          <Form.Item
            name="title"
            label="标题"
            extra={`1-${PROMPT_LIBRARY_TITLE_MAX_LENGTH} 个字（前后空格不计）`}
            rules={[
              { required: true, message: "请填写标题" },
              {
                validator: (_: unknown, value: string) => {
                  const length = String(value ?? "").trim().length;
                  if (length < 1 || length > PROMPT_LIBRARY_TITLE_MAX_LENGTH) {
                    return Promise.reject(new Error(`标题需 1-${PROMPT_LIBRARY_TITLE_MAX_LENGTH} 个字（当前 ${length} 个字）`));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input placeholder="例如：夏日女装主图" maxLength={PROMPT_LIBRARY_TITLE_MAX_LENGTH} />
          </Form.Item>

          <Form.Item
            name="content"
            label="提示词内容"
            extra={`1-${PROMPT_LIBRARY_CONTENT_MAX_LENGTH} 个字（前后空格不计），与数据库约束一致`}
            rules={[
              { required: true, message: "请填写提示词内容" },
              {
                validator: (_: unknown, value: string) => {
                  const length = String(value ?? "").trim().length;
                  if (length < 1) return Promise.reject(new Error("提示词内容不能为空"));
                  if (length > PROMPT_LIBRARY_CONTENT_MAX_LENGTH) {
                    return Promise.reject(new Error(`提示词内容最多 ${PROMPT_LIBRARY_CONTENT_MAX_LENGTH} 个字（当前 ${length} 个字）`));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input.TextArea rows={6} maxLength={PROMPT_LIBRARY_CONTENT_MAX_LENGTH} showCount />
          </Form.Item>

          <div className="grid gap-3 md:grid-cols-2">
            <Form.Item name="creationType" label="创作类型" rules={[{ required: true, message: "请填写创作类型" }]}>
              <Input placeholder={PROMPT_LIBRARY_DEFAULT_CREATION_TYPE} />
            </Form.Item>
            <Form.Item name="moduleKey" label="功能模块（可选）">
              <Input placeholder="generalImage" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </Space>
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("zh-CN", { hour12: false });
}
