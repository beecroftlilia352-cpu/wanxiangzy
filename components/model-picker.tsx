"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Cpu } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { cn } from "@/lib/utils";
import { modelMatchesCapability, modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    className?: string;
    fullWidth?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
};

export function ModelPicker({ config, value, onChange, capability, className, fullWidth = false, placeholder = "选择模型", onMissingConfig }: ModelPickerProps) {
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const options = useMemo(() => {
        const candidates = Array.from(new Set([...(config.channelMode === "local" && !capability ? [value] : []), ...selectableModelsByCapability(config, capability)].filter((model): model is string => Boolean(model))));
        return dedupeModelOptions(candidates, value);
    }, [capability, config, value]);
    const current = resolveCurrentModel(config, options, value, capability);

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    useEffect(() => {
        if (!current || current === value) return;
        onChange(current);
    }, [current, onChange, value]);

    return (
        <Select
            open={open}
            value={current}
            onOpenChange={(nextOpen) => {
                if (nextOpen && !options.length) {
                    if (config.channelMode === "local") onMissingConfig?.();
                    setOpen(false);
                    return;
                }
                if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
                setOpen(nextOpen);
            }}
            onValueChange={onChange}
        >
            <SelectTrigger
                className={cn(
                    "canvas-composer-model-picker h-8 w-fit max-w-full gap-2 rounded-full border border-stone-500/70 bg-stone-900/10 px-3 text-sm font-normal shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] transition-colors hover:border-stone-400/80",
                    fullWidth ? "w-full min-w-0 justify-start" : "min-w-[9rem] justify-start",
                    "data-[state=open]:border-stone-400 data-[state=open]:bg-stone-800/40 data-[state=open]:ring-2 data-[state=open]:ring-stone-500/45",
                    className,
                )}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title={current ? modelOptionLabel(config, current) : placeholder}
            >
                <ModelIcon model={current} />
                <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{current ? modelOptionLabel(config, current) : placeholder}</span>
            </SelectTrigger>
            <SelectContent
                data-canvas-no-zoom
                className="z-[1200] w-[min(360px,calc(100vw-24px))] rounded-2xl border border-stone-700/80 bg-[#1f1f1f] p-2 text-stone-100 shadow-[0_14px_34px_rgba(0,0,0,0.34),inset_0_0_0_1px_rgba(255,255,255,0.04)] [&_[data-slot=select-viewport]]:!h-auto [&_[data-slot=select-viewport]]:!min-w-0 [&_[data-slot=select-viewport]]:!w-full"
                position="popper"
                align="start"
                side="bottom"
                sideOffset={8}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {options.map((model) => (
                    <SelectItem
                        key={model}
                        value={model}
                        textValue={modelOptionLabel(config, model)}
                        className="canvas-model-picker-item h-12 rounded-xl py-0 pl-3 pr-10 text-base text-stone-100 data-[highlighted]:bg-[#292929] data-[highlighted]:text-stone-50 data-[state=checked]:bg-[#262626] data-[state=checked]:text-stone-50 [&>span:first-child]:right-3 [&_svg]:text-stone-50"
                    >
                        <ModelLabel config={config} model={model} />
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function resolveCurrentModel(config: AiConfig, options: string[], value?: string, capability?: ModelCapability) {
    const candidate = value || defaultModelForCapability(config, capability);
    if (candidate && options.includes(candidate) && modelMatchesCapability(candidate, capability)) return candidate;
    const fallback = defaultModelForCapability(config, capability);
    if (fallback && options.includes(fallback)) return fallback;
    return options[0] || "";
}

function dedupeModelOptions(options: string[], current?: string) {
    const byName = new Map<string, string>();
    options.forEach((option) => {
        const key = modelOptionName(option).toLowerCase();
        const existing = byName.get(key);
        if (!existing || option === current || (!existing.includes("platform::") && option.includes("platform::"))) {
            byName.set(key, option);
        }
    });
    return Array.from(byName.values());
}

function defaultModelForCapability(config: AiConfig, capability?: ModelCapability) {
    if (capability === "image") return config.imageModel || config.model;
    if (capability === "video") return config.videoModel || config.model;
    if (capability === "audio") return config.audioModel || config.model;
    if (capability === "text") return config.textModel || config.model;
    return config.model;
}

function ModelLabel({ config, model }: { config: AiConfig; model: string }) {
    const name = modelOptionName(model);
    const showChannel = shouldShowChannelSuffix(config, name);
    const label = showChannel ? modelOptionLabel(config, model) : name;
    return (
        <span className="flex min-w-0 items-center gap-2.5">
            <ModelIcon model={model} />
            <span className="truncate">{label}</span>
        </span>
    );
}

// Show the "（channelName）" suffix only when the model name appears in more
// than one channel. When all matches live in one channel (the common case for
// yunwu's single platform channel), the suffix is redundant visual noise that
// forces long model names to truncate.
function shouldShowChannelSuffix(config: AiConfig, modelName: string): boolean {
    const matches = config.channels.filter((channel) => channel.models.includes(modelName));
    return matches.length > 1;
}

function ModelIcon({ model }: { model: string }) {
    const icon = resolveModelIcon(modelOptionName(model));
    return icon ? <RawPreviewImage src={icon} alt="" width={16} height={16} loading="lazy" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" aria-hidden="true" />;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("MiniMax")) return "/icons/MiniMax.svg";
    if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
    if (name.includes("grok") || name.includes("grok")) return "/icons/grok.svg";
    if (name.includes("deepseek") || name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("glm") || name.includes("glm")) return "/icons/glm.svg";
    return "";
}
