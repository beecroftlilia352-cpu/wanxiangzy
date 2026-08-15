"use client";

import { useTranslations } from "next-intl";
import { StudioGenerationLoader, type StudioLoaderReferenceImage } from "@/components/studio/StudioGenerationLoader";

type LoadingStageProps = {
  genCount: number;
  progress: number;
  moduleName?: string;
  statusText?: string;
  aspectRatio?: string;
  referenceImages?: StudioLoaderReferenceImage[];
  estimatedTime?: string;
  metaItems?: string[];
};

export function LoadingStage({
  genCount,
  progress,
  moduleName,
  statusText,
  aspectRatio,
  referenceImages,
  estimatedTime,
  metaItems,
}: LoadingStageProps) {
  const t = useTranslations("Shared");
  const resolvedModuleName = moduleName ?? t("imageGeneration");
  return (
    <StudioGenerationLoader
      count={genCount}
      progress={progress}
      moduleName={resolvedModuleName}
      statusText={statusText}
      aspectRatio={aspectRatio}
      referenceImages={referenceImages}
      estimatedTime={estimatedTime}
      metaItems={metaItems}
    />
  );
}
