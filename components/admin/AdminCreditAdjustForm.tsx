"use client";

import { useRouter } from "next/navigation";
import { App, Button, Form, Input, InputNumber, Typography } from "@/components/ui/shadcn-compat";
import { FileAddOutlined, PlusCircleOutlined } from "@/components/ui/ant-icons-compat";
import { AdminUserPicker } from "@/components/admin/AdminUserPicker";

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
  const isRequest = mode === "request";

  async function submit(values: CreditAdjustValue) {
    const res = await fetch(isRequest ? "/api/admin/operation-requests" : "/api/admin/credits/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType: isRequest ? "credits.adjust" : undefined,
        userId: values.userId,
        amount: Number(values.amount),
        reason: values.reason,
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
          将对用户 <Typography.Text strong>{values.userId}</Typography.Text> 直接 {summary}。
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
          <AdminUserPicker />
        </Form.Item>
        <Form.Item name="amount" label="调整数量" rules={[{ required: true, message: "请输入调整数量" }]}>
          <InputNumber className="!w-full" min={-10000} max={10000} placeholder="+10 / -5" />
        </Form.Item>
        <Form.Item name="generationId" label="关联任务（可选）" extra="如果是某次生成异常补偿，可从任务详情复制任务编号；不知道可留空。">
          <Input placeholder="可选" />
        </Form.Item>
        <Form.Item name="reason" label="原因" rules={[{ required: true, min: 4, message: "请填写至少 4 个字的原因" }]}>
          <Input placeholder="例如：客服补偿、异常扣费修正" />
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
