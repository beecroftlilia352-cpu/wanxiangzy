"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Layers, CheckCircle2, ChevronRight, Loader2, Minus, PenLine, Plus, Sparkles, X, PersonStanding, Crop } from "lucide-react";
import { toast } from "sonner";
import { isLikelyImageFile, MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { FeatureTabs } from "@/components/FeatureTabs";
import { type PoseOutputMode } from "@/lib/pose-prompt";
import {
  buildPoseVisualAnalysisKey,
  fallbackPoseVisualAnalysis,
  getPoseVisualAnalysisDetailItems,
  getPoseVisualAnalysisSummary,
  normalizePoseVisualAnalysis,
  shouldSuppressPoseFacePlanning,
  type PoseVisualAnalysis,
} from "@/lib/pose-analysis";
import {
  DEFAULT_POSE_ANGLE_COUNTS,
  POSE_PLAN_ANGLE_LABELS,
  POSE_PLAN_MAX_COUNT,
  POSE_PLAN_MIN_COUNT,
  buildPosePlanCacheKey,
  buildDefaultPoseAngleCounts,
  getCommercialPoseActionPresets,
  getCommercialPoseExpressionPresets,
  getPoseAngleTotal,
  getPosePlanSummary,
  normalizePoseAngleCounts,
  normalizePosePlan,
  normalizePosePlanCount,
  type PoseAngleCounts,
  type PosePlanAngle,
  type PosePlan,
} from "@/lib/pose-plan";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PreviewGuide } from "@/components/PreviewGuide";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { StudioMediaLightbox } from "@/components/studio/StudioMediaLightbox";
import { StudioModelSelector, StudioOptionGrid } from "@/components/studio/StudioFormControls";
import { PromptTextarea } from "@/components/studio/PromptTextarea";
import { ResolutionSelector } from "@/components/studio/ResolutionSelector";
import { AspectRatioSelector } from "@/components/studio/AspectRatioSelector";
import { useStudioImageModelOptions } from "@/lib/studio-models";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { MultiImageUploadV2 } from "@/components/studio/MultiImageUploadV2";
import { StudioUploadSection } from "@/components/studio/StudioUploadSection";
import { StudioUploadTile } from "@/components/studio/StudioUploadTile";
import { VisualAnalysisStatusCard, type VisualAnalysisSummaryItem } from "@/components/studio/VisualAnalysisStatus";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { StudioRulesPopover } from "@/components/studio/StudioRulesPopover";
import { useStableFileDrag } from "@/components/studio/useStableFileDrag";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import { fetchHistoryApplyDetail, getHistoryApplyFailureMessage, isHistoryApplyRowFailed, takeApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";
import { showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import { applyGenerationResponseStatus } from "@/lib/ui/credit-copy";
import { createGenericImagePreviewSession, takeSourceImageFromLocation, type ImagePreviewAction } from "@/lib/studio-image-preview";
import { useStudioPreview } from "@/hooks/use-studio-preview";
import { useHistoryApply } from "@/hooks/use-history-apply";
import { FAILED_RETRY_NOTICE, buildPartialFailureDetail, coerceErrorMessage, summarizeGenerationError } from "@/lib/studio-generation-feedback";
import {
  DEFAULT_POSE_SERIES_STYLE,
  type PoseSeriesStyle,
} from "@/lib/module-style-presets";
import { POSE_UPLOAD_RULE, type PoseRuleDemo } from "@/lib/pose-upload-rules";
import { createAdaptivePollDelay, fetchWithAbortAndTimeout, getTotalPollBudgetMs, isAbortLikeError } from "@/lib/poll/status-poll";
import { useRulesPopover } from "@/hooks/use-rules-popover";
import { StudioClearButton } from "@/components/studio/StudioClearButton";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { ensureNotificationPermission, notifyGenerationComplete } from "@/lib/notifications";
import {
  GARMENT_ANGLE_TARGET_OPTIONS,
  GARMENT_ANGLE_UPLOAD_FOOTNOTE,
  GARMENT_ANGLE_VIEW_OPTIONS,
  MAX_GARMENT_ANGLE_IMAGES,
  flattenGarmentAngleReferences,
  formatGarmentAngleReferenceLabel,
  normalizeGarmentAngleReferences,
  type GarmentAngleReference,
  type GarmentAngleTarget,
  type GarmentAngleView,
} from "@/lib/garment-angle-references";
import { MAX_POSE_REFERENCE_IMAGES, normalizePoseReferenceCopies, normalizePoseReferenceUrls } from "@/lib/pose-reference";
import {
  buildRetryPendingResultUrls,
  getRetryDisplayExpectedCount,
  mergeRetryResultUrls,
  normalizeRetryResultIndex,
} from "@/lib/result-slot-retry";

const POSE_ANALYSIS_CLIENT_CACHE_MIN_CONFIDENCE = 0.5;

const POSE_PREVIEW_ACTION_KINDS = ["download", "copy", "repair", "aiVideo", "modelBackground", "productSet", "regenerateAll", "feedback"] as const;

const POSE_PREVIEW_ACTION_LABEL_KEYS: Record<(typeof POSE_PREVIEW_ACTION_KINDS)[number], string> = {
  download: "preview.download",
  copy: "preview.copy",
  repair: "preview.repair",
  aiVideo: "preview.aiVideo",
  modelBackground: "preview.modelBackground",
  productSet: "preview.productSet",
  regenerateAll: "preview.regenerateAll",
  feedback: "preview.feedback",
};

const ASPECTS: { value: AspectRatio; label: string; labelKey?: string; description?: string; descriptionKey?: string }[] = [
  { value: "auto", label: "智能", labelKey: "aspects.auto", description: "按主图匹配", descriptionKey: "aspects.autoDesc" },
  { value: "3:4", label: "3:4", description: "竖版", descriptionKey: "aspects.portrait" },
  { value: "4:5", label: "4:5", description: "商品图", descriptionKey: "aspects.product" },
  { value: "1:1", label: "1:1", description: "方图", descriptionKey: "aspects.square" },
  { value: "9:16", label: "9:16", description: "手机竖屏", descriptionKey: "aspects.phone" },
  { value: "16:9", label: "16:9", description: "横屏", descriptionKey: "aspects.landscape" },
];

const POSE_REFERENCE_DEMOS = [
  {
    title: "蓝裙商业姿势组",
    titleKey: "referenceDemos.blueDress",
    imageUrls: [
      "/pose-reference-demos/vwg-pose-0617-0835-01.jpg",
      "/pose-reference-demos/vwg-pose-0617-0836-02.jpg",
      "/pose-reference-demos/vwg-pose-0617-0836-03.jpg",
      "/pose-reference-demos/vwg-pose-0617-0836-04.jpg",
    ],
  },
];

type PoseHistoryPayload = Extract<HistoryJobPayload, { kind: "pose" }>;
type PoseCreationMode = "free" | "reference";
type PoseGenerateOptions = {
  genCountOverride?: number;
  expectedCountOverride?: number;
  poseStartIndex?: number;
  retryResultIndex?: number;
  toastMessage?: string;
};
type PoseAnalysisSource = "vision" | "cache" | "fallback" | "history";
type PoseAnalysisEntry = {
  analysis: PoseVisualAnalysis;
  source: PoseAnalysisSource;
  error: string | null;
};
type PosePlanMode = "preset" | "ai";
type PosePlanSource = "vision_plan" | "cache" | "fallback" | "preset" | "history" | "user_custom";
type PosePlanEntry = {
  plan: PosePlan;
  source: PosePlanSource;
  error: string | null;
};

const POSE_PLAN_SOURCE_LABELS: Record<PosePlanSource, string> = {
  vision_plan: "智能优化",
  cache: "缓存规划",
  fallback: "保守规划",
  preset: "预设计划",
  history: "历史规划",
  user_custom: "已编辑",
};

const POSE_PLAN_SOURCE_LABEL_KEYS: Record<PosePlanSource, string> = {
  vision_plan: "planSource.visionPlan",
  cache: "planSource.cache",
  fallback: "planSource.fallback",
  preset: "planSource.preset",
  history: "planSource.history",
  user_custom: "planSource.userCustom",
};

const DEFAULT_POSE_PROMPT = `图1是唯一的人物、服装、背景、光线和整体摄影质感参考。
目标：基于商业模特拍摄动作库，生成明确不同的姿势变化；同一角度多张也必须在手势、重心、视线、表情和构图上有可察觉差异。
保持：同一个人、同一张脸、同一身体比例、同一套服装、同一颜色图案、同一面料纹理、同一场景光线和真实商业摄影质感。
允许：根据每个姿势自然调整身体角度、手部动作、表情视线、镜头距离和构图留白。
禁止：换脸、换衣服、改变体型比例、额外人物、拼贴、文字水印、畸形手指、断肢、夸张回眸、过度摆拍。`;

const POSE_ANGLE_OPTIONS: Array<{
  value: PosePlanAngle;
  label: string;
  labelKey: string;
  desc: string;
  descKey: string;
  hint: string;
  hintKey: string;
}> = [
  {
    value: "front",
    label: "正面展示",
    labelKey: "angles.front.label",
    desc: "保留正脸、正面轮廓和完整穿搭。",
    descKey: "angles.front.desc",
    hint: "适合主图、首图和服装正面卖点。",
    hintKey: "angles.front.hint",
  },
  {
    value: "side",
    label: "侧身变化",
    labelKey: "angles.side.label",
    desc: "侧身、三分之二侧身和自然转身。",
    descKey: "angles.side.desc",
    hint: "让版型、肩线、腰线和身体线条更立体。",
    hintKey: "angles.side.hint",
  },
  {
    value: "back",
    label: "背面/侧后",
    labelKey: "angles.back.label",
    desc: "生成背面、侧后或回身角度。",
    descKey: "angles.back.desc",
    hint: "建议补一张同款背面图，背后结构会更准。",
    hintKey: "angles.back.hint",
  },
  {
    value: "detail",
    label: "近景细节",
    labelKey: "angles.detail.label",
    desc: "生成领口、袖口、腰线、面料等近景成片。",
    descKey: "angles.detail.desc",
    hint: "这是输出画面类型，不是上传服装细节图。",
    hintKey: "angles.detail.hint",
  },
  {
    value: "garment",
    label: "服饰/配饰细节",
    labelKey: "angles.garment.label",
    desc: "只拍服饰和配饰局部特写，画面不含头脸。",
    descKey: "angles.garment.desc",
    hint: "适合卖点特写：领型、腰带、包袋、鞋履等。",
    hintKey: "angles.garment.hint",
  },
  {
    value: "seated",
    label: "坐姿展示",
    labelKey: "angles.seated.label",
    desc: "正坐、叠腿或靠坐，展示坐姿下的版型和垂坠。",
    descKey: "angles.seated.desc",
    hint: "适合通勤、休闲场景和橱窗摆拍感。",
    hintKey: "angles.seated.hint",
  },
];

const POSE_ANGLE_PRESETS: Array<{
  id: string;
  label: string;
  labelKey: string;
  countLabel: string;
  countLabelKey: string;
  desc: string;
  descKey: string;
  counts: PoseAngleCounts;
}> = [
  {
    id: "recommended",
    label: "推荐组合",
    labelKey: "anglePresets.recommended.label",
    countLabel: "5 张",
    countLabelKey: "anglePresets.recommended.countLabel",
    desc: "正面 + 侧身 + 近景 + 服饰细节",
    descKey: "anglePresets.recommended.desc",
    counts: { front: 1, side: 2, back: 0, detail: 1, garment: 1, seated: 0 },
  },
  {
    id: "commerce",
    label: "电商四视角",
    labelKey: "anglePresets.commerce.label",
    countLabel: "4 张",
    countLabelKey: "anglePresets.commerce.countLabel",
    desc: "含背面",
    descKey: "anglePresets.commerce.desc",
    counts: { front: 1, side: 1, back: 1, detail: 1, garment: 0, seated: 0 },
  },
  {
    id: "sequence",
    label: "连拍扩展",
    labelKey: "anglePresets.sequence.label",
    countLabel: "8 张",
    countLabelKey: "anglePresets.sequence.countLabel",
    desc: "更多动作变化 + 坐姿",
    descKey: "anglePresets.sequence.desc",
    counts: { front: 2, side: 2, back: 1, detail: 1, garment: 1, seated: 1 },
  },
];

type PosePlanSlot = PosePlan["slots"][number];
type PosePlanSlotPatch = Partial<Pick<PosePlanSlot, "poseName" | "bodyAction" | "handAction" | "headDirection" | "cameraFraming" | "garmentVisibilityRule">>;

function isSamePoseAngleCounts(left: PoseAngleCounts, right: PoseAngleCounts) {
  return (Object.keys(POSE_PLAN_ANGLE_LABELS) as PosePlanAngle[])
    .every((angle) => left[angle] === right[angle]);
}

function normalizePoseSelectorText(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function getSelectedActionPresetId(slot: PosePlanSlot | null | undefined) {
  if (!slot) return "current";
  const source = normalizePoseSelectorText([slot.poseName, slot.bodyAction, slot.handAction].filter(Boolean).join(" "));
  const poseName = normalizePoseSelectorText(slot.poseName || "");
  const preset = getCommercialPoseActionPresets(slot.angle).find((item) => {
    const label = normalizePoseSelectorText(item.label);
    const body = normalizePoseSelectorText(item.bodyAction);
    const hand = normalizePoseSelectorText(item.handAction);
    const keywordMatched = item.matchKeywords?.some((keyword) => source.includes(normalizePoseSelectorText(keyword)));
    return item.label === slot.poseName
      || item.bodyAction === slot.bodyAction
      || source.includes(label)
      || Boolean(poseName && label.includes(poseName))
      || Boolean(body.length >= 14 && source.includes(body.slice(0, 14)))
      || Boolean(hand.length >= 10 && source.includes(hand.slice(0, 10)))
      || Boolean(keywordMatched);
  });
  return preset?.id || "current";
}

function getSelectedExpressionPresetId(slot: PosePlanSlot | null | undefined) {
  if (!slot) return "current";
  const source = normalizePoseSelectorText(slot.headDirection || "");
  const preset = getCommercialPoseExpressionPresets(slot.angle).find((item) => {
    const text = normalizePoseSelectorText(item.text);
    const label = normalizePoseSelectorText(item.label);
    const keywordMatched = item.matchKeywords?.some((keyword) => source.includes(normalizePoseSelectorText(keyword)));
    return item.text === slot.headDirection
      || source.includes(label)
      || source.includes(text.slice(0, 10))
      || Boolean(keywordMatched);
  });
  return preset?.id || "current";
}

function getPoseAngleBadgeClass(angle?: PosePlanAngle) {
  const base = "rounded-full px-1.5 py-0.5 text-[11px] font-black ring-1";
  if (angle === "front") return `${base} bg-blue-50 text-blue-700 ring-blue-100`;
  if (angle === "side") return `${base} bg-[rgba(99,102,241,0.08)] text-[rgba(99,102,241,0.95)] ring-[rgba(99,102,241,0.2)]`;
  if (angle === "back") return `${base} bg-amber-50 text-amber-700 ring-amber-100`;
  if (angle === "detail") return `${base} bg-teal-50 text-teal-700 ring-teal-100`;
  if (angle === "garment") return `${base} bg-rose-50 text-rose-700 ring-rose-100`;
  if (angle === "seated") return `${base} bg-[var(--codex-accent-10)] text-[var(--codex-accent)] ring-[var(--codex-accent-25)]`;
  return `${base} bg-[var(--codex-surface-soft)] dark:bg-white/5 text-codex-muted dark:text-codex-faint ring-[var(--codex-border)]`;
}

function resolvePoseOutputModeFromPayload(payload: PoseHistoryPayload): PoseOutputMode {
  return payload.outputMode === "grid" ? "grid" : "separate";
}

function resolvePoseAngleCountsFromPayload(payload: PoseHistoryPayload): PoseAngleCounts {
  if (payload.angleCounts) return normalizePoseAngleCounts(payload.angleCounts);
  if (payload.posePlan?.angleCounts) return normalizePoseAngleCounts(payload.posePlan.angleCounts);
  const slotCounts = payload.posePlan?.slots?.reduce((counts, slot) => {
    if (slot.angle) counts[slot.angle] += 1;
    return counts;
  }, { front: 0, side: 0, back: 0, detail: 0, garment: 0, seated: 0 } as PoseAngleCounts);
  if (slotCounts && getPoseAngleTotal(slotCounts) > 0) return normalizePoseAngleCounts(slotCounts);
  const payloadCount = payload.poseCount || payload.posePlan?.slots?.length || payload.genCount || 4;
  return buildDefaultPoseAngleCounts(normalizePosePlanCount(payloadCount));
}

function resolvePoseAspectRatioFromPayload(payload: PoseHistoryPayload): AspectRatio {
  return payload.aspectRatio || "auto";
}

function resolvePosePlanModeFromPayload(payload: PoseHistoryPayload): PosePlanMode {
  const rawPayload = payload as PoseHistoryPayload & { pose_plan_mode?: unknown };
  return rawPayload.posePlanMode === "ai" || rawPayload.pose_plan_mode === "ai" ? "ai" : "preset";
}

function stripLegacyRuleDemoText(value: string) {
  return value
    .replace(/\n?人物和姿势气质参考：[^\n]*(?:\n|$)/g, "\n")
    .replace(/\n?姿势裂变拍摄风格档位：[^\n]*(?:\n|$)/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

class PoseGenerationPollTimeoutError extends Error {
  constructor() {
    super("生成仍在后台处理中，可稍后在任务队列或作品库查看。");
    this.name = "PoseGenerationPollTimeoutError";
  }
}

function isCacheablePoseAnalysisEntry(entry: PoseAnalysisEntry) {
  return entry.source !== "fallback"
    && entry.analysis.confidence >= POSE_ANALYSIS_CLIENT_CACHE_MIN_CONFIDENCE
    && hasMeaningfulPoseAnalysis(entry.analysis);
}

function hasMeaningfulPoseAnalysis(analysis: PoseVisualAnalysis) {
  if (analysis.genderExpression !== "unknown") return true;
  if (analysis.ageRange !== "unknown") return true;
  if (analysis.bodyCrop !== "partial_unknown") return true;
  if (typeof analysis.headVisible === "boolean" || typeof analysis.faceVisible === "boolean") return true;
  return Boolean(
    analysis.poseBaseline
    || analysis.cameraFraming
    || analysis.outfitDescription
    || analysis.background
    || analysis.lighting
    || analysis.promptNotes
  );
}

export default function PosePage() {
  const t = useTranslations("Pose");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const poseReferenceInputRef = useRef<HTMLInputElement>(null);
  const garmentDetailInputRef = useRef<HTMLInputElement>(null);
  const generationRunRef = useRef(0);
  const poseAnalysisCacheRef = useRef(new Map<string, PoseAnalysisEntry>());
  const poseAnalysisInflightRef = useRef(new Map<string, Promise<PoseAnalysisEntry>>());
  const lastPoseAnalysisKeyRef = useRef("");
  const poseAnalysisSeqRef = useRef(0);
  const posePlanCacheRef = useRef(new Map<string, PosePlanEntry>());
  const posePlanInflightRef = useRef(new Map<string, Promise<PosePlanEntry>>());
  const lastPosePlanKeyRef = useRef("");
  const posePlanSeqRef = useRef(0);
  const posePlanBypassCacheRef = useRef(false);
  const pollAbortRef = useRef<AbortController | null>(null);
  const applyPoseHistoryPayloadRef = useRef<((payload: PoseHistoryPayload, historyResultUrls?: string[], options?: { silent?: boolean }) => void) | null>(null);

  const {
    authChecked,
    isAuthenticated,
    userId,
    credits,
    setCredits,
    refreshCredits,
    refreshAuth,
  } = useStudioAuth();
  const [aiModel, setAiModel] = useState<LingyaModel>("nano-banana-2");
  const modelOptions = useStudioImageModelOptions();
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [mainImage, setMainImage] = useState<string>("");
  const [mainImageFileName, setMainImageFileName] = useState<string | null>(null);
  const [mainImageUploadProgress, setMainImageUploadProgress] = useState<number | null>(null);
  const [prompt, setPrompt] = useState(DEFAULT_POSE_PROMPT);
  const [supplementPrompt, setSupplementPrompt] = useState("");
  const [outputMode, setOutputMode] = useState<PoseOutputMode>("separate");
  const [poseStyle, setPoseStyle] = useState<PoseSeriesStyle>(DEFAULT_POSE_SERIES_STYLE);
  const [poseAngleCounts, setPoseAngleCounts] = useState<PoseAngleCounts>({ ...DEFAULT_POSE_ANGLE_COUNTS });
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingPoseReferences, setIsDraggingPoseReferences] = useState(false);
  const [poseCreationMode, setPoseCreationMode] = useState<PoseCreationMode>("free");
  const [poseReferenceUrls, setPoseReferenceUrls] = useState<string[]>([]);
  const [poseReferenceCopies, setPoseReferenceCopies] = useState(1);
  const [isUploadingPoseReferences, setIsUploadingPoseReferences] = useState(false);
  const [isDraggingGarmentDetails, setIsDraggingGarmentDetails] = useState(false);
  const [garmentAngleEnabled, setGarmentAngleEnabled] = useState(false);
  const [garmentAngleReferences, setGarmentAngleReferences] = useState<GarmentAngleReference[]>([]);
  const [garmentAngleTarget, setGarmentAngleTarget] = useState<GarmentAngleTarget>("outfit");
  const [garmentAngleView, setGarmentAngleView] = useState<GarmentAngleView>("front");
  const [isUploadingGarmentDetails, setIsUploadingGarmentDetails] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzingPose, setIsAnalyzingPose] = useState(false);
  const [poseAnalysis, setPoseAnalysis] = useState<PoseVisualAnalysis | null>(null);
  const [poseAnalysisEntryKey, setPoseAnalysisEntryKey] = useState("");
  const [poseAnalysisSource, setPoseAnalysisSource] = useState<PoseAnalysisSource | null>(null);
  const [poseAnalysisError, setPoseAnalysisError] = useState<string | null>(null);
  const [poseAnalysisRetryCount, setPoseAnalysisRetryCount] = useState(0);
  const [posePlanMode, setPosePlanMode] = useState<PosePlanMode>("preset");
  const [isPlanningPose, setIsPlanningPose] = useState(false);
  const [posePlan, setPosePlan] = useState<PosePlan | null>(null);
  const [posePlanSource, setPosePlanSource] = useState<PosePlanSource | null>(null);
  const [posePlanError, setPosePlanError] = useState<string | null>(null);
  const [posePlanRetryCount, setPosePlanRetryCount] = useState(0);
  const [showPosePlanEditor, setShowPosePlanEditor] = useState(false);
  const [selectedPosePlanSlotIndex, setSelectedPosePlanSlotIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [runningExpectedCount, setRunningExpectedCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const {
    buttonRef: rulesButtonRef,
    show: showPoseRules,
    style: rulesPopoverStyle,
    open: openRulesPopover,
    scheduleHide: scheduleRulesHide,
    close: closeRulesPopover,
    cancelHide: cancelRulesHide,
  } = useRulesPopover({ width: 720 });
  const mainImageDrag = useStableFileDrag<HTMLDivElement>({
    isDragging,
    setDragging: setIsDragging,
    fileFilter: (file) => file.type.startsWith("image/"),
    onFiles: (files) => handleFile(files[0]),
  });

  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const unitCost = getCreditCost(aiModel, imageSize, aspectRatio);
  const activeGarmentAngleReferences = useMemo(
    () => garmentAngleEnabled ? normalizeGarmentAngleReferences(garmentAngleReferences) : [],
    [garmentAngleEnabled, garmentAngleReferences]
  );
  const activeGarmentAngleUrls = useMemo(
    () => flattenGarmentAngleReferences(activeGarmentAngleReferences),
    [activeGarmentAngleReferences]
  );
  const activePoseReferenceUrls = useMemo(
    () => poseCreationMode === "reference" ? poseReferenceUrls.slice(0, MAX_POSE_REFERENCE_IMAGES) : [],
    [poseCreationMode, poseReferenceUrls]
  );
  const isPoseReferenceMode = poseCreationMode === "reference";

  // 未保存输入离开拦截：有主图/参考图/提示词时提醒
  const { unsavedDialog: unsavedChangesDialog } = useUnsavedChangesGuard(Boolean(mainImage || (prompt.trim() && prompt !== DEFAULT_POSE_PROMPT) || supplementPrompt.trim() || activePoseReferenceUrls.length));
  const activePoseReferenceCopies = normalizePoseReferenceCopies(poseReferenceCopies, Math.max(activePoseReferenceUrls.length, 1));
  const poseReferenceOutputCount = isPoseReferenceMode
    ? Math.max(activePoseReferenceUrls.length * activePoseReferenceCopies, 1)
    : 0;
  const posePlanTargetCount = getPoseAngleTotal(poseAngleCounts);
  const poseRunTargetCount = isPoseReferenceMode ? poseReferenceOutputCount : posePlanTargetCount;
  const effectiveOutputMode: PoseOutputMode = isPoseReferenceMode ? "separate" : outputMode;
  const poseExpectedCount = isPoseReferenceMode
    ? poseReferenceOutputCount
    : outputMode === "separate" ? posePlanTargetCount : 1;
  const poseDeliveryLabel = isPoseReferenceMode
    ? activePoseReferenceUrls.length
      ? t("delivery.refMult", { ref: activePoseReferenceUrls.length, per: activePoseReferenceCopies, total: poseReferenceOutputCount })
      : t("delivery.refIndependently")
    : outputMode === "separate"
      ? t("delivery.independentCount", { count: posePlanTargetCount })
      : t("delivery.gridCount", { count: posePlanTargetCount });
  const cost = unitCost * poseExpectedCount;
  const activeGarmentAngleTargetOption = GARMENT_ANGLE_TARGET_OPTIONS.find((item) => item.value === garmentAngleTarget) || GARMENT_ANGLE_TARGET_OPTIONS[0];
  const activeGarmentAngleViewOption = GARMENT_ANGLE_VIEW_OPTIONS.find((item) => item.value === garmentAngleView) || GARMENT_ANGLE_VIEW_OPTIONS[0];
  const activeGarmentAngleMark = `${activeGarmentAngleTargetOption.label} · ${activeGarmentAngleViewOption.label}`;
  const requestedBackPoseCount = poseAngleCounts.back || 0;
  const hasBackGarmentReference = activeGarmentAngleReferences.some((ref) => ref.view === "back");
  const shouldSuggestBackReference = !isPoseReferenceMode && requestedBackPoseCount > 0 && !hasBackGarmentReference;
  const taskQueue = useTaskQueueGeneration({
    module: "pose",
    title: t("moduleName"),
    defaultExpectedCount: poseExpectedCount,
    applyPath: "/pose",
  });
  const authIsAnonymous = authChecked && !isAuthenticated;
  const activePoseAnalysisForGate = mainImage ? getActivePoseAnalysis() : null;
  const activePoseAnalysisErrorForGate = mainImage ? getActivePoseAnalysisError() : null;
  const isPoseAnalysisPending = Boolean(
    mainImage && (isAnalyzingPose || (!activePoseAnalysisForGate && !activePoseAnalysisErrorForGate))
  );
  const runDisabledReason = !mainImage
    ? t("disabled.uploadMain")
    : isUploading
      ? t("disabled.mainUploading")
      : isUploadingPoseReferences
        ? t("disabled.refUploading")
        : poseCreationMode === "reference" && activePoseReferenceUrls.length === 0
          ? t("disabled.uploadRef")
          : isUploadingGarmentDetails
        ? t("disabled.garmentUploading")
        : isPoseAnalysisPending
          ? t("disabled.analyzing")
          : !isPoseReferenceMode && posePlanMode === "ai" && isPlanningPose
            ? t("disabled.planning")
            : credits !== null && credits < cost
              ? t("disabled.insufficientCredits", { cost })
              : undefined;
  const previewPosePlan = getActivePosePlan();
  const previewPosePlanText = isPoseReferenceMode
    ? [
        activePoseReferenceUrls.length
          ? t("preview.refModeMult", { ref: activePoseReferenceUrls.length, per: activePoseReferenceCopies, total: poseReferenceOutputCount })
          : t("preview.refModeUpload"),
        supplementPrompt.trim() ? t("preview.supplement", { text: supplementPrompt.trim() }) : "",
      ].map((item) => item.trim()).filter(Boolean).join("\n")
    : [
        ...getPosePlanSummary(previewPosePlan).map((item) => `${item.title}：${item.detail}`),
        supplementPrompt.trim() ? t("preview.supplement", { text: supplementPrompt.trim() }) : "",
      ].map((item) => item.trim()).filter(Boolean).join("\n");
  const activeResultExpectedCount = isGenerating
    ? runningExpectedCount || poseExpectedCount
    : runningExpectedCount || Math.max(resultUrls.length, 1);
  const displayedResultUrls = resultUrls.filter(Boolean);
  const hasCompletedPartialResults = Boolean(
    !isGenerating
    && activeResultExpectedCount > displayedResultUrls.length
    && displayedResultUrls.length > 0
  );
  const partialFailureMessage = buildPartialFailureDetail({
    failedCount: activeResultExpectedCount - displayedResultUrls.length,
  });
  const retryDisabled = isSubmitting || isGenerating;
  function handleRetryFailedResult(index: number) {
    if (retryDisabled) return;
    void generate(undefined, {
      genCountOverride: 1,
      expectedCountOverride: 1,
      poseStartIndex: index + 1,
      retryResultIndex: index,
      toastMessage: t("toast.retryPose", { index: index + 1 }),
    });
  }
  const previewSession = useStudioPreview({
    module: "pose",
    title: t("moduleName"),
    urls: resultUrls,
    expectedCount: activeResultExpectedCount,
    isGenerating,
    references: [
      ...(mainImage ? [{ url: mainImage, label: t("meta.main"), role: "source" as const }] : []),
      ...activePoseReferenceUrls.map((url, index) => ({ url, label: t("meta.poseRef", { index: index + 1 }), role: "reference" as const })),
      ...activeGarmentAngleReferences.map((ref, index) => ({ url: ref.url, label: formatGarmentAngleReferenceLabel(ref, index), role: "reference" as const })),
    ],
    promptText: previewPosePlanText,
    metaItems: [
      { label: t("meta.delivery"), value: poseDeliveryLabel },
      { label: t("meta.poseCount"), value: poseRunTargetCount },
      { label: t("meta.aspect"), value: aspectRatio === "auto" ? t("aspects.auto") : aspectRatio },
      { label: t("meta.plan"), value: isPoseReferenceMode ? t("meta.refDirect") : posePlanMode === "ai" ? t(POSE_PLAN_SOURCE_LABEL_KEYS[posePlanSource || "vision_plan"]) : t("meta.autoPlan") },
      { label: t("meta.model"), value: aiModel },
      { label: t("meta.resolution"), value: imageSize },
      { label: t("meta.resultCount"), value: poseExpectedCount },
    ],
    resultTitlePrefix: effectiveOutputMode === "separate" ? t("meta.poseResult") : t("meta.poseGrid"),
    aspectRatio: aspectRatio === "auto" ? undefined : aspectRatio,
  });

  useEffect(() => {
    setPoseReferenceCopies((count) => normalizePoseReferenceCopies(count, Math.max(activePoseReferenceUrls.length, 1)));
  }, [activePoseReferenceUrls.length]);

  function setPoseAnalysisEntry(entry: PoseAnalysisEntry | null, analysisKey = "") {
    setPoseAnalysisEntryKey(entry ? analysisKey : "");
    setPoseAnalysis(entry?.analysis || null);
    setPoseAnalysisSource(entry?.source || null);
    setPoseAnalysisError(entry?.error || null);
    setIsAnalyzingPose(false);
  }

  function setPosePlanEntry(entry: PosePlanEntry | null) {
    setPosePlan(entry?.plan || null);
    setPosePlanSource(entry?.source || null);
    setPosePlanError(entry?.error || null);
    setIsPlanningPose(false);
  }

  function applyPoseAnalysisSnapshot(mainImageUrl: string, rawAnalysis: unknown, source: PoseAnalysisSource = "history") {
    const analysis = normalizePoseVisualAnalysis(rawAnalysis);
    const analysisKey = mainImageUrl ? buildPoseVisualAnalysisKey(mainImageUrl) : "";
    poseAnalysisSeqRef.current += 1;
    if (analysis && analysisKey) {
      const entry: PoseAnalysisEntry = { analysis, source, error: null };
      poseAnalysisCacheRef.current.set(analysisKey, entry);
      lastPoseAnalysisKeyRef.current = analysisKey;
      setPoseAnalysisEntry(entry, analysisKey);
      return;
    }
    lastPoseAnalysisKeyRef.current = "";
    setPoseAnalysisEntry(null);
  }

  function applyPosePlanSnapshot(payload: PoseHistoryPayload, source: PosePlanSource = "history") {
    const analysis = normalizePoseVisualAnalysis(payload.poseAnalysis);
    const planMode = resolvePosePlanModeFromPayload(payload);
    const historyAngleCounts = resolvePoseAngleCountsFromPayload(payload);
    const historyPoseCount = getPoseAngleTotal(historyAngleCounts);
    const planKey = buildPosePlanKey(payload.mainImageUrl, analysis, DEFAULT_POSE_SERIES_STYLE, resolvePoseOutputModeFromPayload(payload), payload.prompt, planMode, historyPoseCount, historyAngleCounts);
    posePlanSeqRef.current += 1;
    if (payload.posePlan && planKey) {
      const entry: PosePlanEntry = {
        plan: normalizePosePlan(payload.posePlan, {
          poseAnalysis: analysis,
          poseStyle: DEFAULT_POSE_SERIES_STYLE,
          outputMode: resolvePoseOutputModeFromPayload(payload),
          prompt: payload.prompt,
          poseCount: historyPoseCount,
          angleCounts: historyAngleCounts,
        }),
        source,
        error: null,
      };
      posePlanCacheRef.current.set(planKey, entry);
      lastPosePlanKeyRef.current = planKey;
      setPosePlanEntry(entry);
      return;
    }
    lastPosePlanKeyRef.current = "";
    setPosePlanEntry(null);
  }

  function getActivePoseAnalysis() {
    if (!mainImage || !poseAnalysis) return null;
    return poseAnalysisEntryKey === buildPoseVisualAnalysisKey(mainImage) ? poseAnalysis : null;
  }

  function getActivePoseAnalysisError() {
    if (!mainImage || !poseAnalysisError) return null;
    return poseAnalysisEntryKey === buildPoseVisualAnalysisKey(mainImage) ? poseAnalysisError : null;
  }

  function buildPlanPromptSource() {
    return stripLegacyRuleDemoText([
      prompt,
      supplementPrompt.trim() ? `补充要求：${supplementPrompt.trim()}` : "",
    ].filter(Boolean).join("\n\n"));
  }

  function buildPosePlanKey(
    imageUrl = mainImage,
    analysis = getActivePoseAnalysis(),
    style = poseStyle,
    mode = outputMode,
    planPrompt = buildPlanPromptSource(),
    planMode = posePlanMode,
    targetCount = posePlanTargetCount,
    angleCounts = poseAngleCounts
  ) {
    if (!imageUrl) return "";
    const baseKey = buildPosePlanCacheKey({
      mainImageUrl: imageUrl,
      poseAnalysis: analysis,
      poseStyle: style,
      outputMode: mode,
      poseCount: targetCount,
      angleCounts,
      prompt: planPrompt,
    });
    return `${baseKey}|mode:${planMode}`;
  }

  function getActivePosePlan() {
    if (poseCreationMode === "reference") return null;
    if (!mainImage || !posePlan) return null;
    return lastPosePlanKeyRef.current === buildPosePlanKey() ? posePlan : null;
  }

  function retryPoseAnalysis() {
    if (!mainImage || isAnalyzingPose) return;
    const analysisKey = buildPoseVisualAnalysisKey(mainImage);
    poseAnalysisCacheRef.current.delete(analysisKey);
    lastPoseAnalysisKeyRef.current = "";
    poseAnalysisSeqRef.current += 1;
    setPoseAnalysisEntry(null);
    setPoseAnalysisRetryCount((count) => count + 1);
  }

  function retryPosePlan() {
    if (!mainImage || isPlanningPose) return;
    setPosePlanMode("ai");
    const planKey = buildPosePlanKey();
    if (planKey) posePlanCacheRef.current.delete(planKey);
    lastPosePlanKeyRef.current = "";
    posePlanSeqRef.current += 1;
    posePlanBypassCacheRef.current = true;
    setPosePlanEntry(null);
    setPosePlanRetryCount((count) => count + 1);
  }

  function usePresetPosePlan() {
    if (posePlanMode === "preset") return;
    posePlanBypassCacheRef.current = false;
    lastPosePlanKeyRef.current = "";
    posePlanSeqRef.current += 1;
    setPosePlanMode("preset");
    setPosePlanEntry(null);
    setSelectedPosePlanSlotIndex(0);
  }

  function patchPosePlanSlot(index: number, patch: PosePlanSlotPatch) {
    setPosePlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        edited: true,
        slots: prev.slots.map((slot, slotIndex) => (
          slotIndex === index ? { ...slot, ...patch } : slot
        )),
      };
    });
    setPosePlanSource("user_custom");
  }

  function updatePosePlanSlot(index: number, key: keyof Pick<PosePlan["slots"][number], "bodyAction" | "handAction" | "headDirection" | "cameraFraming" | "garmentVisibilityRule">, value: string) {
    patchPosePlanSlot(index, { [key]: value } as PosePlanSlotPatch);
  }

  function applyPoseActionPreset(index: number, presetId: string) {
    const slot = getActivePosePlan()?.slots[index];
    if (!slot || presetId === "current") return;
    const preset = getCommercialPoseActionPresets(slot.angle).find((item) => item.id === presetId);
    if (!preset) return;
    patchPosePlanSlot(index, {
      poseName: preset.label,
      bodyAction: preset.bodyAction,
      handAction: preset.handAction,
    });
  }

  function applyPoseExpressionPreset(index: number, presetId: string) {
    const slot = getActivePosePlan()?.slots[index];
    if (!slot || presetId === "current") return;
    const preset = getCommercialPoseExpressionPresets(slot.angle).find((item) => item.id === presetId);
    if (!preset) return;
    patchPosePlanSlot(index, { headDirection: preset.text });
  }

  function updatePoseAngleCount(angle: PosePlanAngle, delta: number) {
    setPoseAngleCounts((prev) => {
      const current = normalizePoseAngleCounts(prev);
      const total = getPoseAngleTotal(current);
      if (delta > 0 && total >= POSE_PLAN_MAX_COUNT) return current;
      if (delta < 0 && total <= POSE_PLAN_MIN_COUNT) return current;
      const nextValue = Math.max(0, current[angle] + delta);
      if (nextValue === current[angle]) return current;
      const next = normalizePoseAngleCounts({ ...current, [angle]: nextValue }, current);
      const nextTotal = getPoseAngleTotal(next);
      if (nextTotal < POSE_PLAN_MIN_COUNT || nextTotal > POSE_PLAN_MAX_COUNT) return current;
      return next;
    });
  }

  function applyPoseAnglePreset(counts: PoseAngleCounts) {
    setPoseAngleCounts(normalizePoseAngleCounts(counts));
    setSelectedPosePlanSlotIndex(0);
  }

  useEffect(() => {
    setSelectedPosePlanSlotIndex((index) => Math.max(0, Math.min(index, posePlanTargetCount - 1)));
  }, [posePlanTargetCount]);

  useEffect(() => {
    const sourceImage = takeSourceImageFromLocation();
    if (sourceImage) {
      setMainImage(sourceImage);
      toast.success(t("toast.previewImageLoaded"));
    }
  }, []);

  // 组件卸载时中止在途的生成状态轮询
  useEffect(() => {
    return () => pollAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  useEffect(() => {
    setPrompt((prev) => stripLegacyRuleDemoText(prev));
  }, []);

  useEffect(() => {
    if (poseCreationMode !== "reference") return;
    lastPosePlanKeyRef.current = "";
    posePlanSeqRef.current += 1;
    setPosePlanEntry(null);
    setShowPosePlanEditor(false);
    setOutputMode("separate");
  }, [poseCreationMode]);

  useEffect(() => {
    const imageUrl = mainImage.trim();
    if (!imageUrl) {
      lastPoseAnalysisKeyRef.current = "";
      poseAnalysisSeqRef.current += 1;
      setPoseAnalysisEntry(null);
      return;
    }

    const analysisKey = buildPoseVisualAnalysisKey(imageUrl);
    if (lastPoseAnalysisKeyRef.current === analysisKey) return;
    lastPoseAnalysisKeyRef.current = analysisKey;
    const seq = poseAnalysisSeqRef.current + 1;
    poseAnalysisSeqRef.current = seq;

    const cachedAnalysis = poseAnalysisCacheRef.current.get(analysisKey);
    if (cachedAnalysis) {
      if (isCacheablePoseAnalysisEntry(cachedAnalysis)) {
        setPoseAnalysisEntry(cachedAnalysis, analysisKey);
        return;
      }
      poseAnalysisCacheRef.current.delete(analysisKey);
    }

    const run = async () => {
      setIsAnalyzingPose(true);
      setPoseAnalysisError(null);
      try {
        let request = poseAnalysisInflightRef.current.get(analysisKey);
        if (!request) {
          const nextRequest = fetch("/api/pose/analyze-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ main_image_url: imageUrl }),
          }).then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || t("errors.analysisFailed"));
            const nextAnalysis = normalizePoseVisualAnalysis(data.analysis);
            if (!nextAnalysis) throw new Error(t("errors.analysisInvalid"));
            const nextSource: PoseAnalysisSource = data.source === "fallback"
              ? "fallback"
              : data.cached ? "cache" : "vision";
            const nextError = nextSource === "fallback"
              ? t("errors.analysisFallback")
              : nextAnalysis.confidence < 0.45
                ? t("errors.analysisLowConfidence")
                : null;
            return {
              analysis: nextAnalysis,
              source: nextSource,
              error: nextError,
            };
          });
          poseAnalysisInflightRef.current.set(analysisKey, nextRequest);
          void nextRequest.finally(() => {
            if (poseAnalysisInflightRef.current.get(analysisKey) === nextRequest) {
              poseAnalysisInflightRef.current.delete(analysisKey);
            }
          }).catch(() => undefined);
          request = nextRequest;
        }

        const nextEntry = await request;
        if (isCacheablePoseAnalysisEntry(nextEntry)) {
          poseAnalysisCacheRef.current.set(analysisKey, nextEntry);
        } else {
          poseAnalysisCacheRef.current.delete(analysisKey);
        }
        if (poseAnalysisSeqRef.current !== seq) return;
        setPoseAnalysisEntry(nextEntry, analysisKey);
      } catch (err: unknown) {
        if (poseAnalysisSeqRef.current !== seq) return;
        setPoseAnalysisEntry({
          analysis: fallbackPoseVisualAnalysis(),
          source: "fallback",
          error: err instanceof Error ? err.message : t("errors.analysisFallback"),
        }, analysisKey);
      } finally {
        if (poseAnalysisSeqRef.current === seq) setIsAnalyzingPose(false);
      }
    };

    void run();
  }, [mainImage, poseAnalysisRetryCount]);

  useEffect(() => {
    const imageUrl = mainImage.trim();
    if (!imageUrl) {
      lastPosePlanKeyRef.current = "";
      posePlanSeqRef.current += 1;
      setPosePlanEntry(null);
      return;
    }

    const imageAnalysisKey = buildPoseVisualAnalysisKey(imageUrl);
    const activeAnalysis = poseAnalysisEntryKey === imageAnalysisKey ? poseAnalysis : null;
    const activeAnalysisError = poseAnalysisEntryKey === imageAnalysisKey ? poseAnalysisError : null;
    const planPrompt = stripLegacyRuleDemoText([
      prompt,
      supplementPrompt.trim() ? `补充要求：${supplementPrompt.trim()}` : "",
    ].filter(Boolean).join("\n\n"));
    const basePlanKey = buildPosePlanCacheKey({
      mainImageUrl: imageUrl,
      poseAnalysis: activeAnalysis,
      poseStyle,
      outputMode,
      poseCount: posePlanTargetCount,
      angleCounts: poseAngleCounts,
      prompt: planPrompt,
    });
    const planKey = `${basePlanKey}|mode:${posePlanMode}`;
    if (lastPosePlanKeyRef.current === planKey) return;
    lastPosePlanKeyRef.current = planKey;
    const seq = posePlanSeqRef.current + 1;
    posePlanSeqRef.current = seq;

    const cachedPlan = posePlanCacheRef.current.get(planKey);
    if (cachedPlan) {
      setPosePlanEntry(cachedPlan);
      return;
    }

    if (posePlanMode === "preset") {
      const plan = normalizePosePlan(null, {
        poseAnalysis: activeAnalysis,
        poseStyle,
        outputMode,
        prompt: planPrompt,
        poseCount: posePlanTargetCount,
        angleCounts: poseAngleCounts,
      });
      const entry: PosePlanEntry = { plan, source: "preset", error: null };
      posePlanCacheRef.current.set(planKey, entry);
      setPosePlanEntry(entry);
      return;
    }

    if (!activeAnalysis && !activeAnalysisError) return;

    const run = async () => {
      setIsPlanningPose(true);
      setPosePlanError(null);
      const forcePlanRequest = posePlanBypassCacheRef.current;
      try {
        let request = posePlanInflightRef.current.get(planKey);
        if (!request || forcePlanRequest) {
          const nextRequest = fetch("/api/pose/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              main_image_url: imageUrl,
              pose_analysis: activeAnalysis,
              pose_style: poseStyle,
              output_mode: outputMode,
              pose_count: posePlanTargetCount,
              angle_counts: poseAngleCounts,
              prompt: planPrompt,
              force: forcePlanRequest,
            }),
          }).then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || t("errors.planFailed"));
            const nextPlan = normalizePosePlan(data.posePlan, {
              poseAnalysis: activeAnalysis,
              poseStyle,
              outputMode,
              prompt: planPrompt,
              poseCount: posePlanTargetCount,
              angleCounts: poseAngleCounts,
            });
            const nextSource: PosePlanSource = data.source === "fallback"
              ? "fallback"
              : data.cached ? "cache" : "vision_plan";
            return {
              plan: nextPlan,
              source: nextSource,
              error: nextSource === "fallback" ? (data.reasonText || t("errors.planFallback")) : null,
            };
          });
          posePlanInflightRef.current.set(planKey, nextRequest);
          void nextRequest.finally(() => {
            if (posePlanInflightRef.current.get(planKey) === nextRequest) {
              posePlanInflightRef.current.delete(planKey);
            }
          }).catch(() => undefined);
          request = nextRequest;
        }

        const nextEntry = await request;
        posePlanCacheRef.current.set(planKey, nextEntry);
        if (posePlanSeqRef.current !== seq) return;
        setPosePlanEntry(nextEntry);
      } catch (err: unknown) {
        if (posePlanSeqRef.current !== seq) return;
        const fallback = normalizePosePlan(null, {
          poseAnalysis: activeAnalysis,
          poseStyle,
          outputMode,
          prompt: planPrompt,
          poseCount: posePlanTargetCount,
          angleCounts: poseAngleCounts,
        });
        setPosePlanEntry({
          plan: fallback,
          source: "fallback",
          error: err instanceof Error ? err.message : t("errors.planFallback"),
        });
      } finally {
        if (posePlanSeqRef.current === seq) {
          posePlanBypassCacheRef.current = false;
          setIsPlanningPose(false);
        }
      }
    };

    void run();
  }, [
    mainImage,
    poseAnalysis,
    poseAnalysisError,
    poseAnalysisEntryKey,
    poseAnalysisSource,
    poseStyle,
    poseCreationMode,
    posePlanMode,
    outputMode,
    prompt,
    supplementPrompt,
    poseAngleCounts,
    posePlanTargetCount,
    posePlanRetryCount,
  ]);

  function applyPoseHistoryPayload(payload: PoseHistoryPayload, historyResultUrls: string[] = [], options?: { silent?: boolean }) {
    generationRunRef.current += 1;
    const nextPosePlanMode = resolvePosePlanModeFromPayload(payload);
    setPosePlanMode(nextPosePlanMode);
    setMainImage(payload.mainImageUrl);
    const historyGarmentAngleReferences = normalizeGarmentAngleReferences(
      payload.garmentAngleReferences?.length ? payload.garmentAngleReferences : payload.garmentDetailUrls
    );
    const historyPoseReferenceUrls = normalizePoseReferenceUrls(payload.poseReferenceUrls);
    const historyPoseReferenceCopies = normalizePoseReferenceCopies(payload.poseReferenceCopies, Math.max(historyPoseReferenceUrls.length, 1));
    setGarmentAngleReferences(historyGarmentAngleReferences);
    setGarmentAngleEnabled(historyGarmentAngleReferences.length > 0);
    setPoseReferenceUrls(historyPoseReferenceUrls);
    setPoseReferenceCopies(historyPoseReferenceCopies);
    const historyCreationMode = historyPoseReferenceUrls.length ? "reference" : "free";
    setPoseCreationMode(historyCreationMode);
    applyPoseAnalysisSnapshot(payload.mainImageUrl, payload.poseAnalysis);
    if (historyCreationMode === "reference") {
      setPosePlanEntry(null);
      lastPosePlanKeyRef.current = "";
    } else {
      applyPosePlanSnapshot(payload);
    }
    setAiModel(payload.aiModel);
    setAspectRatio(resolvePoseAspectRatioFromPayload(payload));
    setImageSize(payload.imageSize);
    setPrompt(stripLegacyRuleDemoText(payload.prompt || DEFAULT_POSE_PROMPT));
    setSupplementPrompt("");
    setPoseStyle(DEFAULT_POSE_SERIES_STYLE);
    setOutputMode(historyCreationMode === "reference" ? "separate" : resolvePoseOutputModeFromPayload(payload));
    setPoseAngleCounts(resolvePoseAngleCountsFromPayload(payload));
    setRunningExpectedCount(null);
    setResultUrls(historyResultUrls);
    setIsSubmitting(false);
    setIsGenerating(false);
    setError("");
    if (!options?.silent) toast.success(t("toast.historyApplied"));
  }

  applyPoseHistoryPayloadRef.current = applyPoseHistoryPayload;

  useHistoryApply({
    kind: "pose",
    apply: (payload, resultUrls, { row }) => {
      applyPoseHistoryPayloadRef.current?.(payload, resultUrls);
      if (isHistoryApplyRowFailed(row)) {
        setError(getHistoryApplyFailureMessage(row));
      }
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("toast.uploadImageFile"));
      return;
    }
    if (file.size === 0) {
      toast.error(t("toast.emptyImageFile"));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t("toast.imageTooLarge", { mb: MAX_FILE_SIZE_MB }));
      return;
    }
    toast.info(t("toast.uploadingMain"));
    setIsUploading(true);
    setMainImageUploadProgress(0);
    try {
      const result = await uploadImage(file, { onProgress: setMainImageUploadProgress });
      setMainImage(result.url);
      setMainImageFileName(file.name);
      toast.success(t("toast.mainSelected"));
    } catch {
      setMainImage("");
      setMainImageFileName(null);
      toast.error(t("toast.mainUploadFailed"));
    } finally {
      setIsUploading(false);
      setMainImageUploadProgress(null);
    }
  }

  async function handlePoseReferenceFiles(files?: FileList | File[]) {
    if (isUploadingPoseReferences) {
      toast.info(t("toast.refUploading"));
      return;
    }
    const arr = Array.from(files || []);
    if (!arr.length) return;
    const remaining = MAX_POSE_REFERENCE_IMAGES - poseReferenceUrls.length;
    if (remaining <= 0) {
      toast.info(t("toast.refMax", { max: MAX_POSE_REFERENCE_IMAGES }));
      return;
    }
    const limited = arr.slice(0, remaining);
    if (arr.length > limited.length) {
      toast.info(t("toast.refRemaining", { remaining }));
    }
    const validFiles: File[] = [];
    for (const file of limited) {
      if (!isLikelyImageFile(file)) { toast.error(t("toast.notImage", { name: file.name })); continue; }
      if (file.size === 0) { toast.error(t("toast.emptyFile", { name: file.name })); continue; }
      if (file.size > MAX_FILE_SIZE) { toast.error(t("toast.tooLarge", { name: file.name, mb: MAX_FILE_SIZE_MB })); continue; }
      validFiles.push(file);
    }
    if (!validFiles.length) return;

    setIsUploadingPoseReferences(true);
    toast.info(t("toast.uploadingRefs", { count: validFiles.length }));
    try {
      const results = await Promise.allSettled(validFiles.map((file) => uploadImage(file)));
      const uploadedUrls: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          uploadedUrls.push(result.value.url);
        } else {
          const message = result.reason instanceof Error ? result.reason.message : t("toast.uploadFailed");
          toast.error(t("toast.uploadFailedWithReason", { name: validFiles[index].name, message }));
        }
      });
      if (uploadedUrls.length) {
        setPoseReferenceUrls((prev) => Array.from(new Set([...prev, ...uploadedUrls])).slice(0, MAX_POSE_REFERENCE_IMAGES));
        setPoseCreationMode("reference");
        toast.success(t("toast.addedRefs", { count: uploadedUrls.length }));
      }
    } finally {
      setIsUploadingPoseReferences(false);
    }
  }

  function toggleGarmentDetails() {
    setGarmentAngleEnabled((value) => !value);
  }

  async function handleGarmentDetailFiles(files?: FileList | File[]) {
    if (isUploadingGarmentDetails) {
      toast.info(t("toast.garmentUploading"));
      return;
    }
    if (isPoseReferenceMode && activePoseReferenceUrls.length === 0) {
      toast.info(t("toast.uploadRefFirst"));
      return;
    }
    const arr = Array.from(files || []);
    if (!arr.length) return;
    const remaining = MAX_GARMENT_ANGLE_IMAGES - activeGarmentAngleReferences.length;
    if (remaining <= 0) {
      toast.info(t("toast.garmentMax", { max: MAX_GARMENT_ANGLE_IMAGES }));
      return;
    }
    const limited = arr.slice(0, remaining);
    if (arr.length > limited.length) {
      toast.info(t("toast.angleRemaining", { remaining }));
    }
    const validFiles: File[] = [];
    for (const file of limited) {
      if (!isLikelyImageFile(file)) { toast.error(t("toast.notImage", { name: file.name })); continue; }
      if (file.size === 0) { toast.error(t("toast.emptyFile", { name: file.name })); continue; }
      if (file.size > MAX_FILE_SIZE) { toast.error(t("toast.tooLarge", { name: file.name, mb: MAX_FILE_SIZE_MB })); continue; }
      validFiles.push(file);
    }
    if (!validFiles.length) return;

    setIsUploadingGarmentDetails(true);
    toast.info(t("toast.uploadingGarments", { count: validFiles.length }));
    try {
      const results = await Promise.allSettled(validFiles.map((file) => uploadImage(file)));
      const uploadedUrls: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          uploadedUrls.push(result.value.url);
        } else {
          const message = result.reason instanceof Error ? result.reason.message : t("toast.uploadFailed");
          toast.error(t("toast.uploadFailedWithReason", { name: validFiles[index].name, message }));
        }
      });
      if (uploadedUrls.length) {
        setGarmentAngleReferences((prev) => normalizeGarmentAngleReferences([
          ...prev,
          ...uploadedUrls.map((url) => ({ url, target: garmentAngleTarget, view: garmentAngleView })),
        ]));
        toast.success(t("toast.addedGarments", { count: uploadedUrls.length }));
      }
    } finally {
      setIsUploadingGarmentDetails(false);
    }
  }

  function removeGarmentDetail(url: string) {
    setGarmentAngleReferences((prev) => prev.filter((item) => item.url !== url));
  }

  function applyRuleDemo(demo: PoseRuleDemo) {
    setMainImage(demo.imageUrl);
    setPrompt((prev) => stripLegacyRuleDemoText(prev));
    closeRulesPopover();
    toast.success(t("toast.exampleApplied"));
  }

  function applyPoseReferenceDemo(demo: typeof POSE_REFERENCE_DEMOS[number]) {
    setPoseCreationMode("reference");
    setPoseReferenceUrls(demo.imageUrls.slice(0, MAX_POSE_REFERENCE_IMAGES));
    setPoseReferenceCopies(1);
    toast.success(t("toast.refExampleApplied"));
  }

  async function generate(promptForRun?: string, options: PoseGenerateOptions = {}) {
    if (isSubmitting) return;
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("toast.loginFirst"));
      router.push("/login");
      return;
    }
    if (!mainImage) {
      toast.error(t("toast.uploadMainFirst"));
      return;
    }
    if (isUploadingGarmentDetails) {
      toast.info(t("toast.garmentUploading"));
      return;
    }
    const activePoseAnalysis = getActivePoseAnalysis();
    const activePoseAnalysisError = getActivePoseAnalysisError();
    const poseAnalysisPending = isAnalyzingPose || (!activePoseAnalysis && !activePoseAnalysisError);
    if (poseAnalysisPending) {
      toast.info(t("toast.analyzingFirst"));
      return;
    }
    const runExpectedCount = normalizePosePlanCount(options.expectedCountOverride ?? options.genCountOverride ?? poseExpectedCount, poseExpectedCount);
    const runGenCount = normalizePosePlanCount(options.genCountOverride ?? runExpectedCount, runExpectedCount);
    const retryResultIndex = normalizeRetryResultIndex(options.retryResultIndex);
    const retryPreviousResultUrls = retryResultIndex !== null ? resultUrls : [];
    const displayExpectedCount = getRetryDisplayExpectedCount({
      retryIndex: retryResultIndex,
      currentExpectedCount: activeResultExpectedCount,
      previousUrls: retryPreviousResultUrls,
      fallbackExpectedCount: runExpectedCount,
    });
    const runTotalCost = unitCost * runExpectedCount;
    if (credits !== null && credits < runTotalCost) {
      showInsufficientCreditsToast({ required: runTotalCost, balance: credits, onRecharge: () => router.push("/pricing") });
      return;
    }

    const runId = generationRunRef.current + 1;
    generationRunRef.current = runId;
    const isCurrentRun = () => generationRunRef.current === runId;
    setIsSubmitting(true);
    setIsGenerating(true);
    setRunningExpectedCount(displayExpectedCount);
    setError("");
    setResultUrls(buildRetryPendingResultUrls(retryPreviousResultUrls, retryResultIndex, displayExpectedCount));
    if (options.toastMessage) toast.info(options.toastMessage);
    const taskInputThumbnails = mainImage ? [mainImage, ...activePoseReferenceUrls, ...activeGarmentAngleUrls] : [];
    const activePosePlan = isPoseReferenceMode ? null : getActivePosePlan();
    const runPrompt = stripLegacyRuleDemoText(
      isPoseReferenceMode
        ? [
            "图1是唯一的人物、服装、背景、光线和整体摄影质感参考。姿势参考图只用于借鉴身体动作、重心、手脚位置、头颈方向、镜头节奏和兼容构图，不复制参考图人物、服装、背景、色调或道具。",
            supplementPrompt.trim() ? `补充要求：${supplementPrompt.trim()}` : "",
          ].filter(Boolean).join("\n\n")
        : [
            typeof promptForRun === "string" ? promptForRun : prompt,
            supplementPrompt.trim() ? `补充要求：${supplementPrompt.trim()}` : "",
          ].filter(Boolean).join("\n\n")
    );
    const provisionalTask = taskQueue.startTask({
      expectedCount: displayExpectedCount,
      inputThumbnails: taskInputThumbnails,
      progress: 10,
    });
    let activeTaskId = provisionalTask.id;
    let latestTaskResultUrls: string[] = [];

    try {
      const res = await fetch("/api/pose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          main_image_url: mainImage,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          prompt: runPrompt,
          pose_style: poseStyle,
          pose_creation_mode: isPoseReferenceMode ? "reference" : "free",
          pose_plan_mode: isPoseReferenceMode ? "preset" : posePlanMode,
          output_mode: effectiveOutputMode,
          pose_count: poseRunTargetCount,
          angle_counts: poseAngleCounts,
          gen_count: runGenCount,
          pose_start_index: options.poseStartIndex,
          pose_analysis: activePoseAnalysis,
          pose_plan: activePosePlan,
          pose_reference_urls: activePoseReferenceUrls,
          pose_reference_copies: activePoseReferenceCopies,
          garment_angle_references: activeGarmentAngleReferences,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          await refreshAuth();
          taskQueue.removeTask(activeTaskId);
          if (isCurrentRun()) {
            setIsSubmitting(false);
            setIsGenerating(false);
            router.push("/login");
          }
          return;
        }
        applyGenerationResponseStatus({
          res,
          data,
          userId,
          setCredits,
          fallbackError: t("generate.failed"),
        });
        throw new Error(data.error || t("generate.failed"));
      }
      if (typeof data.generation_id === "string" && data.generation_id) {
        const serverTask = taskQueue.replaceWithServerTask(activeTaskId, {
          id: data.generation_id,
          expectedCount: displayExpectedCount,
          inputThumbnails: taskInputThumbnails,
          status: data.status || "processing_tryon",
          progress: 25,
        });
        activeTaskId = serverTask.id;
      }
      if (isCurrentRun()) {
        setIsSubmitting(false);
        toast.success(t("generate.submitted"));
        void ensureNotificationPermission();
      }

      // 共享轮询原语：预算按期望张数缩放、退避跟随 attempts、tab 隐藏时节流
      const budgetMs = getTotalPollBudgetMs(displayExpectedCount);
      const pollDelay = createAdaptivePollDelay();
      const pollController = new AbortController();
      pollAbortRef.current = pollController;
      const pollStartedAt = Date.now();
      let elapsedMs = 0;
      let attempts = 0;
      while (elapsedMs < budgetMs) {
        await pollDelay(attempts, pollController.signal);
        attempts += 1;
        elapsedMs = Date.now() - pollStartedAt;
        const poll = await fetchWithAbortAndTimeout(
          `/api/pose?generation_id=${data.generation_id}`,
          pollController.signal,
        );
        if (!poll.ok) continue;
        const state = await poll.json();
        if (state.status === "processing_tryon" || state.status === "processing" || state.status === "pending") {
          if (Array.isArray(state.result_urls) && state.result_urls.length) {
            const nextResultUrls = mergeRetryResultUrls(retryPreviousResultUrls, retryResultIndex, state.result_urls, displayExpectedCount);
            latestTaskResultUrls = nextResultUrls;
            if (isCurrentRun()) setResultUrls(nextResultUrls);
          }
          const runningProgress = Math.min(25 + (elapsedMs / budgetMs) * 65, 90);
          taskQueue.markRunning(activeTaskId, {
            expectedCount: displayExpectedCount,
            inputThumbnails: taskInputThumbnails,
            resultThumbnails: latestTaskResultUrls,
            progress: runningProgress,
            status: state.status,
          });
        } else if (state.status === "completed") {
          const rawFinalUrls = Array.isArray(state.result_urls) ? state.result_urls : latestTaskResultUrls;
          const finalUrls = mergeRetryResultUrls(retryPreviousResultUrls, retryResultIndex, rawFinalUrls, displayExpectedCount);
          const finalResultCount = finalUrls.filter(Boolean).length;
          const expectedResultCount = retryResultIndex !== null
            ? displayExpectedCount
            : Math.min(
                Math.max(Number(state.expected_count) || runExpectedCount, runExpectedCount),
                POSE_PLAN_MAX_COUNT,
              );
          const partialFailure = state.partial_failure && typeof state.partial_failure === "object"
            ? state.partial_failure as { message?: unknown }
            : null;
          const completedError = state.error || coerceErrorMessage(partialFailure?.message);
          if (isCurrentRun()) {
            setResultUrls(finalUrls);
          }
          taskQueue.markCompleted(activeTaskId, {
            expectedCount: expectedResultCount,
            inputThumbnails: taskInputThumbnails,
            resultThumbnails: finalUrls,
            resultCount: finalResultCount,
            error: completedError ? summarizeGenerationError(completedError) : "",
          });
          if (isCurrentRun()) {
            if (completedError || finalResultCount < expectedResultCount) {
              void refreshCredits();
              toast.warning(t("generate.partialComplete", { done: finalResultCount, expected: expectedResultCount }));
            } else {
              toast.success(t("generate.complete"));
              notifyGenerationComplete({
                title: t("generate.complete"),
                body: t("generate.completeBody", { count: expectedResultCount }),
                url: "/history",
              });
            }
            setIsGenerating(false);
          }
          return;
        } else if (state.status === "failed") {
          throw new Error(state.error || t("generate.failed"));
        }
      }
      throw new PoseGenerationPollTimeoutError();
    } catch (err: unknown) {
      // 组件卸载或新任务接管导致的中止：静默退出，不打扰用户
      if (isAbortLikeError(err)) return;
      const message = summarizeGenerationError(err instanceof Error ? err.message : t("generate.failed"));
      if (err instanceof PoseGenerationPollTimeoutError) {
        taskQueue.markRunning(activeTaskId, {
          expectedCount: displayExpectedCount,
          inputThumbnails: taskInputThumbnails,
          resultThumbnails: latestTaskResultUrls,
          progress: 90,
          status: "processing",
        });
        taskQueue.refresh();
        if (isCurrentRun()) {
          setError("");
          toast.info(t("generate.pollTimeout"));
          setIsSubmitting(false);
          setIsGenerating(false);
        }
        return;
      }
      taskQueue.markFailed(activeTaskId, message, {
        expectedCount: displayExpectedCount,
        inputThumbnails: taskInputThumbnails,
        resultThumbnails: latestTaskResultUrls,
      });
      if (isCurrentRun()) {
        setError(message);
        toast.error(message);
        void refreshCredits();
        setIsSubmitting(false);
        setIsGenerating(false);
      }
    }
  }

  function handleRunningTask(item: TaskQueueItem) {
    generationRunRef.current += 1;
    const expectedCount = clampTaskExpectedCount(item, 1, POSE_PLAN_MAX_COUNT);
    setRunningExpectedCount(expectedCount);
    setIsSubmitting(false);
    setIsGenerating(true);
    setError("");
    setResultUrls(safeTaskQueueUrls(item.resultThumbnails));
  }

  async function handleCompletedTask(item: TaskQueueItem, session: TaskSelectionSession) {
    setRunningExpectedCount(null);
    try {
      const detail = await fetchHistoryApplyDetail(item.id, "pose", session.signal);
      if (!session.isCurrent()) return true;
      applyPoseHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails), {
        silent: session.reason === "restore",
      });
      if (item.statusGroup === "failed" || isHistoryApplyRowFailed(detail.row)) {
        setError(getHistoryApplyFailureMessage(detail.row, item.error || t("generate.failed")));
      }
      return true;
    } catch (err) {
      if (session.signal.aborted || !session.isCurrent()) return true;
      toast.error(err instanceof Error ? err.message : t("toast.historyLoadFailed"));
      return true;
    }
  }

  function handleContinueCreate() {
    generationRunRef.current += 1;
    setAiModel("nano-banana-2");
    setAspectRatio("auto");
    setImageSize("1K");
    setMainImage("");
    setGarmentAngleEnabled(false);
    setGarmentAngleReferences([]);
    setGarmentAngleTarget("outfit");
    setGarmentAngleView("front");
    setIsDraggingGarmentDetails(false);
    setIsUploadingGarmentDetails(false);
    lastPoseAnalysisKeyRef.current = "";
    poseAnalysisSeqRef.current += 1;
    setPoseAnalysisEntry(null);
    lastPosePlanKeyRef.current = "";
    posePlanSeqRef.current += 1;
    setPosePlanEntry(null);
    setPosePlanMode("preset");
    setShowPosePlanEditor(false);
    setSelectedPosePlanSlotIndex(0);
    setPoseAngleCounts({ ...DEFAULT_POSE_ANGLE_COUNTS });
    setPoseCreationMode("free");
    setPoseReferenceUrls([]);
    setPoseReferenceCopies(1);
    setIsUploadingPoseReferences(false);
    setPrompt(DEFAULT_POSE_PROMPT);
    setSupplementPrompt("");
    setOutputMode("separate");
    setPoseStyle(DEFAULT_POSE_SERIES_STYLE);
    setRunningExpectedCount(null);
    setIsSubmitting(false);
    setIsGenerating(false);
    setResultUrls([]);
    setError("");
    setLightboxSrc(null);
    closeRulesPopover();
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (poseReferenceInputRef.current) poseReferenceInputRef.current.value = "";
    if (garmentDetailInputRef.current) garmentDetailInputRef.current.value = "";
  }

  const activePoseAnalysis = getActivePoseAnalysis();
  const activePoseAnalysisError = getActivePoseAnalysisError();
  const activePosePlan = getActivePosePlan();
  const poseAnalysisSummary = getPoseVisualAnalysisSummary(activePoseAnalysis);
  const poseAnalysisDetails = getPoseVisualAnalysisDetailItems(activePoseAnalysis);
  const poseAnalysisSummaries: VisualAnalysisSummaryItem[] = poseAnalysisDetails.map((item) => ({
    key: item.label,
    title: `${item.label} · ${item.value}`,
    detail: item.title && item.title !== item.value ? item.title : "",
  }));
  const poseAnalysisStatus = isAnalyzingPose
    ? { tone: "loading" as const, text: t("analysis.readingMain") }
    : activePoseAnalysis
      ? {
          tone: activePoseAnalysisError || poseAnalysisSource === "fallback" || activePoseAnalysis.confidence < 0.45
            ? "warning" as const
            : "success" as const,
          text: poseAnalysisSource === "fallback" ? t("analysis.fallbackHandled") : t("analysis.ready"),
          description: poseAnalysisSummary || t("analysis.fallbackSummary"),
        }
      : activePoseAnalysisError
        ? { tone: "warning" as const, text: t("analysis.incomplete"), description: activePoseAnalysisError }
        : null;
  const posePlanSummaries = getPosePlanSummary(activePosePlan);
  const posePlanStatus = isPlanningPose
    ? { tone: "loading" as const, text: t("plan.preparing") }
    : activePosePlan
      ? {
          tone: posePlanError || posePlanSource === "fallback" ? "warning" as const : "success" as const,
          text: posePlanError || posePlanSource === "fallback" ? t("plan.fallbackHandled") : t("plan.ready"),
          description: t("plan.statusDesc", { source: activePosePlan.edited ? t("planSource.userCustom") : t(POSE_PLAN_SOURCE_LABEL_KEYS[posePlanSource || "vision_plan"]), count: activePosePlan.slots.length }),
        }
      : posePlanError
        ? { tone: "warning" as const, text: t("plan.incomplete"), description: posePlanError }
        : null;
  const selectedPosePlanSlot = activePosePlan?.slots[selectedPosePlanSlotIndex] || activePosePlan?.slots[0] || null;
  const suppressPoseFaceControls = shouldSuppressPoseFacePlanning(activePoseAnalysis);
  const selectedActionPresets = getCommercialPoseActionPresets(selectedPosePlanSlot?.angle);
  const selectedExpressionPresets = getCommercialPoseExpressionPresets(selectedPosePlanSlot?.angle, suppressPoseFaceControls);
  const selectedActionPresetId = getSelectedActionPresetId(selectedPosePlanSlot);
  const selectedExpressionPresetId = getSelectedExpressionPresetId(selectedPosePlanSlot);
  const selectedActionPreset = selectedActionPresets.find((preset) => preset.id === selectedActionPresetId) || null;
  const selectedExpressionPreset = selectedExpressionPresets.find((preset) => preset.id === selectedExpressionPresetId) || null;
  const normalizedPoseAngleCounts = normalizePoseAngleCounts(poseAngleCounts);
  const activePoseAnglePreset = POSE_ANGLE_PRESETS.find((preset) => isSamePoseAngleCounts(normalizedPoseAngleCounts, preset.counts)) || null;
  const poseAnglePlanLabel = activePoseAnglePreset ? t(activePoseAnglePreset.labelKey) : t("angles.custom");

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="pose" />
      <ModuleTaskRail module="pose" moduleLabel={t("moduleName")} onContinue={handleContinueCreate} onRunningTask={handleRunningTask} onCompletedTask={handleCompletedTask} />
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-6">
          <ModuleHeader
            title={t("moduleName")}
            tooltip={t("header.tooltip")}
            actions={(
              <>
                <StudioClearButton
                  label={t("header.clear")}
                  disabled={!mainImage && activePoseReferenceUrls.length === 0}
                  onClear={() => {
                    setMainImage("");
                    setMainImageFileName(null);
                    setPoseReferenceUrls([]);
                    setPrompt("");
                    setSupplementPrompt("");
                    closeRulesPopover?.();
                    toast.info(t("toast.cleared"));
                  }}
                />
                <button
                  ref={rulesButtonRef}
                  type="button"
                  onMouseEnter={openRulesPopover}
                  onMouseLeave={scheduleRulesHide}
                  onFocus={openRulesPopover}
                  onBlur={scheduleRulesHide}
                  aria-expanded={showPoseRules}
                  className="studio-upload-rule-button"
                >
                  {t("header.imageRules")} <ChevronRight aria-hidden="true" className="h-3 w-3" />
                </button>
              </>
            )}
          />
          <section
            {...mainImageDrag.dragHandlers}
            className={`studio-stable-upload-boundary relative rounded-xl transition-[box-shadow] ${isDragging ? "ring-2 ring-[var(--codex-accent-38)] ring-offset-2" : ""}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label={t("upload.modelAria")}
              onChange={(event) => {
                const input = event.currentTarget;
                void handleFile(input.files?.[0]).finally(() => {
                  input.value = "";
                });
              }}
            />
            <StudioUploadTile
              title={t("upload.modelTitle")}
              description={t("upload.modelDesc")}
              imageUrl={mainImage || null}
              fileName={mainImageFileName}
              imageAlt={t("upload.modelAlt")}
              isDragging={isDragging}
              loading={isUploading}
              loadingLabel={mainImageUploadProgress !== null ? t("upload.uploadingPercent", { percent: mainImageUploadProgress }) : undefined}
              onUploadClick={() => fileInputRef.current?.click()}
              onLibraryClick={() => toast.info(t("toast.librarySoon"))}
              onPreview={mainImage ? () => setLightboxSrc(mainImage) : undefined}
              onRemove={mainImage ? () => setMainImage("") : undefined}
              libraryLabel={t("upload.fromLibrary")}
              footnote={t("upload.modelFootnote")}
              examples={{
                label: t("upload.tryIt"),
                images: POSE_UPLOAD_RULE.demos.map((demo) => ({ url: demo.imageUrl, title: demo.title })),
                onSelect: (image) => applyRuleDemo({ title: image.title, imageUrl: image.url }),
              }}
            />
            {poseAnalysisStatus && (
              <VisualAnalysisStatusCard
                status={poseAnalysisStatus}
                summaries={poseAnalysisSummaries}
                isAnalyzing={isAnalyzingPose}
                className="mt-2"
                action={poseAnalysisStatus.tone === "warning" && mainImage ? (
                    <button
                      type="button"
                      onClick={retryPoseAnalysis}
                      className="rounded-full border border-current/15 bg-white/75 dark:bg-white/5 px-2.5 py-1 text-[11px] font-semibold transition hover:bg-white dark:bg-white/5"
                    >
                      {t("retry")}
                    </button>
                  ) : null}
              />
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="flex items-center gap-2 font-bold text-sm"><Layers className="h-4 w-4 text-[var(--codex-accent)]" /> {t("mode.title")}</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-codex-faint">
                {t("mode.desc")}
              </p>
            </div>

            <div className="grid grid-cols-2 rounded-2xl bg-[var(--codex-surface-soft)] dark:bg-white/5 p-1">
              {[
                { value: "free" as const, label: t("mode.free"), desc: t("mode.freeDesc") },
                { value: "reference" as const, label: t("mode.reference"), desc: t("mode.referenceDesc") },
              ].map((item) => {
                const selected = poseCreationMode === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setPoseCreationMode(item.value)}
                    className={`rounded-xl px-3 py-2 text-center transition ${
                      selected
                        ? "bg-white dark:bg-white/5 text-blue-700 shadow-[0_8px_18px_rgba(37,99,235,0.12)]"
                        : "text-codex-muted hover:text-codex-ink"
                    }`}
                  >
                    <span className="block text-xs font-black">{item.label}</span>
                    <span className="mt-0.5 block text-[11px] font-bold opacity-70">{item.desc}</span>
                  </button>
                );
              })}
            </div>

            {poseCreationMode === "reference" && (
              <>
              <StudioUploadSection
                title={(
                  <span className="flex items-center gap-2">
                    {t("reference.sectionTitle")}
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
                      {poseReferenceUrls.length}/{MAX_POSE_REFERENCE_IMAGES}
                    </span>
                  </span>
                )}
                inputRef={poseReferenceInputRef}
                onFiles={handlePoseReferenceFiles}
                multiple
                isDragging={isDraggingPoseReferences}
                setDragging={setIsDraggingPoseReferences}
              >
                {(openFileDialog) => (
                  <MultiImageUploadV2
                    urls={poseReferenceUrls}
                    maxCount={MAX_POSE_REFERENCE_IMAGES}
                    title={t("reference.uploadedTitle")}
                    emptyHint={t("reference.emptyTitle")}
                    itemLabelPrefix={t("reference.itemPrefix")}
                    loading={isUploadingPoseReferences}
                    isDragging={isDraggingPoseReferences}
                    libraryLabel={t("reference.libraryLabel")}
                    summary={poseReferenceUrls.length ? t("reference.summary", { count: poseReferenceOutputCount }) : undefined}
                    footnote={t("reference.footnote")}
                    imageFit="cover"
                    onUploadClick={openFileDialog}
                    onLibraryClick={() => toast.info(t("toast.librarySoon"))}
                    onPreview={(url) => setLightboxSrc(url)}
                    onRemove={(_, index) => setPoseReferenceUrls((prev) => prev.filter((__, i) => i !== index))}
                    onClear={() => setPoseReferenceUrls([])}
                    examples={!poseReferenceUrls.length ? {
                      label: t("upload.tryIt"),
                      images: POSE_REFERENCE_DEMOS.map((demo) => ({
                        url: demo.imageUrls[0],
                        title: demo.title,
                        previewUrls: demo.imageUrls,
                      })),
                      disabled: isUploadingPoseReferences,
                      onSelect: (image) => {
                        const demo = POSE_REFERENCE_DEMOS.find((item) => item.title === image.title && item.imageUrls[0] === image.url);
                        if (demo) applyPoseReferenceDemo(demo);
                      },
                    } : undefined}
                  />
                )}
              </StudioUploadSection>
              {activePoseReferenceUrls.length > 0 && (
                <div className="rounded-2xl border border-[var(--codex-border)] dark:border-white/10 bg-white dark:bg-white/5 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-codex-ink">{t("reference.countTitle")}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-codex-muted">
                        {t("reference.countFormula", { ref: activePoseReferenceUrls.length, per: activePoseReferenceCopies, total: poseReferenceOutputCount })}
                      </p>
                    </div>
                    <div className="grid h-9 shrink-0 grid-cols-[34px_52px_34px] overflow-hidden rounded-full border border-[var(--codex-border)] dark:border-white/10 bg-[var(--codex-surface-soft)] dark:bg-white/4">
                      <button
                        type="button"
                        onClick={() => setPoseReferenceCopies((count) => normalizePoseReferenceCopies(count - 1, activePoseReferenceUrls.length))}
                        disabled={activePoseReferenceCopies <= 1}
                        className="inline-flex items-center justify-center text-codex-muted transition hover:bg-white dark:bg-white/5 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label={t("reference.decreaseAria")}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={activePoseReferenceCopies}
                        onChange={(event) => setPoseReferenceCopies(normalizePoseReferenceCopies(event.target.value, activePoseReferenceUrls.length))}
                        className="w-full border-x border-[var(--codex-border)] dark:border-white/10 bg-white dark:bg-white/5 text-center text-xs font-black text-codex-ink outline-none"
                        aria-label={t("reference.countAria")}
                      />
                      <button
                        type="button"
                        onClick={() => setPoseReferenceCopies((count) => normalizePoseReferenceCopies(count + 1, activePoseReferenceUrls.length))}
                        className="inline-flex items-center justify-center text-codex-muted transition hover:bg-white dark:bg-white/5 hover:text-blue-700"
                        aria-label={t("reference.increaseAria")}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="rounded-2xl border border-emerald-100 bg-[linear-gradient(180deg,#f7fffb_0%,#ffffff_100%)] px-3 py-3 shadow-sm">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="min-w-0">
                    <p className="text-xs font-black text-codex-ink">
                      {activePoseReferenceUrls.length ? t("reference.willGenerate", { count: poseReferenceOutputCount }) : t("reference.uploadToGenerate")}
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-codex-muted">
                      {t("reference.modeNote")}
                    </p>
                  </div>
                </div>
              </div>
              </>
            )}
          </section>

          <section className="space-y-3">
            <button
              type="button"
              onClick={toggleGarmentDetails}
              className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition-colors ${
                garmentAngleEnabled
                  ? "border-blue-300 bg-blue-50/80 text-blue-800 dark:border-[var(--codex-accent-55)] dark:bg-[var(--codex-accent-18)] dark:text-[#cfd8ff]"
                  : shouldSuggestBackReference
                    ? "border-amber-200 bg-amber-50/70 text-amber-900 hover:border-amber-300 dark:border-[rgba(255,159,10,0.45)] dark:bg-[rgba(255,159,10,0.12)] dark:text-[#ffd194]"
                    : "border-[var(--codex-border)] bg-white dark:bg-white/5 text-codex-ink dark:border-white/10 hover:border-[var(--codex-border-strong)] dark:hover:border-white/20"
              }`}
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-sm font-black">
                  {t("garment.toggleTitle")}
                  <span className="rounded-full bg-white/80 dark:bg-white/5 px-2 py-0.5 text-[11px] font-bold text-codex-muted">{t("garment.optional")}</span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-codex-muted">
                  {shouldSuggestBackReference
                    ? t("garment.toggleSuggest")
                    : t("garment.toggleDefault")}
                </span>
              </span>
              <span className={`ml-3 flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${garmentAngleEnabled ? "bg-[var(--codex-accent)]" : "bg-[var(--codex-border)] dark:bg-white/10"}`}>
                <span className={`h-5 w-5 rounded-full bg-white shadow transition dark:bg-codex-surface ${garmentAngleEnabled ? "translate-x-5" : "translate-x-0"}`} />
              </span>
            </button>

            {garmentAngleEnabled && (
              <StudioUploadSection
                title={(
                  <span className="flex items-center gap-2">
                    {t("garment.uploadTitle")}
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
                      {activeGarmentAngleReferences.length}/{MAX_GARMENT_ANGLE_IMAGES}
                    </span>
                  </span>
                )}
                inputRef={garmentDetailInputRef}
                onFiles={handleGarmentDetailFiles}
                multiple
                isDragging={isDraggingGarmentDetails}
                setDragging={setIsDraggingGarmentDetails}
                className="rounded-2xl border border-blue-100 dark:border-blue-400/30 bg-blue-50/35 p-3"
              >
                {(openFileDialog) => (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-blue-100 dark:border-blue-400/30 bg-white/92 dark:bg-white/5 p-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[12px] font-bold text-blue-700">{t("garment.belongsTo")}</p>
                          <p className="mt-0.5 truncate text-sm font-black text-codex-ink">{activeGarmentAngleMark}</p>
                          <p className="mt-0.5 truncate text-[12px] text-codex-muted" title={activeGarmentAngleTargetOption.description}>
                            {activeGarmentAngleTargetOption.description}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">
                          {t("garment.canUploadMore", { count: MAX_GARMENT_ANGLE_IMAGES - activeGarmentAngleReferences.length })}
                        </span>
                      </div>

                      <div className="mt-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="mt-1 w-8 shrink-0 text-[12px] font-bold text-codex-muted">{t("garment.clothes")}</span>
                          <div className="flex flex-wrap gap-1.5">
                            {GARMENT_ANGLE_TARGET_OPTIONS.map((item) => {
                              const selected = item.value === garmentAngleTarget;
                              return (
                                <button
                                  key={item.value}
                                  type="button"
                                  onClick={() => setGarmentAngleTarget(item.value)}
                                  title={item.description}
                                  className={`rounded-full border px-2.5 py-1 text-[12px] font-bold transition ${
                                    selected
                                      ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm"
                                      : "border-[var(--codex-border)] dark:border-white/10 bg-white dark:bg-white/5 text-codex-muted hover:border-blue-200 dark:hover:border-blue-400/40 hover:text-blue-700"
                                  }`}
                                >
                                  {item.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <span className="mt-1 w-8 shrink-0 text-[12px] font-bold text-codex-muted">{t("garment.angle")}</span>
                          <div className="flex flex-wrap gap-1.5">
                            {GARMENT_ANGLE_VIEW_OPTIONS.map((item) => {
                              const selected = item.value === garmentAngleView;
                              return (
                                <button
                                  key={item.value}
                                  type="button"
                                  onClick={() => setGarmentAngleView(item.value)}
                                  className={`rounded-full border px-2.5 py-1 text-[12px] font-bold transition ${
                                    selected
                                      ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm"
                                      : "border-[var(--codex-border)] dark:border-white/10 bg-white dark:bg-white/5 text-codex-muted hover:border-blue-200 dark:hover:border-blue-400/40 hover:text-blue-700"
                                  }`}
                                >
                                  {item.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={openFileDialog}
                      disabled={isUploadingGarmentDetails || activeGarmentAngleReferences.length >= MAX_GARMENT_ANGLE_IMAGES}
                      className={`flex w-full items-center gap-3 rounded-xl border border-dashed bg-white/85 dark:bg-white/5 p-3 text-left transition hover:border-blue-300 hover:bg-white dark:bg-white/5 disabled:cursor-not-allowed disabled:opacity-55 ${
                        isDraggingGarmentDetails ? "border-blue-400 bg-blue-50" : "border-blue-200"
                      }`}
                      aria-label={t("garment.uploadAria", { mark: activeGarmentAngleMark })}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                        {isUploadingGarmentDetails ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : <Sparkles aria-hidden="true" className="h-5 w-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-black text-codex-ink">
                          {t("garment.uploadAs", { mark: activeGarmentAngleMark })}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-codex-muted">
                          {t("garment.uploadHint")}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 shadow-sm">
                        {t("garment.maxCount", { count: MAX_GARMENT_ANGLE_IMAGES })}
                      </span>
                    </button>

                    {activeGarmentAngleReferences.length > 0 && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {activeGarmentAngleReferences.map((ref, index) => {
                            const label = formatGarmentAngleReferenceLabel(ref, index);
                            return (
                              <div key={ref.url} className="group relative overflow-hidden rounded-lg border border-blue-200 bg-white dark:bg-white/5 shadow-sm">
                                <button
                                  type="button"
                                  onClick={() => setLightboxSrc(ref.url)}
                                  className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                  aria-label={t("garment.previewAria", { label })}
                                >
                                  <RawPreviewImage src={ref.url} alt={label} className="aspect-[3/4] w-full object-cover" />
                                  <span className="absolute bottom-1 left-1 max-w-[calc(100%-8px)] truncate rounded-full bg-white/90 dark:bg-white/5 px-1.5 py-0.5 text-[11px] font-bold text-blue-700">
                                    {label}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeGarmentDetail(ref.url)}
                                  className="absolute right-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/92 dark:bg-white/8 text-codex-muted shadow-sm transition-colors duration-150 hover:text-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--codex-accent-55)]"
                                  aria-label={t("garment.removeAria", { label })}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <p className="rounded-lg bg-blue-50/70 px-2.5 py-2 text-[12px] leading-relaxed text-blue-800 dark:bg-[var(--codex-accent-16)] dark:text-[#cfd8ff]">
                      {GARMENT_ANGLE_UPLOAD_FOOTNOTE}
                    </p>
                  </div>
                )}
              </StudioUploadSection>
            )}
          </section>

          <section>
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-codex-ink">
              <Sparkles className="w-4 h-4 text-[var(--codex-accent)]" /> {t("model.title")}
            </h3>
            <StudioModelSelector
              models={modelOptions}
              value={aiModel}
              onChange={setAiModel}
              ariaLabel={t("model.title")}
              getMeta={(model) => `${model.desc} · ${t("model.perImageCredit", { cost: getCreditCost(model.value, imageSize, aspectRatio) })}`}
            />
          </section>

          {!isPoseReferenceMode && (
          <section className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-bold text-sm"><PersonStanding className="h-4 w-4 text-[var(--codex-accent)]" /> {t("angles.title")}</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-codex-faint">
                  {t("angles.desc")}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${
                activePoseAnglePreset ? "bg-blue-50 text-blue-700" : "bg-[var(--codex-surface-soft)] dark:bg-white/5 text-codex-muted"
              }`}>
                {poseAnglePlanLabel} · {t("angles.unitCount", { count: posePlanTargetCount })}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {POSE_ANGLE_PRESETS.map((preset) => {
                const selected = activePoseAnglePreset?.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPoseAnglePreset(preset.counts)}
                    aria-pressed={selected}
                    className={`rounded-2xl border px-3 py-2 text-left transition ${
                      selected
                        ? "border-blue-300 bg-blue-50/80 shadow-sm"
                        : "border-[var(--codex-border)] dark:border-white/10 bg-white dark:bg-white/5 hover:border-blue-200 dark:hover:border-blue-400/40 hover:bg-blue-50/30 hover:text-blue-700"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-1.5">
                      <span className={`min-w-0 truncate text-xs font-black ${selected ? "text-blue-800 dark:text-[#cfd8ff]" : "text-codex-ink"}`}>
                        {t(preset.labelKey)}
                      </span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-black ${
                        selected ? "bg-white dark:bg-white/5 text-blue-700" : "bg-[var(--codex-surface-soft)] dark:bg-white/5 text-codex-muted"
                      }`}>
                        {t(preset.countLabelKey)}
                      </span>
                    </span>
                    <span className={`mt-0.5 block truncate text-[11px] font-semibold ${selected ? "text-blue-600" : "text-codex-muted"}`}>
                      {selected ? t("angles.currentPlan") : t(preset.descKey)}
                    </span>
                  </button>
                );
              })}
            </div>
            {!activePoseAnglePreset ? (
              <p className="rounded-xl bg-[var(--codex-surface-soft)] dark:bg-white/4 px-3 py-2 text-[12px] leading-relaxed text-codex-muted">
                {t("angles.customHint")}
              </p>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-[var(--codex-border)] dark:border-white/10 bg-white/90 dark:bg-white/5 shadow-sm">
              {POSE_ANGLE_OPTIONS.map((item) => {
                const count = poseAngleCounts[item.value] || 0;
                const total = posePlanTargetCount;
                const isBack = item.value === "back";
                const isDetail = item.value === "detail";
                const isGarment = item.value === "garment";
                return (
                  <div key={item.value} className="border-b border-[var(--codex-border)] dark:border-white/5 p-3 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-codex-ink">{t(item.labelKey)}</p>
                          {isDetail ? (
                            <span className="rounded-full bg-[var(--codex-surface-soft)] dark:bg-white/5 px-2 py-0.5 text-[11px] font-bold text-codex-muted">{t("angles.detailBadge")}</span>
                          ) : null}
                          {isGarment ? (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">{t("angles.garmentBadge")}</span>
                          ) : null}
                          {isBack && count > 0 ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">{t("angles.backBadge")}</span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-codex-muted">{t(item.descKey)}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-codex-faint">{t(item.hintKey)}</p>
                      </div>
                      <div className="grid h-9 shrink-0 grid-cols-[34px_34px_34px] overflow-hidden rounded-full border border-[var(--codex-border)] dark:border-white/10 bg-[var(--codex-surface-soft)] dark:bg-white/4">
                        <button
                          type="button"
                          onClick={() => updatePoseAngleCount(item.value, -1)}
                          disabled={count <= 0 || total <= POSE_PLAN_MIN_COUNT}
                          className="inline-flex items-center justify-center text-codex-muted transition hover:bg-white dark:bg-white/5 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label={t("angles.decreaseAria", { label: t(item.labelKey) })}
                        >
                          <Minus aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                        <span className="inline-flex items-center justify-center border-x border-[var(--codex-border)] dark:border-white/10 bg-white dark:bg-white/5 text-xs font-black text-codex-ink">
                          {count}
                        </span>
                        <button
                          type="button"
                          onClick={() => updatePoseAngleCount(item.value, 1)}
                          disabled={total >= POSE_PLAN_MAX_COUNT}
                          className="inline-flex items-center justify-center text-codex-muted transition hover:bg-white dark:bg-white/5 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label={t("angles.increaseAria", { label: t(item.labelKey) })}
                        >
                          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {shouldSuggestBackReference ? (
              <button
                type="button"
                onClick={() => {
                  setGarmentAngleEnabled(true);
                  setGarmentAngleView("back");
                }}
                className="flex w-full items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-left transition hover:border-amber-300 hover:bg-amber-50"
              >
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white dark:bg-white/5 text-xs font-black text-amber-700">
                  !
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-black text-amber-900">{t("angles.backSuggestTitle")}</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-amber-700">
                    {t("angles.backSuggestBody")}
                  </span>
                </span>
              </button>
            ) : null}

            <div>
              <StudioOptionGrid
                options={[
                  { value: "separate" as const, label: t("output.separate"), description: t("output.separateDesc", { count: posePlanTargetCount }) },
                  { value: "grid" as const, label: t("output.grid"), description: t("output.gridDesc", { count: posePlanTargetCount }) },
                ]}
                value={outputMode}
                onChange={setOutputMode}
                columns={2}
                ariaLabel={t("output.aria")}
              />
            </div>
          </section>
          )}

          <section>
            <h3 className="flex items-center gap-2 font-bold text-sm mb-3 text-codex-ink"><Crop className="h-4 w-4 text-[var(--codex-accent)]" /> {t("aspect.title")}</h3>
            <AspectRatioSelector
              options={ASPECTS.map((a) => ({ value: a.value, label: a.labelKey ? t(a.labelKey) : a.label }))}
              value={aspectRatio}
              onChange={setAspectRatio}
              ariaLabel={t("aspect.title")}
            />
            <div className="mt-2 rounded-lg border border-[var(--codex-border)] dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-[12px] leading-relaxed text-codex-muted">
              {t("aspect.note")}
            </div>
          </section>

          {imageSizes.length > 1 && (
            <section>
              <ResolutionSelector
                titleKey="resolution.title"
                options={imageSizes.map((size) => ({
                  value: size,
                  label: size,
                  description: t("resolution.perImageCredit", { cost: getCreditCost(aiModel, size, aspectRatio) }),
                }))}
                value={imageSize}
                onChange={setImageSize}
                ariaLabel={t("resolution.title")}
              />
            </section>
          )}

          {!mainImage && !isPoseReferenceMode && (
            <section className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <PenLine className="w-4 h-4 text-[var(--codex-accent)]" /> {t("plan.title")}
                  </h3>
                  <p className="mt-1 text-[12px] leading-relaxed text-codex-faint">
                    {t("plan.freeDesc")}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fffb_100%)] px-3 py-3 shadow-[0_10px_28px_rgba(16,185,129,0.07)]">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/80">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-emerald-900 dark:text-emerald-300">{t("plan.autoPlanTitle")}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-codex-muted">
                      {t("plan.autoPlanBody")}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {mainImage && !isPoseReferenceMode && (
            <section className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <PenLine className="w-4 h-4 text-[var(--codex-accent)]" /> {t("plan.title")}
                  </h3>
                  <p className="mt-1 text-[12px] leading-relaxed text-codex-faint">
                    {t("plan.defaultDesc")}
                  </p>
                </div>
                {activePosePlan && showPosePlanEditor ? (
                  <button
                    type="button"
                    onClick={() => setShowPosePlanEditor(false)}
                    className="shrink-0 rounded-lg border border-[var(--codex-border)] dark:border-white/10 bg-white dark:bg-white/5 px-2.5 py-1 text-[12px] font-semibold text-codex-muted transition-colors hover:border-blue-200 dark:hover:border-blue-400/40 hover:text-blue-700"
                  >
                    {t("plan.collapseEdit")}
                  </button>
                ) : null}
              </div>

              <div className="rounded-3xl border border-[#d9e4f2] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-3 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex rounded-full bg-[#edf3fa] p-1 shadow-inner shadow-slate-200/70">
                    <button
                      type="button"
                      onClick={usePresetPosePlan}
                      className={`rounded-full px-3.5 py-1.5 text-[12px] font-black transition ${
                        posePlanMode === "preset"
                          ? "bg-white dark:bg-white/5 text-blue-700 shadow-[0_5px_14px_rgba(37,99,235,0.12)]"
                          : "text-codex-muted hover:text-codex-ink"
                      }`}
                    >
                      {t("plan.commercialPreset")}
                    </button>
                    <button
                      type="button"
                      onClick={retryPosePlan}
                      disabled={isPlanningPose || !mainImage}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        posePlanMode === "ai"
                          ? "bg-white dark:bg-white/5 text-blue-700 shadow-[0_5px_14px_rgba(37,99,235,0.12)]"
                          : "text-codex-muted hover:text-codex-ink"
                      }`}
                    >
                      {isPlanningPose ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" /> : null}
                      {t("plan.smartOptimize")}
                    </button>
                  </div>
                  <span className="rounded-full bg-white/85 dark:bg-white/5 px-2.5 py-1 text-[12px] font-black text-codex-muted ring-1 ring-[var(--codex-border)]/80">
                    {activePosePlan ? t("plan.countPoses", { count: activePosePlan.slots.length }) : t("plan.pending")}
                  </span>
                </div>

                {posePlanStatus && (
                  <div className="mt-3">
                    <VisualAnalysisStatusCard status={posePlanStatus} />
                  </div>
                )}

                {activePosePlan && (
                  <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--codex-border)] dark:border-white/10/90 bg-white dark:bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                    {posePlanSummaries.map((item, index) => {
                      const slot = activePosePlan.slots[index];
                      const editing = showPosePlanEditor && index === selectedPosePlanSlotIndex && selectedPosePlanSlot;
                      return (
                        <div
                          key={item.key}
                          className={`group border-t border-[var(--codex-border)] dark:border-white/5 first:border-t-0 ${
                            editing ? "bg-[linear-gradient(90deg,#f5f9ff_0%,#ffffff_74%)]" : "bg-white dark:bg-white/5 hover:bg-[var(--codex-surface-soft)] dark:hover:bg-white/8 dark:bg-white/4"
                          }`}
                        >
                          <div className="flex items-start gap-3 px-3.5 py-3.5">
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-black ${
                              editing
                                ? "bg-blue-600 text-white shadow-[0_8px_16px_rgba(37,99,235,0.18)]"
                                : "bg-[var(--codex-surface-soft)] dark:bg-white/5 text-codex-muted ring-1 ring-[var(--codex-border)]/70 group-hover:bg-white dark:bg-white/5 group-hover:text-codex-ink"
                            }`}>
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <span className="text-[12px] font-black text-codex-muted">
                                  {t("plan.poseIndex", { index: index + 1 })}
                                </span>
                                {slot?.angle ? (
                                  <span className={getPoseAngleBadgeClass(slot.angle)}>
                                    {t(`planAngle.${slot.angle}`)}
                                  </span>
                                ) : null}
                                <span className="min-w-0 truncate text-[13px] font-black text-codex-ink">
                                  {slot?.poseName || item.title}
                                </span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-[12px] leading-[1.65] text-codex-muted" title={item.detail}>
                                {item.detail || slot?.bodyAction || t("plan.planReady")}
                              </p>
                              {slot?.headDirection && !suppressPoseFaceControls ? (
                                <p className="mt-1 line-clamp-1 text-[12px] leading-relaxed text-codex-faint" title={slot.headDirection}>
                                  {t("plan.expressionGaze", { text: slot.headDirection })}
                                </p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPosePlanSlotIndex(index);
                                setShowPosePlanEditor((current) => !(current && index === selectedPosePlanSlotIndex));
                              }}
                              className={`shrink-0 rounded-full border px-3 py-1 text-[12px] font-black transition ${
                                editing
                                  ? "border-blue-600 bg-blue-600 text-white shadow-[0_8px_16px_rgba(37,99,235,0.16)]"
                                  : "border-[var(--codex-border)] dark:border-white/10 bg-white/90 dark:bg-white/5 text-codex-muted hover:border-blue-200 dark:hover:border-blue-400/40 hover:bg-blue-50 hover:text-blue-700"
                              }`}
                            >
                              {editing ? t("plan.collapse") : t("plan.edit")}
                            </button>
                          </div>

                          {editing ? (
                            <div className="border-t border-blue-100 dark:border-blue-400/30/80 px-3.5 pb-3.5 pt-3">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className="block">
                                  <span className="mb-1.5 block text-[12px] font-black text-codex-ink">
                                    {selectedPosePlanSlot.angle ? t("plan.actionTemplateFor", { angle: t(`planAngle.${selectedPosePlanSlot.angle}`) }) : t("plan.actionTemplate")}
                                  </span>
                                  <select
                                    value={selectedActionPresetId}
                                    onChange={(event) => applyPoseActionPreset(selectedPosePlanSlotIndex, event.target.value)}
                                    className="h-10 w-full rounded-xl border border-[var(--codex-border)] dark:border-white/10 bg-white dark:bg-white/5 px-3 text-xs font-bold text-codex-ink shadow-sm outline-none transition hover:border-blue-200 dark:hover:border-blue-400/40 focus:border-blue-300 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/40"
                                  >
                                    <option value="current">{selectedActionPresetId === "current" ? t("plan.byPlanWith", { name: selectedPosePlanSlot.poseName || t("plan.originalPlan") }) : t("plan.byPlan")}</option>
                                    {selectedActionPresets.map((preset) => (
                                      <option key={preset.id} value={preset.id}>{preset.label}</option>
                                    ))}
                                  </select>
                                </label>

                                <label className="block">
                                  <span className="mb-1.5 block text-[12px] font-black text-codex-ink">{t("plan.expressionGazeLabel")}</span>
                                  <select
                                    value={selectedExpressionPresetId}
                                    onChange={(event) => applyPoseExpressionPreset(selectedPosePlanSlotIndex, event.target.value)}
                                    disabled={suppressPoseFaceControls || selectedExpressionPresets.length === 0}
                                    className="h-10 w-full rounded-xl border border-[var(--codex-border)] dark:border-white/10 bg-white dark:bg-white/5 px-3 text-xs font-bold text-codex-ink shadow-sm outline-none transition hover:border-blue-200 dark:hover:border-blue-400/40 focus:border-blue-300 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:bg-[var(--codex-surface-soft)] dark:disabled:bg-white/4 dark:bg-white/4 disabled:text-codex-faint"
                                  >
                                    <option value="current">{selectedPosePlanSlot?.angle === "garment" ? t("plan.faceCloseup") : suppressPoseFaceControls ? t("plan.noClearFace") : t("plan.byPlanExpression")}</option>
                                    {selectedExpressionPresets.map((preset) => (
                                      <option key={preset.id} value={preset.id}>{preset.label}</option>
                                    ))}
                                  </select>
                                </label>
                              </div>

                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <div className="rounded-xl bg-white dark:bg-white/5 px-3 py-2 shadow-sm ring-1 ring-[var(--codex-border)]/90">
                                  <p className="text-[11px] font-black text-codex-faint">{t("plan.actionDesc")}</p>
                                  <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-codex-muted">
                                    {selectedActionPreset?.bodyAction || selectedPosePlanSlot.bodyAction || selectedPosePlanSlot.poseName}
                                  </p>
                                </div>
                                <div className="rounded-xl bg-white dark:bg-white/5 px-3 py-2 shadow-sm ring-1 ring-[var(--codex-border)]/90">
                                  <p className="text-[11px] font-black text-codex-faint">{t("plan.expressionDesc")}</p>
                                  <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-codex-muted">
                                    {suppressPoseFaceControls
                                      ? t("plan.faceAutoDisabled")
                                      : selectedExpressionPreset?.text || selectedPosePlanSlot.headDirection || t("plan.naturalExpression")}
                                  </p>
                                </div>
                              </div>

                              <details className="mt-3 rounded-xl border border-[var(--codex-border)] dark:border-white/10/90 bg-white dark:bg-white/5 px-3 py-2 shadow-sm">
                                <summary className="cursor-pointer text-[12px] font-bold text-codex-muted transition-colors hover:text-blue-700">{t("plan.advancedTuning")}</summary>
                                <div className="mt-3 grid gap-3">
                                  <div>
                                    <label className="mb-1 block text-[11px] font-bold text-codex-muted">{t("plan.actionDetail")}</label>
                                    <PromptTextarea
                                      value={selectedPosePlanSlot.bodyAction || ""}
                                      onChange={(event) => updatePosePlanSlot(selectedPosePlanSlotIndex, "bodyAction", event.target.value)}
                                      rows={3}
                                      className="custom-scroll"
                                      placeholder={t("plan.actionDetailPh")}
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-[11px] font-bold text-codex-muted">{t("plan.handAction")}</label>
                                    <PromptTextarea
                                      value={selectedPosePlanSlot.handAction || ""}
                                      onChange={(event) => updatePosePlanSlot(selectedPosePlanSlotIndex, "handAction", event.target.value)}
                                      rows={2}
                                      className="custom-scroll"
                                      placeholder={t("plan.handActionPh")}
                                    />
                                  </div>
                                  {!suppressPoseFaceControls && (
                                    <div>
                                      <label className="mb-1 block text-[11px] font-bold text-codex-muted">{t("plan.expressionDetail")}</label>
                                      <PromptTextarea
                                        value={selectedPosePlanSlot.headDirection || ""}
                                        onChange={(event) => updatePosePlanSlot(selectedPosePlanSlotIndex, "headDirection", event.target.value)}
                                        rows={2}
                                        className="custom-scroll"
                                        placeholder={t("plan.expressionDetailPh")}
                                      />
                                    </div>
                                  )}
                                  <div>
                                    <label className="mb-1 block text-[11px] font-bold text-codex-muted">{t("plan.cameraFraming")}</label>
                                    <PromptTextarea
                                      value={selectedPosePlanSlot.cameraFraming || ""}
                                      onChange={(event) => updatePosePlanSlot(selectedPosePlanSlotIndex, "cameraFraming", event.target.value)}
                                      rows={2}
                                      className="custom-scroll"
                                      placeholder={t("plan.cameraFramingPh")}
                                    />
                                  </div>
                                </div>
                              </details>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          <PromptTextarea
            titleKey="supplement.title"
            badge={t("supplement.badge")}
            value={supplementPrompt}
            onChange={(event) => setSupplementPrompt(event.target.value)}
            rows={4}
            placeholder={t("supplement.placeholder")}
            description={t("supplement.desc")}
            maxLength={2000}
            onClear={() => setSupplementPrompt("")}
          />
        </div>

        <StudioRunBar
          summary={`${poseDeliveryLabel}${activeGarmentAngleUrls.length ? t("runBar.garmentSummary", { count: activeGarmentAngleUrls.length }) : ""}`}
          estimateLabel={isSubmitting ? t("runBar.estimateGenerating") : t("runBar.estimateReady", { count: posePlanTargetCount })}
          costLabel={authIsAnonymous ? t("runBar.loginToViewCredits") : t("runBar.costBalance", { cost, balance: credits ?? "-" })}
          disabled={isSubmitting || Boolean(runDisabledReason)}
          disabledReason={runDisabledReason}
          primaryLabel={authIsAnonymous
            ? t("runBar.loginToGenerate")
            : isUploading
              ? t("runBar.uploading")
              : isSubmitting
                ? t("runBar.submitting")
                : isGenerating
                  ? t("runBar.continueGenerating")
                  : isPoseReferenceMode
                    ? t("runBar.generateRefs", { count: activePoseReferenceUrls.length ? poseReferenceOutputCount : 0 })
                    : outputMode === "separate" ? t("runBar.generatePoses", { count: posePlanTargetCount }) : t("runBar.generateGrid", { count: posePlanTargetCount })}
          isLoading={isSubmitting}
          onPrimaryAction={() => generate()}
        />
      </div>

      <div className="studio-canvas min-h-[260px] sm:min-h-[360px] lg:min-h-0 flex-1 relative overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error && (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <PreviewGuide
              title={t("previewGuide.title")}
              subtitle={t("previewGuide.subtitle")}
              steps={[
                {
                  title: t("previewGuide.stepSource"),
                  desc: "",
                  imageSrc: "/tutorial-guides/pose-source.webp",
                  imageAlt: t("previewGuide.sourceAlt"),
                  badge: t("previewGuide.sourceBadge"),
                },
                {
                  title: t("previewGuide.stepResult"),
                  desc: "",
                  imageSrc: "/tutorial-guides/pose-result.webp",
                  imageAlt: t("previewGuide.resultAlt"),
                  badge: t("previewGuide.resultBadge"),
                },
              ]}
            />
          </div>
        )}

        {(isGenerating || resultUrls.length > 0) && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col animate-fade-in">
            {isGenerating && (
              <div className="mb-4 rounded-xl border border-purple-100 bg-white/80 dark:bg-white/5 px-3 py-2 text-xs font-medium text-purple-600 shadow-sm">
                {t("result.generatingProgress", { done: resultUrls.filter(Boolean).length, expected: Math.max(runningExpectedCount || poseExpectedCount || 1, resultUrls.filter(Boolean).length) })}
              </div>
            )}
            <div className="flex min-h-0 flex-1 items-start justify-start">
              <ResultImageGrid
                urls={resultUrls}
                filenamePrefix="pose"
                extension="jpg"
                onOpen={(_, index) => setPreviewIndex(index)}
                expectedCount={activeResultExpectedCount}
                isGenerating={isGenerating}
                inputThumbnails={mainImage ? [mainImage, ...activePoseReferenceUrls, ...activeGarmentAngleUrls] : []}
                statusGroup={isGenerating ? "running" : undefined}
                variant="task"
                markMissingAsFailed={hasCompletedPartialResults}
                missingFailureLabel={t("result.missingFailed")}
                missingFailureDetail={partialFailureMessage}
                missingFailureActionLabel={t("result.retryThis")}
                onMissingFailureAction={handleRetryFailedResult}
                missingFailureActionDisabled={retryDisabled}
              
                  tileAspectRatio={aspectRatio}
                />
            </div>
            <StudioImagePreviewDialog
              open={previewIndex !== null}
              onClose={() => setPreviewIndex(null)}
              session={previewSession}
              selectedIndex={previewIndex || 0}
              onSelectedIndexChange={setPreviewIndex}
              filenamePrefix="pose"
              extension="jpg"
              actions={POSE_PREVIEW_ACTION_KINDS.map((kind) => ({ kind, label: t(POSE_PREVIEW_ACTION_LABEL_KEYS[kind]) })) as ImagePreviewAction[]}
              onRegenerateAll={() => void generate()}
            />
          </div>
        )}

        {error && (
          <ErrorStage
            error={summarizeGenerationError(error)}
            onRetry={() => { setError(""); void generate(); }}
            isGenerating={isGenerating}
            retryDisabled={retryDisabled}
            retryLabel={t("result.regenerate")}
            notice={FAILED_RETRY_NOTICE}
          />
        )}
      </div>

      <StudioRulesPopover
        open={showPoseRules}
        style={rulesPopoverStyle}
        width={720}
        demoGridClassName="md:grid-cols-5"
        shortTitle={POSE_UPLOAD_RULE.shortTitle}
        title={POSE_UPLOAD_RULE.title}
        specText={POSE_UPLOAD_RULE.uploadSpecText}
        hoverPreviewLabel={t("rules.hoverPreview")}
        tryItLabel={t("upload.tryIt")}
        demos={POSE_UPLOAD_RULE.demos.map((demo) => ({
          key: demo.imageUrl,
          title: demo.title,
          imageUrls: [demo.imageUrl],
          onApply: () => applyRuleDemo(demo),
        }))}
        examples={POSE_UPLOAD_RULE.deprecatedImages.map((image) => ({
          key: image.title,
          title: image.title,
          imageUrl: image.url,
        }))}
        examplesTitle={POSE_UPLOAD_RULE.deprecatedTitle}
        onMouseEnter={cancelRulesHide}
        onMouseLeave={scheduleRulesHide}
      />

      <StudioMediaLightbox
        src={lightboxSrc}
        alt={t("reference.previewAlt")}
        onClose={() => setLightboxSrc(null)}
      />
      {unsavedChangesDialog}
    </div>
  );
}
