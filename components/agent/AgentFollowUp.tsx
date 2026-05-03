"use client";

import { RefreshCw, Wand2, Download } from "lucide-react";
import type { ModuleKey } from "@/lib/agent/types";
import { FOLLOW_UP_SUGGESTIONS } from "@/lib/agent/conversation-templates";

type Props = {
  module: ModuleKey;
  onAction: (text: string) => void;
};

export function AgentFollowUp({ module, onAction }: Props) {
  const suggestions = FOLLOW_UP_SUGGESTIONS[module] || [];

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      <button
        onClick={() => onAction("再生成几张")}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-violet-300 hover:text-violet-600"
      >
        <RefreshCw className="h-3 w-3" />
        再来几张
      </button>
      {suggestions.slice(0, 2).map((s, i) => (
        <button
          key={i}
          onClick={() => onAction(s)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-violet-300 hover:text-violet-600"
        >
          <Wand2 className="h-3 w-3" />
          {s}
        </button>
      ))}
    </div>
  );
}
