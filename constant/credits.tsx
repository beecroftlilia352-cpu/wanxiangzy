import type { ComponentProps } from "react";
import { Zap } from "lucide-react";

export function CreditSymbol({ className, ...props }: ComponentProps<"span">) {
    return (
        <span {...props} className={`inline-flex items-center justify-center ${className || ""}`}>
            <Zap className="size-[1em] fill-current" strokeWidth={2.4} />
        </span>
    );
}

export type ModelCreditCost = {
    model: string;
    credits: number;
};

function modelCreditCost(modelCosts: ModelCreditCost[] | undefined, model: string) {
    return modelCosts?.find((item) => item.model === model)?.credits || 0;
}

export function requestCreditCost(options: { channelMode: string; modelCosts?: ModelCreditCost[]; model: string; count?: string | number }) {
    const count = Math.max(1, Math.floor(Math.abs(Number(options.count)) || 1));
    const configured = modelCreditCost(options.modelCosts, options.model);
    if (configured > 0) return configured * count;

    const model = options.model.split("::").pop()?.toLowerCase() || options.model.toLowerCase();
    const baseCost = model.includes("happyhorse") || model.includes("video")
        ? 8
        : model.includes("gpt-image") || model.includes("nano-banana-pro")
          ? 2
          : 1;
    return baseCost * count;
}
