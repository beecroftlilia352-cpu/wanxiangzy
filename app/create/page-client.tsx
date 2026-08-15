"use client";

import type { ChangeEvent, KeyboardEvent } from "react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRulesPopover } from "@/hooks/use-rules-popover";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { ensureNotificationPermission, notifyGenerationComplete } from "@/lib/notifications";
import { OnboardingCoach, hasSeenOnboarding } from "@/components/studio/OnboardingCoach";
import { useRouter } from "next/navigation";
import {
  Upload, UserRound, Image as ImageIcon, Sparkles,
  X, Camera, ChevronRight, Wand, Loader2, ZoomIn,
  FolderOpen, CheckCircle2, XCircle,
  Crop, Monitor, Images, ListChecks, PenLine,
} from "lucide-react";
import { useTryOnStore } from "@/lib/store/tryon-store";
import { createLocalImagePreview, isLikelyImageFile, MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { getCreditCost, getSupportedImageSizes, isNanoBananaModel, type LingyaModel, type ImageSize, type AspectRatio } from "@/lib/api/lingya";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { ModuleHeader } from "@/components/ModuleHeader";
import { LoadingStage } from "@/components/studio/LoadingStage";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { PreviewGuide } from "@/components/PreviewGuide";
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { ImgSkeleton } from "@/components/studio/ImgSkeleton";
import { StudioControlPanel } from "@/components/studio/StudioControlPanel";
import { StudioPageShell } from "@/components/studio/StudioPageShell";
import { StudioResultViewport, type StudioResultStatus } from "@/components/studio/StudioResultViewport";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { StudioSection } from "@/components/studio/StudioSection";
import { StudioSegmentedControl } from "@/components/studio/StudioSegmentedControl";
import { StudioTaskRail } from "@/components/studio/StudioTaskRail";
import { StudioUploadTile } from "@/components/studio/StudioUploadTile";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import { useTaskSelectionSession, type TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { useStableFileDrag } from "@/components/studio/useStableFileDrag";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import { useTaskQueueStore } from "@/lib/task-queue-client-store";
import { StudioGenerationCountSelector, StudioModelSelector, StudioOptionGrid, StudioPromptTextarea } from "@/components/studio/StudioFormControls";
import { fetchHistoryApplyDetail, getHistoryApplyFailureMessage, isHistoryApplyRowFailed, takeApplyDetail } from "@/lib/history-apply";
import { clampTaskExpectedCount, isTaskRunning, safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";
import { showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import { FAILED_RETRY_NOTICE, buildFailedTaskDetail, buildPartialFailureDetail, summarizeGenerationError } from "@/lib/studio-generation-feedback";
import {
  buildRetryPendingResultUrls,
  getRetryDisplayExpectedCount,
  mergeRetryResultUrls,
  normalizeRetryResultIndex,
} from "@/lib/result-slot-retry";
import {
  AUTO_DESIGN_BACKGROUNDS,
  AUTO_DESIGN_FRAMINGS,
  AUTO_DESIGN_PLATFORMS,
  DEFAULT_AUTO_DESIGN,
  SCENE_MODE_LABELS,
  buildAutoDesignPrompt,
  normalizeAutoDesignSettings,
  type AutoDesignSettings,
  type TryOnSceneMode,
} from "@/lib/tryon-scene";
import {
  TRYON_CLOTHING_MODE_LABELS,
  TRYON_CLOTHING_ROLE_LABELS,
  TRYON_UPLOAD_RULES,
  TRYON_UPLOAD_SLOT_EXAMPLES,
  normalizeTryOnClothingMode,
  normalizeTryOnClothingRole,
  type TryOnClothingMode,
  type TryOnClothingRole,
  type TryOnRuleDemo,
  type TryOnRuleImage,
} from "@/lib/tryon-upload-rules";
import {
  TRYON_AGE_GROUP_LABELS,
  TRYON_GARMENT_AUDIENCE_LABELS,
  normalizeTryOnAgeGroup,
  normalizeTryOnGarmentAudience,
  type TryOnAgeGroup,
  type TryOnGarmentAudience,
} from "@/lib/tryon-prompt";
import {
  AGE_GROUP_OPTIONS,
  BANANA_ASPECTS,
  GARMENT_AUDIENCE_OPTIONS,
  GPT_ASPECTS,
  MODELS,
  PRESET_MODELS,
  PRESET_REFERENCES,
  SCENE_MODE_TABS,
  STYLE_PRESETS,
} from "@/lib/tryon-studio-options";
import { TRYON_CATEGORY_BY_CODE, isIntimateAnalysis, normalizeTryOnClothingAnalysis, type TryOnClothingAnalysis } from "@/lib/tryon-reference-config";
import { alignTryOnReferenceAnalyses, type TryOnReferenceAnalysis } from "@/lib/tryon-reference-analysis";
import { TryOnSourceLibraryDialog } from "@/components/tryon/TryOnSourceLibraryDialog";
import {
  ReferenceScenePicker,
  type ReferenceScenePickerTab,
} from "@/components/tryon/ReferenceScenePicker";
import { useTryOnSourceLibrary } from "@/components/tryon/useTryOnSourceLibrary";
import type { TryOnSourceLibraryItem } from "@/lib/tryon-source-library";
import { buildTryOnInputReferences } from "@/lib/tryon-input-references";
import type { TryOnInputReference } from "@/lib/tryon-input-references";
import {
  MAX_GARMENT_DETAIL_IMAGES,
  countGarmentDetailImages,
  flattenGarmentDetailGroups,
  normalizeGarmentDetailGroups,
  normalizeGarmentDetailUrls,
  type GarmentDetailReferenceGroup,
} from "@/lib/garment-detail-references";
import { createGenericImagePreviewSession } from "@/lib/studio-image-preview";
import type { ReferenceImage } from "@/types";
import {
  activeTryOnStatusWatchers,
  areOrderedUrlsEqual,
  fetchTryOnGenerationStatus,
  getTaskPreviewSyncSignature,
  getTryOnStatusPollTimeoutMs,
  isAbortLikeError,
  waitForTryOnStatusPoll,
} from "@/features/tryon/create/status-sync";
import {
  buildClothingAnalysisKey,
  buildReferenceAnalysisKey,
  createPlaceholderFile,
  mapWithConcurrency,
  normalizeAssetUrl,
  uniqueReferenceImages,
} from "@/features/tryon/create/asset-utils";
import {
  buildClothingItemStates,
  buildVisibleClothingItems,
  getGarmentDetailOwnerLabel,
} from "@/features/tryon/create/clothing-utils";
import {
  CLOTHING_ROLE_ORDER,
  MAX_TRYON_OUTPUT_IMAGES,
  MAX_TRYON_REFERENCE_IMAGES,
  TRYON_FACE_MODEL_BANANA_NOTICE,
  TRYON_PREVIEW_ACTIONS,
  TRYON_REFERENCE_UPLOAD_CONCURRENCY,
  TRYON_STATUS_FETCH_TIMEOUT_MS,
  TRYON_STATUS_QUEUE_REFRESH_MS,
} from "@/features/tryon/create/constants";
import {
  getAutoClothingRoleFromAnalysis,
  getClothingAnalysisLabel,
  getReferenceAnalysisDetailText,
  getReferenceAnalysisSummary,
  isCacheableClothingAnalysisEntry,
  isCacheableReferenceAnalysisEntry,
} from "@/features/tryon/create/analysis-utils";
import {
  coerceVisibleSceneMode,
  findPresetModelByUrl,
  getFallbackSystemReferences,
  getHistoryReferenceSource,
  getHistoryReferenceUrls,
  getSceneChildReferences,
  getTryOnHistoryExpectedCount,
  normalizeFavoriteReference,
  normalizeReferenceCategoryValue,
  normalizeReferenceTemplate,
  referenceBelongsToSceneMode,
  referenceMatchesSceneFilters,
  toFavoriteReference,
  toHistoryReference,
} from "@/features/tryon/create/reference-utils";
import { getErrorMessage } from "@/features/tryon/create/error-utils";
import {
  GarmentDetailReferencePanel,
  ReferenceSelectionFooter,
  TryOnAnalysisStatusBadge,
  TryOnLightbox,
  TryOnReferenceAnalysisStatus,
  TryOnRulePopover,
} from "@/features/tryon/create/presentation";
import type {
  ClothingAnalysisCacheEntry,
  ClothingItemState,
  CustomReferenceUpload,
  FavoriteReference,
  ReferenceAnalysisCacheEntry,
  ReferenceTemplate,
  SelectedReferenceImage,
  TryOnGenerateOptions,
  TryOnHistoryPayload,
} from "@/features/tryon/create/types";

const VISUAL_AUDIENCE_AUTO_CONFIDENCE = 0.86;

function getVisualAudienceSuggestion(analysis: TryOnClothingAnalysis | null | undefined) {
  if (!analysis || analysis.confidence < VISUAL_AUDIENCE_AUTO_CONFIDENCE) {
    return { audience: null, ageGroup: null } as const;
  }

  return {
    audience: analysis.genderType === "women" || analysis.genderType === "men" ? analysis.genderType : null,
    ageGroup: analysis.ageRange && analysis.ageRange !== "all" ? analysis.ageRange : null,
  } as const;
}

function canApplyVisualAudienceSuggestion(source: ClothingAnalysisCacheEntry["source"] | null) {
  return source === "yunwu" || source === "cache";
}

function formatVisualAudienceSuggestion(audience: TryOnGarmentAudience | null, ageGroup: TryOnAgeGroup | null) {
  return [
    audience ? TRYON_GARMENT_AUDIENCE_LABELS[audience] : "",
    ageGroup ? TRYON_AGE_GROUP_LABELS[ageGroup] : "",
  ].filter(Boolean).join(" ");
}

export default function CreatePage() {
  const t = useTranslations("Create");
  // 服装角色分类标签键（lib TRYON_CLOTHING_ROLE_LABELS 为中文兜底）
  const ROLE_LABEL_KEYS: Record<string, string> = {
    single: "clothing.roleSingle",
    upper: "clothing.roleUpper",
    lower: "clothing.roleLower",
    extra: "clothing.roleExtra",
  };
  const router = useRouter();
  const store = useTryOnStore();
  const {
    setClothing: setStoreClothing,
    setPromptUsed: setStorePromptUsed,
    setReferenceImages: setStoreReferenceImages,
    setSelectedModel: setStoreSelectedModel,
    setResult: setStoreResult,
    setError: setStoreError,
  } = store;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeGenerationRef = useRef<string | null>(null);
  const generationSubmitRef = useRef<{ id: string; controller: AbortController } | null>(null);
  const watchedGenerationIdsRef = useRef<Set<string>>(new Set());
  const statusWatcherControllersRef = useRef<Map<string, AbortController>>(new Map());
  const {
    pendingId: applyingTaskId,
    begin: beginTaskSelection,
    cancel: cancelTaskSelection,
  } = useTaskSelectionSession();
  const {
    buttonRef: rulesButtonRef,
    show: showClothingRules,
    style: rulesPopoverStyle,
    open: openRulesPopover,
    scheduleHide: scheduleRulesHide,
    close: closeRulesPopover,
    cancelHide: cancelRulesHide,
  } = useRulesPopover({ width: 760 });
  const [genCount, setGenCount] = useState(1);

  const {
    authChecked,
    isAuthenticated,
    userId,
    credits,
    setCredits,
    refreshCredits,
    refreshAuth,
  } = useStudioAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingClothingRoles, setUploadingClothingRoles] = useState<TryOnClothingRole[]>([]);
  const [aiModel, setAiModel] = useState<LingyaModel>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [customStyle, setCustomStyle] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [sceneMode, setSceneMode] = useState<TryOnSceneMode>("upload_reference");
  const [autoDesign, setAutoDesign] = useState<AutoDesignSettings>(DEFAULT_AUTO_DESIGN);
  const [favoriteReferences, setFavoriteReferences] = useState<FavoriteReference[]>([]);
  const [referenceTemplates, setReferenceTemplates] = useState<ReferenceTemplate[]>([]);
  const [isLoadingFavoriteReferences, setIsLoadingFavoriteReferences] = useState(false);
  const [isSavingFavoriteReference, setIsSavingFavoriteReference] = useState(false);
  const [clothingMode, setClothingMode] = useState<TryOnClothingMode>("multi");
  const [clothingRoles, setClothingRoles] = useState<TryOnClothingRole[]>([]);
  const [garmentAudience, setGarmentAudience] = useState<TryOnGarmentAudience>("women");
  const [ageGroup, setAgeGroup] = useState<TryOnAgeGroup>("adult");
  const [isIntimateGarment, setIsIntimateGarment] = useState(false);
  const [pendingClothingRole, setPendingClothingRole] = useState<TryOnClothingRole>("upper");

  const [customModelPreview, setCustomModelPreview] = useState<string | null>(null);
  const [customRefUploads, setCustomRefUploads] = useState<CustomReferenceUpload[]>([]);
  const [isUploadingCustomModel, setIsUploadingCustomModel] = useState(false);
  const [isDraggingModel, setIsDraggingModel] = useState(false);
  const [isDraggingRef, setIsDraggingRef] = useState(false);
  const [isDraggingGarmentDetails, setIsDraggingGarmentDetails] = useState(false);
  const [garmentDetailEnabled, setGarmentDetailEnabled] = useState(false);
  const [garmentDetailUrls, setGarmentDetailUrls] = useState<string[]>([]);
  const [garmentDetailGroups, setGarmentDetailGroups] = useState<GarmentDetailReferenceGroup[]>([]);
  const [isUploadingGarmentDetails, setIsUploadingGarmentDetails] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeQueueTask, setActiveQueueTask] = useState<TaskQueueItem | null>(null);
  const [activeTaskReferences, setActiveTaskReferences] = useState<TryOnInputReference[]>([]);
  const taskQueue = useTaskQueueGeneration({
    module: "tryon",
    title: t("tryon.title"),
    defaultExpectedCount: genCount,
    applyPath: "/create",
  });
  const syncedActiveQueueTask = useTaskQueueStore(
    useCallback(
      (state) => {
        const taskId = activeQueueTask?.id;
        if (!taskId) return null;
        return state.modules.tryon?.rows.find((item) => item.id === taskId) ?? null;
      },
      [activeQueueTask?.id]
    )
  );
  const referenceDrag = useStableFileDrag<HTMLElement>({
    isDragging: isDraggingRef,
    setDragging: setIsDraggingRef,
    stopPropagation: true,
    fileFilter: isLikelyImageFile,
    onFiles: (files) => handleCustomRefFiles(files),
  });
  const modelDrag = useStableFileDrag<HTMLElement>({
    isDragging: isDraggingModel,
    setDragging: setIsDraggingModel,
    stopPropagation: true,
    fileFilter: isLikelyImageFile,
    onFiles: (files) => handleCustomModelFile(files[0]),
  });
  const customRefInputRef = useRef<HTMLInputElement>(null);
  const customModelInputRef = useRef<HTMLInputElement>(null);
  const garmentDetailInputRef = useRef<HTMLInputElement>(null);
  const garmentDetailTargetIndexRef = useRef(0);
  const customRefUploadSeqRef = useRef(0);
  const customModelUploadSeqRef = useRef(0);
  const referenceSelectionTouchedRef = useRef(false);
  const audienceSelectionTouchedRef = useRef(false);
  const ageSelectionTouchedRef = useRef(false);
  const clothingAnalysisSeqRef = useRef(0);
  const lastClothingAnalysisKeyRef = useRef("");
  const lastAutoAppliedClothingAnalysisKeyRef = useRef("");
  const lastAutoAppliedAudienceKeyRef = useRef("");
  const referenceAnalysisSeqRef = useRef(0);
  const lastReferenceAnalysisKeyRef = useRef("");
  const clothingAnalysisCacheRef = useRef(new Map<string, ClothingAnalysisCacheEntry>());
  const clothingAnalysisInflightRef = useRef(new Map<string, Promise<ClothingAnalysisCacheEntry>>());
  const referenceAnalysisCacheRef = useRef(new Map<string, ReferenceAnalysisCacheEntry>());
  const referenceAnalysisInflightRef = useRef(new Map<string, Promise<ReferenceAnalysisCacheEntry>>());
  const sourceLibrary = useTryOnSourceLibrary({
    ensureAuthenticated: refreshAuth,
    isAuthenticated,
    onUnauthenticated: () => {
      toast.error(t("library.loginRequired"));
      router.push("/login");
    },
  });

  // 已上传的服装 URL 列表（选择后立即上传）
  const [uploadedClothingUrls, setUploadedClothingUrls] = useState<string[]>([]);
  const [clothingAnalysis, setClothingAnalysis] = useState<TryOnClothingAnalysis | null>(null);
  const [, setClothingAnalysisSource] = useState<"yunwu" | "cache" | "fallback" | "history" | null>(null);
  const [isAnalyzingClothing, setIsAnalyzingClothing] = useState(false);
  const [referenceAnalyses, setReferenceAnalyses] = useState<TryOnReferenceAnalysis[]>([]);
  const [referenceAnalysisKey, setReferenceAnalysisKey] = useState("");
  const [isAnalyzingReferences, setIsAnalyzingReferences] = useState(false);
  const [clothingAnalysisError, setClothingAnalysisError] = useState<string | null>(null);
  const [referenceAnalysisError, setReferenceAnalysisError] = useState<string | null>(null);
  const [referenceAnalysisSource, setReferenceAnalysisSource] = useState<"yunwu" | "cache" | "fallback" | "history" | null>(null);
  const [isLoadingSystemReferences, setIsLoadingSystemReferences] = useState(false);
  const [recommendedSystemReferences, setRecommendedSystemReferences] = useState<SelectedReferenceImage[]>(getFallbackSystemReferences().slice(0, 4));
  const [allSystemReferences, setAllSystemReferences] = useState<SelectedReferenceImage[]>(getFallbackSystemReferences());
  const [isReferenceScenePanelOpen, setIsReferenceScenePanelOpen] = useState(false);
  const [referencePanelTab, setReferencePanelTab] = useState<ReferenceScenePickerTab>("recommended");
  const [referencePanelViewFilter, setReferencePanelViewFilter] = useState<"all" | "front" | "back">("all");
  const [referencePanelBodyFilter, setReferencePanelBodyFilter] = useState<"all" | "whole" | "upper" | "lower">("all");
  const [referencePanelSearch, setReferencePanelSearch] = useState("");
  const [activeReferenceSceneUrl, setActiveReferenceSceneUrl] = useState<string | null>(null);

  // 大图预览
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const openTryonPreview = useCallback((_: string, index: number) => {
    setPreviewIndex(index);
  }, []);

  const aspects = aiModel === "gpt-image-2" ? GPT_ASPECTS : BANANA_ASPECTS;
  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const allSelectedReferenceImages = useMemo(() => (
    uniqueReferenceImages((store.referenceImages?.length ? store.referenceImages : store.referenceImage ? [store.referenceImage] : []) as SelectedReferenceImage[])
  ), [store.referenceImage, store.referenceImages]);
  const selectedReferenceImages = useMemo(() => (
    allSelectedReferenceImages.filter((item) => referenceBelongsToSceneMode(item, sceneMode))
  ), [allSelectedReferenceImages, sceneMode]);
  const effectiveReferenceUrls = useMemo(
    () => selectedReferenceImages.map((item) => item.url).filter(Boolean),
    [selectedReferenceImages]
  );

  // 未保存输入离开拦截：有服装图/参考图/提示词时提醒
  const [showOnboarding, setShowOnboarding] = useState(false);

  // 新注册用户首次进入时显示三步引导（本地标记完成后不再出现）
  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    if (hasSeenOnboarding()) return;
    if (uploadedClothingUrls.length || store.clothingFiles.length) return;
    setShowOnboarding(true);
    const onDismiss = () => setShowOnboarding(false);
    window.addEventListener("pxd:onboarding-dismiss", onDismiss);
    return () => window.removeEventListener("pxd:onboarding-dismiss", onDismiss);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, isAuthenticated]);

  const { unsavedDialog: unsavedChangesDialog } = useUnsavedChangesGuard(Boolean(
    uploadedClothingUrls.length || effectiveReferenceUrls.length || store.promptUsed.trim() || promptOverride?.trim()
  ));
  const activeReferenceAnalysisKey = useMemo(() => {
    if (sceneMode === "auto_design" || !effectiveReferenceUrls.length) return "";
    return buildReferenceAnalysisKey({ urls: effectiveReferenceUrls, clothingMode, clothingRoles, garmentAudience, ageGroup });
  }, [effectiveReferenceUrls, sceneMode, clothingMode, clothingRoles, garmentAudience, ageGroup]);
  const activeGarmentDetailGroups = useMemo(
    () => garmentDetailEnabled ? normalizeGarmentDetailGroups(garmentDetailGroups, uploadedClothingUrls.length) : [],
    [garmentDetailEnabled, garmentDetailGroups, uploadedClothingUrls.length]
  );
  const activeUnassignedGarmentDetailUrls = useMemo(
    () => garmentDetailEnabled ? normalizeGarmentDetailUrls(garmentDetailUrls) : [],
    [garmentDetailEnabled, garmentDetailUrls]
  );
  const activeGarmentDetailUrls = useMemo(
    () => normalizeGarmentDetailUrls([
      ...flattenGarmentDetailGroups(activeGarmentDetailGroups),
      ...activeUnassignedGarmentDetailUrls,
    ]),
    [activeGarmentDetailGroups, activeUnassignedGarmentDetailUrls]
  );
  const referenceMultiplier = sceneMode === "auto_design" ? 1 : effectiveReferenceUrls.length;
  const expectedOutputCount = genCount * referenceMultiplier;
  const isUploadingCustomRef = customRefUploads.some((item) => item.status === "uploading");
  const isAuxiliaryUploading = isUploadingCustomModel || isUploadingCustomRef || isUploadingGarmentDetails;
  const isReferenceUploadPending = isUploadingCustomRef;
  const isModelUploadPending = Boolean(customModelPreview) && !store.selectedModel?.image_url;
  const isReferenceUploadBusy = isUploadingCustomRef || isReferenceUploadPending;
  const isModelUploadBusy = isUploadingCustomModel || isModelUploadPending;
  const hasModelFace = Boolean(store.selectedModel?.image_url);
  const selectableModels = MODELS;
  const selectedReferenceCount = selectedReferenceImages.length;
  const visibleCustomRefUploads = customRefUploads.filter((item) => item.status === "uploading" || item.status === "error");
  const showUploadReferenceEmptyTile = sceneMode === "upload_reference" && selectedReferenceCount === 0 && visibleCustomRefUploads.length === 0;
  const resolvedAutoDesign = normalizeAutoDesignSettings(autoDesign);
  const autoDesignBackgroundOptions = resolvedAutoDesign.platform === "ecommerce_clean"
    ? AUTO_DESIGN_BACKGROUNDS.filter((item) => item.value === "white")
    : AUTO_DESIGN_BACKGROUNDS;
  const autoDesignPrompt = sceneMode === "auto_design" ? buildAutoDesignPrompt(resolvedAutoDesign) : "";
  const stylePrompt = [autoDesignPrompt, customStyle.trim()].filter(Boolean).join("\n");
  const clothingItems = buildVisibleClothingItems({
    previews: store.clothingPreviews,
    urls: uploadedClothingUrls,
    roles: clothingRoles,
    clothingMode,
  });
  const currentUploadRule = TRYON_UPLOAD_RULES[clothingMode];
  const upperClothing = clothingItems.find((item) => item.role === "upper");
  const lowerClothing = clothingItems.find((item) => item.role === "lower");
  const singleClothing = clothingItems[0] || null;
  const activeGarmentDetailTotal = activeGarmentDetailUrls.length;
  const openLightbox = (src: string, alt: string) => {
    setLightboxImage({ src, alt });
  };

  const handlePreviewKeyDown = (event: KeyboardEvent, action: () => void) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    action();
  };

  const resetScenePrompt = () => {
    setPromptOverride(null);
    store.setPromptUsed("");
  };

  const setSelectedReferences = (refs: SelectedReferenceImage[], options: { touch?: boolean; mode?: TryOnSceneMode } = {}) => {
    if (options.touch !== false) referenceSelectionTouchedRef.current = true;
    const mode = options.mode || sceneMode;
    const currentReferences = uniqueReferenceImages(
      (useTryOnStore.getState().referenceImages?.length
        ? useTryOnStore.getState().referenceImages
        : useTryOnStore.getState().referenceImage
          ? [useTryOnStore.getState().referenceImage]
          : []) as SelectedReferenceImage[]
    );
    const nextReferenceUrlKeys = new Set(refs.map((item) => normalizeAssetUrl(item.url) || item.url));
    const inactiveReferences = currentReferences.filter((item) => (
      !referenceBelongsToSceneMode(item, mode)
      && !nextReferenceUrlKeys.has(normalizeAssetUrl(item.url) || item.url)
    ));
    store.setReferenceImages(uniqueReferenceImages([...refs, ...inactiveReferences]) as ReferenceImage[]);
    resetScenePrompt();
  };

  const toggleReferenceImage = (ref: SelectedReferenceImage) => {
    const exists = selectedReferenceImages.some((item) => item.url === ref.url);
    if (exists) {
      setSelectedReferences(selectedReferenceImages.filter((item) => item.url !== ref.url));
      return;
    }
    if (selectedReferenceImages.length >= MAX_TRYON_REFERENCE_IMAGES) {
      toast.info(t("maxReference", { count: MAX_TRYON_REFERENCE_IMAGES }));
      return;
    }
    setSelectedReferences([...selectedReferenceImages, ref]);
  };

  const clearSelectedReferences = () => {
    referenceSelectionTouchedRef.current = true;
    customRefUploadSeqRef.current += 1;
    setSelectedReferences([], { touch: false });
    setCustomRefUploads([]);
    resetScenePrompt();
  };

  const applyReferenceTemplate = (template: ReferenceTemplate) => {
    setSelectedReferences(template.references);
    toast.success(t("templateApplied", { name: template.name }));
  };

  const switchSceneMode = (mode: TryOnSceneMode) => {
    if (isUploadingCustomRef) {
      toast.info(t("referenceUploading"));
      return false;
    }
    const isChangingSource = mode !== sceneMode;
    setSceneMode(mode);
    resetScenePrompt();

    if (mode === "auto_design") {
      referenceSelectionTouchedRef.current = true;
      return true;
    }

    if (isChangingSource) {
      referenceSelectionTouchedRef.current = true;
    }

    return true;
  };

  const updateGarmentAudience = (value: TryOnGarmentAudience) => {
    audienceSelectionTouchedRef.current = true;
    setGarmentAudience(value);
    setPromptOverride(null);
    store.setPromptUsed("");
  };

  const updateAgeGroup = (value: TryOnAgeGroup) => {
    ageSelectionTouchedRef.current = true;
    if (value !== "adult" && isIntimateGarment) {
      setIsIntimateGarment(false);
      toast.info(t("intimateAdultOnlyDisabled"));
    }
    setAgeGroup(value);
    setPromptOverride(null);
    store.setPromptUsed("");
  };

  const updateIntimateGarment = (checked: boolean) => {
    if (checked && ageGroup !== "adult") {
      toast.error(t("intimateAdultOnlySetAdultFirst"));
      return;
    }
    setIsIntimateGarment(checked);
    setPromptOverride(null);
    store.setPromptUsed("");
  };

  const saveSelectedReferenceTemplate = async () => {
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("favorite.loginRequired"));
      router.push("/login");
      return;
    }
    if (!selectedReferenceImages.length) {
      toast.error(t("favorite.selectFirst"));
      return;
    }

    setIsSavingFavoriteReference(true);
    try {
      const res = await fetch("/api/tryon/reference-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: t("favorite.templateName", { count: selectedReferenceImages.length }),
          references: selectedReferenceImages.map((item) => ({
            id: item.id,
            url: item.url,
            label: item.label,
            category: normalizeReferenceCategoryValue(item.category),
            source: item.source || (item.is_preset ? "preset" : "upload"),
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("favorite.saveTemplateFailed"));

      const template = normalizeReferenceTemplate(data.template);
      if (!template) throw new Error(t("favorite.templateDataInvalid"));
      setReferenceTemplates((prev) => [
        template,
        ...prev.filter((item) => item.id !== template.id),
      ].slice(0, 24));
      toast.success(t("favorite.savedAsTemplate"));
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t("favorite.saveTemplateFailed")));
    } finally {
      setIsSavingFavoriteReference(false);
    }
  };

  const removeFavoriteReference = async (id: string) => {
    const removed = favoriteReferences.find((item) => item.id === id);
    if (!removed) return;
    setFavoriteReferences((prev) => prev.filter((item) => item.id !== id));
    if (selectedReferenceImages.some((item) => item.url === removed.url)) {
      setSelectedReferences(selectedReferenceImages.filter((item) => item.url !== removed.url));
    }
    try {
      const res = await fetch(`/api/tryon/reference-favorites/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("favorite.deleteFailed"));
      toast.success(t("favorite.removed"));
    } catch (err: unknown) {
      setFavoriteReferences((prev) => [removed, ...prev].slice(0, 24));
      toast.error(getErrorMessage(err, t("favorite.deleteFailed")));
    }
  };

  useEffect(() => {
    const statusWatcherControllers = statusWatcherControllersRef.current;
    return () => {
      generationSubmitRef.current?.controller.abort();
      generationSubmitRef.current = null;
      statusWatcherControllers.forEach((controller) => controller.abort());
      statusWatcherControllers.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!authChecked) return;
    if (!isAuthenticated) {
      setFavoriteReferences([]);
      setReferenceTemplates([]);
      setIsLoadingFavoriteReferences(false);
      return;
    }

    setIsLoadingFavoriteReferences(true);
    Promise.all([
      fetch("/api/tryon/reference-favorites").then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || t("favorite.loadFailed"));
        return Array.isArray(data.favorites)
          ? data.favorites.map(normalizeFavoriteReference).filter(Boolean) as FavoriteReference[]
          : [];
      }),
      fetch("/api/tryon/reference-templates").then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || t("favorite.templateLoadFailed"));
        return Array.isArray(data.templates)
          ? data.templates.map(normalizeReferenceTemplate).filter(Boolean) as ReferenceTemplate[]
          : [];
      }),
    ])
      .then(([favorites, templates]) => {
        if (cancelled) return;
        setFavoriteReferences(favorites.slice(0, 24));
        setReferenceTemplates(templates.slice(0, 24));
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(getErrorMessage(err, t("favorite.loadFailed")));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingFavoriteReferences(false);
      });

    return () => { cancelled = true; };
  }, [authChecked, isAuthenticated]);

  useEffect(() => {
    const urls = uploadedClothingUrls.filter(Boolean);
    if (!urls.length) {
      lastClothingAnalysisKeyRef.current = "";
      lastAutoAppliedClothingAnalysisKeyRef.current = "";
      lastAutoAppliedAudienceKeyRef.current = "";
      clothingAnalysisSeqRef.current += 1;
      setClothingAnalysis(null);
      setClothingAnalysisSource(null);
      setClothingAnalysisError(null);
      setIsAnalyzingClothing(false);
      setIsLoadingSystemReferences(false);
      setRecommendedSystemReferences(getFallbackSystemReferences().slice(0, 4));
      setAllSystemReferences(getFallbackSystemReferences());
      return;
    }

    const analysisKey = buildClothingAnalysisKey({ urls, clothingMode, clothingRoles, garmentAudience, ageGroup });
    if (lastClothingAnalysisKeyRef.current === analysisKey) return;
    lastClothingAnalysisKeyRef.current = analysisKey;
    const seq = clothingAnalysisSeqRef.current + 1;
    clothingAnalysisSeqRef.current = seq;

    const cachedAnalysis = clothingAnalysisCacheRef.current.get(analysisKey);
    if (cachedAnalysis) {
      if (isCacheableClothingAnalysisEntry(cachedAnalysis)) {
        setClothingAnalysis(cachedAnalysis.analysis);
        setClothingAnalysisSource(cachedAnalysis.source);
        setClothingAnalysisError(cachedAnalysis.error || null);
        setIsAnalyzingClothing(false);
        setIsLoadingSystemReferences(false);
        return;
      }
      clothingAnalysisCacheRef.current.delete(analysisKey);
    }

    const run = async () => {
      setIsAnalyzingClothing(true);
      setIsLoadingSystemReferences(false);
      setClothingAnalysisError(null);
      try {
        let request = clothingAnalysisInflightRef.current.get(analysisKey);
        if (!request) {
          const nextRequest = fetch("/api/tryon/analyze-clothing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clothing_urls: urls,
              clothing_mode: clothingMode,
              clothing_roles: clothingRoles,
              garment_audience: garmentAudience,
              age_group: ageGroup,
            }),
          }).then(async (analysisRes) => {
            const analysisData = await analysisRes.json().catch(() => ({}));
            if (!analysisRes.ok) throw new Error(analysisData.error || t("analysis.clothingFailed"));
            const nextAnalysis = analysisData.analysis as TryOnClothingAnalysis;
            const nextSource: "yunwu" | "cache" | "fallback" = analysisData.source === "fallback"
              ? "fallback"
              : analysisData.cached ? "cache" : "yunwu";
            return {
              analysis: nextAnalysis,
              source: nextSource,
              error: null,
            };
          });
          clothingAnalysisInflightRef.current.set(analysisKey, nextRequest);
          void nextRequest.finally(() => {
            if (clothingAnalysisInflightRef.current.get(analysisKey) === nextRequest) {
              clothingAnalysisInflightRef.current.delete(analysisKey);
            }
          }).catch(() => undefined);
          request = nextRequest;
        }

        const nextEntry = await request;
        if (isCacheableClothingAnalysisEntry(nextEntry)) {
          clothingAnalysisCacheRef.current.set(analysisKey, nextEntry);
        } else {
          clothingAnalysisCacheRef.current.delete(analysisKey);
        }
        if (clothingAnalysisSeqRef.current !== seq) return;
        const nextAnalysis = nextEntry.analysis;
        setClothingAnalysis(nextAnalysis);
        setClothingAnalysisSource(nextEntry.source);
        setClothingAnalysisError(nextEntry.error || null);
        const autoRole = getAutoClothingRoleFromAnalysis(nextAnalysis);
        const autoMode: TryOnClothingMode | null = autoRole ? autoRole === "single" ? "single" : "multi" : null;
        const autoApplyKey = JSON.stringify({ urls, autoRole, autoMode, intimate: isIntimateAnalysis(nextAnalysis) });
        const hasUserSelectedRole = clothingRoles.some((role) => role === "upper" || role === "lower" || role === "single");
        if (!hasUserSelectedRole && urls.length === 1 && autoRole && autoMode && lastAutoAppliedClothingAnalysisKeyRef.current !== autoApplyKey) {
          lastAutoAppliedClothingAnalysisKeyRef.current = autoApplyKey;
          if (autoMode !== clothingMode) setClothingMode(autoMode);
          setPendingClothingRole(autoRole);
          setClothingRoles([autoRole]);
          toast.info(t("analysis.autoRoleDetected", { role: t(ROLE_LABEL_KEYS[autoRole]) }));
        }
        const audienceSuggestion = getVisualAudienceSuggestion(nextAnalysis);
        const hasAudienceSuggestion = Boolean(audienceSuggestion.audience || audienceSuggestion.ageGroup);
        const intimateDetected = isIntimateAnalysis(nextAnalysis);
        if (hasAudienceSuggestion && canApplyVisualAudienceSuggestion(nextEntry.source)) {
          const autoAudienceKey = JSON.stringify({
            urls,
            audience: audienceSuggestion.audience,
            ageGroup: audienceSuggestion.ageGroup,
            source: nextEntry.source,
          });
          const shouldSwitchAudience = Boolean(
            audienceSuggestion.audience &&
            audienceSuggestion.audience !== garmentAudience &&
            !audienceSelectionTouchedRef.current
          );
          const shouldSwitchAge = Boolean(
            audienceSuggestion.ageGroup &&
            audienceSuggestion.ageGroup !== ageGroup &&
            !ageSelectionTouchedRef.current &&
            (!intimateDetected || audienceSuggestion.ageGroup === "adult")
          );
          const hasConflict = Boolean(
            (audienceSuggestion.audience && audienceSuggestion.audience !== garmentAudience) ||
            (audienceSuggestion.ageGroup && audienceSuggestion.ageGroup !== ageGroup)
          );

          if ((shouldSwitchAudience || shouldSwitchAge || hasConflict) && lastAutoAppliedAudienceKeyRef.current !== autoAudienceKey) {
            lastAutoAppliedAudienceKeyRef.current = autoAudienceKey;
            const suggestionLabel = formatVisualAudienceSuggestion(audienceSuggestion.audience, audienceSuggestion.ageGroup);
            if (shouldSwitchAudience && audienceSuggestion.audience) setGarmentAudience(audienceSuggestion.audience);
            if (shouldSwitchAge && audienceSuggestion.ageGroup) setAgeGroup(audienceSuggestion.ageGroup);
            if (shouldSwitchAudience || shouldSwitchAge) {
              toast.info(t("analysis.visualSyncedAudience", { label: suggestionLabel }));
            } else if (hasConflict) {
              toast.info(t("analysis.visualKeptAudience", { label: suggestionLabel }));
            }
          }
        }
        if (intimateDetected && !isIntimateGarment) {
          if (ageGroup !== "adult") {
            setAgeGroup("adult");
            toast.info(t("analysis.intimateDetectedAdult"));
          }
          setIsIntimateGarment(true);
        }
      } catch (err: unknown) {
        if (clothingAnalysisSeqRef.current !== seq) return;
        const message = getErrorMessage(err, t("analysis.clothingFailedContinue"));
        setClothingAnalysis(null);
        setClothingAnalysisSource(null);
        setClothingAnalysisError(message);
        setRecommendedSystemReferences(getFallbackSystemReferences().slice(0, 4));
        setAllSystemReferences(getFallbackSystemReferences());
        if (message && !String(message).includes("请先登录")) { // 匹配服务端返回的登录错误文案
          toast.info(t("analysis.clothingFailedContinue"));
        }
      } finally {
        if (clothingAnalysisSeqRef.current === seq) {
          setIsAnalyzingClothing(false);
          setIsLoadingSystemReferences(false);
        }
      }
    };

    void run();
  }, [uploadedClothingUrls, clothingMode, clothingRoles, garmentAudience, ageGroup, isIntimateGarment]);

  useEffect(() => {
    const urls = effectiveReferenceUrls.filter(Boolean);
    if (!activeReferenceAnalysisKey) {
      lastReferenceAnalysisKeyRef.current = "";
      referenceAnalysisSeqRef.current += 1;
      setReferenceAnalyses((prev) => prev.length ? [] : prev);
      setReferenceAnalysisKey("");
      setIsAnalyzingReferences((prev) => prev ? false : prev);
      setReferenceAnalysisError(null);
      setReferenceAnalysisSource(null);
      return;
    }

    const analysisKey = activeReferenceAnalysisKey;
    if (lastReferenceAnalysisKeyRef.current === analysisKey) return;
    lastReferenceAnalysisKeyRef.current = analysisKey;
    const seq = referenceAnalysisSeqRef.current + 1;
    referenceAnalysisSeqRef.current = seq;
    setReferenceAnalyses((prev) => prev.length ? [] : prev);
    setReferenceAnalysisKey("");
    setReferenceAnalysisSource(null);

    const cachedAnalysis = referenceAnalysisCacheRef.current.get(analysisKey);
    if (cachedAnalysis) {
      if (isCacheableReferenceAnalysisEntry(cachedAnalysis, urls.length)) {
        const cachedAnalyses = alignTryOnReferenceAnalyses(cachedAnalysis.analyses, urls.length);
        setReferenceAnalyses(cachedAnalyses);
        setReferenceAnalysisKey(analysisKey);
        setReferenceAnalysisSource(cachedAnalysis.source);
        setReferenceAnalysisError(cachedAnalysis.error || null);
        setIsAnalyzingReferences(false);
        return;
      }
      referenceAnalysisCacheRef.current.delete(analysisKey);
    }

    const run = async () => {
      setIsAnalyzingReferences(true);
      setReferenceAnalysisError(null);
      try {
        let request = referenceAnalysisInflightRef.current.get(analysisKey);
        if (!request) {
          const nextRequest = fetch("/api/tryon/analyze-references", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reference_urls: urls,
              clothing_mode: clothingMode,
              clothing_roles: clothingRoles,
              garment_audience: garmentAudience,
              age_group: ageGroup,
            }),
          }).then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || t("analysis.referenceFailed"));
            const nextAnalyses = alignTryOnReferenceAnalyses(data.analyses, urls.length);
            const nextSource: "yunwu" | "cache" | "fallback" = data.source === "fallback"
              ? "fallback"
              : data.cached ? "cache" : "yunwu";
            const reasonText = typeof data.reasonText === "string" && data.reasonText.trim()
              ? data.reasonText.trim()
              : null;
            const nextError = nextSource === "fallback" ? reasonText || t("analysis.referenceFallback") : null;
            return {
              analyses: nextAnalyses,
              source: nextSource,
              error: nextError,
              reasonText,
            };
          });
          referenceAnalysisInflightRef.current.set(analysisKey, nextRequest);
          void nextRequest.finally(() => {
            if (referenceAnalysisInflightRef.current.get(analysisKey) === nextRequest) {
              referenceAnalysisInflightRef.current.delete(analysisKey);
            }
          }).catch(() => undefined);
          request = nextRequest;
        }

        const nextEntry = await request;
        if (isCacheableReferenceAnalysisEntry(nextEntry, urls.length)) {
          referenceAnalysisCacheRef.current.set(analysisKey, nextEntry);
        } else {
          referenceAnalysisCacheRef.current.delete(analysisKey);
        }
        if (referenceAnalysisSeqRef.current !== seq) return;
        setReferenceAnalyses(nextEntry.analyses);
        setReferenceAnalysisKey(analysisKey);
        setReferenceAnalysisSource(nextEntry.source);
        setReferenceAnalysisError(nextEntry.error || null);
      } catch (err: unknown) {
        if (referenceAnalysisSeqRef.current !== seq) return;
        const fallbackAnalyses = alignTryOnReferenceAnalyses([], urls.length);
        setReferenceAnalyses(fallbackAnalyses);
        setReferenceAnalysisKey(analysisKey);
        setReferenceAnalysisSource("fallback");
        setReferenceAnalysisError(getErrorMessage(err, t("analysis.referenceFailedContinue")));
      } finally {
        if (referenceAnalysisSeqRef.current === seq) setIsAnalyzingReferences(false);
      }
    };

    void run();
  }, [activeReferenceAnalysisKey, effectiveReferenceUrls, clothingMode, clothingRoles, garmentAudience, ageGroup]);

  useEffect(() => {
    if (!aspects.find(a => a.value === aspectRatio)) setAspectRatio("auto");
    const nextImageSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextImageSizes.includes(imageSize)) setImageSize(nextImageSizes[0]);
  }, [aiModel, aspectRatio, aspects, imageSize]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
    const detail = await takeApplyDetail("tryon");
    const payload = detail?.payload;
    if (cancelled || !payload) return;

    const files = payload.clothingUrls.map((_, index) =>
      new File([], `history-clothing-${index + 1}.jpg`, { type: "image/jpeg" })
    );
    setStoreClothing(files, payload.clothingUrls);
    setUploadedClothingUrls(payload.clothingUrls);
    const historyGarmentDetailGroups = normalizeGarmentDetailGroups(payload.garmentDetailGroups, payload.clothingUrls.length);
    const historyGarmentDetailUrls = historyGarmentDetailGroups.length ? [] : normalizeGarmentDetailUrls(payload.garmentDetailUrls);
    setGarmentDetailGroups(historyGarmentDetailGroups);
    setGarmentDetailUrls(historyGarmentDetailUrls);
    setGarmentDetailEnabled(countGarmentDetailImages(historyGarmentDetailGroups, historyGarmentDetailUrls) > 0);
    const nextClothingMode = normalizeTryOnClothingMode(payload.clothingMode || (payload.clothingUrls.length > 1 ? "multi" : "single"));
    setClothingMode(nextClothingMode);
    const nextClothingRoles = payload.clothingUrls.map((_, index) => normalizeTryOnClothingRole(
      payload.clothingRoles?.[index],
      nextClothingMode === "multi" ? index === 0 ? "upper" : index === 1 ? "lower" : "extra" : "single"
    ));
    setClothingRoles(nextClothingRoles);
    const nextGarmentAudience = normalizeTryOnGarmentAudience(payload.garmentAudience);
    const nextAgeGroup = normalizeTryOnAgeGroup(payload.ageGroup);
    audienceSelectionTouchedRef.current = true;
    ageSelectionTouchedRef.current = true;
    setGarmentAudience(nextGarmentAudience);
    setAgeGroup(nextAgeGroup);
    const historyClothingAnalysis = payload.clothingAnalysis
      ? normalizeTryOnClothingAnalysis(payload.clothingAnalysis)
      : null;
    const historyClothingAnalysisKey = buildClothingAnalysisKey({
      urls: payload.clothingUrls,
      clothingMode: nextClothingMode,
      clothingRoles: nextClothingRoles,
      garmentAudience: nextGarmentAudience,
      ageGroup: nextAgeGroup,
    });
    if (historyClothingAnalysis) {
      lastClothingAnalysisKeyRef.current = historyClothingAnalysisKey;
      clothingAnalysisCacheRef.current.set(historyClothingAnalysisKey, {
        analysis: historyClothingAnalysis,
        source: "history",
        error: null,
      });
      setClothingAnalysis(historyClothingAnalysis);
      setClothingAnalysisSource("history");
      setClothingAnalysisError(null);
      setIsAnalyzingClothing(false);
    } else {
      lastClothingAnalysisKeyRef.current = "";
      setClothingAnalysis(null);
      setClothingAnalysisSource(null);
      setClothingAnalysisError(null);
    }
    if (payload.modelFaceUrl) {
      const presetModel = findPresetModelByUrl(payload.modelFaceUrl);
      if (presetModel) {
        setCustomModelPreview(null);
        setStoreSelectedModel({ ...presetModel, is_preset: true, user_id: null });
      } else {
        setCustomModelPreview(payload.modelFaceUrl);
        setStoreSelectedModel({
          id: "history-model",
          name: t("history.modelName"),
          image_url: payload.modelFaceUrl,
          gender: "female",
          is_preset: false,
          user_id: null,
        });
      }
    } else {
      setCustomModelPreview(null);
      setStoreSelectedModel(null);
    }
    const historyReferenceUrls = getHistoryReferenceUrls(payload);
    const appliedSceneMode = coerceVisibleSceneMode(payload.sceneMode);
    const historyReferenceSource = getHistoryReferenceSource(appliedSceneMode);
    const historyReferences = historyReferenceUrls.map((url, index) => toHistoryReference(url, index, historyReferenceSource));
    setCustomRefUploads([]);
    referenceSelectionTouchedRef.current = historyReferences.length > 0;
    setStoreReferenceImages(appliedSceneMode === "auto_design" ? [] : historyReferences as ReferenceImage[]);
    setSceneMode(appliedSceneMode);
    const historyReferenceAnalyses = alignTryOnReferenceAnalyses(payload.referenceAnalyses, historyReferenceUrls.length);
    const historyReferenceAnalysisKey = buildReferenceAnalysisKey({
      urls: appliedSceneMode === "auto_design" ? [] : historyReferenceUrls,
      clothingMode: nextClothingMode,
      clothingRoles: nextClothingRoles,
      garmentAudience: nextGarmentAudience,
      ageGroup: nextAgeGroup,
    });
    if (appliedSceneMode !== "auto_design" && historyReferenceAnalyses.length) {
      lastReferenceAnalysisKeyRef.current = historyReferenceAnalysisKey;
      referenceAnalysisCacheRef.current.set(historyReferenceAnalysisKey, {
        analyses: historyReferenceAnalyses,
        source: "history",
        error: null,
      });
      setReferenceAnalyses(historyReferenceAnalyses);
      setReferenceAnalysisKey(historyReferenceAnalysisKey);
      setReferenceAnalysisSource("history");
      setReferenceAnalysisError(null);
      setIsAnalyzingReferences(false);
    } else {
      lastReferenceAnalysisKeyRef.current = "";
      setReferenceAnalyses([]);
      setReferenceAnalysisKey("");
      setReferenceAnalysisSource(null);
      setReferenceAnalysisError(null);
    }
    setAutoDesign(normalizeAutoDesignSettings(payload.autoDesign || DEFAULT_AUTO_DESIGN));
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio);
    setImageSize(payload.imageSize);
    setGenCount(payload.genCount);
    setCustomStyle(payload.style || "");
    setPromptOverride(null);
    setStorePromptUsed("");
    setActiveTaskReferences(buildTryOnInputReferences({
      clothingUrls: payload.clothingUrls,
      clothingMode: nextClothingMode,
      clothingRoles: nextClothingRoles,
      referenceUrls: appliedSceneMode === "auto_design" ? [] : historyReferenceUrls,
      modelFaceUrl: payload.modelFaceUrl,
      garmentDetailUrls: historyGarmentDetailUrls,
      garmentDetailGroups: historyGarmentDetailGroups,
    }));
    if (detail.resultUrls.length) {
      setStoreResult(detail.resultUrls);
    } else if (isHistoryApplyRowFailed(detail.row)) {
      setStoreError(getHistoryApplyFailureMessage(detail.row));
    }
    toast.success(t("history.applied"));
    })();
    return () => {
      cancelled = true;
    };
  }, [setStoreClothing, setStoreError, setStorePromptUsed, setStoreReferenceImages, setStoreResult, setStoreSelectedModel]);

  const costPerImage = getCreditCost(aiModel, imageSize, aspectRatio);
  const totalCost = costPerImage * expectedOutputCount;
  // ---- 智能优化提示词 ----
  const handleOptimizePrompt = async () => {
    if (!customStyle.trim()) { toast.error(t("prompt.enterStyleFirst")); return; }
    setOptimizing(true);
    try {
      const res = await fetch("/api/optimize-prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style: customStyle }),
      });
      const data = await res.json();
      if (data.optimized) { setCustomStyle(data.optimized); toast.success(t("prompt.optimized")); }
    } catch { toast.error(t("prompt.optimizeFailed")); }
    setOptimizing(false);
  };

  const applyClothingItems = (items: ClothingItemState[]) => {
    const previousItems = getCurrentClothingItemStates();
    const previousDetailGroups = normalizeGarmentDetailGroups(garmentDetailGroups, uploadedClothingUrls.length);
    const sortedItems = [...items].sort((a, b) => CLOTHING_ROLE_ORDER[a.role] - CLOTHING_ROLE_ORDER[b.role]);
    const nextDetailGroups = sortedItems.flatMap((item, nextIndex) => {
      const previousIndex = previousItems.findIndex((current) => current.url === item.url && current.role === item.role);
      if (previousIndex < 0) return [];
      const urls = previousDetailGroups.find((group) => group.clothingIndex === previousIndex)?.urls || [];
      return urls.length ? [{ clothingIndex: nextIndex, urls }] : [];
    });
    store.setClothing(sortedItems.map((item) => item.file), sortedItems.map((item) => item.preview));
    setUploadedClothingUrls(sortedItems.map((item) => item.url));
    setClothingRoles(sortedItems.map((item) => item.role));
    setGarmentDetailGroups(nextDetailGroups);
    setGarmentDetailUrls([]);
    setPromptOverride(null);
    setStorePromptUsed("");
  };

  const getCurrentClothingItemStates = (): ClothingItemState[] => buildClothingItemStates({
    files: store.clothingFiles,
    previews: store.clothingPreviews,
    urls: uploadedClothingUrls,
    roles: clothingRoles,
    clothingMode,
  });

  const switchClothingMode = (mode: TryOnClothingMode) => {
    if (isUploading) {
      toast.info(t("clothing.uploadingSwitchMode"));
      return;
    }
    if (mode === clothingMode) return;
    setClothingMode(mode);
    setPendingClothingRole(mode === "multi" ? "upper" : "single");
    applyClothingItems([]);
  };

  const openClothingPicker = (role: TryOnClothingRole) => {
    setPendingClothingRole(role);
    fileInputRef.current?.click();
  };

  const applySourceLibraryItem = (item: TryOnSourceLibraryItem) => {
    if (!sourceLibrary.role) return;

    const nextRole = clothingMode === "single" ? "single" : sourceLibrary.role;
    const retainedItems = clothingMode === "single"
      ? []
      : getCurrentClothingItemStates().filter((current) => current.role !== nextRole);
    applyClothingItems([
      ...retainedItems,
      {
        file: createPlaceholderFile(`library-${item.generationId}-${Date.now()}.jpg`),
        preview: item.url,
        url: item.url,
        role: nextRole,
      },
    ]);
    sourceLibrary.close();
    toast.success(t("clothing.libraryAdded", { role: t(ROLE_LABEL_KEYS[nextRole]) || t("clothing.garment") }));
  };

  const applyRuleDemo = (demo: TryOnRuleDemo) => {
    if (isUploading) return;
    const nextMode: TryOnClothingMode = demo.images.length > 1 ? "multi" : "single";
    setClothingMode(nextMode);
    setPendingClothingRole(nextMode === "multi" ? "upper" : "single");
    applyClothingItems(demo.images.map((image) => ({
      file: createPlaceholderFile(`demo-${image.role}.jpg`),
      preview: image.url,
      url: image.url,
      role: image.role,
    })));
    closeRulesPopover();
    toast.success(t("clothing.demoApplied", { title: demo.title }));
  };

  const applyRuleImage = (image: TryOnRuleImage) => {
    if (isUploading) return;
    const nextMode: TryOnClothingMode = image.role === "single" ? "single" : "multi";
    const retainedItems = nextMode === "multi" && clothingMode === "multi"
      ? getCurrentClothingItemStates().filter((current) => current.role !== image.role && current.role !== "single")
      : [];

    setClothingMode(nextMode);
    setPendingClothingRole(image.role === "single" ? "single" : image.role);
    applyClothingItems([
      ...retainedItems,
      {
        file: createPlaceholderFile(`demo-${image.role}.jpg`),
        preview: image.url,
        url: image.url,
        role: image.role,
      },
    ]);
    toast.success(t("clothing.imageApplied", { title: image.title }));
  };

  const applyReferenceExample = (image: { url: string; title: string }) => {
    if (isReferenceUploadBusy) {
      toast.info(t("referenceUploading"));
      return;
    }
    const uploadReferences = allSelectedReferenceImages.filter((item) => referenceBelongsToSceneMode(item, "upload_reference"));
    if (uploadReferences.some((item) => item.url === image.url)) {
      toast.info(t("referenceAlreadyAdded"));
      setSceneMode("upload_reference");
      return;
    }
    if (uploadReferences.length >= MAX_TRYON_REFERENCE_IMAGES) {
      toast.info(t("maxReference", { count: MAX_TRYON_REFERENCE_IMAGES }));
      return;
    }
    setSceneMode("upload_reference");
    setSelectedReferences([
      ...uploadReferences,
      {
        id: `reference-demo-${image.url}`,
        url: image.url,
        label: image.title,
        category: "style",
        is_preset: true,
        user_id: null,
        source: "upload",
      },
    ], { mode: "upload_reference" });
    toast.success(t("clothing.imageApplied", { title: image.title }));
  };

  // ---- 文件处理：选择后立即上传到图床 ----
  const processFiles = async (files: FileList | File[], targetRole: TryOnClothingRole = pendingClothingRole) => {
    if (isUploading) {
      toast.info(t("clothing.uploading"));
      return;
    }
    const arr = Array.from(files);
    if (!arr.length) return;

    const rolePlan: TryOnClothingRole[] = clothingMode === "multi" && arr.length > 1
      ? (["upper", "lower"] as TryOnClothingRole[]).slice(0, arr.length)
      : [clothingMode === "multi" ? targetRole === "lower" ? "lower" : "upper" : "single"];
    const filesToUpload = arr.slice(0, rolePlan.length);

    if (arr.length > filesToUpload.length) {
      toast.info(clothingMode === "multi" ? t("clothing.multiLimit") : t("clothing.singleLimit"));
    }

    setIsUploading(true);
    setUploadingClothingRoles([...new Set(rolePlan.slice(0, filesToUpload.length))]);
    const validItems: { file: File; preview: string; role: TryOnClothingRole }[] = [];

    for (let index = 0; index < filesToUpload.length; index++) {
      const file = filesToUpload[index];
      if (!isLikelyImageFile(file)) { toast.error(t("clothing.notImage", { name: file.name })); continue; }
      if (file.size > MAX_FILE_SIZE) { toast.error(t("clothing.tooLarge", { name: file.name, max: MAX_FILE_SIZE_MB })); continue; }
      validItems.push({ file, preview: createLocalImagePreview(file), role: rolePlan[index] });
    }

    if (validItems.length > 0) {
      toast.info(t("clothing.uploadingFiles", { count: validItems.length }));
      const uploadResults = await Promise.allSettled(validItems.map((item) => uploadImage(item.file)));
      const uploadedItems: ClothingItemState[] = [];

      uploadResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          uploadedItems.push({
            file: validItems[index].file,
            preview: validItems[index].preview,
            url: result.value.url,
            role: validItems[index].role,
          });
        } else {
          const message = result.reason instanceof Error ? result.reason.message : t("common.uploadFailed");
          toast.error(t("clothing.uploadFailedNamed", { name: validItems[index].file.name, message }));
        }
      });

      if (uploadedItems.length > 0) {
        const replaceRoles = new Set(uploadedItems.map((item) => item.role));
        const retainedItems = clothingMode === "single"
          ? []
          : getCurrentClothingItemStates().filter((item) => !replaceRoles.has(item.role));
        applyClothingItems([...retainedItems, ...uploadedItems]);
        toast.success(clothingMode === "multi" ? t("clothing.multiReady") : t("clothing.singleReady"));
      }
    }
    setIsUploading(false);
    setUploadingClothingRoles([]);
  };

  // 删除服装时同步删除已上传的 URL
  const removeClothing = (index: number) => {
    store.removeClothing(index);
    setUploadedClothingUrls(prev => prev.filter((_, i) => i !== index));
    setClothingRoles(prev => prev.filter((_, i) => i !== index));
    setGarmentDetailGroups(prev => normalizeGarmentDetailGroups(prev, uploadedClothingUrls.length)
      .filter((group) => group.clothingIndex !== index)
      .map((group) => ({
        ...group,
        clothingIndex: group.clothingIndex > index ? group.clothingIndex - 1 : group.clothingIndex,
      })));
    setGarmentDetailUrls([]);
    setPromptOverride(null);
    setStorePromptUsed("");
  };

  const toggleGarmentDetails = () => {
    setGarmentDetailEnabled((value) => !value);
    setPromptOverride(null);
    store.setPromptUsed("");
  };

  const handleGarmentDetailFiles = async (files?: FileList | File[], clothingIndex = garmentDetailTargetIndexRef.current) => {
    if (isUploadingGarmentDetails) {
      toast.info(t("garmentDetail.uploading"));
      return;
    }
    if (!uploadedClothingUrls[clothingIndex]) {
      toast.info(t("garmentDetail.needMainImage"));
      return;
    }
    const arr = Array.from(files || []);
    if (!arr.length) return;
    const currentTotal = countGarmentDetailImages(
      normalizeGarmentDetailGroups(garmentDetailGroups, uploadedClothingUrls.length),
      garmentDetailUrls
    );
    const remaining = MAX_GARMENT_DETAIL_IMAGES - currentTotal;
    if (remaining <= 0) {
      toast.info(t("garmentDetail.maxCount", { count: MAX_GARMENT_DETAIL_IMAGES }));
      return;
    }
    const limited = arr.slice(0, remaining);
    if (arr.length > limited.length) {
      toast.info(t("garmentDetail.remainingTruncated", { count: remaining }));
    }
    const validFiles: File[] = [];
    for (const file of limited) {
      if (!isLikelyImageFile(file)) { toast.error(t("clothing.notImage", { name: file.name })); continue; }
      if (file.size > MAX_FILE_SIZE) { toast.error(t("clothing.tooLarge", { name: file.name, max: MAX_FILE_SIZE_MB })); continue; }
      validFiles.push(file);
    }
    if (!validFiles.length) return;

    setIsUploadingGarmentDetails(true);
    toast.info(t("garmentDetail.uploadingFiles", { count: validFiles.length }));
    try {
      const results = await Promise.allSettled(validFiles.map((file) => uploadImage(file)));
      const uploadedUrls: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          uploadedUrls.push(result.value.url);
        } else {
          const message = result.reason instanceof Error ? result.reason.message : t("common.uploadFailed");
          toast.error(t("clothing.uploadFailedNamed", { name: validFiles[index].name, message }));
        }
      });
      if (uploadedUrls.length) {
        setGarmentDetailGroups((prev) => {
          const groups = normalizeGarmentDetailGroups(prev, uploadedClothingUrls.length);
          const next = new Map(groups.map((group) => [group.clothingIndex, [...group.urls]]));
          next.set(clothingIndex, normalizeGarmentDetailUrls([...(next.get(clothingIndex) || []), ...uploadedUrls], MAX_GARMENT_DETAIL_IMAGES));
          return Array.from(next.entries())
            .sort(([a], [b]) => a - b)
            .map(([groupIndex, urls]) => ({ clothingIndex: groupIndex, urls }));
        });
        setGarmentDetailUrls([]);
        setPromptOverride(null);
        store.setPromptUsed("");
        const role = clothingRoles[clothingIndex] || (clothingMode === "multi" ? clothingIndex === 0 ? "upper" : clothingIndex === 1 ? "lower" : "extra" : "single");
        toast.success(t("garmentDetail.added", { owner: getGarmentDetailOwnerLabel(role, clothingIndex), count: uploadedUrls.length }));
      }
    } finally {
      setIsUploadingGarmentDetails(false);
    }
  };

  const removeGarmentDetail = (url: string, clothingIndex?: number) => {
    if (typeof clothingIndex === "number") {
      setGarmentDetailGroups((prev) => normalizeGarmentDetailGroups(prev, uploadedClothingUrls.length)
        .map((group) => group.clothingIndex === clothingIndex
          ? { ...group, urls: group.urls.filter((item) => item !== url) }
          : group)
        .filter((group) => group.urls.length));
    } else {
      setGarmentDetailUrls((prev) => prev.filter((item) => item !== url));
    }
    setPromptOverride(null);
    store.setPromptUsed("");
  };

  const handleCustomModelFile = async (file?: File) => {
    if (!file) return;
    if (!isLikelyImageFile(file)) return toast.error(t("model.pleaseUploadImage"));
    if (file.size > MAX_FILE_SIZE) return toast.error(t("clothing.tooLarge", { name: file.name, max: MAX_FILE_SIZE_MB }));

    const uploadSeq = customModelUploadSeqRef.current + 1;
    customModelUploadSeqRef.current = uploadSeq;
    setIsUploadingCustomModel(true);
    store.setSelectedModel(null);
    setCustomModelPreview(null);
    setPromptOverride(null);
    toast.info(t("model.uploading"));
    try {
      if (customModelUploadSeqRef.current !== uploadSeq) return;
      setCustomModelPreview(createLocalImagePreview(file));
      const result = await uploadImage(file);
      if (customModelUploadSeqRef.current !== uploadSeq) return;
      store.setSelectedModel({ id: "custom", name: t("model.custom"), image_url: result.url, gender: "female", is_preset: false, user_id: null });
      setPromptOverride(null);
      toast.success(t("model.selected"));
    } catch (error) {
      if (customModelUploadSeqRef.current === uploadSeq) {
        setCustomModelPreview(null);
        const message = error instanceof Error ? error.message : t("common.uploadFailed");
        toast.error(t("model.uploadFailed", { message }));
      }
    } finally {
      if (customModelUploadSeqRef.current === uploadSeq) setIsUploadingCustomModel(false);
    }
  };

  const handleCustomModel = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    void handleCustomModelFile(file).finally(() => {
      input.value = "";
    });
  };

  const handleCustomRefFiles = async (files?: FileList | File[]) => {
    if (isUploadingCustomRef) {
      toast.info(t("referenceUploading"));
      return;
    }
    const arr = Array.from(files || []);
    if (!arr.length) return;
    const baseUploadReferences = allSelectedReferenceImages.filter((item) => referenceBelongsToSceneMode(item, "upload_reference"));
    const remaining = MAX_TRYON_REFERENCE_IMAGES - baseUploadReferences.length;
    if (remaining <= 0) {
      toast.info(t("maxReference", { count: MAX_TRYON_REFERENCE_IMAGES }));
      return;
    }
    const limited = arr.slice(0, remaining);
    if (arr.length > limited.length) {
      toast.info(t("referenceRemainingTruncated", { count: remaining }));
    }

    const uploadSeq = customRefUploadSeqRef.current + 1;
    customRefUploadSeqRef.current = uploadSeq;
    if (sceneMode !== "upload_reference") {
      referenceSelectionTouchedRef.current = true;
    }
    setSceneMode("upload_reference");
    resetScenePrompt();

    const uploadItems: Array<{ id: string; file: File; preview: string; label: string }> = [];
    for (const file of limited) {
      if (!isLikelyImageFile(file)) { toast.error(t("clothing.notImage", { name: file.name })); continue; }
      if (file.size > MAX_FILE_SIZE) { toast.error(t("clothing.tooLarge", { name: file.name, max: MAX_FILE_SIZE_MB })); continue; }
      uploadItems.push({
        id: `custom-ref-${Date.now()}-${uploadItems.length}`,
        file,
        preview: createLocalImagePreview(file),
        label: file.name.replace(/\.[^.]+$/, "").slice(0, 24) || t("reference.uploadLabel", { index: baseUploadReferences.length + uploadItems.length + 1 }),
      });
    }
    if (!uploadItems.length) return;

    setCustomRefUploads((prev) => [
      ...prev,
      ...uploadItems.map((item) => ({
        id: item.id,
        preview: item.preview,
        label: item.label,
        status: "uploading" as const,
      })),
    ]);
    toast.info(t("reference.uploadingFiles", { count: uploadItems.length }));

    const results = await mapWithConcurrency(
      uploadItems,
      TRYON_REFERENCE_UPLOAD_CONCURRENCY,
      async (upload) => {
        try {
          const result = await uploadImage(upload.file);
          if (customRefUploadSeqRef.current === uploadSeq) {
            setCustomRefUploads((prev) => prev.map((item) => item.id === upload.id
              ? { ...item, status: "ready" as const, url: result.url }
              : item
            ));
          }
          return { status: "fulfilled" as const, upload, url: result.url };
        } catch (error) {
          const message = error instanceof Error ? error.message : t("common.uploadFailed");
          if (customRefUploadSeqRef.current === uploadSeq) {
            setCustomRefUploads((prev) => prev.map((item) => item.id === upload.id
              ? { ...item, status: "error" as const, error: message }
              : item
            ));
          }
          return { status: "rejected" as const, upload, reason: error };
        }
      }
    );
    if (customRefUploadSeqRef.current !== uploadSeq) return;

    const readyRefs: SelectedReferenceImage[] = results.flatMap((result) => {
      if (result.status !== "fulfilled") return [];
      return [{
        id: result.upload.id,
        url: result.url,
        label: result.upload.label,
        category: "style",
        is_preset: false,
        user_id: null,
        source: "upload",
      }];
    });

    if (readyRefs.length) {
      const currentUploadReferences = uniqueReferenceImages(
        ((useTryOnStore.getState().referenceImages || []) as SelectedReferenceImage[])
          .filter((item) => referenceBelongsToSceneMode(item, "upload_reference"))
      );
      setSelectedReferences(
        uniqueReferenceImages([...currentUploadReferences, ...readyRefs]),
        { mode: "upload_reference" }
      );
      toast.success(t("reference.added", { count: readyRefs.length }));
    }
    const failedCount = results.filter((item) => item.status === "rejected").length;
    if (failedCount) {
      const firstFailure = results.find((item) => item.status === "rejected");
      const message = firstFailure?.status === "rejected" && firstFailure.reason instanceof Error
        ? firstFailure.reason.message
        : t("common.retry");
      toast.error(t("reference.uploadFailedCount", { count: failedCount, message }));
    }
  };

  const handleCustomRef = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = input.files;
    void handleCustomRefFiles(files || undefined).finally(() => {
      input.value = "";
    });
  };

  // ---- 生成（识图 → 生成提示词 → 生成图片） ----
  const refreshTaskQueue = useCallback(() => {
    taskQueue.refresh();
  }, [taskQueue]);

  const removeTaskQueueItem = useCallback((taskId: string) => {
    taskQueue.removeTask(taskId);
  }, [taskQueue]);

  const watchGeneration = useCallback(async (
    generationId: string,
    expectedCount: number,
    context?: { retryResultIndex?: number | null; previousResultUrls?: string[] }
  ) => {
    if (watchedGenerationIdsRef.current.has(generationId)) return;
    const globalWatcher = activeTryOnStatusWatchers.get(generationId);
    if (globalWatcher && !globalWatcher.signal.aborted) return;

    const watcherController = new AbortController();
    activeTryOnStatusWatchers.set(generationId, watcherController);
    statusWatcherControllersRef.current.set(generationId, watcherController);
    watchedGenerationIdsRef.current.add(generationId);
    const retryResultIndex = normalizeRetryResultIndex(context?.retryResultIndex);
    const retryPreviousResultUrls = retryResultIndex !== null ? context?.previousResultUrls || [] : [];
    let attempts = 0;
    const startedAt = Date.now();
    let lastQueueRefreshAt = Date.now();
    const updateActiveTask = (patch: Partial<TaskQueueItem>) => {
      const updatedAt = patch.updatedAt ?? new Date().toISOString();
      taskQueue.patchTask(generationId, { ...patch, updatedAt });
      setActiveQueueTask((prev) => {
        if (prev?.id !== generationId) return prev;
        return { ...prev, ...patch, updatedAt };
      });
    };

    try {
      const pollTimeoutMs = getTryOnStatusPollTimeoutMs(expectedCount);
      while (!watcherController.signal.aborted && Date.now() - startedAt < pollTimeoutMs) {
        try {
          await waitForTryOnStatusPoll(attempts, watcherController.signal);
        } catch (error) {
          if (watcherController.signal.aborted || isAbortLikeError(error)) return;
          throw error;
        }
        if (watcherController.signal.aborted) return;
        if (typeof document !== "undefined" && document.visibilityState === "hidden") continue;
        attempts++;

        const isActive = activeGenerationRef.current === generationId;
        try {
          const pollRes = await fetchTryOnGenerationStatus(
            generationId,
            watcherController.signal,
            TRYON_STATUS_FETCH_TIMEOUT_MS
          );
          if (!pollRes.ok) continue;

          const pollData = await pollRes.json();
          if (pollData.status === "processing_tryon" || pollData.status === "processing" || pollData.status === "pending") {
            const partialResultUrls = mergeRetryResultUrls(
              retryPreviousResultUrls,
              retryResultIndex,
              Array.isArray(pollData.result_urls) ? pollData.result_urls : [],
              expectedCount
            );
            const partialResultCount = partialResultUrls.filter(Boolean).length;
            const elapsedSeconds = Math.max(0, (Date.now() - startedAt) / 1000);
            const progress = Math.min(
              Math.max(Number(pollData.progress) || 0, 25 + elapsedSeconds * 0.6),
              99
            );
            if (isActive) {
              store.updateProgress(progress);
              if (partialResultUrls.length) store.setPartialResult(partialResultUrls);
            }
            updateActiveTask({
              status: "processing_tryon",
              statusGroup: "running",
              progress,
              resultCount: partialResultCount,
              ...(partialResultCount ? {
                resultThumbnails: partialResultUrls,
                thumbnails: partialResultUrls.filter(Boolean).slice(0, 2),
              } : {}),
            });
            if (Date.now() - lastQueueRefreshAt >= TRYON_STATUS_QUEUE_REFRESH_MS) {
              lastQueueRefreshAt = Date.now();
              refreshTaskQueue();
            }
            continue;
          }

          if (pollData.status === "completed") {
            const resultUrls = mergeRetryResultUrls(
              retryPreviousResultUrls,
              retryResultIndex,
              Array.isArray(pollData.result_urls) ? pollData.result_urls : [],
              expectedCount
            );
            const resultCount = resultUrls.filter(Boolean).length;
            const expectedResultCount = retryResultIndex !== null
              ? expectedCount
              : Math.max(Number(pollData.expected_count) || expectedCount, resultCount || 1);
            const partialFailure = pollData.partial_failure && typeof pollData.partial_failure === "object"
              ? pollData.partial_failure as { message?: unknown }
              : null;
            const rawCompletedError = String(pollData.error || partialFailure?.message || "");
            const completedError = rawCompletedError ? summarizeGenerationError(rawCompletedError) : "";
            if (isActive) {
              store.updateProgress(100);
              store.setResult(resultUrls);
              toast.success(t("generate.completed"));
              notifyGenerationComplete({
                title: t("generate.doneTitle"),
                body: t("generate.doneBody"),
                url: "/history",
              });
            }
            if (completedError) void refreshCredits();
            updateActiveTask({
              status: "completed",
              statusGroup: "completed",
              progress: 100,
              error: completedError,
              resultCount,
              expectedCount: expectedResultCount,
              resultThumbnails: resultUrls,
              thumbnails: resultUrls.filter(Boolean).slice(0, 2),
              completedAt: new Date().toISOString(),
            });
            refreshTaskQueue();
            return;
          }

          if (pollData.status === "failed") {
            const message = summarizeGenerationError(pollData.error || t("generate.failed"));
            if (isActive) {
              store.setError(message);
              toast.error(message);
            }
            void refreshCredits();
            updateActiveTask({
              status: "failed",
              statusGroup: "failed",
              error: message,
              progress: 100,
            });
            refreshTaskQueue();
            return;
          }
        } catch (error) {
          if (watcherController.signal.aborted || isAbortLikeError(error)) return;
          // Network blips are tolerated during polling.
        }
      }

      if (!watcherController.signal.aborted && activeGenerationRef.current === generationId) {
        updateActiveTask({
          status: "processing_delayed",
          statusGroup: "running",
          error: "",
          progress: 99,
        });
        store.updateProgress(99);
        toast.info(t("generate.delayed"));
      }
      if (!watcherController.signal.aborted) refreshTaskQueue();
    } finally {
      watchedGenerationIdsRef.current.delete(generationId);
      if (statusWatcherControllersRef.current.get(generationId) === watcherController) {
        statusWatcherControllersRef.current.delete(generationId);
      }
      if (activeTryOnStatusWatchers.get(generationId) === watcherController) {
        activeTryOnStatusWatchers.delete(generationId);
      }
    }
  }, [refreshCredits, refreshTaskQueue, store, taskQueue]);

  useEffect(() => {
    if (!syncedActiveQueueTask || syncedActiveQueueTask.id !== activeQueueTask?.id) return;

    const queueResultUrls = safeTaskQueueUrls(syncedActiveQueueTask.resultThumbnails);
    const queueExpectedCount = clampTaskExpectedCount(
      syncedActiveQueueTask,
      1,
      MAX_TRYON_OUTPUT_IMAGES,
      expectedOutputCount || genCount
    );
    const queueHasExpectedResults = queueResultUrls.length >= queueExpectedCount;
    const effectiveSyncedActiveQueueTask = queueHasExpectedResults && isTaskRunning(syncedActiveQueueTask)
      ? {
        ...syncedActiveQueueTask,
        status: "completed",
        statusGroup: "completed" as const,
        progress: 100,
        resultCount: Math.max(syncedActiveQueueTask.resultCount, queueResultUrls.length),
        completedAt: syncedActiveQueueTask.completedAt || new Date().toISOString(),
      }
      : syncedActiveQueueTask;

    setActiveQueueTask((prev) => {
      if (!prev || prev.id !== syncedActiveQueueTask.id) return prev;
      if (getTaskPreviewSyncSignature(prev) === getTaskPreviewSyncSignature(effectiveSyncedActiveQueueTask)) return prev;
      return effectiveSyncedActiveQueueTask;
    });

    const currentResultUrls = safeTaskQueueUrls(store.resultUrls);
    const resultsChanged = !areOrderedUrlsEqual(queueResultUrls, currentResultUrls);
    const completedWithResults = effectiveSyncedActiveQueueTask.statusGroup === "completed" && queueResultUrls.length > 0;

    if (completedWithResults && (store.isGenerating || resultsChanged)) {
      store.setResult(queueResultUrls);
    } else if (
      queueResultUrls.length > 0 &&
      resultsChanged &&
      (effectiveSyncedActiveQueueTask.statusGroup === "running" || effectiveSyncedActiveQueueTask.statusGroup === "queued")
    ) {
      store.setPartialResult(queueResultUrls);
    }

    if (completedWithResults || effectiveSyncedActiveQueueTask.statusGroup === "failed") {
      if (activeGenerationRef.current === syncedActiveQueueTask.id) {
        activeGenerationRef.current = null;
      }
      const controller = statusWatcherControllersRef.current.get(syncedActiveQueueTask.id);
      controller?.abort();
    }

    if (effectiveSyncedActiveQueueTask.statusGroup === "failed" && store.isGenerating) {
      store.setError(syncedActiveQueueTask.error || t("generate.taskFailedRetry"));
    }
  }, [
    activeQueueTask?.id,
    expectedOutputCount,
    genCount,
    store,
    store.isGenerating,
    store.resultUrls,
    syncedActiveQueueTask,
  ]);

  const handleContinueCreate = useCallback(() => {
    cancelTaskSelection();
    const pendingSubmitId = generationSubmitRef.current?.id || "";
    generationSubmitRef.current?.controller.abort();
    statusWatcherControllersRef.current.forEach((controller) => controller.abort());
    statusWatcherControllersRef.current.clear();
    if (pendingSubmitId.startsWith("local-")) removeTaskQueueItem(pendingSubmitId);
    generationSubmitRef.current = null;
    activeGenerationRef.current = null;
    customModelUploadSeqRef.current += 1;
    customRefUploadSeqRef.current += 1;
    clothingAnalysisSeqRef.current += 1;
    referenceAnalysisSeqRef.current += 1;
    referenceSelectionTouchedRef.current = false;
    audienceSelectionTouchedRef.current = false;
    ageSelectionTouchedRef.current = false;
    lastClothingAnalysisKeyRef.current = "";
    lastAutoAppliedAudienceKeyRef.current = "";
    lastReferenceAnalysisKeyRef.current = "";
    setActiveQueueTask(null);
    setIsSubmitting(false);
    setIsUploadingCustomModel(false);
    setIsUploadingGarmentDetails(false);
    setGarmentDetailEnabled(false);
    setGarmentDetailUrls([]);
    setIsDraggingGarmentDetails(false);
    setUploadedClothingUrls([]);
    setClothingRoles([]);
    setClothingAnalysis(null);
    setClothingAnalysisSource(null);
    setClothingAnalysisError(null);
    setIsAnalyzingClothing(false);
    setReferenceAnalyses([]);
    setReferenceAnalysisSource(null);
    setReferenceAnalysisError(null);
    setIsAnalyzingReferences(false);
    setIsLoadingSystemReferences(false);
    setRecommendedSystemReferences(getFallbackSystemReferences().slice(0, 4));
    setAllSystemReferences(getFallbackSystemReferences());
    setCustomModelPreview(null);
    setCustomRefUploads([]);
    setPromptOverride(null);
    setActiveTaskReferences([]);
    setSceneMode("upload_reference");
    setAutoDesign(DEFAULT_AUTO_DESIGN);
    setGarmentDetailGroups([]);
    setGarmentDetailUrls([]);
    setGarmentDetailEnabled(false);
    if (garmentDetailInputRef.current) garmentDetailInputRef.current.value = "";
    store.reset();
  }, [cancelTaskSelection, removeTaskQueueItem, store]);

  const applyTryOnHistoryPayload = useCallback((
    payload: TryOnHistoryPayload,
    options?: { resultUrls?: string[]; selectedTask?: TaskQueueItem | null; errorMessage?: string | null; silent?: boolean }
  ) => {
    customModelUploadSeqRef.current += 1;
    customRefUploadSeqRef.current += 1;
    setIsUploadingCustomModel(false);
    setCustomRefUploads([]);

    const files = payload.clothingUrls.map((_, index) =>
      new File([], `history-clothing-${index + 1}.jpg`, { type: "image/jpeg" })
    );
    store.setClothing(files, payload.clothingUrls);
    setUploadedClothingUrls(payload.clothingUrls);
    const historyGarmentDetailGroups = normalizeGarmentDetailGroups(payload.garmentDetailGroups, payload.clothingUrls.length);
    const historyGarmentDetailUrls = historyGarmentDetailGroups.length ? [] : normalizeGarmentDetailUrls(payload.garmentDetailUrls);
    setGarmentDetailGroups(historyGarmentDetailGroups);
    setGarmentDetailUrls(historyGarmentDetailUrls);
    setGarmentDetailEnabled(countGarmentDetailImages(historyGarmentDetailGroups, historyGarmentDetailUrls) > 0);

    const nextClothingMode = normalizeTryOnClothingMode(
      payload.clothingMode || (payload.clothingUrls.length > 1 ? "multi" : "single")
    );
    setClothingMode(nextClothingMode);
    const nextClothingRoles = payload.clothingUrls.map((_, index) => normalizeTryOnClothingRole(
      payload.clothingRoles?.[index],
      nextClothingMode === "multi" ? index === 0 ? "upper" : index === 1 ? "lower" : "extra" : "single"
    ));
    setClothingRoles(nextClothingRoles);
    const nextGarmentAudience = normalizeTryOnGarmentAudience(payload.garmentAudience);
    const nextAgeGroup = normalizeTryOnAgeGroup(payload.ageGroup);
    audienceSelectionTouchedRef.current = true;
    ageSelectionTouchedRef.current = true;
    setGarmentAudience(nextGarmentAudience);
    setAgeGroup(nextAgeGroup);
    const historyClothingAnalysis = payload.clothingAnalysis
      ? normalizeTryOnClothingAnalysis(payload.clothingAnalysis)
      : null;
    const historyClothingAnalysisKey = buildClothingAnalysisKey({
      urls: payload.clothingUrls,
      clothingMode: nextClothingMode,
      clothingRoles: nextClothingRoles,
      garmentAudience: nextGarmentAudience,
      ageGroup: nextAgeGroup,
    });
    if (historyClothingAnalysis) {
      lastClothingAnalysisKeyRef.current = historyClothingAnalysisKey;
      clothingAnalysisCacheRef.current.set(historyClothingAnalysisKey, {
        analysis: historyClothingAnalysis,
        source: "history",
        error: null,
      });
      setClothingAnalysis(historyClothingAnalysis);
      setClothingAnalysisSource("history");
      setClothingAnalysisError(null);
      setIsAnalyzingClothing(false);
    } else {
      lastClothingAnalysisKeyRef.current = "";
      setClothingAnalysis(null);
      setClothingAnalysisSource(null);
      setClothingAnalysisError(null);
    }

    if (payload.modelFaceUrl) {
      const presetModel = findPresetModelByUrl(payload.modelFaceUrl);
      if (presetModel) {
        setCustomModelPreview(null);
        store.setSelectedModel({ ...presetModel, is_preset: true, user_id: null });
      } else {
        setCustomModelPreview(payload.modelFaceUrl);
        store.setSelectedModel({
          id: "history-model",
          name: t("history.modelName"),
          image_url: payload.modelFaceUrl,
          gender: "female",
          is_preset: false,
          user_id: null,
        });
      }
    } else {
      setCustomModelPreview(null);
      store.setSelectedModel(null);
    }

    const historyReferenceUrls = getHistoryReferenceUrls(payload);
    const appliedSceneMode = coerceVisibleSceneMode(payload.sceneMode);
    const historyReferenceSource = getHistoryReferenceSource(appliedSceneMode);
    const historyReferences = historyReferenceUrls.map((url, index) => toHistoryReference(url, index, historyReferenceSource));
    setCustomRefUploads([]);
    referenceSelectionTouchedRef.current = historyReferences.length > 0;
    store.setReferenceImages(appliedSceneMode === "auto_design" ? [] : historyReferences as ReferenceImage[]);

    setSceneMode(appliedSceneMode);
    const historyReferenceAnalyses = alignTryOnReferenceAnalyses(payload.referenceAnalyses, historyReferenceUrls.length);
    const historyReferenceAnalysisKey = buildReferenceAnalysisKey({
      urls: appliedSceneMode === "auto_design" ? [] : historyReferenceUrls,
      clothingMode: nextClothingMode,
      clothingRoles: nextClothingRoles,
      garmentAudience: nextGarmentAudience,
      ageGroup: nextAgeGroup,
    });
    if (appliedSceneMode !== "auto_design" && historyReferenceAnalyses.length) {
      lastReferenceAnalysisKeyRef.current = historyReferenceAnalysisKey;
      referenceAnalysisCacheRef.current.set(historyReferenceAnalysisKey, {
        analyses: historyReferenceAnalyses,
        source: "history",
        error: null,
      });
      setReferenceAnalyses(historyReferenceAnalyses);
      setReferenceAnalysisKey(historyReferenceAnalysisKey);
      setReferenceAnalysisSource("history");
      setReferenceAnalysisError(null);
      setIsAnalyzingReferences(false);
    } else {
      lastReferenceAnalysisKeyRef.current = "";
      setReferenceAnalyses([]);
      setReferenceAnalysisKey("");
      setReferenceAnalysisSource(null);
      setReferenceAnalysisError(null);
    }
    setAutoDesign(normalizeAutoDesignSettings(payload.autoDesign || DEFAULT_AUTO_DESIGN));
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio);
    setImageSize(payload.imageSize);
    setGenCount(payload.genCount);
    setCustomStyle(payload.style || "");
    setPromptOverride(null);
    store.setPromptUsed("");
    setActiveTaskReferences(buildTryOnInputReferences({
      clothingUrls: payload.clothingUrls,
      clothingMode: nextClothingMode,
      clothingRoles: nextClothingRoles,
      referenceUrls: appliedSceneMode === "auto_design" ? [] : historyReferenceUrls,
      modelFaceUrl: payload.modelFaceUrl,
      garmentDetailUrls: historyGarmentDetailUrls,
      garmentDetailGroups: historyGarmentDetailGroups,
    }));
    store.setResult(options?.resultUrls || []);
    store.setError(options?.errorMessage || null);
    activeGenerationRef.current = null;
    setActiveQueueTask(options?.selectedTask ?? null);
    if (!options?.silent) toast.success(t("history.applied"));
  }, [store]);

  const handleTaskSelect = useCallback(async (item: TaskQueueItem, railSelection?: TaskSelectionSession) => {
    const selection = beginTaskSelection(item.id, railSelection?.reason ?? "manual");
    setActiveTaskReferences([]);

    // 其他模块的任务：不套用本页状态，直接跳转到任务所属模块页面
    if (item.module && item.module !== "tryon") {
      if (item.applyUrl) {
        router.push(item.applyUrl);
      } else {
        toast.info(t("task.notTryonModule"));
      }
      selection.finish();
      return;
    }

    if (isTaskRunning(item)) {
      const expectedCount = clampTaskExpectedCount(item, 1, MAX_TRYON_OUTPUT_IMAGES);
      const partialResultUrls = safeTaskQueueUrls(item.resultThumbnails);
      const progress = Math.min(Math.max(Math.round(Number(item.progress) || 10), 1), 99);
      activeGenerationRef.current = item.id;
      setActiveQueueTask(item);
      setGenCount(Math.min(Math.max(expectedCount, 1), 4));
      store.startGeneration();
      if (partialResultUrls.length) store.setPartialResult(partialResultUrls);
      store.updateProgress(progress);
      try {
        const detail = await fetchHistoryApplyDetail(item.id, "tryon", selection.signal);
        if (!selection.isCurrent()) return;
        const nextExpectedCount = clampTaskExpectedCount(
          { ...item, expectedCount: getTryOnHistoryExpectedCount(detail.payload) },
          1,
          MAX_TRYON_OUTPUT_IMAGES,
          expectedCount
        );
        const nextResultUrls = detail.resultUrls.length ? detail.resultUrls : partialResultUrls;
        applyTryOnHistoryPayload(detail.payload, {
          resultUrls: nextResultUrls,
          selectedTask: item,
          silent: true,
        });
        activeGenerationRef.current = item.id;
        setActiveQueueTask(item);
        store.startGeneration();
        if (nextResultUrls.length) store.setPartialResult(nextResultUrls);
        store.updateProgress(progress);
        void watchGeneration(item.id, nextExpectedCount);
      } catch {
        if (selection.signal.aborted || !selection.isCurrent()) return;
        void watchGeneration(item.id, expectedCount);
      } finally {
        selection.finish();
      }
      return;
    }

    if (item.statusGroup === "completed" || item.statusGroup === "failed") {
      const isFailedTask = item.statusGroup === "failed";
      if (item.module === "tryon") {
        const resultThumbnails = safeTaskQueueUrls(item.resultThumbnails);
        const thumbnails = safeTaskQueueUrls(item.thumbnails);
        const resultUrls = resultThumbnails.length ? resultThumbnails : isFailedTask ? [] : thumbnails;
        const errorMessage = isFailedTask ? item.error || t("generate.taskFailedRetry") : null;
        try {
          const detail = await fetchHistoryApplyDetail(item.id, "tryon", selection.signal);
          if (!selection.isCurrent()) return;
          activeGenerationRef.current = null;
          applyTryOnHistoryPayload(detail.payload, {
            resultUrls: detail.resultUrls.length ? detail.resultUrls : resultUrls,
            selectedTask: item,
            errorMessage: isHistoryApplyRowFailed(detail.row)
              ? getHistoryApplyFailureMessage(detail.row, errorMessage || t("generate.taskFailedRetry"))
              : errorMessage,
            silent: selection.reason === "restore",
          });
        } catch (err: unknown) {
          if (selection.signal.aborted || !selection.isCurrent()) return;
          toast.error(getErrorMessage(err, t("history.loadFailed")));
        } finally {
          selection.finish();
        }
        return;
      }

      if (item.applyUrl) {
        router.push(item.applyUrl);
      } else if (isFailedTask) {
        activeGenerationRef.current = null;
        setActiveQueueTask(item);
        store.setResult([]);
        store.setError(item.error || t("generate.taskFailedRetry"));
      }
      selection.finish();
      return;
    }
  }, [applyTryOnHistoryPayload, beginTaskSelection, router, store, watchGeneration]);

  const handleGenerate = async (promptForRun?: string, options: TryOnGenerateOptions = {}) => {
    if (isSubmitting || generationSubmitRef.current) return;
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("common.loginRequired"));
      router.push("/login");
      return;
    }
    const runGenCount = Math.min(Math.max(Number(options.genCountOverride ?? genCount) || 1, 1), 4);
    const runReferenceUrls = sceneMode === "auto_design"
      ? []
      : Array.from(new Set((options.referenceUrlsOverride ?? effectiveReferenceUrls).filter((url): url is string => typeof url === "string" && url.trim().length > 0)));
    const runReferenceAnalyses = options.referenceAnalysesOverride ?? referenceAnalyses;
    const runExpectedCount = Math.max(1, options.expectedCountOverride ?? (runGenCount * (sceneMode === "auto_design" ? 1 : runReferenceUrls.length || 1)));
    const retryResultIndex = normalizeRetryResultIndex(options.retryResultIndex);
    const retryPreviousResultUrls = retryResultIndex !== null ? store.resultUrls : [];
    const displayExpectedCount = getRetryDisplayExpectedCount({
      retryIndex: retryResultIndex,
      currentExpectedCount: activeResultExpectedCount,
      previousUrls: retryPreviousResultUrls,
      fallbackExpectedCount: runExpectedCount,
    });
    const runTotalCost = costPerImage * runExpectedCount;
    if (isUploading) {
      toast.info(t("clothing.uploadingWait"));
      return;
    }
    if (!uploadedClothingUrls.length) { toast.error(t("clothing.pleaseUpload")); return; }
    if (isAuxiliaryUploading || isReferenceUploadPending || isModelUploadPending) {
      const pendingLabel = isModelUploadBusy ? t("common.modelImage") : isUploadingGarmentDetails ? t("common.garmentDetailImage") : t("common.referenceImage");
      toast.info(t("generate.auxUploadingWait", { label: pendingLabel }));
      return;
    }
    if (sceneMode !== "auto_design" && !runReferenceUrls.length) {
      toast.error(t("reference.selectAtLeast"));
      return;
    }
    if (
      sceneMode !== "auto_design"
      && !options.referenceUrlsOverride
      && (
        referenceAnalysisKey !== activeReferenceAnalysisKey
        || referenceAnalyses.length !== effectiveReferenceUrls.length
      )
    ) {
      toast.info(t("reference.analyzingWait"));
      return;
    }
    if (isIntimateGarment && ageGroup !== "adult") {
      toast.error(t("intimateAdultOnly"));
      return;
    }
    if (credits !== null && credits < runTotalCost) {
      showInsufficientCreditsToast({ required: runTotalCost, balance: credits, onRecharge: () => router.push("/pricing") });
      return;
    }

    setIsSubmitting(true);
    cancelTaskSelection();
    const provisionalTaskId = `local-tryon-${Date.now()}`;
    const submitController = new AbortController();
    generationSubmitRef.current = { id: provisionalTaskId, controller: submitController };
    const isCurrentSubmit = () =>
      generationSubmitRef.current?.id === provisionalTaskId && !submitController.signal.aborted;
    const submittingAt = new Date().toISOString();
    const taskInputReferences = buildTryOnInputReferences({
      clothingUrls: uploadedClothingUrls,
      clothingMode,
      clothingRoles,
      referenceUrls: runReferenceUrls,
      modelFaceUrl: store.selectedModel?.image_url,
      garmentDetailUrls: activeUnassignedGarmentDetailUrls,
      garmentDetailGroups: activeGarmentDetailGroups,
    });
    const taskInputThumbnails = taskInputReferences.map((item) => item.url);
    setActiveTaskReferences(taskInputReferences);
    const provisionalTask = taskQueue.startTask({
      id: provisionalTaskId,
      status: "submitting",
      statusGroup: "queued",
      time: "0:00",
      createdAt: submittingAt,
      updatedAt: submittingAt,
      completedAt: null,
      error: "",
      progress: 5,
      expectedCount: displayExpectedCount,
      resultCount: 0,
      inputThumbnails: taskInputThumbnails,
      resultThumbnails: [],
      thumbnails: taskInputThumbnails.slice(0, 2),
      applyUrl: "",
    });
    setActiveQueueTask(provisionalTask);
    store.startGeneration();
    const retryPendingResultUrls = buildRetryPendingResultUrls(retryPreviousResultUrls, retryResultIndex, displayExpectedCount);
    if (retryPendingResultUrls.length) store.setPartialResult(retryPendingResultUrls);

    try {
      // ---- Step 1: 构建稳定的编号提示词 ----
      store.updateProgress(5);

      let finalStyle = stylePrompt || "";
      let usedAiPrompt = false;
      const activePromptOverride = typeof promptForRun === "string" ? promptForRun : promptOverride;
      if (activePromptOverride?.trim()) {
        finalStyle = activePromptOverride.trim();
        usedAiPrompt = true;
        store.setPromptUsed(finalStyle);
      }
      if (process.env.NODE_ENV === "development") {
        console.info("[generate] 跳过自动图片分析，使用当前提示词"); // 开发日志，非用户可见
      }

      store.updateProgress(15);
      toast.info(options.toastMessage || t("generate.submitting"));

      // ---- Step 2: 调用生成 API ----
      const res = await fetch("/api/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: submitController.signal,
        body: JSON.stringify({
          clothing_urls: uploadedClothingUrls,
          clothing_mode: clothingMode,
          clothing_roles: clothingRoles,
          clothing_analysis: clothingAnalysis,
          garment_detail_urls: activeUnassignedGarmentDetailUrls,
          garment_detail_groups: activeGarmentDetailGroups,
          garment_audience: garmentAudience,
          age_group: ageGroup,
          garment_category: isIntimateGarment ? "intimate" : "regular",
          is_intimate_garment: isIntimateGarment,
          model_face_url: store.selectedModel?.image_url,
          reference_url: runReferenceUrls[0] || null,
          reference_urls: runReferenceUrls,
          reference_analyses: alignTryOnReferenceAnalyses(runReferenceAnalyses, runReferenceUrls.length),
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          style: usedAiPrompt ? undefined : finalStyle,
          raw_prompt: usedAiPrompt ? finalStyle : undefined,
          gen_count: runGenCount,
          scene_mode: sceneMode,
          auto_design: sceneMode === "auto_design" ? resolvedAutoDesign : undefined,
        }),
      });
      if (!isCurrentSubmit()) return;

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        if (!isCurrentSubmit()) return;
        if (res.status === 401) {
          await refreshAuth();
          if (!isCurrentSubmit()) return;
          store.setError(null);
          setActiveQueueTask((prev) => prev?.id === provisionalTaskId ? null : prev);
          removeTaskQueueItem(provisionalTaskId);
          setIsSubmitting(false);
          generationSubmitRef.current = null;
          router.push("/login");
          return;
        }
        if (res.status === 402) {
          const nextCredits = e.balance ?? 0;
          setCredits(nextCredits);
          if (userId) setCachedProfileCredits(userId, nextCredits);
        }
        throw new Error(e.error || t("generate.failed"));
      }

      const { generation_id, credits_remaining } = await res.json();
      if (!isCurrentSubmit()) return;
      if (credits_remaining !== undefined) {
        setCredits(credits_remaining);
        if (userId) setCachedProfileCredits(userId, credits_remaining);
      }
      store.updateProgress(25);

      if (!generation_id) throw new Error(t("generate.submitFailed"));
      const now = new Date().toISOString();
      const optimisticTask: TaskQueueItem = {
        id: generation_id,
        module: "tryon",
        title: t("tryon.title"),
        status: "processing_tryon",
        statusGroup: "running",
        time: "0:00",
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        error: "",
        progress: 25,
        expectedCount: displayExpectedCount,
        resultCount: 0,
        inputThumbnails: taskInputThumbnails,
        resultThumbnails: [],
        thumbnails: taskInputThumbnails.slice(0, 2),
        applyUrl: `/create?apply=${encodeURIComponent(generation_id)}`,
      };

      activeGenerationRef.current = generation_id;
      setActiveQueueTask(optimisticTask);
      taskQueue.replaceWithServerTask(provisionalTaskId, optimisticTask);
      refreshTaskQueue();
      toast.success(t("generate.submitted"));
      setIsSubmitting(false);
      generationSubmitRef.current = null;
      void watchGeneration(generation_id, displayExpectedCount, {
        retryResultIndex,
        previousResultUrls: retryPreviousResultUrls,
      });
      return;
    } catch (err: unknown) {
      if (isAbortLikeError(err) || !isCurrentSubmit()) return;
      const message = summarizeGenerationError(getErrorMessage(err, t("generate.failed")));
      store.setError(message);
      setActiveQueueTask((prev) => prev?.id === provisionalTaskId ? null : prev);
      removeTaskQueueItem(provisionalTaskId);
      toast.error(message);
      setIsSubmitting(false);
      generationSubmitRef.current = null;
    }
  };

  const displayedResultUrls = store.resultUrls.filter(Boolean);
  const activeResultExpectedCount = activeQueueTask
    ? clampTaskExpectedCount(activeQueueTask, 1, MAX_TRYON_OUTPUT_IMAGES, expectedOutputCount || genCount)
    : expectedOutputCount || genCount;
  const hasCompletedPartialResults = Boolean(
    activeQueueTask?.statusGroup === "completed"
    && activeResultExpectedCount > displayedResultUrls.length
  );
  const retryDisabled = store.isGenerating || Boolean(applyingTaskId);
  const activeFailureMessage = activeQueueTask?.statusGroup === "failed"
    ? buildFailedTaskDetail(activeQueueTask.error || store.error || t("generate.failed"))
    : "";
  const partialFailureCount = Math.max(0, activeResultExpectedCount - displayedResultUrls.length);
  const partialFailureMessage = buildPartialFailureDetail({
    message: activeQueueTask?.error,
    failedCount: partialFailureCount || 1,
  });
  const handleRetryFailedResult = (index: number) => {
    if (retryDisabled) return;
    const referenceIndex = sceneMode === "auto_design" ? -1 : Math.floor(index / Math.max(1, genCount));
    const referenceUrl = referenceIndex >= 0 ? effectiveReferenceUrls[referenceIndex] : "";
    const referenceAnalysis = referenceIndex >= 0 ? referenceAnalyses[referenceIndex] : undefined;
    if (sceneMode !== "auto_design" && !referenceUrl) {
      toast.error(t("generate.missingReferenceRetry"));
      return;
    }
    void handleGenerate(undefined, {
      genCountOverride: 1,
      referenceUrlsOverride: referenceUrl ? [referenceUrl] : [],
      referenceAnalysesOverride: referenceAnalysis ? [referenceAnalysis] : [],
      expectedCountOverride: 1,
      retryResultIndex: index,
      toastMessage: t("generate.retryFilling", { index: index + 1 }),
    });
  };
  const tryonPreviewReferences = useMemo(() => {
    const references = activeTaskReferences.length
      ? activeTaskReferences
      : buildTryOnInputReferences({
          clothingUrls: uploadedClothingUrls,
          clothingMode,
          clothingRoles,
          referenceUrls: effectiveReferenceUrls,
          modelFaceUrl: store.selectedModel?.image_url,
          garmentDetailUrls: activeUnassignedGarmentDetailUrls,
          garmentDetailGroups: activeGarmentDetailGroups,
        });
    return references.map((item) => ({
      url: item.url,
      label: item.label,
      role: item.label.includes("服装") || item.label.includes("上装") || item.label.includes("下装") || item.label.includes("连体") // 匹配参考图标签文本
        ? "clothing" as const
        : item.label.includes("模特") // 匹配参考图标签文本
          ? "model" as const
          : "reference" as const,
    }));
  }, [activeGarmentDetailGroups, activeTaskReferences, activeUnassignedGarmentDetailUrls, clothingMode, clothingRoles, effectiveReferenceUrls, store.selectedModel?.image_url, uploadedClothingUrls]);
  const tryonPreviewErrors = useMemo(
    () => Array.from({ length: activeResultExpectedCount }, (_, index) => (
      hasCompletedPartialResults && !displayedResultUrls[index]
        ? partialFailureMessage
        : null
    )),
    [activeResultExpectedCount, displayedResultUrls, hasCompletedPartialResults, partialFailureMessage]
  );
  const tryonPreviewSession = useMemo(
    () => createGenericImagePreviewSession({
      module: "tryon",
      title: t("tryon.title"),
      taskId: activeQueueTask?.id,
      createdAt: activeQueueTask?.createdAt,
      statusGroup: activeQueueTask?.statusGroup || (store.isGenerating ? "running" : undefined),
      urls: store.resultUrls,
      expectedCount: activeResultExpectedCount,
      isGenerating: store.isGenerating,
      references: tryonPreviewReferences,
      promptText: customStyle,
      errors: tryonPreviewErrors,
      metaItems: [
        { label: t("meta.clothingMode"), value: t("clothing.modeLabel", { mode: clothingMode === "single" ? t("clothing.modeSingle") : t("clothing.modeMulti") }) },
        { label: t("meta.sceneMode"), value: SCENE_MODE_LABELS[sceneMode] },
        { label: t("meta.audience"), value: TRYON_GARMENT_AUDIENCE_LABELS[garmentAudience] },
        { label: t("meta.age"), value: TRYON_AGE_GROUP_LABELS[ageGroup] },
        { label: t("meta.model"), value: aiModel },
        { label: t("meta.ratio"), value: aspectRatio },
        { label: t("meta.resolution"), value: imageSize },
        { label: t("meta.genCount"), value: activeResultExpectedCount },
      ],
      resultTitlePrefix: t("tryon.resultPrefix"),
      aspectRatio,
    }),
    [activeQueueTask, activeResultExpectedCount, ageGroup, aiModel, aspectRatio, clothingMode, customStyle, garmentAudience, imageSize, sceneMode, store.isGenerating, store.resultUrls, tryonPreviewErrors, tryonPreviewReferences]
  );
  const resultStatus: StudioResultStatus = store.error
      ? "error"
      : store.isGenerating || store.resultUrls.length > 0
        ? "results"
        : "empty";
  const isVisualAnalysisPending = isAnalyzingClothing || (sceneMode !== "auto_design" && isAnalyzingReferences);
  const isReferenceAnalysisReady = sceneMode === "auto_design"
    || !effectiveReferenceUrls.length
    || (
      referenceAnalysisKey === activeReferenceAnalysisKey
      && referenceAnalyses.length === effectiveReferenceUrls.length
    );
  const runDisabled = isSubmitting
    || isUploading
    || isAuxiliaryUploading
    || isReferenceUploadPending
    || isModelUploadPending
    || isVisualAnalysisPending
    || !isReferenceAnalysisReady
    || (sceneMode !== "auto_design" && !effectiveReferenceUrls.length)
    || !uploadedClothingUrls.length;
  const authIsAnonymous = authChecked && !isAuthenticated;
  const runDisabledReason = (() => {
    if (isSubmitting) return t("reason.submitting");
    if (isUploading) return t("reason.clothingUploading");
    if (isModelUploadBusy) return t("reason.modelUploading");
    if (isUploadingGarmentDetails) return t("reason.detailUploading");
    if (isReferenceUploadBusy) return t("reason.referenceUploading");
    if (isAnalyzingClothing) return t("reason.clothingAnalyzing");
    if (sceneMode !== "auto_design" && isAnalyzingReferences) return t("reason.referenceAnalyzing");
    if (!isReferenceAnalysisReady) return t("reason.referenceUpdating");
    if (sceneMode !== "auto_design" && !effectiveReferenceUrls.length) return t("reason.needReference");
    if (!uploadedClothingUrls.length) return t("reason.needClothing");
    return undefined;
  })();
  const clothingAnalysisLabel = getClothingAnalysisLabel(clothingAnalysis);
  const visibleSceneModeTabs = SCENE_MODE_TABS.filter((tab) => tab.value !== "system_reference");
  const clothingAnalysisStatus = isAnalyzingClothing
    ? { tone: "loading" as const, text: t("status.readingClothing") }
    : clothingAnalysisLabel
      ? { tone: "success" as const, text: t("status.clothingReady"), description: clothingAnalysisLabel }
      : clothingAnalysisError
        ? { tone: "warning" as const, text: t("status.clothingIncomplete"), description: clothingAnalysisError }
        : null;
  const referenceAnalysisStatus = isAnalyzingReferences
    ? { tone: "loading" as const, text: t("status.readingReference") }
    : referenceAnalysisError
      ? { tone: "warning" as const, text: t("status.referenceIncomplete"), description: referenceAnalysisError }
      : selectedReferenceCount > 0 && referenceAnalyses.length > 0
        ? {
            tone: referenceAnalysisSource === "fallback" ? "warning" as const : "success" as const,
            text: referenceAnalysisSource === "fallback" ? t("status.referenceConservative") : t("status.referenceReady"),
            description: t("status.referenceCount", { current: Math.min(referenceAnalyses.length, selectedReferenceCount), total: selectedReferenceCount }),
          }
        : null;
  const referenceAnalysisSummaries = selectedReferenceImages
    .map((ref, index) => {
      const analysis = referenceAnalyses[index];
      if (!analysis) return null;
      const isFallback = referenceAnalysisSource === "fallback";
      return {
        key: ref.url || `${analysis.index}-${index}`,
        title: t("status.imageSummary", { index: index + 1, summary: getReferenceAnalysisSummary(analysis, { fallback: isFallback }) }),
        detail: getReferenceAnalysisDetailText(analysis, {
          fallback: isFallback,
          reasonText: referenceAnalysisError,
        }),
      };
    })
    .filter(Boolean) as Array<{ key: string; title: string; detail: string }>;
  const isCustomModelSelected = Boolean(store.selectedModel && !store.selectedModel.is_preset);
  const customModelImageUrl = customModelPreview || (isCustomModelSelected ? store.selectedModel?.image_url || "" : "");
  const referencePanelBaseReferences = referencePanelTab === "recommended"
    ? recommendedSystemReferences
    : referencePanelTab === "exclusive"
      ? allSystemReferences.filter((item) => item.styleTags?.some((tag) => tag.includes("exclusive")) || item.sceneTags?.some((tag) => tag.includes("exclusive")))
      : allSystemReferences;
  const referencePanelMainReferences = referencePanelBaseReferences.filter((ref) => referenceMatchesSceneFilters(ref, {
    view: referencePanelViewFilter,
    body: referencePanelBodyFilter,
    search: referencePanelSearch,
  }));
  const activeReferenceScene = referencePanelMainReferences.find((item) => item.url === activeReferenceSceneUrl)
    || referencePanelMainReferences[0]
    || recommendedSystemReferences[0]
    || allSystemReferences[0]
    || null;
  const activeReferenceSceneChildren = getSceneChildReferences(activeReferenceScene);
  const isReferenceSelected = (url: string) => selectedReferenceImages.some((item) => item.url === url);
  const referenceSelectionFooter = sceneMode !== "auto_design" ? (
    <ReferenceSelectionFooter
      selectedCount={selectedReferenceCount}
      isSaving={isSavingFavoriteReference}
      onClear={clearSelectedReferences}
      onSave={saveSelectedReferenceTemplate}
    />
  ) : null;

  return (
    <>
      <StudioPageShell
        activeFeature="tryon"
        taskRail={(
          <StudioTaskRail
            module="tryon"
            moduleLabel={t("tryon.title")}
            onContinue={handleContinueCreate}
            onSelectTask={handleTaskSelect}
          />
        )}
        header={(
          <ModuleHeader
            title={t("tryon.title")}
            tooltip={t("header.tooltip")}
            actions={(
              <button
                ref={rulesButtonRef}
                type="button"
                onMouseEnter={openRulesPopover}
                onMouseLeave={scheduleRulesHide}
                onFocus={openRulesPopover}
                onBlur={scheduleRulesHide}
                aria-expanded={showClothingRules}
                className="studio-upload-rule-button"
              >
                {t("header.imageRules")} <ChevronRight className="h-3 w-3" />
              </button>
            )}
          />
        )}
        controlPanel={(
          <StudioControlPanel>
          {/* ---- 服装（整个区域可拖拽） ---- */}
          <StudioSection
            title={t("clothing.sectionTitle")}
            description={currentUploadRule.uploadSpecText}
            badge={isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--codex-accent)]" /> : null}
            className="studio-clothing-upload-section studio-stable-upload-boundary relative rounded-xl transition-[box-shadow]"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple={clothingMode === "multi"}
              className="hidden"
              aria-label={t("clothing.uploadAriaLabel")}
              onChange={(e) => {
                if (isUploading) {
                  e.currentTarget.value = "";
                  return;
                }
                if (e.target.files) processFiles(e.target.files, pendingClothingRole);
                e.currentTarget.value = "";
              }}
            />

            <StudioSegmentedControl<TryOnClothingMode>
              value={clothingMode}
              ariaLabel={t("clothing.modeAriaLabel")}
              onChange={switchClothingMode}
              options={[
                { value: "multi", label: t("clothing.modeMulti"), description: t("clothing.modeMultiDesc"), disabled: isUploading },
                { value: "single", label: t("clothing.modeSingle"), description: t("clothing.modeSingleDesc"), disabled: isUploading },
              ]}
            />

            <TryOnAnalysisStatusBadge status={clothingAnalysisStatus} className="mt-2" />

            {clothingMode === "single" ? (
              <div className="studio-clothing-slot-stack" data-mode="single">
                <StudioUploadTile
                  title={t("clothing.singleTitle")}
                  description={t("clothing.singleDesc")}
                  imageUrl={singleClothing?.preview}
                  imageAlt={t("clothing.singleImageAlt")}
                  disabled={isUploading}
                  loading={isUploading && uploadingClothingRoles.includes("single")}
                  supportBadge={t("clothing.oneImageBadge")}
                  onUploadClick={() => openClothingPicker("single")}
                  onLibraryClick={() => sourceLibrary.open("single")}
                  onPreview={singleClothing ? () => openLightbox(singleClothing.preview, t("clothing.singleImageAlt")) : undefined}
                  onRemove={singleClothing ? () => removeClothing(0) : undefined}
                  onDropFile={(file) => {
                    if (file) processFiles([file], "single");
                  }}
                  libraryLabel={t("clothing.libraryImport")}
                  footnote={t("clothing.singleFootnote")}
                  examples={{
                    label: t("clothing.tryIt"),
                    images: TRYON_UPLOAD_SLOT_EXAMPLES.overall,
                    disabled: isUploading,
                    onSelect: (image) => applyRuleImage(image as TryOnRuleImage),
                  }}
                />
              </div>
            ) : (
              <div className="studio-clothing-slot-stack" data-mode="multi">
                {([
                  ["upper", upperClothing],
                  ["lower", lowerClothing],
                ] as const).map(([role, item]) => {
                  const itemIndex = clothingItems.findIndex((clothing) => clothing.role === role);
                  const title = role === "upper" ? t("clothing.upperTitle") : t("clothing.lowerTitle");
                  return (
                    <div key={role} className="studio-clothing-slot-card">
                      <StudioUploadTile
                        title={title}
                        description={t("clothing.multiDesc", { role: t(ROLE_LABEL_KEYS[role]) })}
                        imageUrl={item?.preview}
                        imageAlt={t("clothing.uploadedRoleAlt", { role: t(ROLE_LABEL_KEYS[role]) })}
                        disabled={isUploading}
                        loading={isUploading && uploadingClothingRoles.includes(role)}
                        supportBadge={t("clothing.individualUploadBadge")}
                        onUploadClick={() => openClothingPicker(role)}
                        onLibraryClick={() => sourceLibrary.open(role)}
                        onPreview={item ? () => openLightbox(item.preview, t("clothing.uploadedRoleAlt", { role: TRYON_CLOTHING_ROLE_LABELS[role] })) : undefined}
                        onRemove={item && itemIndex >= 0 ? () => removeClothing(itemIndex) : undefined}
                        onDropFile={(file) => {
                          if (file) processFiles([file], role);
                        }}
                        libraryLabel={t("clothing.libraryImport")}
                        footnote={t("clothing.multiFootnote")}
                        examples={{
                          label: t("clothing.tryIt"),
                          images: role === "upper" ? TRYON_UPLOAD_SLOT_EXAMPLES.upper : TRYON_UPLOAD_SLOT_EXAMPLES.lower,
                          disabled: isUploading,
                          onSelect: (image) => applyRuleImage(image as TryOnRuleImage),
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-slate-100 bg-white/70 px-3 py-2 text-xs text-slate-700 transition-colors hover:border-[rgba(91,124,255,0.3)] dark:border-white/10 dark:bg-[#1c1c1e] dark:text-stone-200 dark:hover:border-[rgba(167,139,250,0.45)]">
              <input
                type="checkbox"
                checked={isIntimateGarment}
                onChange={(event) => updateIntimateGarment(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--codex-accent)] accent-[var(--codex-accent)] focus:ring-violet-500 dark:border-stone-600 dark:bg-stone-800"
              />
              <span>
                <span className="font-semibold">{t("clothing.intimateLabel")}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">
                  {t("clothing.intimateHint")}
                </span>
              </span>
            </label>

            <GarmentDetailReferencePanel
              enabled={garmentDetailEnabled}
              total={activeGarmentDetailTotal}
              clothingItems={clothingItems}
              uploadedClothingUrls={uploadedClothingUrls}
              groups={activeGarmentDetailGroups}
              unassignedUrls={activeUnassignedGarmentDetailUrls}
              inputRef={garmentDetailInputRef}
              clothingMode={clothingMode}
              isDragging={isDraggingGarmentDetails}
              setDragging={setIsDraggingGarmentDetails}
              isUploading={isUploadingGarmentDetails}
              onToggle={toggleGarmentDetails}
              onFiles={(files) => handleGarmentDetailFiles(files)}
              onOpenClothingPicker={openClothingPicker}
              onOpenLightbox={openLightbox}
              onRemoveDetail={removeGarmentDetail}
              onSetDetailTarget={(clothingIndex) => {
                garmentDetailTargetIndexRef.current = clothingIndex;
              }}
            />
          </StudioSection>

          {/* ---- 服装人群 ---- */}
          <section className="rounded-2xl border border-violet-100 bg-white/78 p-3 shadow-sm dark:border-white/10 dark:bg-[#1c1c1e]">
            <div className="mb-2.5 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[13px] font-bold text-slate-900 dark:text-stone-100">
                  {t("audience.title")} <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:bg-white/10 dark:text-stone-400">{t("common.optional")}</span>
                </h3>
                <p className="mt-1 truncate text-[11px] text-slate-400 dark:text-stone-500">
                  {t("audience.description")}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[rgba(91,124,255,0.1)] px-2 py-0.5 text-[10px] font-medium text-[var(--codex-accent)] dark:bg-[rgba(167,139,250,0.18)] dark:text-purple-300">
                {t("audience.badge")}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {GARMENT_AUDIENCE_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateGarmentAudience(value)}
                  aria-pressed={garmentAudience === value}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium leading-none transition-[color,background-color,border-color,box-shadow] ${
                    garmentAudience === value
                      ? "border-violet-400 bg-[rgba(91,124,255,0.1)] text-violet-700 shadow-sm dark:border-[rgba(167,139,250,0.6)] dark:bg-[rgba(167,139,250,0.18)] dark:text-purple-200"
                      : "border-slate-200 bg-white text-slate-500 hover:border-[rgba(91,124,255,0.3)] hover:text-[var(--codex-accent)] dark:border-white/10 dark:bg-[#26262a] dark:text-stone-300 dark:hover:border-[rgba(167,139,250,0.45)] dark:hover:text-purple-300"
                  }`}
                >
                  {TRYON_GARMENT_AUDIENCE_LABELS[value]}
                </button>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {AGE_GROUP_OPTIONS.map((value) => {
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateAgeGroup(value)}
                    aria-pressed={ageGroup === value}
                    className={`rounded-lg border px-1.5 py-1.5 text-[11px] font-medium leading-none transition-[color,background-color,border-color,box-shadow] ${
                      ageGroup === value
                        ? "border-violet-400 bg-[rgba(91,124,255,0.1)] text-violet-700 shadow-sm dark:border-[rgba(167,139,250,0.6)] dark:bg-[rgba(167,139,250,0.18)] dark:text-purple-200"
                        : "border-slate-200 bg-white text-slate-500 hover:border-[rgba(91,124,255,0.3)] hover:text-[var(--codex-accent)] dark:border-white/10 dark:bg-[#26262a] dark:text-stone-300 dark:hover:border-[rgba(167,139,250,0.45)] dark:hover:text-purple-300"
                    }`}
                  >
                    {TRYON_AGE_GROUP_LABELS[value]}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ---- 参考图（整个区域可拖拽） ---- */}
          <section
            {...referenceDrag.dragHandlers}
            className={`studio-stable-upload-boundary relative rounded-xl transition-[box-shadow] ${isDraggingRef ? "ring-2 ring-[rgba(91,124,255,0.38)] ring-offset-2" : ""}`}
          >
            {isDraggingRef && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-[rgba(91,124,255,0.58)] bg-[rgba(91,124,255,0.12)]">
                <div className="text-center">
                  <Upload className="mx-auto mb-1 h-7 w-7 text-[var(--codex-accent)]" />
                  <p className="text-xs font-semibold text-[var(--codex-accent)]">{t("reference.dropHint")}</p>
                </div>
              </div>
            )}
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-[var(--codex-accent)]" /> {t("reference.title")}
                </h3>
                <p className="mt-1 text-[11px] text-gray-400">{t("reference.description")}</p>
              </div>
              {sceneMode !== "auto_design" && (
                <span className="rounded-full bg-[rgba(91,124,255,0.1)] px-2 py-1 text-[10px] font-semibold text-[var(--codex-accent)]">
                  {t("common.maxCount", { count: MAX_TRYON_REFERENCE_IMAGES })}
                </span>
              )}
            </div>

            <StudioOptionGrid
              options={visibleSceneModeTabs.map((tab) => ({
                value: tab.value,
                label: tab.label,
              }))}
              value={sceneMode}
              onChange={switchSceneMode}
              columns={3}
              ariaLabel={t("reference.title")}
              className="tryon-scene-mode-tabs mb-3"
            />

            {false && sceneMode === "system_reference" && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/5">
                {selectedReferenceImages.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReferencePanelTab("recommended");
                      setActiveReferenceSceneUrl((prev) => prev || recommendedSystemReferences[0]?.url || allSystemReferences[0]?.url || null);
                      setIsReferenceScenePanelOpen(true);
                    }}
                    className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white/80 p-3 text-left transition hover:border-[var(--codex-accent)] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                    aria-label={t("reference.openSystemScene")}
                  >
                    <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 shadow-sm">
                      <ImgSkeleton
                        src={recommendedSystemReferences[0]?.url || allSystemReferences[0]?.url || ""}
                        alt={t("reference.recommendedAlt")}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900">{t("reference.select")} <span className="font-medium text-slate-400">{t("reference.multiSelect")}</span></p>
                      <p className="mt-2 inline-flex max-w-full rounded-lg bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-600">
                        {t("reference.selectTip")}
                      </p>
                      {clothingAnalysisLabel && (
                        <p className="mt-2 truncate text-[10px] font-semibold text-[var(--codex-accent)]">{t("reference.recognized")}: {clothingAnalysisLabel}</p>
                      )}
                      {(isAnalyzingClothing || isLoadingSystemReferences) && (
                        <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-[var(--codex-accent)]">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {isAnalyzingClothing ? t("reference.recognizingClothing") : t("reference.recommending")}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-7 w-7 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[var(--codex-accent)]" />
                  </button>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {selectedReferenceImages.slice(0, 8).map((ref) => (
                      <button
                        key={ref.url}
                        type="button"
                        onClick={() => openLightbox(ref.url, ref.label || t("common.referenceImage"))}
                        className="group relative overflow-hidden rounded-lg border-2 border-[var(--codex-accent)] bg-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                        aria-label={t("reference.previewSelected", { label: ref.label })}
                      >
                        <RawPreviewImage eager src={ref.url} alt={ref.label || t("common.referenceImage")} className="aspect-[3/4] w-full object-cover" />
                        <CheckCircle2 className="absolute right-1 top-1 h-4 w-4 rounded-full bg-[var(--codex-accent)] text-white" />
                      </button>
                    ))}
                    {!isReferenceScenePanelOpen && selectedReferenceCount < MAX_TRYON_REFERENCE_IMAGES && (
                      <button
                        type="button"
                        onClick={() => {
                          setReferencePanelTab("recommended");
                          setActiveReferenceSceneUrl((prev) => prev || recommendedSystemReferences[0]?.url || allSystemReferences[0]?.url || null);
                          setIsReferenceScenePanelOpen(true);
                        }}
                        className="flex aspect-[3/4] flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-white text-slate-400 transition hover:border-[var(--codex-accent)] hover:bg-[rgba(91,124,255,0.1)]/40 hover:text-[var(--codex-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-white/5 dark:text-stone-500 dark:hover:bg-[rgba(91,124,255,0.1)]0/15 dark:hover:text-violet-300"
                        aria-label={t("reference.addSystemScene")}
                      >
                        <ChevronRight className="mb-1 h-6 w-6" />
                        <span className="text-xs font-medium">{t("common.add")}</span>
                      </button>
                    )}
                  </div>
                )}
                {referenceSelectionFooter}
              </div>
            )}

            {sceneMode === "upload_reference" && (
              <div className={`studio-reference-upload-panel transition-colors ${isDraggingRef ? "rounded-xl ring-2 ring-[rgba(91,124,255,0.36)] ring-offset-2" : ""}`}>
                <input ref={customRefInputRef} type="file" accept="image/*" multiple className="hidden" aria-label={t("reference.uploadAriaLabel")} onChange={handleCustomRef} disabled={selectedReferenceCount >= MAX_TRYON_REFERENCE_IMAGES || isReferenceUploadBusy} />
                <TryOnReferenceAnalysisStatus
                  status={referenceAnalysisStatus}
                  summaries={referenceAnalysisSummaries}
                  isAnalyzing={isAnalyzingReferences}
                />
                {showUploadReferenceEmptyTile ? (
                  <StudioUploadTile
                    title={t("reference.uploadTitle")}
                    description={t("reference.uploadDesc", { count: MAX_TRYON_REFERENCE_IMAGES })}
                    imageAlt={t("reference.uploadImageAlt")}
                    isDragging={isDraggingRef}
                    disabled={isReferenceUploadBusy}
                    loading={isReferenceUploadBusy}
                    supportBadge={t("common.maxCount", { count: MAX_TRYON_REFERENCE_IMAGES })}
                    onUploadClick={() => customRefInputRef.current?.click()}
                    uploadLabel={t("reference.uploadLocal")}
                    loadingLabel={t("reference.uploadingLabel")}
                    footnote={t("reference.uploadFootnote")}
                    examples={{
                      label: t("clothing.tryIt"),
                      images: PRESET_REFERENCES.slice(0, 6).map((item) => ({
                        url: item.url,
                        title: item.label,
                      })),
                      disabled: isReferenceUploadBusy,
                      onSelect: applyReferenceExample,
                    }}
                  />
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {selectedReferenceImages.map((ref) => (
                      <div key={ref.url} className="group relative overflow-hidden rounded-lg border-2 border-[var(--codex-accent)] bg-white shadow-sm">
                        <button
                          type="button"
                          onClick={() => openLightbox(ref.url, ref.label || t("common.referenceImage"))}
                          className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                          aria-label={t("reference.preview", { label: ref.label })}
                        >
                          <RawPreviewImage eager src={ref.url} alt={t("reference.previewAlt", { label: ref.label })} className="aspect-[3/4] w-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center bg-slate-950/0 opacity-0 transition group-hover:bg-slate-950/18 group-hover:opacity-100 group-focus-within:bg-slate-950/18 group-focus-within:opacity-100">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/92 text-slate-700 shadow-sm">
                              <ZoomIn className="h-4 w-4" />
                            </span>
                          </span>
                        </button>
                        <span className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--codex-accent)] text-white shadow-sm">
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedReferences(selectedReferenceImages.filter((item) => item.url !== ref.url))}
                          className="absolute left-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/92 text-slate-600 shadow-sm transition-colors duration-150 hover:text-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[rgba(91,124,255,0.55)]"
                          aria-label={t("reference.remove", { label: ref.label })}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {visibleCustomRefUploads.map((item) => (
                      <div key={item.id} className="relative overflow-hidden rounded-lg border-2 border-dashed border-gray-200 bg-white dark:border-white/10 dark:bg-white/5">
                        <RawPreviewImage eager src={item.preview} alt={item.label} className="aspect-[3/4] w-full object-cover opacity-70" />
                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/70 text-[10px] font-bold text-[var(--codex-accent)] backdrop-blur-[1px]">
                          {item.status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 text-red-500" />}
                          {item.status === "uploading" ? t("common.uploading") : t("common.failed")}
                        </span>
                        {item.status === "error" && (
                          <button
                            type="button"
                            onClick={() => setCustomRefUploads((prev) => prev.filter((upload) => upload.id !== item.id))}
                            className="absolute right-1 top-1 z-[2] inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/88 text-slate-500 shadow-sm transition hover:text-red-500"
                            aria-label={t("reference.removeFailed", { label: item.label })}
                            title={item.error || t("common.uploadFailed")}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => customRefInputRef.current?.click()}
                      disabled={selectedReferenceCount >= MAX_TRYON_REFERENCE_IMAGES || isReferenceUploadBusy}
                      className={`flex aspect-[3/4] flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-white text-slate-400 transition-[color,background-color,border-color,box-shadow] hover:border-[var(--codex-accent)] hover:bg-[rgba(91,124,255,0.1)]/40 hover:text-[var(--codex-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/5 dark:text-stone-500 dark:hover:bg-[rgba(91,124,255,0.1)]0/15 dark:hover:text-violet-300 ${isDraggingRef ? "border-[var(--codex-accent)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)] dark:bg-[rgba(91,124,255,0.1)]0/20" : "border-gray-200 dark:border-white/10"}`}
                      aria-label={t("reference.uploadAriaLabel")}
                    >
                      <ChevronRight className="mb-1 h-6 w-6" />
                      <span className="text-xs font-medium">{t("common.add")}</span>
                    </button>
                  </div>
                )}
                {referenceSelectionFooter}
              </div>
            )}

            {sceneMode === "auto_design" && (
              <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <div>
                  <p className="mb-2 text-xs font-bold text-gray-800">{t("autoDesign.platform")}</p>
                  <StudioOptionGrid
                    options={AUTO_DESIGN_PLATFORMS.map((item) => ({
                      value: item.value,
                      label: item.label,
                      description: item.desc,
                    }))}
                    value={resolvedAutoDesign.platform}
                    onChange={(platform) => {
                      setAutoDesign((prev) => normalizeAutoDesignSettings({ ...prev, platform }));
                      setPromptOverride(null);
                    }}
                    columns={2}
                    ariaLabel={t("autoDesign.platform")}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold text-gray-800">{t("autoDesign.framing")}</p>
                  <StudioOptionGrid
                    options={AUTO_DESIGN_FRAMINGS.map((item) => ({
                      value: item.value,
                      label: item.label,
                    }))}
                    value={resolvedAutoDesign.framing}
                    onChange={(framing) => {
                      setAutoDesign((prev) => normalizeAutoDesignSettings({ ...prev, framing }));
                      setPromptOverride(null);
                    }}
                    columns={4}
                    ariaLabel={t("autoDesign.framing")}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold text-gray-800">{t("autoDesign.background")}</p>
                  <StudioOptionGrid
                    options={autoDesignBackgroundOptions.map((item) => ({
                      value: item.value,
                      label: item.label,
                    }))}
                    value={resolvedAutoDesign.background}
                    onChange={(background) => {
                      setAutoDesign((prev) => normalizeAutoDesignSettings({ ...prev, background }));
                      setPromptOverride(null);
                    }}
                    columns={2}
                    ariaLabel={t("autoDesign.background")}
                  />
                </div>
              </div>
            )}

            {sceneMode === "favorites" && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/5">
                {authIsAnonymous ? (
                  <div className="py-8 text-center text-xs text-gray-400">{t("favorite.anonView")}</div>
                ) : isLoadingFavoriteReferences ? (
                  <div className="py-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {t("favorite.loading")}
                  </div>
                ) : favoriteReferences.length === 0 && referenceTemplates.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-400">{t("favorite.empty")}</div>
                ) : (
                  <div className="space-y-3">
                    {referenceTemplates.length > 0 && (
                      <div>
                        <p className="mb-2 text-[11px] font-bold text-slate-600">{t("favorite.templates")}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {referenceTemplates.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => applyReferenceTemplate(template)}
                              className="group overflow-hidden rounded-lg border-2 border-transparent bg-white text-left transition hover:border-[var(--codex-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                              aria-label={t("favorite.applyTemplate", { name: template.name })}
                            >
                              <div className="relative aspect-[4/3] overflow-hidden">
                                <RawPreviewImage eager src={template.coverUrl} alt={template.name} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                                <span className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-[var(--codex-accent)]">
                                  {t("common.countImages", { count: template.references.length })}
                                </span>
                              </div>
                              <div className="px-2 py-1">
                                <p className="truncate text-[10px] font-bold text-slate-700">{template.name}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {favoriteReferences.length > 0 && (
                      <div>
                        <p className="mb-2 text-[11px] font-bold text-slate-600">{t("favorite.single")}</p>
                        <div className="grid grid-cols-3 gap-2">
                    {favoriteReferences.map((ref) => {
                      const selected = isReferenceSelected(ref.url);
                      return (
                      <div key={ref.id} role="button" tabIndex={0}
                        aria-label={t("favorite.select", { label: ref.label })}
                        onClick={() => {
                          if (!switchSceneMode("favorites")) return;
                          toggleReferenceImage(toFavoriteReference(ref));
                        }}
                        onKeyDown={(event) => handlePreviewKeyDown(event, () => {
                          if (!switchSceneMode("favorites")) return;
                          toggleReferenceImage(toFavoriteReference(ref));
                        })}
                        className={`group relative cursor-pointer overflow-hidden rounded-lg border-2 bg-white transition-[color,background-color,border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                          selected ? "border-[var(--codex-accent)] ring-1 ring-blue-200" : "border-transparent hover:border-gray-300"
                        }`}>
                        <ImgSkeleton src={ref.url} alt={t("favorite.imageAlt", { label: ref.label })} className="w-full aspect-[3/4] object-cover" />
                        {selected && (
                          <span className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--codex-accent)] text-white shadow-sm">
                            <CheckCircle2 className="h-4 w-4" />
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openLightbox(ref.url, t("favorite.previewLabel", { label: ref.label })); }}
                          onKeyDown={(e) => { e.stopPropagation(); }}
                          className="absolute left-1 top-1 w-6 h-6 rounded-full bg-white/85 shadow-sm flex items-center justify-center opacity-100 transition-opacity hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                          aria-label={t("favorite.preview", { label: ref.label })}
                          title={t("favorite.preview", { label: ref.label })}
                        >
                          <ZoomIn className="w-3 h-3 text-gray-500" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeFavoriteReference(ref.id); }}
                          onKeyDown={(e) => { e.stopPropagation(); }}
                          className="absolute right-1 top-1 w-6 h-6 rounded-full bg-white/85 shadow-sm flex items-center justify-center opacity-100 transition-opacity hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                          aria-label={t("favorite.remove", { label: ref.label })}
                          title={t("favorite.remove", { label: ref.label })}
                        >
                          <X className="w-3 h-3 text-gray-500" />
                        </button>
                        <div className="p-1 text-center"><span className="text-[10px] font-medium">{ref.label}</span></div>
                      </div>
                    );})}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {referenceSelectionFooter}
              </div>
            )}
          </section>

          {/* ---- 模特（整个区域可拖拽·可选） ---- */}
          <section
            {...modelDrag.dragHandlers}
            className={`studio-stable-upload-boundary relative rounded-xl transition-[box-shadow] ${isDraggingModel ? "ring-2 ring-[rgba(91,124,255,0.38)] ring-offset-2" : ""}`}
          >
            {isDraggingModel && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-[rgba(91,124,255,0.48)] bg-[rgba(91,124,255,0.10)] pointer-events-none">
                <div className="text-center">
                  <Upload className="w-8 h-8 mx-auto text-[var(--codex-accent)] mb-1" />
                  <p className="text-sm font-medium text-[var(--codex-accent)]">{t("model.dropHint")}</p>
                </div>
              </div>
            )}
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-[13px] font-bold text-slate-900 dark:text-stone-100">
                  <UserRound className="h-4 w-4 text-[var(--codex-accent)]" />
                  {t("model.title")}
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:bg-white/10 dark:text-stone-400">{t("common.optional")}</span>
                </h3>
                <p className="mt-1 text-[11px] text-gray-400 dark:text-stone-500">{t("model.description")}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[rgba(91,124,255,0.1)] px-2 py-1 text-[10px] font-semibold text-[var(--codex-accent)] dark:bg-[rgba(167,139,250,0.18)] dark:text-purple-300">
                {t("model.dragBadge")}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isModelUploadBusy) {
                    toast.info(t("model.uploadingWait"));
                    return;
                  }
                  store.setSelectedModel(null);
                  setCustomModelPreview(null);
                  toast.success(t("model.noReplaceSet"));
                }}
                disabled={isModelUploadBusy}
                className={`group relative overflow-hidden rounded-xl border bg-white text-center transition-[color,background-color,border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#1c1c1e] ${
                  !store.selectedModel
                    ? "border-[var(--codex-accent)] bg-[rgba(91,124,255,0.10)] dark:bg-[rgba(91,124,255,0.18)] shadow-sm ring-1 ring-blue-100 dark:ring-[rgba(91,140,255,0.45)]"
                    : "border-slate-200 dark:border-white/10 hover:border-[rgba(91,124,255,0.34)] hover:bg-[rgba(91,124,255,0.1)]/30 dark:hover:bg-[rgba(91,140,255,0.10)]"
                }`}
              >
                <span className="flex aspect-[4/5] items-center justify-center">
                  <span className="flex flex-col items-center gap-2">
                    <UserRound className={`h-7 w-7 ${!store.selectedModel ? "text-[var(--codex-accent)]" : "text-slate-300 dark:text-stone-500"}`} />
                    <span className={`text-[13px] font-bold ${!store.selectedModel ? "text-[var(--codex-accent)]" : "text-slate-400 dark:text-stone-400"}`}>
                      {t("model.noSelectionDefault")}
                    </span>
                  </span>
                </span>
                <span className={`block border-t px-2 py-2 text-[11px] font-semibold ${!store.selectedModel ? "border-[rgba(91,124,255,0.12)] text-[var(--codex-accent)]" : "border-slate-100 dark:border-white/10 text-slate-500 dark:text-stone-400"}`}>
                  {t("model.noReplace")}
                </span>
              </button>
              {PRESET_MODELS.map((m) => (
                <div
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  aria-label={t("model.select", { name: m.name })}
                  onClick={() => {
                    if (isModelUploadBusy) {
                      toast.info(t("model.uploadingWait"));
                      return;
                    }
                    setCustomModelPreview(null);
                    store.setSelectedModel({ ...m, is_preset: true, user_id: null });
                    setPromptOverride(null);
                  }}
                  onKeyDown={(event) => handlePreviewKeyDown(event, () => {
                    if (isModelUploadBusy) {
                      toast.info(t("model.uploadingWait"));
                      return;
                    }
                    setCustomModelPreview(null);
                    store.setSelectedModel({ ...m, is_preset: true, user_id: null });
                    setPromptOverride(null);
                  })}
                  className={`group relative overflow-hidden rounded-xl border bg-white transition-[color,background-color,border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:bg-[#1c1c1e] ${
                    isModelUploadBusy ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  } ${
                    store.selectedModel?.id === m.id
                      ? "border-[var(--codex-accent)] shadow-sm ring-1 ring-blue-100 dark:ring-[rgba(91,140,255,0.45)]"
                      : "border-slate-200 dark:border-white/10 hover:border-[rgba(91,124,255,0.34)] hover:shadow-sm"
                  }`}>
                  <ImgSkeleton src={m.image_url} alt={t("model.imageAlt", { name: m.name })} className="aspect-[4/5] w-full object-cover" />
                  {store.selectedModel?.id === m.id && (
                    <span className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--codex-accent)] text-white shadow-sm">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                  )}
                  <div className="pointer-events-none absolute inset-0 flex items-end justify-end bg-violet-950/0 p-2 opacity-100 transition-[background-color,opacity] sm:opacity-0 sm:group-hover:bg-violet-950/10 sm:group-hover:opacity-100 sm:group-focus-within:bg-violet-950/10 sm:group-focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openLightbox(m.image_url, t("model.imageAlt", { name: m.name })); }}
                      onKeyDown={(e) => { e.stopPropagation(); }}
                      className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                      aria-label={t("model.preview", { name: m.name })}
                      title={t("model.preview", { name: m.name })}
                    >
                      <ZoomIn className="h-4 w-4 text-gray-600" />
                    </button>
                  </div>
                  <div className={`border-t px-2 py-2 text-center ${store.selectedModel?.id === m.id ? "border-[rgba(91,124,255,0.12)] bg-blue-50 dark:bg-[rgba(91,140,255,0.18)] dark:border-[rgba(91,140,255,0.32)]" : "border-slate-100 dark:border-white/10"}`}>
                    <span className="block truncate text-[11px] font-bold text-slate-800 dark:text-stone-200">{m.name}</span>
                  </div>
                </div>
              ))}
              <div
                role="button"
                tabIndex={0}
                onClick={() => customModelInputRef.current?.click()}
                onKeyDown={(event) => handlePreviewKeyDown(event, () => customModelInputRef.current?.click())}
                className={`group relative overflow-hidden rounded-xl border bg-white text-center transition-[color,background-color,border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:bg-[#1c1c1e] ${
                  isModelUploadBusy ? "cursor-not-allowed opacity-80" : "cursor-pointer"
                } ${
                  isCustomModelSelected
                    ? "border-[var(--codex-accent)] shadow-sm ring-1 ring-blue-100 dark:ring-[rgba(91,140,255,0.45)]"
                    : "border-dashed border-slate-200 hover:border-[rgba(91,124,255,0.38)] hover:bg-[rgba(91,124,255,0.1)]/30"
                }`}
                aria-label={customModelImageUrl ? t("model.replaceUpload") : t("model.uploadAriaLabel")}
              >
                <span className="flex aspect-[4/5] items-center justify-center overflow-hidden bg-slate-50 dark:bg-white/5">
                  {customModelImageUrl
                    ? <RawPreviewImage src={customModelImageUrl} alt={t("model.uploadedAlt")} className="h-full w-full object-cover" />
                    : (
                      <span className="flex flex-col items-center gap-2 px-3 text-slate-400 dark:text-stone-500">
                        <Camera className="h-7 w-7" />
                        <span className="text-[13px] font-bold text-slate-500 dark:text-stone-300">{t("model.uploadFace")}</span>
                        <span className="text-[10px] leading-4 text-slate-400 dark:text-stone-500">{t("model.faceOnly")}</span>
                        <span className="text-[10px] text-slate-300 dark:text-stone-600">≤{MAX_FILE_SIZE_MB}MB</span>
                      </span>
                    )
                  }
                </span>
                {isCustomModelSelected && (
                  <span className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--codex-accent)] text-white shadow-sm">
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                )}
                {customModelImageUrl && (
                  <div className="pointer-events-none absolute inset-0 flex items-end justify-end bg-violet-950/0 p-2 opacity-100 transition-[background-color,opacity] sm:opacity-0 sm:group-hover:bg-violet-950/10 sm:group-hover:opacity-100 sm:group-focus-within:bg-violet-950/10 sm:group-focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openLightbox(customModelImageUrl, t("model.uploadedAlt"));
                      }}
                      onKeyDown={(event) => { event.stopPropagation(); }}
                      className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                      aria-label={t("model.previewUpload")}
                      title={t("model.previewUpload")}
                    >
                      <ZoomIn className="h-4 w-4 text-gray-600" />
                    </button>
                  </div>
                )}
                <span className={`block truncate border-t px-2 py-2 text-[11px] font-bold ${
                  isCustomModelSelected ? "border-[rgba(91,124,255,0.12)] bg-blue-50 dark:bg-[rgba(91,140,255,0.18)] dark:border-[rgba(91,140,255,0.32)] text-slate-800 dark:text-stone-200" : "border-slate-100 dark:border-white/10 text-slate-500 dark:text-stone-400"
                }`}>
                  {customModelImageUrl ? t("common.uploaded") : t("common.upload")}
                </span>
                {isModelUploadBusy && (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-white/78 text-[11px] font-bold text-[var(--codex-accent)] backdrop-blur-[1px] dark:bg-[rgba(28,28,30,0.82)]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("common.uploading")}
                  </span>
                )}
              </div>
              <input ref={customModelInputRef} type="file" accept="image/*" className="hidden" aria-label={t("model.uploadAriaLabel")} onChange={handleCustomModel} disabled={isModelUploadBusy} />
            </div>
          </section>

          {/* ---- 生成模型 ---- */}
          <section>
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-slate-900 dark:text-stone-100">
              <Sparkles className="w-4 h-4 text-[var(--codex-accent)]" /> {t("model.sectionTitle")}
            </h3>
            <StudioModelSelector
              models={selectableModels}
              value={aiModel}
              onChange={(value) => {
                if (hasModelFace && isNanoBananaModel(value)) {
                  toast.info(TRYON_FACE_MODEL_BANANA_NOTICE);
                }
                setAiModel(value);
              }}
              ariaLabel={t("model.sectionTitle")}
              getMeta={(model) => (
                hasModelFace && isNanoBananaModel(model.value)
                  ? t("model.faceFusionWarning")
                  : t("model.costMeta", { desc: model.desc, cost: getCreditCost(model.value, imageSize, aspectRatio) })
              )}
            />
            {hasModelFace && (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                {t("model.bananaWarning")}
                <a href="/face-swap" className="mx-1 font-bold text-amber-900 underline decoration-amber-400 underline-offset-2">{t("model.swapModule")}</a>
                {t("model.swapFace")}
              </div>
            )}
          </section>

          {/* ---- 比例 ---- */}
          <section>
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-slate-900 dark:text-stone-100"><Crop className="h-4 w-4 text-[var(--codex-accent)]" /> {t("ratio.title")}</h3>
            <StudioOptionGrid options={aspects} value={aspectRatio} onChange={setAspectRatio} ariaLabel={t("ratio.title")} />
          </section>

          {/* ---- 分辨率 ---- */}
          {imageSizes.length > 1 && (
            <section>
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-slate-900 dark:text-stone-100"><Monitor className="h-4 w-4 text-[var(--codex-accent)]" /> {t("resolution.title")}</h3>
              <StudioOptionGrid
                options={imageSizes.map((size) => ({ value: size, label: t("resolution.option", { size, cost: getCreditCost(aiModel, size, aspectRatio) }) }))}
                value={imageSize}
                onChange={setImageSize}
                ariaLabel={t("resolution.title")}
              />
            </section>
          )}

          {/* ---- 细节补充 + 智能整理 ---- */}
          <section>
            <StudioPromptTextarea
              title={t("prompt.title")}
              badge={t("common.optional")}
              value={customStyle}
              onChange={(e) => { setCustomStyle(e.target.value); setPromptOverride(null); store.setPromptUsed(""); }}
              placeholder={t("prompt.placeholder")}
              aria-label={t("prompt.title")}
              rows={4}
              action={(
                <button
                  type="button"
                  onClick={handleOptimizePrompt}
                  disabled={optimizing || !customStyle.trim()}
                  className="studio-prompt-icon-action"
                  title={t("prompt.optimizeTitle")}
                >
                  {optimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
                </button>
              )}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {STYLE_PRESETS.map((s, i) => (
                <button key={i} onClick={() => { setCustomStyle(s); setPromptOverride(null); store.setPromptUsed(""); }}
                  aria-pressed={customStyle === s}
                  className="rounded-full border bg-gray-50 px-2 py-0.5 text-[10px] text-gray-500 transition-colors hover:bg-purple-50 hover:text-purple-600 dark:border-white/10 dark:bg-white/5 dark:text-stone-400 dark:hover:bg-[rgba(91,124,255,0.1)]0/15 dark:hover:text-violet-300">{t(`stylePreset.${i}`)}</button>
              ))}
            </div>

          </section>

          {/* ---- 生成数量 ---- */}
          <StudioSection title={t("genCount.title")} description={t("genCount.description")} icon={<Images className="h-4 w-4" />}>
            <StudioGenerationCountSelector
              value={genCount}
              onChange={setGenCount}
              ariaLabel={t("genCount.ariaLabel")}
            />
          </StudioSection>
          </StudioControlPanel>
        )}
        runBar={(
          <StudioRunBar
            summary={t("runBar.summary", {
              mode: t("clothing.modeLabel", { mode: clothingMode === "single" ? t("clothing.modeSingle") : t("clothing.modeMulti") }),
              clothingCount: store.clothingFiles.length,
              detailCount: activeGarmentDetailUrls.length,
              scene: sceneMode === "auto_design" ? t("common.autoDesign") : t("runBar.refCount", { count: selectedReferenceCount }),
              costPerImage,
              expectedCount: expectedOutputCount,
            })}
            costLabel={authIsAnonymous ? t("runBar.loginToViewCredits") : t("runBar.costBalance", { total: totalCost, balance: credits ?? "—" })}
            disabled={runDisabled}
            disabledReason={runDisabledReason}
            primaryLabel={authIsAnonymous ? t("runBar.loginToGenerate") : isSubmitting ? t("runBar.submitting") : t("runBar.generateCount", { count: expectedOutputCount })}
            isLoading={isSubmitting}
            onPrimaryAction={() => handleGenerate()}
          />
        )}

        canvas={(
          <StudioResultViewport
            status={resultStatus}
            emptyState={(
              <div className="flex min-h-[320px] items-center justify-center p-4 sm:min-h-[420px] lg:h-full">
                <PreviewGuide
                  title={t("guide.title")}
                  subtitle={t("guide.subtitle")}
                  steps={[
                    {
                      title: t("guide.step1Title"),
                      desc: "",
                      imageSrc: "/tutorial-guides/tryon-garment.webp",
                      imageAlt: t("guide.step1Alt"),
                      imageFit: "contain",
                      badge: t("guide.step1Badge"),
                    },
                    {
                      title: t("guide.step2Title"),
                      desc: "",
                      imageSrc: "/tutorial-guides/tryon-reference.webp",
                      imageAlt: t("guide.step2Alt"),
                      badge: t("guide.step2Badge"),
                    },
                    {
                      title: t("guide.step3Title"),
                      desc: "",
                      imageSrc: "/tutorial-guides/tryon-model.webp",
                      imageAlt: t("guide.step3Alt"),
                      badge: t("guide.step3Badge"),
                    },
                    {
                      title: t("guide.step4Title"),
                      desc: "",
                      imageSrc: "/tutorial-guides/tryon-result.webp",
                      imageAlt: t("guide.step4Alt"),
                      badge: t("guide.step4Badge"),
                    },
                  ]}
                  actions={(
                    <>
                      <button
                        type="button"
                        onClick={() => openClothingPicker(clothingMode === "multi" ? "upper" : "single")}
                        className="inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
                      >
                        <Upload className="h-3.5 w-3.5" /> {t("guide.uploadClothing")}
                      </button>
                      <button
                        type="button"
                        onClick={() => sourceLibrary.open(clothingMode === "multi" ? "upper" : "single")}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 dark:border-white/15 dark:bg-[#26262a] dark:text-stone-200 dark:hover:border-white/30 dark:hover:text-white"
                      >
                        <FolderOpen className="h-3.5 w-3.5" /> {t("guide.selectFromLibrary")}
                      </button>
                    </>
                  )}
                />
              </div>
            )}
            loadingState={(
              <LoadingStage
                genCount={genCount}
                progress={store.generationProgress}
                moduleName={t("tryon.title")}
                referenceImages={[
                  { label: clothingMode === "multi" ? t("loading.upperLowerRef") : t("loading.jumpsuitRef"), url: store.clothingPreviews[0] },
                  { label: t("loading.modelRef"), url: store.selectedModel?.image_url },
                  ...selectedReferenceImages.map((item, index) => ({ label: t("loading.poseRef", { index: selectedReferenceImages.length > 1 ? index + 1 : "" }), url: item.url })),
                  ...activeGarmentDetailGroups.flatMap((group) => {
                    const role = clothingRoles[group.clothingIndex]
                      || (clothingMode === "multi"
                        ? group.clothingIndex === 0 ? "upper" : group.clothingIndex === 1 ? "lower" : "extra"
                        : "single");
                    const roleLabel = getGarmentDetailOwnerLabel(role, group.clothingIndex);
                    return group.urls.map((url, index) => ({ label: t("loading.detailRef", { role: roleLabel, index: index + 1 }), url }));
                  }),
                  ...activeUnassignedGarmentDetailUrls.map((url, index) => ({ label: t("loading.unassignedDetail", { index: index + 1 }), url })),
                ]}
                metaItems={[aspectRatio, imageSize, sceneMode === "auto_design" ? t("common.autoDesign") : t("runBar.refCount", { count: selectedReferenceCount }), activeGarmentDetailUrls.length ? t("runBar.detailCount", { count: activeGarmentDetailUrls.length }) : ""].filter(Boolean)}
              />
            )}
            errorState={store.error ? (
              <ErrorStage
                error={summarizeGenerationError(store.error)}
                onRetry={() => { store.setError(null); handleGenerate(); }}
                isGenerating={store.isGenerating}
                retryDisabled={retryDisabled}
                retryLabel={applyingTaskId ? t("generate.applying") : t("generate.regenerate")}
                notice={FAILED_RETRY_NOTICE}
              />
            ) : null}
            results={(
              <div className="relative min-h-[320px] sm:min-h-[420px] lg:h-full">
                <div className="studio-result-stage min-h-[320px] overflow-y-auto overflow-x-hidden p-4 sm:min-h-[420px] sm:p-6 lg:h-full">
                  <div className="flex min-h-full items-start justify-start">
                    <ResultImageGrid
                      urls={store.resultUrls}
                      filenamePrefix="tryon"
                      onOpen={openTryonPreview}
                      imageAltPrefix={t("tryon.resultPrefix")}
                      expectedCount={activeResultExpectedCount}
                      isGenerating={store.isGenerating}
                      inputThumbnails={safeTaskQueueUrls(activeQueueTask?.inputThumbnails)}
                      inputReferences={activeTaskReferences}
                      createdAt={activeQueueTask?.createdAt}
                      statusGroup={activeQueueTask?.statusGroup}
                      variant="task"
                      renderKey={activeQueueTask?.id || "tryon-create"}
                      markMissingAsFailed={hasCompletedPartialResults}
                      missingFailureLabel={t("generate.thisImageFailed")}
                      missingFailureDetail={partialFailureMessage}
                      missingFailureActionLabel={t("generate.retryThisImage")}
                      onMissingFailureAction={handleRetryFailedResult}
                      missingFailureActionDisabled={retryDisabled}
                      failureLabel={t("generate.failed")}
                      failureDetail={activeFailureMessage || undefined}
                    
                tileAspectRatio={aspectRatio}
              />
                  </div>
                </div>

                <StudioImagePreviewDialog
                  open={previewIndex !== null}
                  onClose={() => setPreviewIndex(null)}
                  session={tryonPreviewSession}
                  selectedIndex={previewIndex || 0}
                  onSelectedIndexChange={setPreviewIndex}
                  filenamePrefix="tryon"
                  actions={TRYON_PREVIEW_ACTIONS}
                  onRegenerateAll={handleContinueCreate}
                />
              </div>
            )}
          />
        )}
      />

      <TryOnSourceLibraryDialog
        open={sourceLibrary.role !== null}
        targetLabel={sourceLibrary.targetLabel}
        items={sourceLibrary.items}
        isLoading={sourceLibrary.isLoading}
        error={sourceLibrary.error}
        onClose={sourceLibrary.close}
        onRefresh={sourceLibrary.load}
        onSelect={applySourceLibraryItem}
      />

      {rulesPopoverStyle && (
        <TryOnRulePopover
          open={showClothingRules}
          style={{
            top: rulesPopoverStyle.top,
            left: rulesPopoverStyle.left,
            maxHeight: rulesPopoverStyle.maxHeight,
          }}
          clothingMode={clothingMode}
          rule={currentUploadRule}
          onMouseEnter={cancelRulesHide}
          onMouseLeave={scheduleRulesHide}
          onApplyDemo={applyRuleDemo}
        />
      )}

      <ReferenceScenePicker
        open={false && isReferenceScenePanelOpen}
        tabs={[
          { value: "recommended", label: t("sceneTab.recommended") },
          { value: "exclusive", label: t("sceneTab.exclusive") },
          { value: "all", label: t("sceneTab.all") },
        ]}
        activeTab={referencePanelTab}
        onTabChange={(tab) => {
          setReferencePanelTab(tab);
          setActiveReferenceSceneUrl(null);
        }}
        mainReferences={referencePanelMainReferences}
        activeReference={activeReferenceScene}
        childReferences={activeReferenceSceneChildren}
        selectedCount={selectedReferenceCount}
        maxSelected={MAX_TRYON_REFERENCE_IMAGES}
        categoryLabels={(clothingAnalysis?.subcategories || [])
          .slice(0, 2)
          .map((category) => TRYON_CATEGORY_BY_CODE.get(category)?.nameZh || category)}
        viewFilter={referencePanelViewFilter}
        onViewFilterChange={setReferencePanelViewFilter}
        bodyFilter={referencePanelBodyFilter}
        onBodyFilterChange={setReferencePanelBodyFilter}
        search={referencePanelSearch}
        onSearchChange={setReferencePanelSearch}
        isSelected={isReferenceSelected}
        onActiveReferenceChange={setActiveReferenceSceneUrl}
        onToggleReference={(ref) => {
          if (!switchSceneMode("upload_reference")) return;
          toggleReferenceImage(ref as SelectedReferenceImage);
        }}
        onClearSelected={clearSelectedReferences}
        onClose={() => setIsReferenceScenePanelOpen(false)}
        onConfirm={() => setIsReferenceScenePanelOpen(false)}
        onPreview={(url, label) => openLightbox(url, label || t("sceneTab.mainScene"))}
      />

      <TryOnLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />
      {unsavedChangesDialog}
      <OnboardingCoach show={showOnboarding} />

    </>
  );
}
