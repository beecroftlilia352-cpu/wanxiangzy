"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2, Plus, Save } from "lucide-react";

type BillingProductOption = {
  id: string;
  name: string;
};

export function AdminBillingCatalogForms({ products }: { products: BillingProductOption[] }) {
  const router = useRouter();
  const [productPending, setProductPending] = useState(false);
  const [pricePending, setPricePending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProductPending(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const tierKey = stringField(form, "tierKey");
    const payload = {
      id: stringField(form, "id") || (tierKey ? `prod_${tierKey}` : ""),
      tierKey,
      name: stringField(form, "name"),
      description: stringField(form, "description"),
      badge: stringField(form, "badge"),
      creditAmount: numberField(form, "creditAmount"),
      bonusCredits: numberField(form, "bonusCredits"),
      subscriptionBonusPercent: numberField(form, "subscriptionBonusPercent") || 5,
      sortOrder: numberField(form, "sortOrder"),
      active: form.get("active") === "on",
      features: stringField(form, "features")
        .split(/[\n,，]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    };

    try {
      await postJson("/api/admin/billing/products", payload);
      setMessage("商品已保存");
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "商品保存失败");
    } finally {
      setProductPending(false);
    }
  }

  async function submitPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPricePending(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      id: stringField(form, "id"),
      productId: stringField(form, "productId"),
      mode: stringField(form, "mode"),
      label: stringField(form, "label"),
      unitAmount: Math.round(numberField(form, "amountYuan") * 100),
      credits: numberField(form, "credits"),
      walletEnabled: form.get("walletEnabled") === "on",
      sortOrder: numberField(form, "sortOrder"),
      active: form.get("active") === "on",
    };

    try {
      await postJson("/api/admin/billing/prices", payload);
      setMessage("价格已创建，点击同步后会推送到 Stripe");
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "价格创建失败");
    } finally {
      setPricePending(false);
    }
  }

  return (
    <div className="grid gap-4 border-b border-[var(--admin-border)] p-4 xl:grid-cols-2">
      <form onSubmit={submitProduct} className="space-y-3">
        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.1em] text-[var(--admin-faint)]">Product Management</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">维护本地商品镜像，可重复提交同一 ID 更新商品。</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field name="tierKey" label="tier key" placeholder="starter" required />
          <Field name="id" label="商品 ID" placeholder="prod_starter" />
          <Field name="name" label="名称" placeholder="入门版" required />
          <Field name="badge" label="标签" placeholder="热门" />
          <Field name="creditAmount" label="基础灵点" type="number" placeholder="1000" />
          <Field name="bonusCredits" label="赠送灵点" type="number" placeholder="200" />
          <Field name="subscriptionBonusPercent" label="订阅加成 %" type="number" placeholder="5" />
          <Field name="sortOrder" label="排序" type="number" placeholder="1" />
        </div>
        <TextArea name="description" label="描述" placeholder="适合稳定日常生产。" />
        <TextArea name="features" label="权益" placeholder={"1,000 灵点 + 赠送 200\n适合多模块连续生成"} />
        <div className="flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--admin-fg)]">
            <input name="active" type="checkbox" defaultChecked className="h-4 w-4 rounded border-[var(--codex-border-strong)]" />
            启用商品
          </label>
          <SubmitButton pending={productPending} icon={Save} label="保存商品" />
        </div>
      </form>

      <form onSubmit={submitPrice} className="space-y-3">
        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.1em] text-[var(--admin-faint)]">Price Management</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">创建本地价格；Stripe Price 由同步操作生成，避免客户端伪造金额。</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[var(--admin-faint)]">商品</span>
            <select
              name="productId"
              required
              className="h-9 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-sm font-semibold text-[var(--admin-fg)] outline-none focus:border-[var(--admin-border-strong)]"
            >
              <option value="">选择商品</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.id})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[var(--admin-faint)]">模式</span>
            <select
              name="mode"
              defaultValue="payment"
              className="h-9 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-sm font-semibold text-[var(--admin-fg)] outline-none focus:border-[var(--admin-border-strong)]"
            >
              <option value="payment">一次性购买</option>
              <option value="subscription">月订阅</option>
            </select>
          </label>
          <Field name="id" label="价格 ID" placeholder="price_starter_once" />
          <Field name="label" label="标签" placeholder="一次性购买" />
          <Field name="amountYuan" label="金额（元）" type="number" placeholder="35" required />
          <Field name="credits" label="到账灵点" type="number" placeholder="250" required />
          <Field name="sortOrder" label="排序" type="number" placeholder="1" />
        </div>
        <div className="flex items-center justify-between gap-3 pt-9">
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--admin-fg)]">
              <input name="walletEnabled" type="checkbox" defaultChecked className="h-4 w-4 rounded border-[var(--codex-border-strong)]" />
              一次性钱包支付
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--admin-fg)]">
              <input name="active" type="checkbox" defaultChecked className="h-4 w-4 rounded border-[var(--codex-border-strong)]" />
              启用价格
            </label>
          </div>
          <SubmitButton pending={pricePending} icon={Plus} label="创建价格" />
        </div>
      </form>
      {message && <p className="xl:col-span-2 rounded-lg bg-[var(--admin-surface-soft)] px-3 py-2 text-xs font-bold text-[var(--admin-fg)]">{message}</p>}
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  placeholder,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[var(--admin-faint)]">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-sm font-semibold text-[var(--admin-fg)] outline-none placeholder:text-codex-faint focus:border-[var(--admin-border-strong)]"
      />
    </label>
  );
}

function TextArea({ name, label, placeholder }: { name: string; label: string; placeholder?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[var(--admin-faint)]">{label}</span>
      <textarea
        name={name}
        rows={2}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-2 text-sm font-semibold text-[var(--admin-fg)] outline-none placeholder:text-codex-faint focus:border-[var(--admin-border-strong)]"
      />
    </label>
  );
}

function SubmitButton({ pending, icon: Icon, label }: { pending: boolean; icon: typeof Save; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--admin-fg)] px-3 text-xs font-black text-white hover:bg-codex-muted disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

async function postJson(url: string, payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `请求失败 (${response.status})`);
  }
  return body;
}

function stringField(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function numberField(form: FormData, key: string) {
  const value = Number(form.get(key));
  return Number.isFinite(value) ? value : 0;
}
