"use client";

import { useRouter } from "next/navigation";
import { App, Button, Form, Input, Select, Typography } from "@/components/ui/shadcn-compat";
import { UserAddOutlined } from "@/components/ui/ant-icons-compat";
import { AdminUserPicker, type AdminUserOption } from "@/components/admin/AdminUserPicker";

type MemberFormValue = {
  userId: string;
  email: string;
  role: string;
  status: string;
};

const roleOptions = [
  { value: "owner", label: "负责人：全部权限" },
  { value: "ops", label: "运营：功能、任务、内容" },
  { value: "support", label: "客服：用户和工单" },
  { value: "finance", label: "财务：灵点和报表" },
  { value: "reviewer", label: "审核：内容处理" },
  { value: "engineer", label: "技术：任务队列和排障" },
  { value: "viewer", label: "只读：查看数据" },
];

const statusOptions = [
  { value: "active", label: "启用" },
  { value: "disabled", label: "停用" },
];

export function AdminMemberForm() {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<MemberFormValue>();

  async function submit(values: MemberFormValue) {
    const res = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `保存失败 (${res.status})`);
  }

  function handleSubmit(values: MemberFormValue) {
    const roleLabel = roleOptions.find((r) => r.value === values.role)?.label || values.role;
    modal.confirm({
      title: "确认保存后台成员",
      content: (
        <Typography.Paragraph className="!mb-0">
          将为 {values.email} 设置角色：{roleLabel}（{values.status === "active" ? "启用" : "停用"}）。该变更将立即生效并写入审计日志。
        </Typography.Paragraph>
      ),
      okText: "确认保存",
      okButtonProps: { danger: values.role === "owner" },
      async onOk() {
        try {
          await submit(values);
          message.success("后台成员已保存，审计日志已记录");
          form.resetFields();
          router.refresh();
        } catch (error) {
          message.error(error instanceof Error ? error.message : "保存失败");
        }
      },
    });
  }

  function handleUserChange(user: AdminUserOption | null) {
    if (user?.email) form.setFieldValue("email", user.email);
  }

  return (
    <Form<MemberFormValue>
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      className="p-4"
      initialValues={{ role: "viewer", status: "active" }}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.2fr)_minmax(220px,0.9fr)_220px_130px_auto]">
        <Form.Item name="userId" label="选择成员账号" rules={[{ required: true, message: "请先搜索并选择账号" }]}>
          <AdminUserPicker onUserChange={handleUserChange} placeholder="搜索要加入后台的用户邮箱" />
        </Form.Item>
        <Form.Item name="email" label="邮箱" rules={[{ required: true, type: "email", message: "请输入有效邮箱" }]}>
          <Input placeholder="admin@example.com" />
        </Form.Item>
        <Form.Item name="role" label="后台角色" rules={[{ required: true }]}>
          <Select options={roleOptions} />
        </Form.Item>
        <Form.Item name="status" label="状态" rules={[{ required: true }]}>
          <Select options={statusOptions} />
        </Form.Item>
        <Form.Item label=" " className="!mb-0">
          <Button type="primary" htmlType="submit" icon={<UserAddOutlined aria-hidden="true" />}>
            保存成员
          </Button>
        </Form.Item>
      </div>
    </Form>
  );
}
