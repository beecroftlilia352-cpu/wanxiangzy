"use client";

import {
  forwardRef,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import {
  BookOpen,
  Brush,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * 统一 prompt 文本描述组件。
 *
 * 设计目标：
 * - 标题沿用比例 / 分辨率 控件的紫色 marker 标题
 * - 底部内嵌一行操作：[AI帮写] [词库]              0 / 2000 [保存] [清空]
 * - AI帮写按 prop 控制（仅当目标页有该能力时显示）
 * - 词库按钮是预留入口，目前点击占位
 * - 保存 / 清空图标 hover 显示自定义黑色 tooltip（参考设计稿）
 *
 * 调用方传 `value / onChange` 与原生 textarea 一致；其余交互回调全部可选。
 */
export type PromptTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "title" | "onChange" | "value"
> & {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** 标题文本 */
  title?: ReactNode;
  /** i18n 标题 key，优先于 title */
  titleKey?: string;
  /** 标题右侧小标签（如「可选」），保留与 StudioPromptTextarea 兼容 */
  badge?: ReactNode;
  /** 描述行：渲染在 textarea 下方、AI帮写按钮上方 */
  description?: ReactNode;
  /** 词库按钮开关：默认显示（预留入口）；设为 false 时整列隐藏 */
  showWordLibrary?: boolean;
  /** AI帮写开关：默认 false（只有真正调用 optimizePrompt 的页面才传 true） */
  hasAiAssistant?: boolean;
  /** AI帮写 loading 状态（用于 spinner 切换） */
  isOptimizing?: boolean;
  /** AI帮写点击回调（必填才渲染） */
  onOptimizePrompt?: () => void;
  /** AI帮写 disabled 条件（如缺前置图、文本为空） */
  aiAssistantDisabled?: boolean;
  /** 词库点击回调（默认占位） */
  onOpenWordLibrary?: () => void;
  /** 保存到我的提示词（默认占位） */
  onSaveToMyPrompts?: () => void;
  /** 清空文本 */
  onClear?: () => void;
  /** Enter 直接提交（Shift+Enter 仍换行） */
  onSubmitOnEnter?: () => void;
  /** 自定义 className 加在 section 上 */
  className?: string;
};

/**
 * 自定义黑色 tooltip：参考设计稿 hover 显示在按钮上方。
 * 比 native title 更可控，定位 / 箭头 / 动画都自己掌握。
 */
function HoverTooltip({
  label,
  children,
  side = "top",
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
}) {
  return (
    <span className={cn("studio-prompt-tooltip-host", side === "bottom" && "studio-prompt-tooltip-host-bottom")}>
      {children}
      <span role="tooltip" className="studio-prompt-tooltip">
        <span className="studio-prompt-tooltip-bubble">{label}</span>
        <span aria-hidden="true" className="studio-prompt-tooltip-arrow" />
      </span>
    </span>
  );
}

export const PromptTextarea = forwardRef<HTMLTextAreaElement, PromptTextareaProps>(
  function PromptTextarea(
    {
      title,
      titleKey,
      badge,
      description,
      showWordLibrary = true,
      hasAiAssistant = false,
      isOptimizing = false,
      onOptimizePrompt,
      aiAssistantDisabled = false,
      onOpenWordLibrary,
      onSaveToMyPrompts,
      onClear,
      onSubmitOnEnter,
      value,
      onChange,
      className,
      maxLength,
      rows = 6,
      placeholder,
      ...textareaProps
    },
    ref
  ) {
    const t = useTranslations();
    const tPrompt = useTranslations("Shared.prompt");
    const resolvedTitle = titleKey ? t(titleKey) : title;
    const hasTitle = resolvedTitle != null && resolvedTitle !== "";
    const showAiButton = hasAiAssistant && typeof onOptimizePrompt === "function";
    const showClear = typeof onClear === "function";
    const showSave = typeof onSaveToMyPrompts === "function";
    // 词库按钮：只要声明了 onOpenWordLibrary 就渲染（默认隐藏，避免点了没反应）
    const showWordLibraryButton = showWordLibrary && typeof onOpenWordLibrary === "function";
    const safeMax = typeof maxLength === "number" ? maxLength : 2000;
    const currentLength = value.length;

    return (
      <section className={cn("studio-prompt-control studio-prompt-textarea-section", className)}>
        {hasTitle && (
          <h3 className="studio-prompt-textarea-title">
            <span aria-hidden="true" className="studio-prompt-textarea-title-mark" />
            <span className="studio-prompt-textarea-title-text">{resolvedTitle}</span>
            {badge ? (
              <span className="studio-prompt-textarea-title-badge">{badge}</span>
            ) : null}
          </h3>
        )}

        <div className="studio-prompt-textarea-card">
          {description ? (
            <p className="studio-prompt-textarea-description">{description}</p>
          ) : null}

          <div className="studio-prompt-field">
            <textarea
              ref={ref}
              {...textareaProps}
              value={value}
              maxLength={maxLength}
              rows={rows}
              placeholder={placeholder}
              onChange={(event) => {
                if (typeof maxLength === "number" && event.target.value.length > maxLength) {
                  event.target.value = event.target.value.slice(0, maxLength);
                }
                onChange(event);
              }}
              onKeyDown={(event) => {
                textareaProps.onKeyDown?.(event);
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  onSubmitOnEnter
                ) {
                  event.preventDefault();
                  onSubmitOnEnter();
                }
              }}
              className="studio-prompt-textarea"
            />
          </div>

          {showAiButton || showClear || showSave || showWordLibraryButton ? (
            <div className="studio-prompt-textarea-actions">
              <div className="studio-prompt-textarea-actions-left">
                {showAiButton ? (
                  <button
                    type="button"
                    onClick={onOptimizePrompt}
                    disabled={isOptimizing || aiAssistantDisabled}
                    className="studio-prompt-action-pill"
                  >
                    {isOptimizing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Brush className="h-3.5 w-3.5" />
                    )}
                    <span>{tPrompt("aiAssist")}</span>
                  </button>
                ) : null}
                {showWordLibraryButton ? (
                  <button
                    type="button"
                    onClick={onOpenWordLibrary}
                    className="studio-prompt-action-pill"
                    data-tone="muted"
                    aria-label={tPrompt("wordLibrary")}
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>{tPrompt("wordLibrary")}</span>
                  </button>
                ) : null}
              </div>

              <div className="studio-prompt-textarea-actions-right">
                <span className="studio-prompt-textarea-count" aria-live="polite">
                  {currentLength} / {safeMax}
                </span>
                {showSave ? (
                  <HoverTooltip label={tPrompt("saveToMyPrompts")} side="top">
                    <button
                      type="button"
                      onClick={onSaveToMyPrompts}
                      className="studio-prompt-icon-action"
                      aria-label={tPrompt("saveToMyPrompts")}
                    >
                      <Save className="h-4 w-4" />
                    </button>
                  </HoverTooltip>
                ) : null}
                {showClear ? (
                  <HoverTooltip label={tPrompt("clear")} side="top">
                    <button
                      type="button"
                      onClick={onClear}
                      className="studio-prompt-icon-action"
                      aria-label={tPrompt("clear")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </HoverTooltip>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    );
  }
);

/**
 * 兼容旧 StudioPromptTextarea 名字。新代码请直接 import PromptTextarea。
 */
export const StudioPromptTextarea = PromptTextarea;