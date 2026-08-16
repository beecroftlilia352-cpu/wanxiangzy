"use client";

import {
  forwardRef,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import {
  Languages,
  Loader2,
  NotebookTabs,
  Save,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * 统一 prompt 文本描述组件。
 *
 * 设计目标：
 * - 标题沿用比例 / 分辨率 控件的紫色 marker 标题
 * - 底部内嵌一行操作：[AI帮写] [词库]              0 / 2000 [保存] [清空]
 * - AI帮写按 prop 控制（仅当目标页有该能力时显示）
 * - 词库 / 保存按钮默认保留，未接业务时给出明确占位反馈
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
  /** 保存按钮开关：默认显示（预留入口） */
  showSaveAction?: boolean;
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
  /** 嵌套高级编辑器使用紧凑样式，默认使用截图主样式 */
  variant?: "default" | "compact";
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
      showSaveAction = true,
      hasAiAssistant = false,
      isOptimizing = false,
      onOptimizePrompt,
      aiAssistantDisabled = false,
      onOpenWordLibrary,
      onSaveToMyPrompts,
      onClear,
      onSubmitOnEnter,
      variant = "default",
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
    const tShared = useTranslations("Shared");
    const tPrompt = useTranslations("Shared.prompt");
    const { confirm, confirmDialog } = useConfirm();
    const resolvedTitle = titleKey ? t(titleKey) : title;
    const hasTitle = resolvedTitle != null && resolvedTitle !== "";
    const showAiButton = hasAiAssistant && typeof onOptimizePrompt === "function";
    const showClear = typeof onClear === "function";
    const showSave = showSaveAction;
    const showWordLibraryButton = showWordLibrary;
    const safeMax = typeof maxLength === "number" ? maxLength : 2000;
    const currentLength = value.length;
    const interactionDisabled = Boolean(textareaProps.disabled || textareaProps.readOnly);

    const handleReservedAction = (callback?: () => void) => {
      if (callback) {
        callback();
        return;
      }
      toast.info(t("Header.comingSoon"));
    };

    const handleClear = () => {
      if (!onClear || !value.length || interactionDisabled) return;
      confirm({
        variant: "batch-clear",
        title: tShared("clearContentTitle"),
        okText: tShared("confirmClear"),
        cancelText: tShared("cancel"),
        onOk: onClear,
      });
    };

    return (
      <>
        <section
          className={cn(
            "studio-prompt-control studio-prompt-textarea-section",
            variant === "compact" && "studio-prompt-textarea-section-compact",
            className,
          )}
        >
          {hasTitle && (
            <h3 className="studio-prompt-textarea-title">
              <span aria-hidden="true" className="studio-prompt-textarea-title-mark" />
              <span className="studio-prompt-textarea-title-text">{resolvedTitle}</span>
              {badge ? (
                <span className="studio-prompt-textarea-title-badge">{badge}</span>
              ) : null}
            </h3>
          )}

          {description ? (
            <p className="studio-prompt-textarea-description">{description}</p>
          ) : null}

          <div className="studio-prompt-textarea-shell">
            <div className="studio-prompt-field">
              <textarea
              ref={ref}
              {...textareaProps}
              value={value}
              maxLength={safeMax}
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
              <div className="studio-prompt-textarea-actions">
                <div className="studio-prompt-textarea-actions-left">
                {showAiButton ? (
                  <button
                    type="button"
                    onClick={onOptimizePrompt}
                    disabled={interactionDisabled || isOptimizing || aiAssistantDisabled}
                    className="studio-prompt-action-pill"
                  >
                    {isOptimizing ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Languages />
                    )}
                    <span>{tPrompt("aiAssist")}</span>
                  </button>
                ) : null}
                {showWordLibraryButton ? (
                  <button
                    type="button"
                    onClick={() => handleReservedAction(onOpenWordLibrary)}
                    disabled={interactionDisabled}
                    className="studio-prompt-action-pill"
                    data-tone="muted"
                    aria-label={tPrompt("wordLibrary")}
                  >
                    <NotebookTabs />
                    <span>{tPrompt("wordLibrary")}</span>
                  </button>
                ) : null}
                </div>

              <div className="studio-prompt-textarea-actions-right">
                <span className="studio-prompt-textarea-count" aria-live="polite">
                  <span className="studio-prompt-textarea-count-current">{currentLength}</span>
                  <span className="studio-prompt-textarea-count-limit"> / {safeMax}</span>
                </span>
                {showSave ? (
                  <HoverTooltip label={tPrompt("saveToMyPrompts")} side="top">
                    <button
                      type="button"
                      onClick={() => handleReservedAction(onSaveToMyPrompts)}
                      disabled={interactionDisabled}
                      className="studio-prompt-icon-action studio-prompt-icon-action-save"
                      aria-label={tPrompt("saveToMyPrompts")}
                    >
                      <Save />
                    </button>
                  </HoverTooltip>
                ) : null}
                {showClear ? (
                  <HoverTooltip label={tPrompt("clear")} side="top">
                    <button
                      type="button"
                      onClick={handleClear}
                      disabled={interactionDisabled || !value.length}
                      className="studio-prompt-icon-action studio-prompt-icon-action-clear"
                      aria-label={tPrompt("clear")}
                    >
                      <Trash2 />
                    </button>
                  </HoverTooltip>
                ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>
        {confirmDialog}
      </>
    );
  }
);

/**
 * 兼容旧 StudioPromptTextarea 名字。新代码请直接 import PromptTextarea。
 */
export const StudioPromptTextarea = PromptTextarea;
