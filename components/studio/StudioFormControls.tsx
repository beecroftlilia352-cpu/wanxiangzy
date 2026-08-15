import { useEffect, useMemo } from "react";
import type { ChangeEvent, ComponentType, ReactNode, TextareaHTMLAttributes } from "react";
import { useVisibleImageModels } from "@/lib/use-visible-image-models";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { useTranslations } from "next-intl";

export type StudioChoiceOption<T extends string = string> = {
  value: T;
  label: ReactNode;
  labelKey?: string;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
  /** 比例预览（如 "3:4"）：渲染一个该比例的小矩形 + 下方比例文字 */
  ratio?: string;
  /** 角落徽章（如「推荐」），用于给选项分层 */
  badge?: string;
};

export function StudioOptionGrid<T extends string>({
  options,
  value,
  onChange,
  columns = "auto",
  ariaLabel,
  className,
  textAlign = "center",
  descriptionMode = "truncate",
}: {
  options: readonly StudioChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: 1 | 2 | 3 | 4 | "auto";
  ariaLabel: string;
  className?: string;
  textAlign?: "center" | "start";
  descriptionMode?: "truncate" | "wrap";
}) {
  const t = useTranslations();
  return (
    <div
      className={cn(
        "studio-option-grid",
        columns !== "auto" && `studio-option-grid-${columns}`,
        className
      )}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const selected = value === option.value;
        const Icon = option.icon;
        const labelText = option.labelKey ? t(option.labelKey) : option.label;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            title={typeof labelText === "string" ? labelText : undefined}
            className={cn(
              "studio-option-control",
              textAlign === "start" && "studio-option-control-start",
              selected && "studio-option-control-selected"
            )}
          >
            {option.badge ? (
              <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-[rgba(91,124,255,0.12)] px-1.5 py-0.5 text-[9px] font-black leading-none text-[var(--codex-accent)]">
                {option.badge}
              </span>
            ) : null}
            {option.ratio ? (
              <span className="flex flex-col items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="block w-7 rounded-[3px] border-[1.6px] border-current"
                  style={{ aspectRatio: option.ratio, maxHeight: "26px" }}
                />
                <span className="truncate text-[11px] font-bold leading-none">{option.ratio}</span>
                <span className="sr-only">{labelText}</span>
              </span>
            ) : (
              <span className={cn("min-w-0", Icon && "flex items-start gap-2.5")}>
                {Icon && (
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate">{labelText}</span>
                  {option.description && (
                    <span
                      className={cn(
                        "mt-0.5 block text-[11px] font-semibold opacity-65",
                        descriptionMode === "wrap"
                          ? "whitespace-normal break-words leading-4"
                          : "truncate"
                      )}
                    >
                      {option.description}
                    </span>
                  )}
                </span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type StudioModelOption<T extends string = string> = {
  value: T;
  label: string;
  labelKey?: string;
  desc: string;
  descKey?: string;
  icon?: string;
  badge?: string;
  badgeKey?: string;
  disabled?: boolean;
};

export function StudioModelSelector<T extends string>({
  models,
  value,
  onChange,
  getMeta,
  columns = 2,
  ariaLabel = "Generation model",
}: {
  models: readonly StudioModelOption<T>[];
  value: T;
  onChange: (value: T) => void;
  getMeta?: (model: StudioModelOption<T>) => ReactNode;
  columns?: 1 | 2;
  ariaLabel?: string;
}) {
  const t = useTranslations();
  const { visibleModels, isReady } = useVisibleImageModels();
  const visibleOptions = useMemo(() => {
    if (!isReady || !visibleModels) return models;
    return models.filter((model) => visibleModels.has(model.value));
  }, [isReady, models, visibleModels]);

  useEffect(() => {
    if (!isReady || visibleOptions.length === 0) return;
    if (!visibleOptions.some((model) => model.value === value)) {
      onChange(visibleOptions[0].value);
    }
  }, [isReady, onChange, value, visibleOptions]);

  return (
    <div className={cn("studio-model-selector", columns === 1 && "studio-model-selector-1")} role="radiogroup" aria-label={ariaLabel}>
      {visibleOptions.map((model) => {
        const selected = value === model.value;
        return (
          <button
            key={model.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={model.disabled}
            onClick={() => onChange(model.value)}
            className={cn("studio-model-option", selected && "studio-model-option-selected")}
          >
            <span className="studio-model-option-icon">
              {model.icon ? <RawPreviewImage src={model.icon} alt="" /> : <ImageIcon className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="studio-model-option-title">
                <span className="leading-tight [overflow-wrap:anywhere]">{model.labelKey ? t(model.labelKey) : model.label}</span>
                {model.badge && <span className="studio-model-option-badge">{model.badgeKey ? t(model.badgeKey) : model.badge}</span>}
              </span>
              <span className="studio-model-option-desc">{getMeta?.(model) ?? (model.descKey ? t(model.descKey) : model.desc)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function StudioToggleRow({
  title,
  description,
  checked,
  onChange,
  meta,
  disabled,
  ariaLabel,
}: {
  title: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  meta?: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-xl bg-slate-50/90 p-4 text-left transition",
        "hover:bg-slate-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2",
        disabled && "cursor-not-allowed opacity-60 hover:bg-slate-50/90"
      )}
    >
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-black text-codex-ink">{title}</span>
          {meta && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-codex-faint shadow-sm">{meta}</span>}
        </span>
        {description && <span className="mt-1 block text-[11px] font-semibold leading-5 text-codex-faint">{description}</span>}
      </span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-[var(--codex-accent)]" : "bg-slate-300"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  );
}

export function StudioHiddenFileInput({
  inputRef,
  multiple,
  accept = "image/*",
  onFiles,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  multiple?: boolean;
  accept?: string;
  onFiles: (files: File[]) => void | Promise<void>;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple={multiple}
      className="hidden"
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        const input = event.currentTarget;
        void Promise.resolve(onFiles(Array.from(input.files || []))).finally(() => {
          input.value = "";
        });
      }}
    />
  );
}

export type StudioPresetImage = {
  id: string;
  src: string;
  label?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
};

export function StudioPromptTextarea({
  title,
  badge,
  description,
  action,
  className,
  onSubmitOnEnter,
  onKeyDown,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  title?: ReactNode;
  badge?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Enter 提交（Shift+Enter 换行）；桌面端快捷生成 */
  onSubmitOnEnter?: () => void;
}) {
  return (
    <section className="studio-prompt-control">
      {(title || badge) && (
        <div className="mb-3 flex min-w-0 items-center gap-2">
          {title && <h3 className="text-sm font-black text-codex-ink">{title}</h3>}
          {badge && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-codex-muted">{badge}</span>}
        </div>
      )}
      <div className="studio-prompt-field">
        <textarea
          {...props}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && onSubmitOnEnter) {
              event.preventDefault();
              onSubmitOnEnter();
            }
          }}
          className={cn("studio-prompt-textarea", action && "studio-prompt-textarea-with-action", className)}
        />
        {action ? <div className="studio-prompt-inline-action">{action}</div> : null}
      </div>
      {description && <p className="mt-2 text-[11px] leading-relaxed text-codex-faint">{description}</p>}
    </section>
  );
}
