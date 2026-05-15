"use client";

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
  moduleName = "图像生成",
  statusText,
  aspectRatio,
  referenceImages,
  estimatedTime,
  metaItems,
}: LoadingStageProps) {
  return (
    <StudioGenerationLoader
      count={genCount}
      progress={progress}
      moduleName={moduleName}
      statusText={statusText}
      aspectRatio={aspectRatio}
      referenceImages={referenceImages}
      estimatedTime={estimatedTime}
      metaItems={metaItems}
    />
  );
}
