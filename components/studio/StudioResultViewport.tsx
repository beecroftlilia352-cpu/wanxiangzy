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
    <div className="studio-result-viewport">
      {status === "empty" && emptyState}
      {status === "loading" && loadingState}
      {status === "error" && errorState}
      {status === "results" && results}
    </div>
  );
}
