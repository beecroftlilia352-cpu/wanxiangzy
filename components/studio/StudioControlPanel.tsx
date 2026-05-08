import type { ReactNode } from "react";

export type StudioControlPanelProps = {
  children: ReactNode;
};

export function StudioControlPanel({ children }: StudioControlPanelProps) {
  return (
    <div className="studio-parameters-scroll studio-control-panel flex-1 overflow-visible lg:overflow-y-auto">
      {children}
    </div>
  );
}
