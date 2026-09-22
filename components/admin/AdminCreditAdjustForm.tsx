"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Form, Input, InputNumber, Typography } from "@/components/ui/shadcn-compat";
import { FileAddOutlined, PlusCircleOutlined } from "@/components/ui/ant-icons-compat";
import { AdminUserPicker, type AdminUserOption } from "@/components/admin/AdminUserPicker";

type CreditAdjustValue = {
  userId: string;
  amount: number;
  generationId?: string;
  reason: string;
};

export function AdminCreditAdjustForm({
  mode = "adjust",
}: {
  mode?: "adjust" | "request";
}) {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<CreditAdjustValue>();
  const [selectedUser, setSelectedUser] = useState<AdminUserOption | null>(null);
  const isRequest = mode === "request";

  async function submit(values: CreditAdjustValue) {
    const res = await fetch(isRequest ? "/api/admin/operation-requests" : "/api/admin/credits/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType: isRequest ? "credits.adjust" : undefined,
        userId: values.userId,
        amount: Number(values.amount),
        reason: values.reason.trim(),
        generationId: values.generationId || undefined,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `调整失败 (${res.status})`);
  }

  function handleSubmit(values: CreditAdjustValue) {
    const summary = `${values.amount > 0 ? "+" : ""}${values.amount} 灵点 · ${values.reason}`;
    const confirmTitle = isRequest ? "创建补偿审批单" : "确认直接调整灵点";
    const confirmAction = isRequest ? "创建审批单" : "直接调整";
    const runSubmit = () =>
      submit(values)
        .then(() => {
          message.success(isRequest ? "补偿审批单已创建" : "灵点已调整，审计日志已记录");
          form.resetFields();
          router.refresh();
        })
        .catch((error: unknown) => {
          message.error(error instanceof Error ? error.message : "调整失败");
        });

    if (isRequest) {
      modal.confirm({
        title: confirmTitle,
        content: (
          <Typography.Paragraph className="!mb-0">{summary}</Typography.Paragraph>
        ),
        okText: confirmAction,
        async onOk() {
          await runSubmit();
        },
      });
      return;
    }

    // 直接调整 = destructive — 必须明确确认
    modal.confirm({
      title: confirmTitle,
      content: (
        <Typography.Paragraph className="!mb-0">
          将对用户 <Typography.Text strong>{selectedUser?.email || values.userId}</Typography.Text> 直接 {summary}。
          此操作会立即生效并写入审计日志，无法撤销。
        </Typography.Paragraph>
      ),
      okText: confirmAction,
      okButtonProps: { danger: true },
      async onOk() {
        await runSubmit();
      },
    });
  }

  return (
    <Form<CreditAdjustValue>
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      className="p-4"
      initialValues={{ amount: 10 }}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_140px_minmax(220px,1fr)_minmax(260px,1fr)_auto]">
        <Form.Item name="userId" label="选择用户" rules={[{ required: true, message: "请先搜索并选择用户" }]}>
          <AdminUserPicker onUserChange={(user) => setSelectedUser(user)} />
        </Form.Item>
        <Form.Item name="amount" label="调整数量" rules={[{ required: true, message: "请输入调整数量" }]}>
          <InputNumber className="!w-full" min={-10000} max={10000} placeholder="+10 / -5" />
        </Form.Item>
        <Form.Item name="generationId" label="关联任务（可选）" extra="如果是某次生成异常补偿，可从任务详情复制任务编号；不知道可留空。">
          <Input placeholder="可选" />
        </Form.Item>
        <Form.Item
          name="reason"
          label="原因"
          extra="4-240 个字（前后空格不计），会写入审计日志"
          rules={[
            { required: true, message: "请填写调整原因" },
            {
              // 与后端 admin_adjust_user_credits 的校验保持一致：先 trim 再计长度（4-240）。
              // 此前只校验 min、且未 trim，导致「前端通过、后端报错」的体验分裂。
              validator: (_: unknown, value: string) => {
                const length = String(value ?? "").trim().length;
                if (length < 4 || length > 240) {
                  return Promise.reject(new Error(`原因需 4-240 个字（当前 ${length} 个字）`));
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <Input placeholder="例如：客服补偿、异常扣费修正" maxLength={240} />
        </Form.Item>
        <Form.Item label=" " className="!mb-0">
          <Button
            type="primary"
            htmlType="submit"
            icon={isRequest ? <FileAddOutlined aria-hidden="true" /> : <PlusCircleOutlined aria-hidden="true" />}
          >
            {isRequest ? "创建申请" : "直接调整"}
          </Button>
        </Form.Item>
      </div>
    </Form>
  );
}
