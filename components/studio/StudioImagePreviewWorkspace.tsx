"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Brush,
  Clapperboard,
  Copy,
  Download,
  Eye,
  ImageIcon,
  Images,
  Loader2,
  Maximize2,
  MessageSquare,
  Minus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  UserRoundCheck,
  WandSparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

/** 预览操作标签按 kind 映射 Shared 命名空间（数据数组里 label 为中文兜底） */
const ACTION_LABEL_KEYS: Record<string, string> = {
  download: "actionDownload",
  copy: "actionCopy",
  repair: "actionRepair",
  aiVideo: "actionAiVideo",
  modelBackground: "actionModelBackground",
  pose: "actionPose",
  productSet: "actionProductSet",
  allCategoryProductImage: "actionAllCategoryProductImage",
  regenerateOne: "actionRegenerateOne",
  regenerateAll: "actionRegenerateAll",
  useAsSource: "actionUseAsSource",
  useAsFace: "actionUseAsFace",
  feedback: "actionFeedback",
};
import { Button } from "@/components/ui/button";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getImageVariantUrl, getOriginalImageUrl } from "@/lib/image-variants";
import {
  buildSourceImageHref,
  getPreviewCanvasInputReferences,
  getSelectedPreviewResult,
  IMAGE_PREVIEW_MODULE_LABELS,
  type ImagePreviewAction,
  type ImagePreviewActionKind,
  type ImagePreviewReference,
  type ImagePreviewResult,
  type ImagePreviewSession,
} from "@/lib/studio-image-preview";
import { downloadImagesAsZip } from "@/lib/download-batch";
import { cn, downloadImage, generateDownloadFilename } from "@/lib/utils";

type StudioImagePreviewWorkspaceProps = {
  session: ImagePreviewSession;
  filenamePrefix: string;
  extension?: string;
  selectedIndex?: number;
  onSelectedIndexChange?: (index: number) => void;
  actions?: ImagePreviewAction[];
  onRegenerateOne?: (url: string | null, index: number) => void;
  onRegenerateAll?: () => void;
  onUseAsSource?: (url: string) => void;
  onUseAsFace?: (url: string) => void;
  onFeedbackSubmitted?: () => void;
  className?: string;
};

type FocusImage = {
  url: string;
  title: string;
};

const DEFAULT_ACTIONS: ImagePreviewAction[] = [
  { kind: "download", label: "下载图片" },
  { kind: "copy", label: "复制链接" },
  { kind: "repair", label: "AI修图" },
  { kind: "aiVideo", label: "AI视频" },
  { kind: "modelBackground", label: "换模特背景" },
  { kind: "pose", label: "姿势裂变" },
  { kind: "productSet", label: "商品套图" },
  { kind: "feedback", label: "反馈" },
];

const MORE_TOOL_ITEMS = [
  { label: "商品重绘", labelKey: "toolProductRepaint", path: "/general-image/image-to-image" },
  { label: "AI扩图", labelKey: "toolAiExpand", path: "/general-image/image-to-image" },
  { label: "高清修复", labelKey: "toolHdRestore", path: "/general-image/image-to-image" },
  { label: "智能抠图", labelKey: "toolSmartCutout", path: "/general-image/image-to-image" },
  { label: "消除笔", labelKey: "toolEraser", path: "/general-image/image-to-image" },
  { label: "AI换色", labelKey: "toolAiRecolor", path: "/general-image/image-to-image" },
  { label: "文字编辑", labelKey: "toolTextEdit", path: "/general-image/image-to-image" },
  { label: "印花修复", labelKey: "toolPrintRestore", path: "/general-image/image-to-image" },
];

const VIDEO_TOOL_ITEMS = [
  { label: "图生视频", labelKey: "videoToolImageToVideo", path: "/video" },
  { label: "动作复刻", labelKey: "videoToolMotionReplicate", path: "/video/motion-control" },
  { label: "多图成片", labelKey: "videoToolMultiToVideo", path: "/video/first-last-frame" },
  { label: "模特替换", labelKey: "videoToolModelReplace", path: "/model-background" },
];

