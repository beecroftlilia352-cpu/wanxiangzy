type Props = {
  value: number;
  label: string;
};

/**
 * 进度条组件：标签 + 百分比 + 圆角填充条。
 *
 * value 会被夹紧到 [0, 100]，最小可见宽度为 4%（避免空态视觉空洞）。
 */
export function ProgressLine({ value, label }: Props) {
  const display = Math.min(Math.max(Math.round(value), 0), 100);
  return (
    <div className="rounded-lg border border-[var(--codex-border)] bg-[var(--codex-surface-soft)] px-4 py-3">
      <div className="flex items-center justify-between text-sm font-semibold text-codex-muted">
        <span>{label}</span>
        <span>{display}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white dark:bg-white/10">
        <div
          className="h-full rounded-full bg-codex-ink transition-[width] duration-500"
          style={{ width: `${Math.max(display, 4)}%` }}
        />
      </div>
    </div>
  );
}