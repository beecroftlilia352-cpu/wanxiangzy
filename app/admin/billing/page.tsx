import { CreditCard } from "lucide-react";
import { AdminBillingActionButton } from "@/components/admin/AdminBillingActions";
import { AdminBillingCatalogForms } from "@/components/admin/AdminBillingCatalogForms";
import { AdminPricingStrategy } from "@/components/admin/AdminPricingStrategy";
import {
  AdminMetricCard,
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  formatDateTime,
  formatNumber,
} from "@/components/admin/AdminPrimitives";
import { requireAdmin } from "@/lib/admin/auth";
import { hasAdminPermission } from "@/lib/admin/permissions";
import {
  listAdminBillingOverview,
  type AdminBillingConfigStatus,
  type AdminBillingOrder,
  type AdminBillingPrice,
  type AdminBillingProduct,
  type AdminBillingSubscription,
  type AdminBillingWebhookEvent,
} from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminBillingPage() {
  const admin = await requireAdmin("billing:read");
  const canWrite = hasAdminPermission(admin.role, "billing:write");
  const canOperate = hasAdminPermission(admin.role, "billing:operate");
  const billing = await listAdminBillingOverview();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="支付账单"
        title="账单控制台"
        description="管理套餐售价、模块扣点与支付履约。售卖价格、用户消耗和供应商成本分层治理，避免在订单流水中直接改价。"
        actions={<AdminBillingActionButton action="sync" canOperate={canOperate} />}
      />

      {!billing.available && (
        <AdminNotice>
          Billing 数据表尚未安装或主线程数据契约尚未落地。页面会先显示配置状态；安装 `billing_products`、`billing_prices`、`payment_orders`、`stripe_subscriptions`、`stripe_webhook_events` 后会自动展示数据。
        </AdminNotice>
      )}
      {billing.warnings.length > 0 && (
        <AdminNotice tone="info">Billing 数据源提示：{billing.warnings.slice(0, 4).join("；")}</AdminNotice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {billing.metrics.map((metric) => (
          <AdminMetricCard
            key={metric.label}
            label={metric.label}
            value={formatMetricValue(metric.label, metric.value)}
            hint={metric.hint}
            tone={metric.tone}
          />
        ))}
      </div>

      <AdminPricingStrategy products={billing.products} prices={billing.prices} canManage={canWrite} />

      <AdminSection title="创建套餐与价格版本" description="金额或到账灵点变化时创建新的价格版本；同步 Stripe 成功后，再在上方套餐矩阵停用旧版本。">
        {canWrite ? <AdminBillingCatalogForms products={billing.products.map((product) => ({ id: product.id, name: product.name }))} /> : <AdminNotice tone="info">当前角色只能查看套餐与价格。创建商品、价格版本和停用价格需要账单写权限。</AdminNotice>}
      </AdminSection>

      <details className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)]">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-black text-[var(--admin-fg)] [&::-webkit-details-marker]:hidden">
          支付履约与 Stripe 运维（高级）
          <span className="ml-2 text-xs font-semibold text-[var(--admin-muted)]">创建套餐 SKU、同步 Stripe、订单、订阅和 Webhook · 点击展开</span>
        </summary>
      <AdminSection title="配置状态" description="只显示是否配置，不暴露密钥明文。表状态来自约定的 Billing 后台数据表。">
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          {billing.configStatus.map((item) => (
            <ConfigStatusTile key={`${item.scope}:${item.key}`} item={item} />
          ))}
        </div>
      </AdminSection>

      <AdminSection title="商品 / 价格映射" description="本地 Billing 镜像与 Stripe 标识符，用于对账和排查；售卖配置请使用上方的定价工作台。">
        <div className="border-b border-[var(--admin-border)]">
          <div className="px-4 py-3">
            <h3 className="text-xs font-black uppercase tracking-[0.1em] text-[var(--admin-faint)]">Products</h3>
          </div>
          <AdminTable<AdminBillingProduct>
            rows={billing.products}
            rowKey={(row) => row.id}
            empty="暂无商品"
            columns={[
              {
                key: "name",
                label: "商品",
                render: (row) => (
                  <div className="min-w-[220px]">
                    <p className="text-sm font-black text-[var(--admin-fg)]">{row.name}</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-[var(--admin-muted)]">{row.description || "无描述"}</p>
                  </div>
                ),
              },
              { key: "stripe", label: "Stripe ID", render: (row) => <CodeText value={row.stripeProductId} /> },
              { key: "status", label: "状态", render: (row) => <AdminStatusBadge status={row.active ? "active" : "inactive"} /> },
              { key: "updated", label: "更新", render: (row) => <MutedText value={formatDateTime(row.updatedAt || row.createdAt)} /> },
            ]}
          />
        </div>

        <div>
          <div className="px-4 py-3">
            <h3 className="text-xs font-black uppercase tracking-[0.1em] text-[var(--admin-faint)]">Prices</h3>
          </div>
          <AdminTable<AdminBillingPrice>
            rows={billing.prices}
            rowKey={(row) => row.id}
            empty="暂无价格"
            columns={[
              {
                key: "price",
                label: "价格",
                render: (row) => (
                  <div className="min-w-[220px]">
                    <p className="font-mono text-sm font-black text-[var(--admin-fg)]">{formatMoney(row.unitAmount, row.currency)}</p>
                    <p className="mt-0.5 text-xs font-semibold text-[var(--admin-muted)]">{formatPriceCadence(row)}</p>
                  </div>
                ),
              },
              { key: "product", label: "商品", render: (row) => <span className="text-sm font-bold text-[var(--admin-fg)]">{row.productName || row.stripeProductId || "-"}</span> },
              { key: "stripe", label: "Stripe ID", render: (row) => <CodeText value={row.stripePriceId} /> },
              { key: "credits", label: "灵点", render: (row) => <span className="font-mono text-sm font-black text-[var(--admin-fg)]">{formatNumber(row.credits)}</span> },
              { key: "status", label: "状态", render: (row) => <AdminStatusBadge status={row.active ? "active" : "inactive"} /> },
            ]}
          />
        </div>
      </AdminSection>

      <AdminSection title="支付流水" description="按本地订单镜像展示 Checkout / PaymentIntent 状态，退款按钮按后台契约调用退款接口。">
        <AdminTable<AdminBillingOrder>
          rows={billing.orders}
          rowKey={(row) => row.id}
          empty="暂无支付流水"
          columns={[
            {
              key: "order",
              label: "订单",
              render: (row) => (
                <div className="min-w-[240px]">
                  <CodeText value={row.id} />
                  <p className="mt-1 truncate text-[11px] font-semibold text-[var(--admin-faint)]">{row.stripeCheckoutSessionId || row.stripePaymentIntentId || "-"}</p>
                </div>
              ),
            },
            { key: "user", label: "用户", render: (row) => <UserCell email={row.email} userId={row.userId} /> },
            { key: "status", label: "状态", render: (row) => <AdminStatusBadge status={row.status} /> },
            { key: "amount", label: "金额", render: (row) => <MoneyCell amount={row.amountTotal} currency={row.currency} /> },
            { key: "refund", label: "已退", render: (row) => <MoneyCell amount={row.refundedAmount} currency={row.currency} muted /> },
            { key: "credits", label: "灵点", render: (row) => <span className="font-mono text-sm font-black text-[var(--admin-fg)]">{formatNumber(row.creditsGranted)}</span> },
            { key: "time", label: "时间", render: (row) => <MutedText value={formatDateTime(row.createdAt)} /> },
            {
              key: "actions",
              label: "操作",
              render: (row) => <AdminBillingActionButton action="refund" targetId={row.id} disabled={!row.id || row.refundedAmount >= row.amountTotal} canOperate={canOperate} />,
            },
          ]}
        />
      </AdminSection>

      <AdminSection title="订阅" description="订阅状态与周期来自本地 Subscription 镜像表，取消按钮按后台契约调用取消接口。">
        <AdminTable<AdminBillingSubscription>
          rows={billing.subscriptions}
          rowKey={(row) => row.id}
          empty="暂无订阅"
          columns={[
            {
              key: "subscription",
              label: "订阅",
              render: (row) => (
                <div className="min-w-[240px]">
                  <CodeText value={row.stripeSubscriptionId} />
                  <p className="mt-1 truncate text-[11px] font-semibold text-[var(--admin-faint)]">{row.stripeCustomerId || "-"}</p>
                </div>
              ),
            },
            { key: "user", label: "用户", render: (row) => <UserCell email={row.email} userId={row.userId} /> },
            { key: "status", label: "状态", render: (row) => <AdminStatusBadge status={row.status} /> },
            { key: "price", label: "价格", render: (row) => <CodeText value={row.stripePriceId || "-"} /> },
            { key: "period", label: "周期结束", render: (row) => <MutedText value={formatDateTime(row.currentPeriodEnd)} /> },
            { key: "cancel", label: "续订", render: (row) => <AdminStatusBadge status={row.cancelAtPeriodEnd ? "pending" : "active"} /> },
            {
              key: "actions",
              label: "操作",
              render: (row) => (
                <AdminBillingActionButton
                  action="cancel-subscription"
                  targetId={row.stripeSubscriptionId || row.id}
                  disabled={!row.stripeSubscriptionId || row.status === "canceled" || row.status === "cancelled"}
                  canOperate={canOperate}
                />
              ),
            },
          ]}
        />
      </AdminSection>

      <AdminSection title="Webhook 事件" description="用于查看事件处理状态，并预留失败事件重放入口。">
        <AdminTable<AdminBillingWebhookEvent>
          rows={billing.webhookEvents}
          rowKey={(row) => row.id}
          empty="暂无 Webhook 事件"
          columns={[
            {
              key: "event",
              label: "事件",
              render: (row) => (
                <div className="min-w-[260px]">
                  <p className="text-sm font-black text-[var(--admin-fg)]">{row.type}</p>
                  <CodeText value={row.stripeEventId} />
                </div>
              ),
            },
            { key: "status", label: "状态", render: (row) => <AdminStatusBadge status={row.status} /> },
            { key: "attempts", label: "次数", render: (row) => <span className="font-mono text-sm font-black text-[var(--admin-fg)]">{formatNumber(row.attempts)}</span> },
            { key: "error", label: "错误", render: (row) => <span className="line-clamp-2 max-w-[360px] text-xs font-semibold text-[var(--admin-danger)]">{row.errorMessage || "-"}</span> },
            { key: "received", label: "接收", render: (row) => <MutedText value={formatDateTime(row.createdAt)} /> },
            { key: "processed", label: "处理", render: (row) => <MutedText value={formatDateTime(row.processedAt)} /> },
            {
              key: "actions",
              label: "操作",
              render: (row) => <AdminBillingActionButton action="replay-event" targetId={row.stripeEventId || row.id} disabled={!row.stripeEventId && !row.id} canOperate={canOperate} />,
            },
          ]}
        />
      </AdminSection>
      </details>
    </div>
  );
}

