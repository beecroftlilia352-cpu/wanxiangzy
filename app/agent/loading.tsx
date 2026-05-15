export default function AgentLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[rgba(91,124,255,0.22)] border-t-[var(--codex-accent)]" />
        <p className="text-sm font-medium text-slate-500">加载中...</p>
      </div>
    </div>
  );
}
