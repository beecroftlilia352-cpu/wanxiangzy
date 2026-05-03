"use client";

import { Shirt, Heart, UserRound, Images, PersonStanding, Box } from "lucide-react";
import { QUICK_START_TEMPLATES } from "@/lib/agent/conversation-templates";

const ICON_MAP: Record<string, React.ElementType> = {
  Shirt, Heart, UserRound, Images, PersonStanding, Box,
};

type Props = {
  onSelect: (message: string) => void;
};

export function AgentQuickStart({ onSelect }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-4">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 shadow-lg shadow-violet-200">
          <Shirt className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-xl font-black text-slate-900">AI 服装助手</h2>
        <p className="mt-2 text-sm text-slate-500">
          用自然语言告诉我你想做什么，或者选择一个模板开始
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {QUICK_START_TEMPLATES.map((t) => {
          const Icon = ICON_MAP[t.icon] || Shirt;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.message)}
              className="group rounded-2xl border border-slate-200/80 bg-white p-4 text-left transition-all hover:border-violet-300 hover:shadow-md"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 group-hover:bg-violet-100">
                <Icon className="h-5 w-5 text-violet-500" />
              </div>
              <p className="text-sm font-bold text-slate-800">{t.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-slate-400">{t.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
