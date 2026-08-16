type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  textarea?: boolean;
};

/**
 * 规划模块行内编辑的输入字段。textarea=true 渲染多行；否则单行 input。
 *
 * 用于 PlanningPreview 内嵌每个 plan 的标题 / 描述 / 详情规则编辑。
 */
export function EditField({ label, value, onChange, textarea }: Props) {
  return (
    <label className="block text-xs font-black text-codex-muted">
      {label}
      {textarea ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 min-h-[96px] w-full resize-y rounded-lg border border-[var(--codex-border)] bg-white p-2 text-sm font-medium leading-6 text-codex-ink outline-none focus:border-[var(--codex-border-strong)]"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 h-10 w-full rounded-lg border border-[var(--codex-border)] bg-white px-2 text-sm font-medium text-codex-ink outline-none focus:border-[var(--codex-border-strong)]"
        />
      )}
    </label>
  );
}