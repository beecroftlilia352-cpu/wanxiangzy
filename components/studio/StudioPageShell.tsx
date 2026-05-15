import { FeatureTabs } from "@/components/FeatureTabs";
import type { FeatureKey } from "@/lib/navigation";
import type { ReactNode } from "react";

export type StudioPageShellProps = {
  activeFeature: FeatureKey;
  header: ReactNode;
  controlPanel: ReactNode;
  canvas: ReactNode;
  runBar: ReactNode;
  taskRail?: ReactNode;
};

export function StudioPageShell({
  activeFeature,
  header,
  controlPanel,
  canvas,
  runBar,
  taskRail,
}: StudioPageShellProps) {
  return (
    <div className="studio-workbench studio-page-shell min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)]">
      <FeatureTabs active={activeFeature} />
      {taskRail && (
        <section className="studio-shell-task-rail" aria-label="Workspace tasks">
          {taskRail}
        </section>
      )}
      <section className="studio-shell-sidebar" aria-label="Studio controls">
        <div className="studio-shell-header">{header}</div>
        {controlPanel}
        {runBar}
      </section>
      <section className="studio-canvas studio-shell-canvas" aria-label="Preview and results">
        {canvas}
      </section>
    </div>
  );
}
