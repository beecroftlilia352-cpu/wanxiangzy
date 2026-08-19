"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { MenuFoldOutlined, MenuOutlined, MenuUnfoldOutlined, SafetyCertificateOutlined, UserOutlined } from "@/components/ui/ant-icons-compat";
import { Avatar, Breadcrumb, Button, Drawer, Layout, Menu, Space, Spin, Tag, Typography, type MenuProps } from "@/components/ui/shadcn-compat";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { AdminRole } from "@/lib/admin/permissions";
import { getAdminNavigationItem, getVisibleAdminNavigation } from "@/lib/admin/navigation";

type AdminShellProps = {
  admin: {
    email: string | null;
    role: AdminRole;
    source: "table" | "bootstrap-env";
  };
  pendingApprovals?: number;
  children: React.ReactNode;
};

export function AdminShell({ admin, pendingApprovals = 0, children }: AdminShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formPending, setFormPending] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const activeHref = mounted ? getActiveHref(pathname) : "";
  const selectedKeys = activeHref ? [activeHref] : [];
  const breadcrumbTitle = mounted ? currentTitle(pathname) : "Console";
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const lastRouteKeyRef = useRef(routeKey);
  const visibleGroups = useMemo(() => getVisibleAdminNavigation(admin.role), [admin.role]);
  const openKeys = useMemo(() => visibleGroups.filter((group) => group.children.some((item) => item.href === activeHref)).map((group) => group.key), [activeHref, visibleGroups]);

  const menuItems = useMemo<MenuProps["items"]>(
    () =>
      visibleGroups.map((group) => ({
        key: group.key,
        label: group.label,
        type: "group" as const,
        children: group.children.map((item) => ({
          key: item.href,
          icon: item.icon,
          label: (
            <Link
              href={item.href}
              onClick={(event) => {
                // 普通 Link 走 RSC 软导航,无需切换 formPending;
                // 但若用户用 modifier 键想新开页签,保持默认行为。
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                setDrawerOpen(false);
              }}
              className="admin-nav-link"
              title={item.description}
            >
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.badgeKey === "requests" && pendingApprovals > 0 ? (
                <span className="admin-nav-badge">{pendingApprovals > 99 ? "99+" : pendingApprovals}</span>
              ) : null}
            </Link>
          ),
        })),
      })),
    [pendingApprovals, visibleGroups],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (lastRouteKeyRef.current !== routeKey) {
      lastRouteKeyRef.current = routeKey;
      setDrawerOpen(false);
      setFormPending(false);
    }
  }, [routeKey]);

  function handleSubmit(event: React.FormEvent<HTMLElement>) {
    if (event.defaultPrevented) return;
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const method = (form.method || "get").toLowerCase();
    if (method !== "get") return;
    const url = new URL(form.action || window.location.href, window.location.href);
    if (url.origin === window.location.origin && url.pathname.startsWith("/admin")) {
      startTransition(() => {
        setFormPending(true);
      });
    }
  }

  const routeLoading = isPending || formPending;
  const loadingId = useId();

  return (
    <Layout className="admin-app-shell flex" onSubmit={handleSubmit}>
      <a
        href="#admin-main-content"
        className="admin-skip-link sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-[var(--admin-border-strong)] focus:bg-[var(--admin-surface)] focus:px-3 focus:py-2 focus:text-sm focus:font-black focus:text-[var(--admin-fg)] focus:shadow-lg"
      >
        跳到主内容
      </a>
      <AdminRouteLoading active={routeLoading} id={loadingId} />
      <Layout.Sider
        width={252}
        collapsedWidth={76}
        collapsible
        collapsed={collapsed}
        trigger={null}
        className={`admin-sider shrink-0 motion-safe:transition-[width] motion-safe:duration-200 motion-reduce:transition-none ${collapsed ? "w-[76px]" : "w-[252px]"}`}
      >
        <AdminBrand collapsed={collapsed} />
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          openKeys={mounted ? openKeys : []}
          items={menuItems}
          className="admin-side-menu"
        />
        <AdminAccount admin={admin} collapsed={collapsed} />
      </Layout.Sider>

      <Drawer
        title={<AdminBrand collapsed={false} compact />}
        placement="left"
        size={292}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        className="admin-mobile-drawer"
        ariaLabel="后台导航菜单"
      >
        <Menu mode="inline" selectedKeys={selectedKeys} openKeys={mounted ? openKeys : []} items={menuItems} />
        <div className="mt-4">
          <AdminAccount admin={admin} collapsed={false} />
        </div>
      </Drawer>

      <Layout className="min-w-0 flex-1 flex-col">
        <Layout.Header className="admin-topbar">
          <Space className="min-w-0" size={12}>
            <Button
              className="admin-desktop-trigger"
              type="text"
              aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
              icon={collapsed ? <MenuUnfoldOutlined aria-hidden="true" /> : <MenuFoldOutlined aria-hidden="true" />}
              onClick={() => setCollapsed((value) => !value)}
            />
            <Button
              className="admin-mobile-trigger"
              type="text"
              aria-label="打开导航菜单"
              icon={<MenuOutlined aria-hidden="true" />}
              onClick={() => setDrawerOpen(true)}
            />
            <Breadcrumb
              items={[
                { title: "万象智艺" },
                { title: breadcrumbTitle },
              ]}
            />
          </Space>
          <Space size={8}>
            {admin.source === "bootstrap-env" && <Tag color="gold">初始管理员</Tag>}
            <Tag color="blue">{roleDisplayName(admin.role)}</Tag>
            <ThemeToggle className="admin-theme-toggle" />
          </Space>
        </Layout.Header>
        <Layout.Content className="admin-content">
          <div role="main" id="admin-main-content" className="contents">
            {children}
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}

