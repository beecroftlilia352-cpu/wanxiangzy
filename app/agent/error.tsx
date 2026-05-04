"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function AgentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[agent] page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
          <AlertCircle className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">出了点问题</h2>
        <p className="mt-2 text-sm text-slate-500">
          {error.message || "智能体遇到了意外错误"}
        </p>
        <button
          onClick={reset}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-200 hover:bg-violet-700"
        >
          <RefreshCw className="h-4 w-4" />
          重试
        </button>
      </div>
    </div>
  );
}
