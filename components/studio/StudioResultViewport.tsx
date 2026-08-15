import type { ReactNode } from "react";

export type StudioResultStatus = "empty" | "loading" | "error" | "results";

export type StudioResultViewportProps = {
  status: StudioResultStatus;
  emptyState: ReactNode;
  loadingState: ReactNode;
  errorState: ReactNode;
  results: ReactNode;
};

export function StudioResultViewport({
  status,
  emptyState,
  loadingState,
  errorState,
  results,
}: StudioResultViewportProps) {
  return (
    <div id="studio-results-panel" className="studio-result-viewport scroll-mt-24">
      {status === "empty" && emptyState}
      {status === "loading" && loadingState}
      {status === "error" && errorState}
      {status === "results" && results}
    </div>
  );
}
