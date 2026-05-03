"use client";

import { useRef, useState, useCallback, type KeyboardEvent, type ClipboardEvent } from "react";
import { Send, ImagePlus, X, Loader2 } from "lucide-react";
import type { AgentImage } from "@/lib/agent/types";

type Props = {
  pendingImages: AgentImage[];
  isProcessing: boolean;
  onSend: (text: string) => void;
  onAttachImages: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
};

export function AgentInputBar({
  pendingImages,
  isProcessing,
  onSend,
  onAttachImages,
  onRemoveImage,
}: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && pendingImages.length === 0) return;
    if (isProcessing) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, pendingImages, isProcessing, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      onAttachImages(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) onAttachImages(files);
    e.target.value = "";
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const uploading = pendingImages.some((img) => img.uploading);

  return (
    <div className="sticky bottom-0 z-10 border-t border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur-2xl sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Pending images preview */}
        {pendingImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingImages.map((img, i) => (
              <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200">
                <img src={img.url || img.preview} alt={img.fileName} className="h-full w-full object-cover" />
                {img.uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </div>
                )}
                <button
                  onClick={() => onRemoveImage(i)}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-400 transition-colors hover:border-violet-300 hover:text-violet-500"
            title="上传图片"
          >
            <ImagePlus className="h-5 w-5" />
          </button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onInput={handleInput}
            placeholder="描述你想做什么，或上传图片..."
            rows={1}
            className="min-h-[44px] max-h-[120px] flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
          />

          <button
            onClick={handleSend}
            disabled={isProcessing || uploading || (!text.trim() && pendingImages.length === 0)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-pink-600 text-white shadow-lg shadow-violet-200 transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
