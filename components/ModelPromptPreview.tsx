"use client";

import { Copy, X } from "lucide-react";
import { toast } from "sonner";
import type { LingyaModel } from "@/lib/api/lingya";
import { compileImagePromptForModel, type ImagePromptKind } from "@/lib/api/prompt-compiler";

type ModelPromptPreviewProps = {
  kind: ImagePromptKind;
  model: LingyaModel;
  prompt: string;
  className?: string;
  metadata?: Record<string, string>;
  onClose?: () => void;
};

export function ModelPromptPreview({
  kind,
  model,
  prompt,
  className = "",
  metadata,
  onClose,
}: ModelPromptPreviewProps) {
  const compiledPrompt = compileImagePromptForModel({ kind, model, prompt });
  const isCompiled = compiledPrompt.trim() !== prompt.trim();

  return (
    <div className={`rounded-xl border border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-[var(--codex-accent)]">当前模型执行版提示词</p>
          <p className="text-[10px] text-[var(--codex-accent)]">
            {model}{isCompiled ? " · 已自动压缩适配" : " · 使用完整高质量版"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(compiledPrompt);
              toast.success("已复制模型执行版提示词");
            }}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-[rgba(91,124,255,0.22)] bg-white px-2 text-[10px] font-medium text-[var(--codex-accent)] hover:border-[rgba(91,124,255,0.3)]"
          >
            <Copy className="h-3 w-3" />
            复制
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(91,124,255,0.22)] bg-white text-[var(--codex-accent)]0 hover:border-[rgba(91,124,255,0.3)]"
              aria-label="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {metadata && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          {Object.entries(metadata).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-[rgba(91,124,255,0.22)] bg-white/70 px-2.5 py-1.5">
              <p className="text-[10px] text-[var(--codex-accent)]">{label}</p>
              <p className="mt-0.5 break-words text-[11px] font-medium text-gray-700">{value}</p>
            </div>
          ))}
        </div>
      )}
      <textarea
        readOnly
        value={compiledPrompt}
        className="h-28 w-full resize-y rounded-lg border border-[rgba(91,124,255,0.22)] bg-white/80 px-3 py-2 text-[11px] leading-relaxed text-gray-700 outline-none"
      />
    </div>
  );
}