function ConfigStatusTile({ item }: { item: AdminBillingConfigStatus }) {
  return (
    <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-[var(--admin-fg)]">{item.label}</p>
          <p className="mt-1 truncate font-mono text-[11px] text-[var(--admin-faint)]">{item.key}</p>
        </div>
        <AdminStatusBadge status={item.configured ? "completed" : "failed"} group={item.configured ? "completed" : "failed"} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs font-bold text-[var(--admin-muted)]">
        <CreditCard className="h-3.5 w-3.5 text-[var(--admin-faint)]" />
        <span className="uppercase tracking-[0.08em]">{item.scope}</span>
        <span className="truncate">{item.statusHint}</span>
      </div>
    </div>
  );
}

function UserCell({ email, userId }: { email: string | null; userId: string | null }) {
  return (
    <div className="min-w-[220px]">
      <p className="truncate text-sm font-bold text-[var(--admin-fg)]">{email || "-"}</p>
      <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--admin-faint)]">{userId || "-"}</p>
    </div>
  );
}

function MoneyCell({ amount, currency, muted }: { amount: number; currency: string; muted?: boolean }) {
  return <span className={`font-mono text-sm font-black ${muted ? "text-[var(--admin-muted)]" : "text-[var(--admin-fg)]"}`}>{formatMoney(amount, currency)}</span>;
}

function CodeText({ value }: { value: string }) {
  return <code className="break-all font-mono text-xs font-bold text-[var(--admin-fg)]">{value || "-"}</code>;
}

function MutedText({ value }: { value: string }) {
  return <span className="whitespace-nowrap text-xs font-semibold text-[var(--admin-muted)]">{value}</span>;
}

function formatMoney(amount: number, currency: string) {
  const normalizedCurrency = currency || "USD";
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(amount / 100);
  } catch {
    return `${normalizedCurrency} ${formatNumber(Math.round(amount) / 100)}`;
  }
}

function formatPriceCadence(row: AdminBillingPrice) {
  if (!row.recurringInterval) return row.nickname || row.type;
  const count = row.recurringIntervalCount > 1 ? `${row.recurringIntervalCount} ` : "";
  return `${row.nickname || row.type} / ${count}${row.recurringInterval}`;
}

function formatMetricValue(label: string, value: number) {
  if (label === "Sample revenue") return formatNumber(Math.round(value * 100) / 100);
  return formatNumber(value);
}