function AdminRouteLoading({ active, id }: { active: boolean; id?: string }) {
  if (!active) {
    // 始终在 DOM 中保留 polite region,屏幕阅读器才能感知到后续状态变化
    return <span id={id} className="sr-only" role="status" aria-live="polite" />;
  }
  return (
    <>
      <div
        className="admin-route-loading"
        aria-hidden="true"
      >
        <div className="admin-route-loading-bar motion-safe:animate-pulse" />
        <div className="admin-route-loading-card">
          <Spin size="small" />
          <Typography.Text className="!text-xs !font-bold !text-[var(--admin-fg)]">页面加载中…</Typography.Text>
        </div>
      </div>
      <span id={id} className="sr-only" role="status" aria-live="polite">页面加载中</span>
    </>
  );
}

function AdminBrand({ collapsed, compact = false }: { collapsed: boolean; compact?: boolean }) {
  return (
    <Link href="/admin" className={`admin-brand ${compact ? "admin-brand-compact" : ""}`}>
      <span className="admin-brand-mark">
        <SafetyCertificateOutlined aria-hidden="true" />
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <Typography.Text strong className="block !text-[var(--admin-fg)]">
            运营控制台
          </Typography.Text>
          <Typography.Text type="secondary" className="block truncate !text-xs">
            万象智艺 · 商业化运营
          </Typography.Text>
        </span>
      )}
    </Link>
  );
}

function AdminAccount({ admin, collapsed }: { admin: AdminShellProps["admin"]; collapsed: boolean }) {
  return (
    <div className="admin-account">
      <Avatar size={collapsed ? 32 : 36} icon={<UserOutlined aria-hidden="true" />} />
      {!collapsed && (
        <div className="min-w-0">
          <Typography.Text strong className="block truncate">
            {roleDisplayName(admin.role)}
          </Typography.Text>
          <Typography.Text type="secondary" className="block truncate !text-xs">
            {admin.email || "未绑定邮箱"}
          </Typography.Text>
        </div>
      )}
    </div>
  );
}

function getActiveHref(pathname: string) {
  return getAdminNavigationItem(pathname).href;
}

function currentTitle(pathname: string) {
  return getAdminNavigationItem(pathname).label;
}

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  owner: "负责人",
  ops: "运营",
  support: "客服",
  finance: "财务",
  reviewer: "审核",
  engineer: "技术",
  viewer: "只读",
};

function roleDisplayName(role: string) {
  return ROLE_DISPLAY_NAMES[role] || role;
}
