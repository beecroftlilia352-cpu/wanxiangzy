export default function AgentLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-500" />
        <p className="text-sm font-medium text-slate-500">加载中...</p>
      </div>
    </div>
  );
}
