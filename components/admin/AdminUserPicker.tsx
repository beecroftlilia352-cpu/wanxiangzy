"use client";

import { useMemo, useState } from "react";
import { Select, Space, Tag, Typography } from "@/components/ui/shadcn-compat";
import type { AdminUserListItem } from "@/lib/admin/data";

type AdminUserPickerProps = {
  value?: string;
  onChange?: (value: string, user: AdminUserOption | null) => void;
  onUserChange?: (user: AdminUserOption | null) => void;
  placeholder?: string;
};

export type AdminUserOption = {
  id: string;
  email: string;
  displayName: string | null;
  credits: number;
  accountStatus: string;
  generateEnabled: boolean;
};

export function AdminUserPicker({ value, onChange, onUserChange, placeholder = "搜索邮箱、昵称或用户关键词" }: AdminUserPickerProps) {
  const [options, setOptions] = useState<AdminUserOption[]>([]);
  const [fetching, setFetching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserOption | null>(null);

  const selectOptions = useMemo(
    () =>
      options.map((user) => ({
        value: user.id,
        label: user.email || user.displayName || `用户 ${user.id.slice(0, 8)}`,
        user,
      })),
    [options],
  );

  async function searchUsers(keyword: string) {
    const q = keyword.trim();
    if (q.length < 2) return;
    setFetching(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&pageSize=20`, { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      setOptions(rows.map(toUserOption));
    } finally {
      setFetching(false);
    }
  }

  return (
    <Space orientation="vertical" size={6} className="w-full">
      <Select
        showSearch
        allowClear
        value={value}
        filterOption={false}
        onSearch={searchUsers}
        onClear={() => {
          setSelectedUser(null);
          onChange?.("", null);
          onUserChange?.(null);
        }}
        onChange={(nextValue, option) => {
          const user = Array.isArray(option) ? null : option?.user || options.find((item) => item.id === nextValue) || null;
          setSelectedUser(user);
          onChange?.(nextValue || "", user);
          onUserChange?.(user);
        }}
        options={selectOptions}
        loading={fetching}
        placeholder={placeholder}
        notFoundContent={fetching ? "搜索中…" : "输入至少 2 个字搜索用户"}
        optionRender={(option) => {
          const user = option.data.user;
          return (
            <Space orientation="vertical" size={0}>
              <Typography.Text strong>{user.email || user.displayName || "未记录邮箱"}</Typography.Text>
              <Typography.Text type="secondary" className="text-xs">
                余额 {formatNumber(user.credits)} · {user.generateEnabled ? "可生成" : "已暂停生成"}
              </Typography.Text>
            </Space>
          );
        }}
      />
      {selectedUser && (
        <Space wrap size={6}>
          <Tag color={selectedUser.generateEnabled ? "green" : "red"}>{selectedUser.generateEnabled ? "可生成" : "已暂停生成"}</Tag>
          <Tag>余额 {formatNumber(selectedUser.credits)}</Tag>
          {selectedUser.accountStatus !== "active" && <Tag color="orange">{selectedUser.accountStatus}</Tag>}
        </Space>
      )}
    </Space>
  );
}

function toUserOption(row: AdminUserListItem): AdminUserOption {
  return {
    id: row.id,
    email: row.email || "",
    displayName: row.displayName,
    credits: row.credits,
    accountStatus: row.accountStatus,
    generateEnabled: row.generateEnabled,
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}
