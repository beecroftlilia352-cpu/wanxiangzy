"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
};

/**
 * Result 卡片悬浮层的工具按钮（图标 + 文字），自带 Tooltip 包裹。
 * 阻止冒泡，避免触发外层卡片的预览打开。
 */
export function OutfitFusionFocusAction({ label, icon, onClick }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="studio-result-focus-action"
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label={label}
        >
          {icon}
          <span>{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