export function StudioImagePreviewWorkspace({
  session,
  filenamePrefix,
  extension = "png",
  selectedIndex,
  onSelectedIndexChange,
  actions = DEFAULT_ACTIONS,
  onRegenerateOne,
  onRegenerateAll,
  onUseAsSource,
  onUseAsFace,
  onFeedbackSubmitted,
  className,
}: StudioImagePreviewWorkspaceProps) {
  const t = useTranslations("Shared");
  const router = useRouter();
  const [internalIndex, setInternalIndex] = useState(session.selectedIndex || 0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [focusImage, setFocusImage] = useState<FocusImage | null>(null);
  const [inputZoom, setInputZoom] = useState(100);
  const [outputZoom, setOutputZoom] = useState(100);
  const activeIndex = clampIndex(selectedIndex ?? internalIndex, session.results.length);
  const activeResult = session.results[activeIndex] || getSelectedPreviewResult(session);
  const activeUrl = activeResult?.url || "";
  const inputReferences = useMemo(() => getPreviewCanvasInputReferences(session), [session]);
  const aspectConfig = useMemo(() => getPreviewAspectConfig(activeResult?.aspectRatio), [activeResult?.aspectRatio]);
  const usableActions = useMemo(() => filterUsableActions(actions, {
    hasUrl: Boolean(activeUrl),
    onRegenerateOne: Boolean(onRegenerateOne),
    onRegenerateAll: Boolean(onRegenerateAll),
    onUseAsSource: Boolean(onUseAsSource),
    onUseAsFace: Boolean(onUseAsFace),
  }), [actions, activeUrl, onRegenerateOne, onRegenerateAll, onUseAsFace, onUseAsSource]);

  const setActiveIndex = useCallback((index: number) => {
    const next = clampIndex(index, session.results.length);
    setInternalIndex(next);
    onSelectedIndexChange?.(next);
  }, [onSelectedIndexChange, session.results.length]);

  useEffect(() => {
    setInternalIndex(clampIndex(session.selectedIndex || 0, session.results.length));
  }, [session.selectedIndex, session.results.length]);

  useEffect(() => {
    setOutputZoom(100);
  }, [activeUrl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || focusImage || feedbackOpen) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex(activeIndex - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex(activeIndex + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, feedbackOpen, focusImage, setActiveIndex]);

  const openFocusImage = (url: string, title: string) => {
    if (!url) return;
    setFocusImage({ url, title });
  };

  const runAction = async (action: ImagePreviewAction) => {
    if (action.disabled) {
      if (action.disabledReason) toast.info(action.disabledReason);
      return;
    }

    if ((action.kind === "download" || action.kind === "copy") && !activeUrl) {
      toast.info(t("noImagesYet"));
      return;
    }

    if (action.kind === "download") {
      try {
        await downloadImage(activeUrl, generateDownloadFilename(filenamePrefix, activeIndex, extension));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("downloadFailed"));
      }
      return;
    }
    if (action.kind === "copy") {
      await navigator.clipboard.writeText(activeUrl);
      toast.success(t("imageLinkCopied"));
      return;
    }
    if (action.kind === "aiVideo") {
      router.push(buildSourceImageHref("/video", activeUrl));
      return;
    }
    if (action.kind === "modelBackground") {
      router.push(buildSourceImageHref("/model-background", activeUrl));
      return;
    }
    if (action.kind === "pose") {
      router.push(buildSourceImageHref("/pose", activeUrl));
      return;
    }
    if (action.kind === "productSet") {
      router.push(buildSourceImageHref("/product-set", activeUrl));
      return;
    }
    if (action.kind === "allCategoryProductImage") {
      router.push(buildSourceImageHref("/all-category-product-image", activeUrl));
      return;
    }
    if (action.kind === "regenerateOne") {
      onRegenerateOne?.(activeUrl || null, activeIndex);
      return;
    }
    if (action.kind === "regenerateAll") {
      onRegenerateAll?.();
      return;
    }
    if (action.kind === "useAsSource" && activeUrl) {
      onUseAsSource?.(activeUrl);
      return;
    }
    if (action.kind === "useAsFace" && activeUrl) {
      onUseAsFace?.(activeUrl);
      return;
    }
    if (action.kind === "repair") {
      router.push(buildSourceImageHref("/general-image/image-to-image", activeUrl));
      return;
    }
    if (action.kind === "feedback") {
      setFeedbackOpen(true);
    }
  };

  const routeWithSource = (path: string) => {
    if (!activeUrl) {
      toast.info(t("noImagesYet"));
      return;
    }
    router.push(buildSourceImageHref(path, activeUrl));
  };

  return (
    <TooltipProvider>
      <div className={cn("studio-image-preview-workspace", className)}>
        <div className="studio-image-preview-main">
          <div className="studio-image-preview-stage-shell" aria-label={t("resultPreviewArea", { title: session.title })}>
            <ResultRail
              results={session.results}
              activeIndex={activeIndex}
              onSelect={setActiveIndex}
            />

            <PreviewNavigationButton
              direction="prev"
              disabled={session.results.length <= 1}
              onClick={() => setActiveIndex(activeIndex - 1)}
            />

            <div
              className="studio-image-preview-comparison"
              data-aspect-ratio={aspectConfig.aspectRatio}
              data-fit-mode={aspectConfig.fitMode}
              style={aspectConfig.style}
            >
              <InputPreviewPanel
                module={session.module}
                references={inputReferences}
                zoom={inputZoom}
                onZoomChange={setInputZoom}
                onFocus={openFocusImage}
              />
              <OutputPreviewPanel
                result={activeResult}
                index={activeIndex}
                zoom={outputZoom}
                onZoomChange={setOutputZoom}
                onFocus={openFocusImage}
              />
            </div>

            <PreviewNavigationButton
              direction="next"
              disabled={session.results.length <= 1}
              onClick={() => setActiveIndex(activeIndex + 1)}
            />
          </div>

          <PreviewActionBar
            actions={usableActions}
            activeUrl={activeUrl}
            activeResult={activeResult}
            onRunAction={runAction}
            onRouteWithSource={routeWithSource}
            resultUrls={session.results.map((item) => item.url).filter((url): url is string => Boolean(url))}
            filenamePrefix={filenamePrefix}
          />
        </div>

        <PreviewInspector
          session={session}
          result={activeResult}
          selectedIndex={activeIndex}
          onReferenceFocus={openFocusImage}
        />

        {focusImage && (
          <ImageFocusDialog
            image={focusImage}
            onClose={() => setFocusImage(null)}
          />
        )}

        {feedbackOpen && (
          <FeedbackDialog
            session={session}
            result={activeResult}
            resultUrl={activeUrl}
            onClose={() => setFeedbackOpen(false)}
            onSubmitted={() => {
              setFeedbackOpen(false);
              onFeedbackSubmitted?.();
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

function ResultRail({
  results,
  activeIndex,
  onSelect,
}: {
  results: ImagePreviewResult[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const t = useTranslations("Shared");
  return (
    <div className="studio-image-preview-result-rail" aria-label={t("resultThumbnails")}>
      {results.map((result, index) => (
        <Button
          key={`${result.url || result.title}-${index}`}
          type="button"
          variant="ghost"
          onClick={() => onSelect(index)}
          className={cn("studio-image-preview-result-thumb", index === activeIndex && "studio-image-preview-result-thumb-active")}
          aria-label={t("viewResult", { title: result.title })}
          aria-current={index === activeIndex}
        >
          {result.url ? (
            <RawPreviewImage src={getImageVariantUrl(result.url, "thumb")} alt={result.title} />
          ) : (
            <PendingThumb result={result} />
          )}
          <span>{index + 1}</span>
        </Button>
      ))}
    </div>
  );
}

function InputPreviewPanel({
  module,
  references,
  zoom,
  onZoomChange,
  onFocus,
}: {
  module: ImagePreviewSession["module"];
  references: ImagePreviewReference[];
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onFocus: (url: string, title: string) => void;
}) {
  const t = useTranslations("Shared");
  const hasReferences = references.length > 0;

  return (
    <section className="studio-image-preview-panel studio-image-preview-input-panel" aria-label={t("inputImageArea")}>
      <span className="studio-image-preview-panel-badge">{t("originalImage")}</span>
      {hasReferences ? (
        <>
          <div className={cn(
            "studio-image-preview-input-stack",
            references.length > 1 && "studio-image-preview-input-stack-multi",
            module === "outfitFusion" && references.length > 1 && "studio-image-preview-input-stack-collage"
          )}>
            {references.map((reference, index) => (
              <button
                key={`${reference.url}-${index}`}
                type="button"
                className="studio-image-preview-input-image"
                onClick={() => onFocus(reference.url, reference.label)}
                aria-label={t("focusViewLabel", { label: reference.label })}
              >
                <RawPreviewImage
                  src={getImageVariantUrl(reference.url, "detail")}
                  alt={reference.label}
                  loading="eager"
                  decoding="async"
                  style={{ transform: `scale(${zoom / 100})` }}
                />
                <span>{reference.label}</span>
              </button>
            ))}
          </div>
          <ZoomDock
            zoom={zoom}
            onZoomChange={onZoomChange}
            onReset={() => onZoomChange(100)}
          />
        </>
      ) : (
        <div className="studio-image-preview-empty-input">
          <ImageIcon className="h-8 w-8" />
          <span>{t("noInputImage")}</span>
        </div>
      )}
    </section>
  );
}

function OutputPreviewPanel({
  result,
  index,
  zoom,
  onZoomChange,
  onFocus,
}: {
  result: ImagePreviewResult;
  index: number;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onFocus: (url: string, title: string) => void;
}) {
  const t = useTranslations("Shared");
  return (
    <section className="studio-image-preview-panel studio-image-preview-output-panel" data-aspect-ratio={result.aspectRatio || undefined} aria-label={t("outputImageArea")}>
      <span className="studio-image-preview-panel-badge">{result.badgeLabel || t("generatedImage")}</span>
      {result.url ? (
        <>
          <button
            type="button"
            className="studio-image-preview-output-image"
            onClick={() => onFocus(result.url || "", result.title)}
            aria-label={t("focusViewLabel", { label: result.title })}
          >
            <RawPreviewImage
              src={getImageVariantUrl(result.url, "detail")}
              alt={result.title}
              loading="eager"
              decoding="async"
              style={{ transform: `scale(${zoom / 100})` }}
            />
          </button>
          <ZoomDock
            zoom={zoom}
            onZoomChange={onZoomChange}
            onReset={() => onZoomChange(100)}
          />
        </>
      ) : (
        <EmptyResult result={result} index={index} />
      )}
    </section>
  );
}

function EmptyResult({ result, index }: { result: ImagePreviewResult; index: number }) {
  const t = useTranslations("Shared");
  const failed = result.status === "failed";
  return (
    <div className={cn("studio-image-preview-empty-result", failed && "studio-image-preview-empty-result-failed")}>
      <div className="studio-image-preview-empty-icon">
        {failed ? <X className="h-7 w-7" /> : <Loader2 className="h-7 w-7 animate-spin" />}
      </div>
      <p>{failed ? result.error || t("thisImageFailed") : result.status === "running" ? t("generatingPleaseWait") : t("waitingToGenerate")}</p>
      <span>{t("imageN", { index: index + 1 })}</span>
    </div>
  );
}

function ZoomDock({
  zoom,
  onZoomChange,
  onReset,
}: {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onReset: () => void;
}) {
  const t = useTranslations("Shared");
  const setZoom = (next: number) => onZoomChange(clampZoom(next));
  return (
    <div className={cn("studio-image-preview-zoom-dock", zoom !== 100 && "studio-image-preview-zoom-dock-active")} aria-label={t("imageZoom")}>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onReset} aria-label={t("resetZoom")}>
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setZoom(zoom - 10)} aria-label={t("zoomOut")}>
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span>{zoom}%</span>
      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setZoom(zoom + 10)} aria-label={t("zoomIn")}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function PreviewInspector({
  session,
  result,
  selectedIndex,
  onReferenceFocus,
}: {
  session: ImagePreviewSession;
  result: ImagePreviewResult;
  selectedIndex: number;
  onReferenceFocus: (url: string, title: string) => void;
}) {
  const t = useTranslations("Shared");
  const referenceGroups = getInspectorReferenceGroups(session, t);
  const statusText = result.status === "completed"
    ? t("completed")
    : result.status === "failed"
      ? t("failed")
      : result.status === "running"
        ? t("generating")
        : t("waiting");

  return (
    <aside className="studio-image-preview-inspector" aria-label={t("imageInfo")}>
      <header>
        <div>
          <p>{t("imageInfo")}</p>
          <h2>{session.title}</h2>
        </div>
        <span className={cn("studio-image-preview-status", `studio-image-preview-status-${result.status || "queued"}`)}>
          {statusText}
        </span>
      </header>

      <dl className="studio-image-preview-meta">
        <MetaRow label={t("module")} value={IMAGE_PREVIEW_MODULE_LABELS[session.module]} />
        {session.taskId && <MetaRow label={t("taskId")} value={session.taskId} mono />}
        {session.createdAt && <MetaRow label={t("generateTime")} value={formatPreviewDate(session.createdAt)} />}
        <MetaRow label={t("currentImage")} value={`${selectedIndex + 1}/${session.results.length}`} />
        {(session.metaItems || []).map((item) => (
          <MetaRow key={`${item.label}-${item.value}`} label={item.label} value={item.value} />
        ))}
      </dl>

      {referenceGroups.map((group) => (
        <section key={group.title} className="studio-image-preview-section">
          <h3>{group.title}</h3>
          <div className="studio-image-preview-reference-grid">
            {group.references.map((reference, index) => (
              <button
                key={`${reference.url}-${index}`}
                type="button"
                className="studio-image-preview-reference"
                title={t("focusViewLabel", { label: reference.label })}
                onClick={() => onReferenceFocus(reference.url, reference.label)}
              >
                <RawPreviewImage src={getImageVariantUrl(reference.url, "thumb")} alt={reference.label} />
                <span>{reference.label}</span>
                <i aria-hidden="true">
                  <Maximize2 className="h-3 w-3" />
                </i>
              </button>
            ))}
          </div>
        </section>
      ))}

      {session.promptText && (
        <section className="studio-image-preview-section">
          <h3>{t("textControlContent")}</h3>
          <p className="studio-image-preview-prompt">{session.promptText}</p>
        </section>
      )}

      {(result.quality || result.error) && (
        <section className="studio-image-preview-section">
          <h3>{t("qualityInfo")}</h3>
          {result.quality?.score !== undefined && (
            <p className="studio-image-preview-quality-score">
              {Math.round(result.quality.score * 100)}{t("scoreUnit")}{result.quality.label ? ` · ${result.quality.label}` : ""}
            </p>
          )}
          {result.quality?.summary && <p className="studio-image-preview-quality-summary">{result.quality.summary}</p>}
          {result.quality?.issues?.length ? (
            <div className="studio-image-preview-issues">
              {result.quality.issues.slice(0, 4).map((issue) => <span key={issue}>{issue}</span>)}
            </div>
          ) : null}
          {result.error && <p className="studio-image-preview-error">{result.error}</p>}
        </section>
      )}
    </aside>
  );
}

function PreviewActionBar({
  actions,
  activeUrl,
  activeResult,
  onRunAction,
  onRouteWithSource,
  resultUrls,
  filenamePrefix,
}: {
  actions: ImagePreviewAction[];
  activeUrl: string;
  activeResult: ImagePreviewResult;
  onRunAction: (action: ImagePreviewAction) => void | Promise<void>;
  onRouteWithSource: (path: string) => void;
  resultUrls?: string[];
  filenamePrefix?: string;
}) {
  const t = useTranslations("Shared");
  const actionMap = new Map(actions.map((action) => [action.kind, action]));
  const downloadAction = actionMap.get("download");
  const renderAction = (kind: ImagePreviewActionKind) => {
    const action = actionMap.get(kind);
    if (!action) return null;
    if ((kind === "modelBackground" || kind === "productSet") && activeUrl) {
      return (
        <PreviewExamplePopover
          key={kind}
          action={action}
          activeUrl={activeUrl}
          resultTitle={activeResult.title}
          onClick={() => void onRunAction(action)}
        />
      );
    }
    return (
      <PreviewActionButton
        key={action.kind}
        action={action}
        onClick={() => void onRunAction(action)}
      />
    );
  };

  return (
    <div className="studio-image-preview-actions" aria-label={t("resultActions")}>
      <div className="studio-image-preview-action-shell">
        <div className="studio-image-preview-action-group">
          {renderAction("repair")}
          {activeUrl && <MoreToolsPopover onSelect={onRouteWithSource} />}
        </div>
        <div className="studio-image-preview-action-group">
          {activeUrl && actionMap.has("aiVideo") && <VideoToolsPopover onSelect={onRouteWithSource} />}
          {renderAction("modelBackground")}
          {renderAction("productSet")}
          {renderAction("pose")}
        </div>
        <div className="studio-image-preview-action-group studio-image-preview-action-group-secondary">
          {renderAction("copy")}
          {renderAction("regenerateOne")}
          {renderAction("regenerateAll")}
          {renderAction("useAsSource")}
          {renderAction("useAsFace")}
          {renderAction("feedback")}
        </div>
        {downloadAction && (
          <div className="studio-image-preview-action-download-wrap">
            <PreviewActionButton
              action={downloadAction}
              onClick={() => void onRunAction(downloadAction)}
              className="studio-image-preview-action-download"
            />
            {resultUrls && resultUrls.length > 1 && (
              <PreviewActionButton
                action={{ kind: "download", label: t("downloadAll", { count: resultUrls.length }) }}
                onClick={() => void downloadImagesAsZip({
                  urls: resultUrls,
                  filename: `pixel-diffusion-${filenamePrefix || "results"}`,
                  label: t("results"),
                })}
                className="studio-image-preview-action-download"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MoreToolsPopover({ onSelect }: { onSelect: (path: string) => void }) {
  const t = useTranslations("Shared");
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="studio-image-preview-action">
              <MoreHorizontal className="h-4 w-4" />
              <span>{t("more")}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t("moreImageTools")}</TooltipContent>
      </Tooltip>
      <PopoverContent className="studio-image-preview-menu-popover" side="top" align="center">
        {MORE_TOOL_ITEMS.map((item) => (
          <Button
            key={item.label}
            type="button"
            variant="ghost"
            className="studio-image-preview-menu-item"
            onClick={() => onSelect(item.path)}
          >
            <WandSparkles className="h-4 w-4" />
            <span>{item.labelKey ? t(item.labelKey) : item.label}</span>
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function VideoToolsPopover({ onSelect }: { onSelect: (path: string) => void }) {
  const t = useTranslations("Shared");
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="studio-image-preview-action">
              <Clapperboard className="h-4 w-4" />
              <span>{t("generateVideo")}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t("chooseVideoMethod")}</TooltipContent>
      </Tooltip>
      <PopoverContent className="studio-image-preview-menu-popover" side="top" align="center">
        {VIDEO_TOOL_ITEMS.map((item) => (
          <Button
            key={item.label}
            type="button"
            variant="ghost"
            className="studio-image-preview-menu-item"
            onClick={() => onSelect(item.path)}
          >
            <Clapperboard className="h-4 w-4" />
            <span>{item.labelKey ? t(item.labelKey) : item.label}</span>
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function PreviewExamplePopover({
  action,
  activeUrl,
  resultTitle,
  onClick,
}: {
  action: ImagePreviewAction;
  activeUrl: string;
  resultTitle: string;
  onClick: () => void;
}) {
  const t = useTranslations("Shared");
  const actionLabel = ACTION_LABEL_KEYS[action.kind] ? t(ACTION_LABEL_KEYS[action.kind]) : action.label;
  const isSet = action.kind === "productSet" || action.kind === "allCategoryProductImage";
  const title = action.kind === "modelBackground"
    ? t("modelBackgroundExampleTitle")
    : isSet
      ? t("productSetExampleTitle")
      : action.label;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="studio-image-preview-action">
              {action.kind === "modelBackground" ? <UserRoundCheck className="h-4 w-4" /> : <Images className="h-4 w-4" />}
              <span>{actionLabel}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{action.label}</TooltipContent>
      </Tooltip>
      <PopoverContent className="studio-image-preview-example-popover" side="top" align="center">
        <p>{title}</p>
        <div className={cn("studio-image-preview-example", isSet && "studio-image-preview-example-set")}>
          <RawPreviewImage src={getImageVariantUrl(activeUrl, "thumb")} alt={resultTitle} />
          <span aria-hidden="true">→</span>
          <div>
            <RawPreviewImage src={getImageVariantUrl(activeUrl, "thumb")} alt={`${resultTitle}${t("previewSuffix")}`} />
            {isSet && <RawPreviewImage src={getImageVariantUrl(activeUrl, "thumb")} alt={`${resultTitle}${t("previewSetSuffix")}`} />}
            {isSet && <RawPreviewImage src={getImageVariantUrl(activeUrl, "thumb")} alt={`${resultTitle}${t("previewSetSuffix")}`} />}
          </div>
        </div>
        <Button type="button" size="sm" className="h-8 w-full" onClick={onClick} disabled={action.disabled}>
          {action.disabled ? action.disabledReason || t("unavailable") : t("useNow")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function MetaRow({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return (
    <>
      <dt>{label}</dt>
      <dd className={mono ? "font-mono" : undefined}>{value}</dd>
    </>
  );
}

function PreviewActionButton({ action, onClick, className }: { action: ImagePreviewAction; onClick: () => void; className?: string }) {
  const t = useTranslations("Shared");
  const Icon = actionIcon(action.kind);
  const actionLabel = ACTION_LABEL_KEYS[action.kind] ? t(ACTION_LABEL_KEYS[action.kind]) : action.label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClick}
          disabled={action.disabled}
          className={cn("studio-image-preview-action", className)}
          aria-label={actionLabel}
          title={action.disabled ? action.disabledReason || action.label : action.label}
        >
          <Icon className="h-4 w-4" />
          <span>{actionLabel}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {action.disabled ? action.disabledReason || action.label : action.label}
      </TooltipContent>
    </Tooltip>
  );
}

function PreviewNavigationButton({ direction, disabled, onClick }: { direction: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  const t = useTranslations("Shared");
  const label = direction === "prev" ? t("prevImage") : t("nextImage");
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon-sm"
      className={cn("studio-image-preview-nav", direction === "prev" ? "studio-image-preview-nav-prev" : "studio-image-preview-nav-next")}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {direction === "prev" ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
    </Button>
  );
}

function PendingThumb({ result }: { result: ImagePreviewResult }) {
  return (
    <span className={cn("studio-image-preview-thumb-pending", result.status === "failed" && "studio-image-preview-thumb-failed")}>
      {result.status === "failed" ? <X className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
    </span>
  );
}

function ImageFocusDialog({ image, onClose }: { image: FocusImage; onClose: () => void }) {
  const t = useTranslations("Shared");
  const [zoom, setZoom] = useState(100);
  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="studio-image-preview-focus-dialog">
        <DialogTitle className="sr-only">{image.title}</DialogTitle>
        <DialogDescription className="sr-only">{t("focusViewImage")}</DialogDescription>
        <div
          className="studio-image-preview-focus-stage"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <RawPreviewImage
            src={getOriginalImageUrl(image.url)}
            alt={image.title}
            loading="eager"
            decoding="async"
            style={{ transform: `scale(${zoom / 100})` }}
            onClick={(event) => event.stopPropagation()}
          />
          <div onClick={(event) => event.stopPropagation()}>
            <ZoomDock zoom={zoom} onZoomChange={setZoom} onReset={() => setZoom(100)} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FeedbackDialog({
  session,
  result,
  resultUrl,
  onClose,
  onSubmitted,
}: {
  session: ImagePreviewSession;
  result: ImagePreviewResult;
  resultUrl: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const t = useTranslations("Shared");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const description = value.trim();
    if (description.length < 8) {
      toast.info(t("feedbackMinLength"));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        category: "generation_failure",
        title: `${IMAGE_PREVIEW_MODULE_LABELS[session.module]}${t("feedbackResultSuffix")}`,
        description: [
          description,
          t("feedbackModulePrefix", { label: IMAGE_PREVIEW_MODULE_LABELS[session.module] }),
          session.taskId ? t("feedbackTaskPrefix", { id: session.taskId }) : "",
          result.title ? t("feedbackImagePrefix", { title: result.title }) : "",
          resultUrl ? t("feedbackUrlPrefix", { url: resultUrl }) : "",
        ].filter(Boolean).join("\n"),
        pageUrl: typeof window !== "undefined" ? window.location.href : "",
      };
      const response = await fetch("/api/support/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t("feedbackSubmitFailed"));
      toast.success(t("feedbackSubmitted"));
      onSubmitted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("feedbackSubmitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="studio-image-preview-feedback">
        <DialogHeader>
          <DialogTitle>{t("feedbackTitle")}</DialogTitle>
          <DialogDescription>{result.title}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={500}
          placeholder={t("feedbackPlaceholder")}
          className="min-h-32 resize-none"
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>{t("cancel")}</Button>
          <Button type="button" onClick={() => void submit()} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("submitFeedback")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function filterUsableActions(
  actions: ImagePreviewAction[],
  capability: {
    hasUrl: boolean;
    onRegenerateOne: boolean;
    onRegenerateAll: boolean;
    onUseAsSource: boolean;
    onUseAsFace: boolean;
  }
) {
  const seen = new Set<ImagePreviewActionKind>();
  return actions.filter((action) => {
    if (seen.has(action.kind)) return false;
    seen.add(action.kind);
    if (action.kind === "repair" && !capability.hasUrl) return false;
    if (["download", "copy", "aiVideo", "modelBackground", "pose", "productSet", "allCategoryProductImage", "feedback"].includes(action.kind) && !capability.hasUrl) return false;
    if (action.kind === "regenerateOne" && !capability.onRegenerateOne) return false;
    if (action.kind === "regenerateAll" && !capability.onRegenerateAll) return false;
    if (action.kind === "useAsSource" && !capability.onUseAsSource) return false;
    if (action.kind === "useAsFace" && !capability.onUseAsFace) return false;
    return true;
  });
}

function getInspectorReferenceGroups(
  session: ImagePreviewSession,
  t: (key: string) => string
): Array<{ title: string; references: ImagePreviewReference[] }> {
  const references = session.references || [];
  if (!references.length) return [];
  if (session.module === "outfitFusion") {
    const outfitReferences = references.filter((reference) => (
      reference.role === "clothing"
      || reference.role === "garment"
      || reference.role === "product"
      || /搭配图|服装|鞋|包|配饰/.test(reference.label)
    ));
    const referenceImages = references.filter((reference) => reference.role === "reference" || /参考图/.test(reference.label));
    const modelReferences = references.filter((reference) => reference.role === "model" || /模特/.test(reference.label));
    const groups = [
      outfitReferences.length ? { title: t("outfitGroup"), references: outfitReferences } : null,
      referenceImages.length ? { title: t("referenceGroup"), references: referenceImages } : null,
      modelReferences.length ? { title: t("modelGroup"), references: modelReferences } : null,
    ].filter(Boolean) as Array<{ title: string; references: ImagePreviewReference[] }>;
    return groups.length ? groups : [{ title: t("inputReference"), references }];
  }
  if (session.module !== "tryon") return [{ title: t("inputReference"), references }];

  const isModel = (reference: ImagePreviewReference) => reference.role === "model" || /模特/.test(reference.label);
  const isClothing = (reference: ImagePreviewReference) => (
    reference.role === "clothing"
    || reference.role === "garment"
    || reference.role === "product"
    || /上装|下装|服装|连体|全身|商品/.test(reference.label)
  );
  const clothingReferences = references.filter(isClothing);
  const modelReferences = references.filter(isModel);
  const sceneReferences = references.filter((reference) => !isModel(reference) && !isClothing(reference));
  const groups = [
    clothingReferences.length ? { title: t("clothingGroup"), references: clothingReferences } : null,
    modelReferences.length ? { title: t("modelGroup"), references: modelReferences } : null,
    sceneReferences.length ? { title: t("referenceGroup"), references: sceneReferences } : null,
  ].filter(Boolean) as Array<{ title: string; references: ImagePreviewReference[] }>;

  return groups.length ? groups : [{ title: t("inputReference"), references }];
}

function actionIcon(kind: ImagePreviewActionKind) {
  if (kind === "download") return Download;
  if (kind === "copy") return Copy;
  if (kind === "repair") return WandSparkles;
  if (kind === "aiVideo") return Clapperboard;
  if (kind === "modelBackground") return UserRoundCheck;
  if (kind === "pose") return Sparkles;
  if (kind === "productSet") return ImageIcon;
  if (kind === "allCategoryProductImage") return Images;
  if (kind === "regenerateOne") return RotateCcw;
  if (kind === "regenerateAll") return RefreshCw;
  if (kind === "feedback") return MessageSquare;
  if (kind === "useAsSource") return Brush;
  if (kind === "useAsFace") return Eye;
  return ImageIcon;
}

function formatPreviewDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function clampIndex(index: number, length: number) {
  if (!length) return 0;
  return Math.min(Math.max(Math.round(Number(index) || 0), 0), length - 1);
}

function clampZoom(value: number) {
  return Math.min(Math.max(Math.round(value), 30), 220);
}

function getPreviewAspectConfig(value?: string | null): {
  aspectRatio: string;
  fitMode: "height" | "width";
  style: CSSProperties;
} {
  const fallback = { width: 1, height: 1, label: "1:1" };
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
  const parsedWidth = match ? Number(match[1]) : fallback.width;
  const parsedHeight = match ? Number(match[2]) : fallback.height;
  const width = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : fallback.width;
  const height = Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : fallback.height;
  const singleRatio = width / height;
  const aspectRatio = match ? `${trimRatioNumber(width)}:${trimRatioNumber(height)}` : fallback.label;

  return {
    aspectRatio,
    fitMode: singleRatio <= 1 ? "height" : "width",
    style: {
      "--studio-preview-comparison-aspect": `${trimRatioNumber(width * 2)} / ${trimRatioNumber(height)}`,
      "--studio-preview-panel-aspect": `${trimRatioNumber(width)} / ${trimRatioNumber(height)}`,
    } as CSSProperties,
  };
}

function trimRatioNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}
