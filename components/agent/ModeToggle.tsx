"use client";

import { MessageSquare, Wand2 } from "lucide-react";
import type { AgentMode } from "@/lib/agent/types";

type Props = {
  mode: AgentMode;
  onChange: (mode: AgentMode) => void;
};

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      <button
        onClick={() => onChange("chat")}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
          mode === "chat" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
        }`}
      >
        <MessageSquare className="h-3 w-3" />
        Chat
      </button>
      <button
        onClick={() => onChange("agent")}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
          mode === "agent" ? "bg-violet-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
        }`}
      >
        <Wand2 className="h-3 w-3" />
        Agent
      </button>
    </div>
  );
}
