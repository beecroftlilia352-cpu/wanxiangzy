"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Layers3,
  Loader2,
  RefreshCw,
  Settings2,
  Activity,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { StudioUploadTile } from "@/components/studio/StudioUploadTile";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { useStableFileDrag } from "@/components/studio/useStableFileDrag";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import { StudioMediaLightbox } from "@/components/studio/StudioMediaLightbox";
import { fetchHistoryApplyDetail, getHistoryApplyFailureMessage, isHistoryApplyRowFailed, takeApplyDetail } from "@/lib/history-apply";
import { getImageVariantUrl } from "@/lib/image-variants";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";
import { downloadImage, generateDownloadFilename, MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { applyGenerationResponseStatus, showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { buildPartialFailureDetail, summarizeGenerationError } from "@/lib/studio-generation-feedback";
import { createProductSetPreviewSession, takeSourceImageFromLocation, type ImagePreviewResultStatus } from "@/lib/studio-image-preview";
import {
  PRODUCT_SET_EXAMPLE_GROUPS,
  PRODUCT_SET_PRESET_PLANS,
  PRODUCT_SET_PROMPT_VERSION,
  PRODUCT_SET_STYLE_PACKS,
  buildProductSetPlanRecommendation,
  getProductSetModuleQualityLabel,
  getProductSetModuleKey,
  getProductSetTemplates,
  getProductSetVisualDirectorPlanCount,
  normalizeProductSetProductProfile,
  resolveProductSetTemplates,
  type ProductSetCreationMode,
  type ProductSetCustomTemplate,
  type ProductSetImageType,
  type ProductSetModuleOverride,
  type ProductSetModuleResult,
  type ProductSetProductProfile,
  type ProductSetResolvedTemplate,
  type ProductSetSettings,
} from "@/lib/product-set";
import {
  buildDefaultFavoritePlanName,
  buildFavoritePlanApplyState,
  buildSavedProductSetPlan,
  getPlanSourceTabForProductSetState,
  getSelectedPlanIdForProductSetState,
  normalizeFavoriteProductSetPlan,
  type ProductSetPlanSourceTab,
  type SavedProductSetPlan,
} from "@/lib/product-set-ui-state";
import {
  getAnalysisFallbackMessage,
  getDefaultGenerationCount,
  getProductAnalysisStatus,
  isPlaceholderProductName,
  parseProductInfo,
  resolveAnalysisSource,
  type ProductAnalysisSource,
} from "@/features/product-set/create/product-info";
import {
  COUNT_OPTIONS,
  DEFAULT_DRAFT,
  DEFAULT_REFERENCE_STYLE_BRIEF,
  DEFAULT_SETTINGS,
  FAVORITE_PRODUCT_SET_PLAN_LIMIT,
  PLAN_SOURCE_TABS,
  buildReferenceStyleBrief,
  getAspectRatioLabel,
} from "@/features/product-set/create/config";
import type {
  CustomDraft,
  ProductImage,
  ProductSetAnalysisDetail,
  ProductSetHistoryPayload,
  TemplateFilter,
} from "@/features/product-set/create/types";
import {
  CountSelector,
  ProductModeTabs,
  WorkflowStepper,
} from "@/features/product-set/create/controls";
import {
  AnalysisSummaryCard,
  ProductAnalysisNotice,
  ProductBriefSummary,
  ProductProfileCard,
  ProductVisualStrategyCard,
} from "@/features/product-set/create/analysis-sections";
import {
  ModuleEditModal,
  ProductProfileEditorModal,
  ReferenceStyleModal,
  SettingsModal,
} from "@/features/product-set/create/edit-dialogs";
import { CustomTemplateSourcePanel } from "@/features/product-set/create/custom-template-source-panel";
import { FavoritePlanPanel } from "@/features/product-set/create/favorite-plan-panel";
import { GenerationSettingsSummary } from "@/features/product-set/create/generation-settings-summary";
import { ModelConfigPanel } from "@/features/product-set/create/model-config-panel";
import { PlanList } from "@/features/product-set/create/plan-list";
import { PlanRecommendationCard } from "@/features/product-set/create/plan-recommendation-card";
import { ResultsCanvas } from "@/features/product-set/create/results-canvas";
import { TemplateLibraryDialog } from "@/features/product-set/create/template-library-dialog";

export default function ProductSetPage() {
  const t = useTranslations("ProductSet");
  const router = useRouter();
  const productInputRef = useRef<HTMLInputElement>(null);
  const { confirm, confirmDialog } = useConfirm();
  const customRefInputRef = useRef<HTMLInputElement>(null);
  const customModelRefInputRef = useRef<HTMLInputElement>(null);
  const customOtherRefInputRef = useRef<HTMLInputElement>(null);

  const {
    authChecked,
    isAuthenticated,
    userId,
    credits,
    setCredits,
    refreshAuth,
    refreshCredits,
  } = useStudioAuth();
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [productInfo, setProductInfo] = useState("");
  const [productProfile, setProductProfile] = useState<ProductSetProductProfile | null>(null);
  const [analysisDetail, setAnalysisDetail] = useState<ProductSetAnalysisDetail | null>(null);
  const [analysisSource, setAnalysisSource] = useState<ProductAnalysisSource>("idle");
  const [analysisMessage, setAnalysisMessage] = useState("");
  const [showProductInfoEditor, setShowProductInfoEditor] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [settings, setSettings] = useState<ProductSetSettings>(DEFAULT_SETTINGS);
  const [mode, setMode] = useState<ProductSetCreationMode>("smart");
  const [planSourceTab, setPlanSourceTab] = useState<ProductSetPlanSourceTab>("smart");
  const [imageType, setImageType] = useState<ProductSetImageType>("details");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("smart");
  const [customTemplates, setCustomTemplates] = useState<ProductSetCustomTemplate[]>([]);
  const [moduleOverrides, setModuleOverrides] = useState<ProductSetModuleOverride[]>([]);
  const [editingModuleIndex, setEditingModuleIndex] = useState<number | null>(null);
  const [customDraft, setCustomDraft] = useState<CustomDraft>(DEFAULT_DRAFT);
  const [aiModel, setAiModel] = useState<LingyaModel>("nano-banana-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
  const [imageSize, setImageSize] = useState<ImageSize>("2K");
  const [genCount, setGenCount] = useState(0);
  const [qualityMode, setQualityMode] = useState<"standard" | "advanced">("standard");
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploadingCustomRef, setIsUploadingCustomRef] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [moduleResults, setModuleResults] = useState<ProductSetModuleResult[]>([]);
  const [resultPlan, setResultPlan] = useState<ProductSetResolvedTemplate[]>([]);
  const [error, setError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [activeQueueTask, setActiveQueueTask] = useState<TaskQueueItem | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [showAnalysisDetails, setShowAnalysisDetails] = useState(false);
  const [showFullPlan, setShowFullPlan] = useState(false);
  const [showGenerationSettings, setShowGenerationSettings] = useState(false);
  const [showReferenceStyleModal, setShowReferenceStyleModal] = useState(false);
  const [referenceStyleBrief, setReferenceStyleBrief] = useState("");
  const [referenceStyleDraft, setReferenceStyleDraft] = useState(DEFAULT_REFERENCE_STYLE_BRIEF);
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>("all");
  const [templateQuery, setTemplateQuery] = useState("");
  const [favoritePlans, setFavoritePlans] = useState<SavedProductSetPlan[]>([]);
  const [favoritePlanName, setFavoritePlanName] = useState("");
  const [isLoadingFavoritePlans, setIsLoadingFavoritePlans] = useState(false);
  const [isSavingFavoritePlan, setIsSavingFavoritePlan] = useState(false);
  const productImageDrag = useStableFileDrag<HTMLElement>({
    isDragging,
    setDragging: setIsDragging,
    fileFilter: (file) => file.type.startsWith("image/"),
    onFiles: processFiles,
  });

  const templates = useMemo(() => getProductSetTemplates(imageType), [imageType]);
  const activeSelectedTemplateIds = useMemo(
    () => selectedTemplateIds.filter((id) => templates.some((template) => template.id === id)),
    [selectedTemplateIds, templates]
  );
  const activeCustomTemplates = useMemo(
    () => customTemplates.filter((template) => template.imageType === imageType),
    [customTemplates, imageType]
  );
  const productInfoFields = useMemo(() => parseProductInfo(productInfo), [productInfo]);
  const displayProductInfoFields = useMemo(() => ({
    ...productInfoFields,
    name: isPlaceholderProductName(productInfoFields.name) ? t("unrecognizedProductName") : productInfoFields.name,
  }), [productInfoFields]);
  const effectiveProductProfile = useMemo(
    () => normalizeProductSetProductProfile(productProfile, productInfo),
    [productProfile, productInfo]
  );
  const analysisStatus = getProductAnalysisStatus({
    source: isAnalyzing ? "running" : analysisSource,
    hasProductInfo: Boolean(productInfo.trim()),
    message: analysisMessage,
  });
  const hasAnalyzedProduct = analysisSource === "ai" || analysisSource === "history";
  const isReferenceMode = planSourceTab !== "smart";
  const canResolvePlan = hasAnalyzedProduct;
  const planTemplates = useMemo(
    () => canResolvePlan ? resolveProductSetTemplates({
      mode,
      imageType,
      selectedTemplateIds: activeSelectedTemplateIds,
      customTemplates: activeCustomTemplates,
      genCount,
      productProfile: effectiveProductProfile,
      settings,
      moduleOverrides,
    }) : [],
    [canResolvePlan, mode, imageType, activeSelectedTemplateIds, activeCustomTemplates, genCount, effectiveProductProfile, settings, moduleOverrides]
  );
  const planRecommendation = useMemo(
    () => buildProductSetPlanRecommendation({
      mode,
      imageType,
      templates: planTemplates,
      productProfile: effectiveProductProfile,
    }),
    [mode, imageType, planTemplates, effectiveProductProfile]
  );
  const supportedSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const outputCount = planTemplates.length;
  const cost = planTemplates.length
    ? planTemplates.reduce((sum, template) => sum + getCreditCost(aiModel, imageSize, template.aspectRatio || aspectRatio), 0)
    : 0;
  const taskInputThumbnails = useMemo(
    () => productImages.map((item) => item.url).filter(Boolean),
    [productImages]
  );
  const taskQueue = useTaskQueueGeneration({
    module: "productSet",
    title: t("moduleName"),
    defaultExpectedCount: Math.max(1, outputCount || genCount),
    applyPath: "/product-set",
  });
  useEffect(() => {
    const sourceImage = takeSourceImageFromLocation();
    if (sourceImage) {
      setProductImages([{ url: sourceImage, name: t("fromResultPreview") }]);
      toast.success(t("previewImageImported"));
    }
  }, []);
  const requiresProductConfirmation = productImages.length > 0 && !isAnalyzing && mode === "smart" && !hasAnalyzedProduct;
  const canGenerate = !isGenerating && !isUploading && !isAnalyzing && canResolvePlan && productImages.length > 0 && Boolean(productInfo.trim()) && outputCount > 0;
  const canAnalyzeProduct = !isAnalyzing && !isUploading && productImages.length > 0;
  const workflowStep = !productImages.length ? 1 : (!productInfo.trim() || genCount <= 0) ? 2 : canResolvePlan && outputCount > 0 ? 4 : 3;
  const selectedStylePack = PRODUCT_SET_STYLE_PACKS.find((pack) => pack.id === settings.stylePackId) || PRODUCT_SET_STYLE_PACKS[0];
  const settingsSummary = `${settings.country} · ${settings.language} · ${settings.platform} · ${selectedStylePack.name} · ${t(`fontStyle.${settings.fontStyle}`)}`;
  const countOptions = COUNT_OPTIONS;
  const outputUnit = imageType === "main" ? t("units.mainImage") : t("units.detailPage");
  const detailsResolutionWarning = imageType === "details" && imageSize === "1K";
  const visiblePresetPlans = useMemo(
    () => PRODUCT_SET_PRESET_PLANS.filter((plan) => plan.id === "smart" || plan.imageType === imageType),
    [imageType]
  );
  const favoritePlanDefaultName = useMemo(
    () => buildDefaultFavoritePlanName(displayProductInfoFields.name, imageType, isPlaceholderProductName),
    [displayProductInfoFields.name, imageType]
  );

  useEffect(() => {
    let cancelled = false;
    if (!authChecked) return;
    if (!isAuthenticated) {
      setFavoritePlans([]);
      setIsLoadingFavoritePlans(false);
      return;
    }

    setIsLoadingFavoritePlans(true);
    fetch("/api/product-set/favorite-plans")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || t("favoritePlanLoadFailed"));
        const rawPlans = data && typeof data === "object" && Array.isArray((data as { plans?: unknown }).plans)
          ? (data as { plans: unknown[] }).plans
          : [];
        const plans = rawPlans.length
          ? rawPlans.map((item) => normalizeFavoriteProductSetPlan(item, DEFAULT_SETTINGS)).filter((plan): plan is SavedProductSetPlan => Boolean(plan))
          : [];
        if (!cancelled) setFavoritePlans(plans);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : t("favoritePlanLoadFailed"));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingFavoritePlans(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authChecked, isAuthenticated]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
    const detail = await takeApplyDetail("productSet");
    const applyPayload = detail?.payload;
    if (cancelled || !applyPayload) return;

    const appliedImageType = applyPayload.imageType === "details" ? "details" : "main";
    setProductImages(applyPayload.productImageUrls.slice(0, 3).map((url, index) => ({ url, name: t("historyProductImage", { index: index + 1 }) })));
    setProductInfo(applyPayload.productInfo || "");
    setProductProfile(normalizeProductSetProductProfile(applyPayload.productProfile, applyPayload.productInfo || ""));
    setAnalysisDetail(null);
    setAnalysisSource(applyPayload.productInfo ? "history" : "idle");
    setAnalysisMessage("");
    setSettings({ ...DEFAULT_SETTINGS, ...(applyPayload.settings || {}) });
    const appliedMode = applyPayload.mode === "custom" ? "custom" : "smart";
    setMode(appliedMode);
    setPlanSourceTab(getPlanSourceTabForProductSetState({
      mode: appliedMode,
      selectedPlanId: appliedMode === "custom" ? "custom" : "smart",
      customTemplates: applyPayload.customTemplates || [],
    }));
    setImageType(appliedImageType);
    setSelectedTemplateIds(applyPayload.selectedTemplateIds || []);
    setSelectedPlanId(appliedMode === "custom" ? "custom" : "smart");
    setCustomTemplates(applyPayload.customTemplates || []);
    setModuleOverrides(applyPayload.moduleOverrides || []);
    setAiModel(applyPayload.aiModel);
    setAspectRatio(applyPayload.aspectRatio);
    setImageSize(applyPayload.imageSize);
    setGenCount(Math.min(Math.max(applyPayload.genCount || getDefaultGenerationCount(appliedImageType), 1), appliedImageType === "details" ? 8 : 6));
    setActiveQueueTask(null);
    setResultUrls(detail.resultUrls);
    setModuleResults([]);
    setResultPlan([]);
    setError(isHistoryApplyRowFailed(detail.row) ? getHistoryApplyFailureMessage(detail.row) : "");
    setProgress(detail.resultUrls.length ? 100 : 0);
    setIsGenerating(false);
    toast.success(t("historyParamsApplied"));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0] || "1K");
  }, [aiModel, aspectRatio, imageSize]);

  function resetOutput() {
    setActiveQueueTask(null);
    setIsGenerating(false);
    setRegeneratingIndex(null);
    setResultUrls([]);
    setModuleResults([]);
    setResultPlan([]);
    setError("");
    setProgress(0);
  }

  function handleContinueCreate() {
    setProductImages([]);
    setProductInfo("");
    setProductProfile(null);
    setAnalysisDetail(null);
    setAnalysisSource("idle");
    setAnalysisMessage("");
    setShowProductInfoEditor(false);
    setShowProfileEditor(false);
    setSettings({ ...DEFAULT_SETTINGS });
    setMode("smart");
    setPlanSourceTab("smart");
    setImageType("details");
    setSelectedTemplateIds([]);
    setSelectedPlanId("smart");
    setCustomTemplates([]);
    setModuleOverrides([]);
    setEditingModuleIndex(null);
    setCustomDraft({ ...DEFAULT_DRAFT });
    setAiModel("nano-banana-2");
    setAspectRatio("auto");
    setImageSize("2K");
    setGenCount(0);
    setQualityMode("standard");
    setReferenceStyleBrief("");
    setReferenceStyleDraft(DEFAULT_REFERENCE_STYLE_BRIEF);
    setTemplateFilter("all");
    setTemplateQuery("");
    setFavoritePlanName("");
    setShowSettingsModal(false);
    setShowTemplateModal(false);
    setShowCustomBuilder(false);
    setShowAnalysisDetails(false);
    setShowFullPlan(false);
    setShowGenerationSettings(false);
    setShowReferenceStyleModal(false);
    setLightboxSrc(null);
    resetOutput();
    if (productInputRef.current) productInputRef.current.value = "";
    if (customRefInputRef.current) customRefInputRef.current.value = "";
    if (customModelRefInputRef.current) customModelRefInputRef.current.value = "";
    if (customOtherRefInputRef.current) customOtherRefInputRef.current.value = "";
  }

  function confirmContinueCreate() {
    confirm({
      title: t("continueCreate.title"),
      content: t("continueCreate.content"),
      okText: t("common.confirm"),
      cancelText: t("common.cancel"),
      onOk: () => {
        handleContinueCreate();
      },
    });
  }

  function applyProductSetHistoryPayload(applyPayload: ProductSetHistoryPayload, historyResultUrls: string[] = [], options?: { silent?: boolean }) {
    const appliedImageType = applyPayload.imageType === "details" ? "details" : "main";
    const nextSettings = { ...DEFAULT_SETTINGS, ...(applyPayload.settings || {}) };
    const nextMode = applyPayload.mode === "custom" ? "custom" : "smart";
    const nextSelectedTemplateIds = applyPayload.selectedTemplateIds || [];
    const nextCustomTemplates = applyPayload.customTemplates || [];
    const nextSelectedPlanId = getSelectedPlanIdForProductSetState({
      mode: nextMode,
      imageType: appliedImageType,
      selectedTemplateIds: nextSelectedTemplateIds,
    });
    const nextGenCount = Math.min(
      Math.max(applyPayload.genCount || getDefaultGenerationCount(appliedImageType), 1),
      appliedImageType === "details" ? 8 : 6
    );

    setProductImages(applyPayload.productImageUrls.slice(0, 3).map((url, index) => ({ url, name: t("historyProductImage", { index: index + 1 }) })));
    setProductInfo(applyPayload.productInfo || "");
    setProductProfile(normalizeProductSetProductProfile(applyPayload.productProfile, applyPayload.productInfo || ""));
    setAnalysisDetail(null);
    setAnalysisSource(applyPayload.productInfo ? "history" : "idle");
    setAnalysisMessage("");
    setSettings(nextSettings);
    setMode(nextMode);
    setPlanSourceTab(getPlanSourceTabForProductSetState({
      mode: nextMode,
      selectedPlanId: nextSelectedPlanId,
      customTemplates: nextCustomTemplates,
    }));
    setImageType(appliedImageType);
    setSelectedTemplateIds(nextSelectedTemplateIds);
    setSelectedPlanId(nextSelectedPlanId);
    setCustomTemplates(nextCustomTemplates);
    setModuleOverrides(applyPayload.moduleOverrides || []);
    setAiModel(applyPayload.aiModel);
    setAspectRatio(applyPayload.aspectRatio);
    setImageSize(applyPayload.imageSize);
    setGenCount(nextGenCount);
    setActiveQueueTask(null);
    setResultUrls(historyResultUrls);
    setModuleResults([]);
    setResultPlan([]);
    setError("");
    setProgress(historyResultUrls.length ? 100 : 0);
    setIsGenerating(false);
    setRegeneratingIndex(null);
    if (!options?.silent) toast.success(t("historyParamsApplied"));
  }

  function resetAnalysisPlan(source: ProductAnalysisSource = productInfo.trim() ? "manual" : "idle", message = "") {
    setProductProfile(null);
    setAnalysisDetail(null);
    setAnalysisSource(source);
    setAnalysisMessage(message);
    setSettings((prev) => ({ ...prev, visualDirectorScript: "", visualDirectorPlan: undefined }));
    setModuleOverrides([]);
    setShowAnalysisDetails(false);
    setShowFullPlan(false);
    setShowGenerationSettings(false);
    resetOutput();
  }

  function changeGenerationCount(value: number) {
    setGenCount(value);
    resetOutput();
    if (analysisSource === "ai" || analysisSource === "history") {
      resetAnalysisPlan("manual", t("countAdjustedNeedReanalyze"));
      toast.info(t("countUpdatedNeedReanalyze"));
    }
  }

  async function processFiles(files: FileList | File[]) {
    const incoming = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (!incoming.length) return toast.error(t("upload.pleaseUploadImage"));
    const freeSlots = Math.max(0, 3 - productImages.length);
    if (!freeSlots) return toast.error(t("upload.maxThreeImages"));
    const filesToUpload = incoming.slice(0, freeSlots);
    if (incoming.length > filesToUpload.length) toast.info(t("upload.extraIgnored"));
    const emptyFile = filesToUpload.find((file) => file.size === 0);
    if (emptyFile) return toast.error(t("upload.emptyFile", { name: emptyFile.name }));
    const oversized = filesToUpload.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) return toast.error(t("upload.oversized", { name: oversized.name, mb: MAX_FILE_SIZE_MB }));

    setIsUploading(true);
    setProductInfo("");
    setProductProfile(null);
    setAnalysisDetail(null);
    setAnalysisSource("idle");
    setAnalysisMessage("");
    setSettings((prev) => ({ ...prev, visualDirectorScript: "", visualDirectorPlan: undefined }));
    setModuleOverrides([]);
    resetOutput();
    toast.info(t("upload.uploading", { count: filesToUpload.length }));
    try {
      const results = await Promise.allSettled(filesToUpload.map((file) => uploadImage(file)));
      const next: ProductImage[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          next.push({ url: result.value.url, name: filesToUpload[index].name || t("upload.productImageName", { index: productImages.length + index + 1 }) });
        } else {
          toast.error(t("upload.uploadFailed", { name: filesToUpload[index].name }));
        }
      });
      if (next.length) {
        setProductImages((prev) => [...prev, ...next].slice(0, 3));
        toast.success(t("upload.donePleaseAnalyze"));
      }
    } finally {
      setIsUploading(false);
      if (productInputRef.current) productInputRef.current.value = "";
    }
  }

  function applyExampleGroup(group: typeof PRODUCT_SET_EXAMPLE_GROUPS[number]) {
    setProductImages(group.images.map((url, index) => ({ url, name: t("exampleGroupImage", { name: group.name, index: index + 1 }) })));
    setProductInfo("");
    setProductProfile(null);
    setAnalysisDetail(null);
    setAnalysisSource("idle");
    setAnalysisMessage("");
    setSettings((prev) => ({ ...prev, visualDirectorScript: "", visualDirectorPlan: undefined }));
    setModuleOverrides([]);
    resetOutput();
    toast.success(t("exampleGroupApplied", { name: group.name }));
  }

  function removeProductImage(index: number) {
    setProductImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setProductInfo("");
    setProductProfile(null);
    setAnalysisDetail(null);
    setAnalysisSource("idle");
    setAnalysisMessage("");
    setSettings((prev) => ({ ...prev, visualDirectorScript: "", visualDirectorPlan: undefined }));
    setModuleOverrides([]);
    resetOutput();
  }

  async function analyzeProductInfo(options: { silent?: boolean } = {}) {
    if (!productImages.length) return toast.error(t("analyze.pleaseUploadFirst"));
    if (genCount <= 0) return toast.error(t("analyze.pleaseSelectCount", { unit: imageType === "main" ? t("analysis.genCount") : t("analysis.detailScreenCount") }));
    if (!isAuthenticated && !(await refreshAuth())) {
      if (!options.silent) toast.error(t("analyze.pleaseLogin"));
      return;
    }
    setIsAnalyzing(true);
    setAnalysisSource("running");
    setAnalysisMessage("");
    if (!options.silent) toast.info(productInfo.trim() ? t("analyze.optimizing") : t("analyze.writingInfo"));
    try {
      const res = await fetch("/api/product-set/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_image_urls: productImages.map((item) => item.url),
          product_info: productInfo.trim(),
          reference_style_info: referenceStyleBrief.trim(),
          image_type: imageType,
          gen_count: genCount,
          target_platform: settings.platform,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        await refreshAuth();
        if (!options.silent) router.push("/login");
        return;
      }
      if (!res.ok) throw new Error(data.error || t("analysis.failed"));
      if (data.product_info) {
        const nextProductInfo = String(data.product_info).slice(0, 2000);
        const nextAnalysisSource = resolveAnalysisSource(data, nextProductInfo);
        setProductInfo(nextProductInfo);
        setAnalysisSource(nextAnalysisSource);
        setAnalysisMessage(nextAnalysisSource === "fallback" ? getAnalysisFallbackMessage(data.reason) : "");
        const nextProfile = normalizeProductSetProductProfile(data.product_profile, nextProductInfo);
        setProductProfile(nextProfile);
        setAnalysisDetail(nextAnalysisSource === "ai" && data.analysis && typeof data.analysis === "object" ? data.analysis as ProductSetAnalysisDetail : null);
        let analyzedPlanCount = 0;
        if (nextAnalysisSource === "ai" && data.settings_patch && typeof data.settings_patch === "object") {
          const patch = data.settings_patch as Partial<ProductSetSettings>;
          analyzedPlanCount = getProductSetVisualDirectorPlanCount(patch.visualDirectorPlan, imageType);
          setSettings((prev) => ({
            ...prev,
            ...patch,
            extraDescription: patch.extraDescription
              ? [prev.extraDescription, patch.extraDescription].filter(Boolean).join("\n").slice(0, 600)
              : prev.extraDescription,
            visualDirectorScript: patch.visualDirectorScript || "",
            visualDirectorPlan: patch.visualDirectorPlan,
          }));
        }
        if (mode === "smart" && selectedPlanId === "smart" && analyzedPlanCount > 0 && analyzedPlanCount !== genCount) {
          setAnalysisMessage(t("analysis.countMismatch", { genCount, unit: imageType === "main" ? t("units.singleImage") : t("units.singleScreen"), analyzedPlanCount }));
        }
        setShowProductInfoEditor(false);
        setShowAnalysisDetails(false);
        setShowFullPlan(false);
        setShowGenerationSettings(false);
        if (!options.silent) {
          if (nextAnalysisSource === "ai") toast.success(productInfo.trim() ? t("analysis.infoAnalyzed") : t("analysis.infoWritten"));
          else toast.warning(t("analysis.visualIncomplete"));
        }
      } else {
        setAnalysisSource("fallback");
        setAnalysisDetail(null);
        setAnalysisMessage(t("analysis.noInfoReturned"));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("analysis.failed");
      setAnalysisSource("failed");
      setAnalysisDetail(null);
      setAnalysisMessage(message);
      if (!options.silent) toast.error(message);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function uploadCustomReference(kind: "style" | "model" | "other", file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error(t("upload.pleaseUploadImage"));
    if (file.size === 0) return toast.error(t("customRef.emptyFile"));
    if (file.size > MAX_FILE_SIZE) return toast.error(t("upload.imageTooLarge", { mb: MAX_FILE_SIZE_MB }));
    setMode("custom");
    setPlanSourceTab("upload");
    setSelectedPlanId("custom");
    setIsUploadingCustomRef(true);
    try {
      const result = await uploadImage(file);
      setCustomDraft((prev) => {
        const defaults = {
          name: prev.name && prev.name !== DEFAULT_DRAFT.name ? prev.name : (imageType === "details" ? t("custom.detailsPlanName") : t("custom.mainPlanName")),
          typeDescription: prev.typeDescription || t("custom.typeDescriptionDefault"),
          moduleRole: prev.moduleRole || (imageType === "details" ? t("custom.detailsRole") : t("custom.mainRole")),
        };
        if (kind === "model") return { ...prev, ...defaults, modelReferenceImageUrls: [result.url], modelConsistency: true };
        if (kind === "other") return { ...prev, ...defaults, otherReferenceImageUrls: [...prev.otherReferenceImageUrls, result.url].slice(0, 3) };
        return { ...prev, ...defaults, referenceImageUrls: [result.url] };
      });
      toast.success(t("custom.referenceUploaded"));
      resetOutput();
    } catch {
      toast.error(t("custom.referenceUploadFailed"));
    } finally {
      setIsUploadingCustomRef(false);
      if (customRefInputRef.current) customRefInputRef.current.value = "";
      if (customModelRefInputRef.current) customModelRefInputRef.current.value = "";
      if (customOtherRefInputRef.current) customOtherRefInputRef.current.value = "";
    }
  }

  function addCustomTemplate() {
    const hasReferenceImage = [
      ...customDraft.referenceImageUrls,
      ...customDraft.modelReferenceImageUrls,
      ...customDraft.otherReferenceImageUrls,
    ].some(Boolean);
    if (!customDraft.typeDescription.trim() && !hasReferenceImage) return toast.error(t("custom.pleaseUploadOrDescribe"));
    if (genCount <= 0) return toast.error(t("analyze.pleaseSelectCount", { unit: imageType === "main" ? t("analysis.genCount") : t("analysis.detailScreenCount") }));
    const fallbackDescription = t("custom.fallbackDescription", { count: genCount || 1, unit: imageType === "main" ? t("units.mainImageAux") : t("units.detailPage") });
    const fallbackName = imageType === "main" ? t("custom.mainPlanName") : t("custom.detailsPlanName");
    const item: ProductSetCustomTemplate = {
      id: `custom-${Date.now()}`,
      name: (customDraft.name.trim() || fallbackName).slice(0, 20),
      imageType,
      typeDescription: (customDraft.typeDescription.trim() || fallbackDescription).slice(0, 600),
      aspectRatio: customDraft.aspectRatio,
      referenceImageUrls: customDraft.referenceImageUrls,
      modelReferenceImageUrls: customDraft.modelReferenceImageUrls,
      otherReferenceImageUrls: customDraft.otherReferenceImageUrls,
      extraDescription: customDraft.extraDescription.trim().slice(0, 600),
      subjectConsistency: customDraft.subjectConsistency,
      modelConsistency: customDraft.modelConsistency,
      intelligentCopy: customDraft.intelligentCopy,
      copyDensity: customDraft.copyDensity,
      moduleRole: (customDraft.moduleRole.trim() || (imageType === "details" ? t("custom.detailsPageRole") : t("custom.mainImageRole"))).slice(0, 120),
      contentScope: customDraft.contentScope.trim().slice(0, 240),
      layoutRules: customDraft.layoutRules.trim().slice(0, 320),
      textRules: customDraft.textRules.trim().slice(0, 260),
      avoidRules: customDraft.avoidRules.trim().slice(0, 320),
    };
    setMode("custom");
    setPlanSourceTab("upload");
    setSelectedPlanId("custom");
    setCustomTemplates((prev) => [...prev, item].slice(-10));
    setModuleOverrides([]);
    setCustomDraft(DEFAULT_DRAFT);
    setShowCustomBuilder(false);
    resetOutput();
    toast.success(t("custom.addedReferenceMode"));
  }

  function toggleTemplate(id: number) {
    setMode("custom");
    setPlanSourceTab("preset");
    setSelectedPlanId("custom");
    setSelectedTemplateIds((prev) => replaceSelectedTemplateIdsForImageType(
      prev,
      imageType,
      activeSelectedTemplateIds.includes(id)
        ? activeSelectedTemplateIds.filter((item) => item !== id)
        : [...activeSelectedTemplateIds, id].slice(0, 10)
    ));
    setModuleOverrides([]);
    resetOutput();
  }

  function upsertModuleOverride(index: number, patch: Partial<ProductSetModuleOverride>) {
    const template = planTemplates[index];
    if (!template) return;
    const key = getProductSetModuleKey(template, index);
    setModuleOverrides((prev) => {
      const existing = prev.find((item) => item.key === key);
      const next = { ...(existing || { key }), ...patch, key };
      return [...prev.filter((item) => item.key !== key), next].slice(-10);
    });
    resetOutput();
  }

  function removePlanModule(index: number) {
    upsertModuleOverride(index, { disabled: true });
    toast.success(t("plan.moduleRemoved"));
  }

  async function saveCurrentPlanAsFavorite() {
    if (!isAuthenticated && !(await refreshAuth())) return toast.error(t("favorite.pleaseLogin"));
    if (!planTemplates.length) return toast.error(t("favorite.nothingToSave"));
    const now = new Date().toISOString();
    const name = (favoritePlanName.trim() || favoritePlanDefaultName).slice(0, 40);
    const existing = favoritePlans.find((plan) => plan.name === name);
    const nextPlan = buildSavedProductSetPlan({
      existingPlan: existing,
      name,
      now,
      mode,
      imageType,
      genCount,
      settings,
      selectedTemplateIds: activeSelectedTemplateIds,
      customTemplates: activeCustomTemplates,
      moduleOverrides,
      aiModel,
      aspectRatio,
      imageSize,
      qualityMode,
      planTemplates,
      productProfile: effectiveProductProfile,
    });
    setIsSavingFavoritePlan(true);
    try {
      const res = await fetch("/api/product-set/favorite-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPlan),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        await refreshAuth();
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error(data.error || t("favorite.saveFailed"));
      const savedPlan = normalizeFavoriteProductSetPlan(data.plan, DEFAULT_SETTINGS);
      if (!savedPlan) throw new Error(t("favorite.saveInvalidResult"));
      setFavoritePlans((prev) => [savedPlan, ...prev.filter((plan) => plan.id !== savedPlan.id && plan.name !== savedPlan.name)]
        .slice(0, FAVORITE_PRODUCT_SET_PLAN_LIMIT));
      setFavoritePlanName("");
      toast.success(existing ? t("favorite.updated") : t("favorite.saved"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("favorite.saveFailed"));
    } finally {
      setIsSavingFavoritePlan(false);
    }
  }

  function applyFavoritePlan(plan: SavedProductSetPlan) {
    const nextState = buildFavoritePlanApplyState(plan, {
      defaultSettings: DEFAULT_SETTINGS,
      defaultGenCount: getDefaultGenerationCount(plan.imageType, effectiveProductProfile),
    });
    setMode(nextState.mode);
    setPlanSourceTab(nextState.planSourceTab);
    setImageType(nextState.imageType);
    setSelectedPlanId(nextState.selectedPlanId);
    setSelectedTemplateIds(nextState.selectedTemplateIds);
    setCustomTemplates(nextState.customTemplates);
    setModuleOverrides(nextState.moduleOverrides);
    setSettings(nextState.settings);
    setAiModel(nextState.aiModel);
    setAspectRatio(nextState.aspectRatio);
    setImageSize(nextState.imageSize);
    setQualityMode(nextState.qualityMode);
    setGenCount(nextState.genCount);
    resetOutput();
    toast.success(t("favorite.applied", { name: plan.name }));
  }

  async function removeFavoritePlan(id: string) {
    if (!isAuthenticated && !(await refreshAuth())) return toast.error(t("common.pleaseLogin"));
    const previousPlans = favoritePlans;
    setFavoritePlans((prev) => prev.filter((plan) => plan.id !== id));
    try {
      const res = await fetch(`/api/product-set/favorite-plans/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        await refreshAuth();
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error(data.error || t("favorite.deleteFailed"));
      toast.success(t("favorite.deleted"));
    } catch (err: unknown) {
      setFavoritePlans(previousPlans);
      toast.error(err instanceof Error ? err.message : t("favorite.deleteFailed"));
    }
  }

  function confirmRemoveFavoritePlan(id: string) {
    confirm({
      title: t("favorite.deleteTitle"),
      content: t("favorite.deleteContent"),
      okText: t("common.confirm"),
      cancelText: t("common.cancel"),
      onOk: () => {
        void removeFavoritePlan(id);
      },
    });
  }

  function saveProductProfile(profile: ProductSetProductProfile) {
    setProductProfile(normalizeProductSetProductProfile(profile, productInfo));
    resetOutput();
  }

  function createClientModuleResults(plan: ProductSetResolvedTemplate[]): ProductSetModuleResult[] {
    return plan.map((template, index) => ({
      moduleKey: getProductSetModuleKey(template, index),
      index: index + 1,
      templateId: String(template.id),
      templateSource: template.source,
      name: template.name,
      imageType: template.imageType,
      aspectRatio: template.aspectRatio,
      moduleRole: template.moduleRole,
      contentScope: template.contentScope,
      status: "queued",
      progress: 0,
      updatedAt: new Date().toISOString(),
      promptVersion: PRODUCT_SET_PROMPT_VERSION,
      promptVariant: settings.stylePackId || "auto",
    }));
  }

  function readModuleResults(value: unknown): ProductSetModuleResult[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is ProductSetModuleResult => Boolean(item && typeof item === "object" && typeof (item as ProductSetModuleResult).moduleKey === "string"))
      .sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
  }

  function getModuleResultUrl(module?: ProductSetModuleResult) {
    const url = module?.resultUrl;
    return typeof url === "string" && url.length > 0 ? url : "";
  }

  function findModuleResultForTemplate(
    modules: ProductSetModuleResult[],
    template: ProductSetResolvedTemplate | undefined,
    index: number
  ) {
    if (!modules.length) return undefined;
    if (template) {
      const key = getProductSetModuleKey(template, index);
      const byKey = modules.find((item) => item.moduleKey === key);
      if (byKey) return byKey;
    }
    return modules.find((item) => Number(item.index) === index + 1) || modules[index];
  }

  function urlsFromModules(modules: ProductSetModuleResult[], plan: ProductSetResolvedTemplate[]) {
    const urls = plan
      .map((template, index) => getModuleResultUrl(findModuleResultForTemplate(modules, template, index)))
      .filter(Boolean);

    modules.forEach((module) => {
      const url = getModuleResultUrl(module);
      if (url && !urls.includes(url)) urls.push(url);
    });

    return urls;
  }

  function mergeModuleResults(prev: ProductSetModuleResult[], incoming: ProductSetModuleResult[]) {
    const byKey = new Map(prev.map((item) => [item.moduleKey, item]));
    incoming.forEach((item) => byKey.set(item.moduleKey, { ...(byKey.get(item.moduleKey) || {}), ...item }));
    return Array.from(byKey.values()).sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
  }

  function applyPresetPlan(planId: string) {
    const plan = PRODUCT_SET_PRESET_PLANS.find((item) => item.id === planId);
    if (!plan) return;
    setSelectedPlanId(plan.id);
    setModuleOverrides([]);
    if (plan.id === "smart") {
      setMode("smart");
      setPlanSourceTab("smart");
      resetOutput();
      return;
    }

    setMode("smart");
    setPlanSourceTab("preset");
    setImageType(plan.imageType);
    setAspectRatio("auto");
    if (plan.id === "amazon-listing") {
      setSettings((prev) => ({ ...prev, country: t("preset.countryUS"), language: t("preset.languageEN"), platform: t("preset.platformAmazon") }));
    } else if (plan.scenario === "womenswear") {
      setSettings((prev) => ({ ...prev, platform: plan.imageType === "main" ? t("preset.platformXiaohongshu") : prev.platform }));
    }
    setReferenceStyleDraft(referenceStyleBrief || buildReferenceStyleBrief(plan));
    setShowReferenceStyleModal(true);
    resetAnalysisPlan(productInfo.trim() ? "manual" : "idle", t("preset.styleSelected"));
  }

  function changeImageType(value: ProductSetImageType) {
    const nextAspect: AspectRatio = "auto";
    const nextSizes = getSupportedImageSizes(aiModel, nextAspect);
    const nextSelectedTemplateIds = getSelectedTemplateIdsForImageType(selectedTemplateIds, value);
    setImageType(value);
    setAspectRatio(nextAspect);
    if (value === "details" && nextSizes.includes("2K")) {
      setImageSize("2K");
    } else if (!nextSizes.includes(imageSize)) {
      setImageSize(nextSizes[0] || "1K");
    }
    if (mode === "smart") setGenCount(0);
    setSelectedPlanId(getSelectedPlanIdForProductSetState({
      mode,
      imageType: value,
      selectedTemplateIds: nextSelectedTemplateIds,
    }));
    resetAnalysisPlan(productInfo.trim() ? "manual" : "idle", t("imageTypeSwitched"));
  }

  function changePlanSourceTab(value: ProductSetPlanSourceTab) {
    setPlanSourceTab(value);
    if (value === "smart") {
      setMode("smart");
      setSelectedPlanId("smart");
      resetOutput();
      return;
    }
    setMode(value === "preset" ? "smart" : "custom");
    if (value === "upload") setSelectedPlanId("custom");
    resetOutput();
  }

  function changePlanMode(value: "smart" | "reference") {
    if (value === "smart") {
      changePlanSourceTab("smart");
      return;
    }
    changePlanSourceTab(planSourceTab === "smart" ? "preset" : planSourceTab);
  }

  function saveReferenceStyleBrief() {
    const nextBrief = referenceStyleDraft.trim().slice(0, 2000);
    if (!nextBrief) return toast.error(t("referenceStyle.pleaseFill"));
    setReferenceStyleBrief(nextBrief);
    setShowReferenceStyleModal(false);
    setPlanSourceTab("preset");
    setMode("smart");
    resetAnalysisPlan(productInfo.trim() ? "manual" : "idle", t("referenceStyle.saved"));
    resetOutput();
    toast.success(t("referenceStyle.savedToast"));
  }

  function updateSetting<K extends keyof ProductSetSettings>(key: K, value: ProductSetSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    resetOutput();
  }

  function getSelectedTemplateIdsForImageType(sourceIds: number[], nextImageType: ProductSetImageType) {
    const templateIds = new Set(getProductSetTemplates(nextImageType).map((template) => template.id));
    return sourceIds.filter((id) => templateIds.has(id));
  }

  function replaceSelectedTemplateIdsForImageType(sourceIds: number[], nextImageType: ProductSetImageType, nextIds: number[]) {
    const templateIds = new Set(getProductSetTemplates(nextImageType).map((template) => template.id));
    return [
      ...sourceIds.filter((id) => !templateIds.has(id)),
      ...nextIds,
    ];
  }

  async function generate() {
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("common.pleaseLogin"));
      router.push("/login");
      return;
    }
    if (!productImages.length) return toast.error(t("analyze.pleaseUploadFirst"));
    if (requiresProductConfirmation) return toast.warning(t("generate.pleaseAnalyzeOrConfirm"));
    if (outputCount <= 0) return toast.error(t("generate.pleaseSelectStyle"));
    if (credits !== null && credits < cost) {
      showInsufficientCreditsToast({ required: cost, balance: credits, onRecharge: () => router.push("/pricing") });
      return;
    }

    const currentPlan = planTemplates;
    const expectedResultCount = Math.max(1, currentPlan.length);
    setActiveQueueTask(null);
    setIsGenerating(true);
    setProgress(8);
    setError("");
    setResultUrls([]);
    setResultPlan(currentPlan);
    setModuleResults(createClientModuleResults(currentPlan));
    const provisionalTask = taskQueue.startTask({
      expectedCount: expectedResultCount,
      inputThumbnails: taskInputThumbnails,
      progress: 8,
    });
    setActiveQueueTask(provisionalTask);
    let activeTaskId = provisionalTask.id;
    let latestUrls: string[] = [];
    try {
      const finalSettings = {
        ...settings,
        extraDescription: [settings.extraDescription, qualityMode === "advanced" ? t("quality.advancedModeNote") : ""]
          .filter(Boolean)
          .join("\n"),
      };
      const res = await fetch("/api/product-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_image_urls: productImages.map((item) => item.url),
          product_info: productInfo,
          product_profile: effectiveProductProfile,
          settings: finalSettings,
          mode,
          image_type: imageType,
          selected_template_ids: mode === "custom" ? activeSelectedTemplateIds : [],
          custom_templates: mode === "custom" ? activeCustomTemplates : [],
          module_overrides: moduleOverrides,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          gen_count: mode === "smart" ? genCount : currentPlan.length,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          await refreshAuth();
          taskQueue.removeTask(activeTaskId);
          setActiveQueueTask(null);
          setIsGenerating(false);
          router.push("/login");
          return;
        }
        applyGenerationResponseStatus({
          res,
          data,
          userId,
          setCredits,
          fallbackError: t("generation.failed"),
        });
        throw new Error(data.error || t("generation.failed"));
      }
      const initialModules = readModuleResults(data.module_results);
      if (initialModules.length) setModuleResults(initialModules);
      if (typeof data.generation_id === "string" && data.generation_id) {
        const initialUrls = urlsFromModules(initialModules, currentPlan);
        latestUrls = initialUrls;
        const serverTask = taskQueue.replaceWithServerTask(activeTaskId, {
          id: data.generation_id,
          expectedCount: expectedResultCount,
          inputThumbnails: taskInputThumbnails,
          resultThumbnails: initialUrls,
          resultCount: initialUrls.length,
          status: data.status || "processing_tryon",
          progress: 12,
        });
        setActiveQueueTask(serverTask);
        activeTaskId = serverTask.id;
      }

      let completedWithoutAllResultsTicks = 0;
      for (let attempts = 0; attempts < 900; attempts++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const poll = await fetch(`/api/product-set?generation_id=${encodeURIComponent(data.generation_id)}`);
        if (!poll.ok) continue;
        const state = await poll.json();
        const nextUrls = Array.isArray(state.result_urls)
          ? state.result_urls.filter((url: unknown): url is string => typeof url === "string" && url.length > 0)
          : [];
        const nextModules = readModuleResults(state.module_results);
        const hasAllResults = nextModules.length
          ? nextModules.every((item) => item.status === "completed" || item.status === "failed")
          : nextUrls.length >= expectedResultCount;
        const nextProgress = Number(state.progress);
        if (Number.isFinite(nextProgress)) {
          const rounded = Math.min(Math.max(Math.round(nextProgress), 0), 100);
          const runningProgress = !hasAllResults && rounded >= 100 ? 99 : rounded;
          setProgress(runningProgress);
          const runningTask = taskQueue.markRunning(activeTaskId, {
            expectedCount: expectedResultCount,
            inputThumbnails: taskInputThumbnails,
            resultThumbnails: latestUrls,
            resultCount: latestUrls.length,
            progress: runningProgress,
            status: state.status,
          });
          setActiveQueueTask(runningTask);
        }
        if (nextModules.length) {
          setModuleResults(nextModules);
          const moduleUrls = urlsFromModules(nextModules, currentPlan);
          if (moduleUrls.length) {
            latestUrls = moduleUrls;
            setResultUrls(moduleUrls);
          } else if (nextUrls.length) {
            latestUrls = nextUrls;
            setResultUrls(nextUrls);
          }
        } else if (nextUrls.length) {
          latestUrls = nextUrls;
          setResultUrls(nextUrls);
        }
        if (state.status === "completed") {
          // worker 已标记完成但模块尚未全部结算：最多再等 10 个 tick（20 秒），
          // 超时按当前已有结果收尾，避免旧逻辑挂满 30 分钟才报超时
          if (!hasAllResults) {
            completedWithoutAllResultsTicks += 1;
            if (completedWithoutAllResultsTicks < 10) continue;
          }
          setProgress(100);
          const partialFailure = state.partial_failure && typeof state.partial_failure === "object"
            ? state.partial_failure as { message?: unknown }
            : null;
          const failedModuleCount = nextModules.filter((item) => item.status === "failed").length;
          const completedErrorSource = nextModules.find((item) => item.error)?.error || state.error || partialFailure?.message || "";
          const completedError = completedErrorSource ? summarizeGenerationError(completedErrorSource) : "";
          if (nextModules.length) {
            setModuleResults(nextModules);
            const moduleUrls = urlsFromModules(nextModules, currentPlan);
            const finalUrls = moduleUrls.length ? moduleUrls : nextUrls;
            const finalResultCount = finalUrls.filter(Boolean).length;
            latestUrls = finalUrls;
            setResultUrls(finalUrls);
            const completedTask = taskQueue.markCompleted(activeTaskId, {
              expectedCount: expectedResultCount,
              inputThumbnails: taskInputThumbnails,
              resultThumbnails: finalUrls,
              resultCount: finalResultCount,
              error: completedError,
            });
            setActiveQueueTask(completedTask);
            if (failedModuleCount > 0 || finalResultCount < expectedResultCount || completedError) {
              await refreshCredits();
              toast.warning(buildPartialFailureDetail({
                message: completedError || completedErrorSource,
                failedCount: failedModuleCount || expectedResultCount - finalResultCount || 1,
              }));
            } else {
              toast.success(t("generation.completed"));
            }
          } else {
            latestUrls = nextUrls;
            setResultUrls(nextUrls);
            const finalResultCount = nextUrls.filter(Boolean).length;
            const completedTask = taskQueue.markCompleted(activeTaskId, {
              expectedCount: expectedResultCount,
              inputThumbnails: taskInputThumbnails,
              resultThumbnails: nextUrls,
              resultCount: finalResultCount,
              error: completedError,
            });
            setActiveQueueTask(completedTask);
            if (finalResultCount < expectedResultCount || completedError) {
              await refreshCredits();
              toast.warning(buildPartialFailureDetail({
                message: completedError || completedErrorSource,
                failedCount: expectedResultCount - finalResultCount || 1,
              }));
            } else {
              toast.success(t("generation.completed"));
            }
          }
          setIsGenerating(false);
          return;
        }
        if (state.status === "failed") throw new Error(state.error || t("generation.failed"));
      }
      if (latestUrls.length > 0) {
        setIsGenerating(false);
        const backgroundTask = taskQueue.markRunning(activeTaskId, {
          expectedCount: expectedResultCount,
          inputThumbnails: taskInputThumbnails,
          resultThumbnails: latestUrls,
          resultCount: latestUrls.length,
          progress: 99,
        });
        setActiveQueueTask(backgroundTask);
        toast.info(t("generation.background"));
        return;
      }
      throw new Error(t("generation.timeout"));
    } catch (err: unknown) {
      const message = summarizeGenerationError(err instanceof Error ? err.message : t("generation.failed"));
      setError(message);
      const failedTask = taskQueue.markFailed(activeTaskId, message, {
        expectedCount: expectedResultCount,
        inputThumbnails: taskInputThumbnails,
        resultThumbnails: latestUrls,
      });
      setActiveQueueTask(failedTask);
      await refreshCredits();
      toast.error(message);
      setIsGenerating(false);
    }
  }

  async function regenerateResult(index: number) {
    if (isGenerating || regeneratingIndex !== null) return toast.info(t("regenerate.waitForCurrent"));
    const currentPlan = resultPlan.length ? resultPlan : planTemplates;
    const template = currentPlan[index];
    if (!template) return toast.error(t("regenerate.moduleNotFound"));
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("common.pleaseLogin"));
      router.push("/login");
      return;
    }
    const singleCost = getCreditCost(aiModel, imageSize, template.aspectRatio || aspectRatio);
    if (credits !== null && credits < singleCost) {
      showInsufficientCreditsToast({ required: singleCost, balance: credits, onRecharge: () => router.push("/pricing") });
      return;
    }

    setRegeneratingIndex(index);
    setError("");
    try {
      const finalSettings = {
        ...settings,
        extraDescription: [settings.extraDescription, qualityMode === "advanced" ? t("quality.advancedModeNote") : ""]
          .filter(Boolean)
          .join("\n"),
      };
      const res = await fetch("/api/product-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_image_urls: productImages.map((item) => item.url),
          product_info: productInfo,
          product_profile: effectiveProductProfile,
          settings: finalSettings,
          mode,
          image_type: imageType,
          selected_template_ids: mode === "custom" ? activeSelectedTemplateIds : [],
          custom_templates: mode === "custom" ? activeCustomTemplates : [],
          module_overrides: moduleOverrides,
          regenerate_index: index,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          gen_count: mode === "smart" ? Math.max(genCount, currentPlan.length) : currentPlan.length,
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        await refreshAuth();
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error(data.error || t("regenerate.failed"));
      if (data.credits_remaining !== undefined) {
        setCredits(data.credits_remaining);
        if (userId) setCachedProfileCredits(userId, data.credits_remaining);
      }

      for (let attempts = 0; attempts < 240; attempts++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const poll = await fetch(`/api/product-set?generation_id=${encodeURIComponent(data.generation_id)}`);
        if (!poll.ok) continue;
        const state = await poll.json();
        const nextUrl = Array.isArray(state.result_urls)
          ? state.result_urls.find((url: unknown): url is string => typeof url === "string" && url.length > 0)
          : "";
        const nextModules = readModuleResults(state.module_results);
        if (nextModules.length) {
          setModuleResults((prev) => mergeModuleResults(prev.length ? prev : createClientModuleResults(currentPlan), nextModules));
        }
        const moduleUrl = nextModules.find((item) => item.resultUrl)?.resultUrl;
        const failedModule = nextModules.find((item) => item.status === "failed");
        if (state.status === "completed" && failedModule && !moduleUrl && !nextUrl) {
          throw new Error(failedModule.error || t("regenerate.failed"));
        }
        if (moduleUrl || nextUrl) {
          const finalUrl = (moduleUrl || nextUrl) as string;
          setResultPlan((prev) => prev.length ? prev : currentPlan);
          setResultUrls((prev) => {
            const next = [...prev];
            next[index] = finalUrl;
            return next;
          });
          if (state.status === "completed") {
            toast.success(t("regenerate.done", { index: index + 1 }));
            return;
          }
        }
        if (state.status === "failed") throw new Error(state.error || t("regenerate.failed"));
      }
      toast.info(t("regenerate.background"));
    } catch (err: unknown) {
      const message = summarizeGenerationError(err instanceof Error ? err.message : t("regenerate.failed"));
      await refreshCredits();
      toast.error(message);
    } finally {
      setRegeneratingIndex(null);
    }
  }

  function downloadResult(url: string, index: number) {
    const ext = url.toLowerCase().includes(".jpg") || url.toLowerCase().includes(".jpeg") ? "jpg" : "png";
    downloadImage(url, generateDownloadFilename("product-set", index, ext));
  }

  function handleRunningTask(item: TaskQueueItem) {
    setActiveQueueTask(item);
    const urls = safeTaskQueueUrls(item.resultThumbnails);
    const nextProgress = Number.isFinite(Number(item.progress)) ? Number(item.progress) : 8;
    setIsGenerating(true);
    setRegeneratingIndex(null);
    setProgress(Math.min(Math.max(Math.round(nextProgress), 1), 99));
    setResultUrls(urls);
    setModuleResults([]);
    setResultPlan([]);
    setError("");
  }

  async function handleCompletedTask(item: TaskQueueItem, session: TaskSelectionSession) {
    try {
      const detail = await fetchHistoryApplyDetail(item.id, "productSet", session.signal);
      if (!session.isCurrent()) return true;
      applyProductSetHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails), {
        silent: session.reason === "restore",
      });
      if (item.statusGroup === "failed" || isHistoryApplyRowFailed(detail.row)) {
        setError(getHistoryApplyFailureMessage(detail.row, item.error || t("generation.failed")));
      }
      return true;
    } catch (err) {
      if (session.signal.aborted || !session.isCurrent()) return true;
      toast.error(err instanceof Error ? err.message : t("history.taskLoadFailed"));
      return true;
    }
  }

  const displayedResultPlan = resultPlan.length ? resultPlan : planTemplates;
  const moduleResultUrls = urlsFromModules(moduleResults, displayedResultPlan);
  const taskExpectedResultCount = activeQueueTask
    ? clampTaskExpectedCount(activeQueueTask, 1, imageType === "details" ? 8 : 6, displayedResultPlan.length || outputCount || 1)
    : 0;
  const resultSlotCount = Math.max(displayedResultPlan.length, resultUrls.length, moduleResults.length, taskExpectedResultCount);
  const hasVisibleResults = resultUrls.length > 0 || moduleResultUrls.length > 0;
  const hasResultStage = hasVisibleResults || (!isGenerating && moduleResults.length > 0) || (activeQueueTask?.statusGroup === "completed" && resultSlotCount > 0);
  const shouldShowTaskPanel = Boolean(activeQueueTask) && activeQueueTask?.statusGroup !== "completed" && !hasVisibleResults && moduleResults.length === 0;
  const resultSlots = Array.from({ length: resultSlotCount }, (_, index) => {
    const template = displayedResultPlan[index];
    const moduleResult = findModuleResultForTemplate(moduleResults, template, index);
    return {
      module: moduleResult,
      url: getModuleResultUrl(moduleResult) || resultUrls[index],
      template,
    };
  });
  const visibleResultCount = resultSlots.filter((item) => item.url).length;
  const hasCompletedPartialResults = Boolean(activeQueueTask?.statusGroup === "completed" && visibleResultCount < resultSlotCount);
  const partialFailureMessage = buildPartialFailureDetail({
    message: activeQueueTask?.error || error || undefined,
    failedCount: resultSlotCount - visibleResultCount || 1,
  });
  const productSetPreviewPromptText = [
    settings.extraDescription,
    ...moduleOverrides.map((item) => item.extraDescription),
  ].map((item) => item?.trim() || "").filter(Boolean).join("\n\n");
  const productSetPreviewSession = useMemo(
    () => createProductSetPreviewSession({
      module: "productSet",
      urls: resultSlots.map((slot) => slot.url || ""),
      expectedCount: Math.max(resultSlotCount, 1),
      isGenerating,
      statusGroup: activeQueueTask?.statusGroup || (isGenerating ? "running" : undefined),
      taskId: activeQueueTask?.id,
      createdAt: activeQueueTask?.createdAt,
      references: (safeTaskQueueUrls(activeQueueTask?.inputThumbnails).length ? safeTaskQueueUrls(activeQueueTask?.inputThumbnails) : productImages.map((item) => item.url)).map((url, index) => ({
        url,
        label: productImages[index]?.name || t("preview.productImage", { index: index + 1 }),
        role: "product" as const,
      })),
      promptText: productSetPreviewPromptText,
      metaItems: [
        { label: t("meta.mode"), value: mode === "smart" ? t("meta.smartSet") : t("meta.customSet") },
        { label: t("meta.imageType"), value: imageType === "main" ? t("meta.mainAux") : t("meta.detailsPage") },
        { label: t("meta.platform"), value: settings.platform },
        { label: t("meta.language"), value: settings.language },
        { label: t("meta.style"), value: selectedStylePack.name },
        { label: t("meta.quality"), value: qualityMode === "advanced" ? t("meta.advancedMode") : t("meta.standardMode") },
        { label: t("meta.count"), value: resultSlotCount },
      ],
      titles: resultSlots.map((slot, index) => slot.template?.name || slot.module?.name || t("preview.resultTitle", { index: index + 1 })),
      subtitles: resultSlots.map((slot) => `${slot.template?.imageType === "details" ? t("meta.detailsModule") : t("meta.mainAux")} · ${getAspectRatioLabel(slot.template?.aspectRatio || slot.module?.aspectRatio || aspectRatio)}`),
      statuses: resultSlots.map((slot) => (slot.url ? "completed" : slot.module?.status || (hasCompletedPartialResults ? "failed" : isGenerating ? "running" : "queued")) as ImagePreviewResultStatus),
      errors: resultSlots.map((slot) => slot.module?.error || (!slot.url && hasCompletedPartialResults ? partialFailureMessage : null)),
      qualities: resultSlots.map((slot) => {
        if (slot.module?.qualityScore === undefined && !slot.module?.qualitySummary && !slot.module?.qualityIssues?.length) return null;
        return {
          score: slot.module.qualityScore,
          label: getProductSetModuleQualityLabel(slot.module.qualityScore).label,
          summary: slot.module.qualitySummary,
          issues: slot.module.qualityIssues || [],
        };
      }),
      aspectRatio,
    }),
    [activeQueueTask, aspectRatio, hasCompletedPartialResults, imageType, isGenerating, mode, partialFailureMessage, productImages, productSetPreviewPromptText, qualityMode, resultSlotCount, resultSlots, selectedStylePack.name, settings.language, settings.platform]
  );

  return (
    <div className="studio-workbench studio-product-set-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="productSet" />
      <ModuleTaskRail
        module="productSet"
        moduleLabel={t("moduleName")}
        onContinue={confirmContinueCreate}
        onRunningTask={handleRunningTask}
        onCompletedTask={handleCompletedTask}
      />
      <aside className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4">
          <ModuleHeader title={t("header.title")} tooltip={t("header.tooltip")} />
          <ProductModeTabs imageType={imageType} onChange={changeImageType} />
          <WorkflowStepper currentStep={workflowStep} />

          <section
            {...productImageDrag.dragHandlers}
            className={`studio-stable-upload-boundary rounded-3xl border bg-white p-4 shadow-sm transition-[border-color,box-shadow] ${isDragging ? "border-[rgba(91,124,255,0.22)] ring-4 ring-[rgba(91,124,255,0.18)]" : "border-slate-100"}`}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-slate-950 dark:text-stone-100">{t("productImages.title")}</h3>
                <p className="mt-1 text-xs text-slate-400">{t("productImages.help")}</p>
              </div>
              <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-[rgba(91,124,255,0.1)] px-2.5 text-[10px] font-bold text-[var(--codex-accent)]">{productImages.length}/3</span>
            </div>
            <input
              ref={productInputRef}
              aria-hidden="true"
              tabIndex={-1}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && processFiles(event.target.files)}
            />
            <StudioUploadTile
              title={productImages.length >= 3 ? t("productImages.maxReached") : productImages.length ? t("productImages.continueUpload") : t("productImages.tileTitle")}
              description={t("productImages.help")}
              imageUrl={null}
              imageAlt={t("productImages.title")}
              isDragging={isDragging}
              loading={isUploading}
              onUploadClick={() => productInputRef.current?.click()}
              onLibraryClick={() => toast.info(t("library.comingSoon"))}
              uploadLabel={productImages.length ? t("productImages.continueUploadLabel") : t("upload.localUpload")}
              libraryLabel={t("upload.fromLibrary")}
              supportBadge={t("productImages.supportBadge")}
              footnote={t("productImages.footnote")}
              examples={{
                label: t("common.tryIt"),
                images: PRODUCT_SET_EXAMPLE_GROUPS.map((group) => ({
                  url: group.images[0],
                  title: group.name,
                  previewUrls: group.images,
                })),
                disabled: isUploading,
                onSelect: (image) => {
                  const group = PRODUCT_SET_EXAMPLE_GROUPS.find((item) => item.name === image.title && item.images[0] === image.url);
                  if (group) applyExampleGroup(group);
                },
              }}
            />

            {productImages.length > 0 && (
              <>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {productImages.map((item, index) => (
                  <div key={`${item.url}-${index}`} className="studio-checkerboard group relative aspect-square overflow-hidden rounded-xl border border-white bg-white shadow-sm">
                    <RawPreviewImage src={getImageVariantUrl(item.url, "thumb")} alt={item.name} className="h-full w-full object-contain p-1.5" />
                    <span className="absolute left-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-stone-300">{t("productImages.imageLabel", { index: index + 1 })}</span>
                    <button type="button" aria-label={`${t("productImages.remove")}${item.name}`} onClick={() => removeProductImage(index)} className="absolute right-1 top-1 flex h-5 w-5 touch-manipulation items-center justify-center rounded-full bg-slate-800/80 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2">
                      <X aria-hidden="true" className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={() => { setProductImages([]); setProductInfo(""); resetAnalysisPlan("idle"); }} className="inline-flex h-8 shrink-0 touch-manipulation items-center gap-1 rounded-full px-2 text-xs font-bold text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2">
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" /> {t("common.clear")}
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-slate-950 dark:text-stone-100">{t("analysisSection.title")}</h3>
                <p className="mt-1 text-xs text-slate-400">{t("analysisSection.help")}</p>
              </div>
              <button
                type="button"
                onClick={() => analyzeProductInfo()}
                disabled={!canAnalyzeProduct}
                className="inline-flex h-9 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] px-3 text-xs font-black text-[var(--codex-accent)] transition-colors hover:bg-[rgba(91,124,255,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAnalyzing ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
                {isAnalyzing ? t("analysisSection.analyzing") : hasAnalyzedProduct ? t("analysisSection.rewrite") : t("analysisSection.write")}
              </button>
            </div>

            <ProductAnalysisNotice status={analysisStatus} />

            {productInfo && !showProductInfoEditor ? (
              <ProductBriefSummary fields={displayProductInfoFields} onEdit={() => setShowProductInfoEditor(true)} />
            ) : (
              <div>
                <textarea
                  name="product-information"
                  autoComplete="off"
                  value={productInfo}
                  maxLength={2000}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setProductInfo(nextValue);
                    resetAnalysisPlan(nextValue.trim() ? "manual" : "idle", nextValue.trim() ? t("analysisSection.infoModified") : "");
                  }}
                  aria-label={t("analysisSection.ariaLabel")}
                  placeholder={t("analysisSection.placeholder")}
                  className="min-h-40 w-full resize-none rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800 transition-colors focus-visible:border-[rgba(91,124,255,0.5)] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2 dark:border-white/10 dark:bg-white/5 dark:text-stone-200 dark:focus-visible:bg-white/10"
                />
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{productInfo ? t("analysisSection.keepTemplateHint") : t("analysisSection.optionalHint")}</span>
                  <span>{productInfo.length} / 2000</span>
                </div>
              </div>
            )}

            <CountSelector
              imageType={imageType}
              value={genCount}
              options={countOptions}
              onChange={changeGenerationCount}
              helper={hasAnalyzedProduct ? t("countSelector.analyzedHelper") : t("countSelector.helper")}
            />

            <button
              type="button"
              onClick={() => analyzeProductInfo()}
              disabled={!canAnalyzeProduct}
              className="mt-3 flex h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-full bg-slate-950 text-sm font-black text-white shadow-lg shadow-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAnalyzing ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Activity aria-hidden="true" className="h-4 w-4" />}
              {isAnalyzing ? t("analysisSection.analyzingProduct") : hasAnalyzedProduct ? t("analysisSection.rewriteInfo") : t("analysisSection.writeInfo")}
            </button>

            {!hasAnalyzedProduct && (
              <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-stone-400">
                {t("analysisSection.planExplanation")}
              </div>
            )}

            {hasAnalyzedProduct && (
              <>
                <AnalysisSummaryCard
                  profile={effectiveProductProfile}
                  analysis={analysisDetail}
                  stylePack={selectedStylePack}
                  imageType={imageType}
                  outputCount={outputCount}
                  expanded={showAnalysisDetails}
                  onToggleExpanded={() => setShowAnalysisDetails((value) => !value)}
                  onEditProfile={() => setShowProfileEditor(true)}
                  onAdjust={() => setShowSettingsModal(true)}
                />
                {showAnalysisDetails && (
                  <>
                    <ProductProfileCard profile={effectiveProductProfile} analysisSource={analysisSource} onEdit={() => setShowProfileEditor(true)} />
                    <ProductVisualStrategyCard
                      profile={effectiveProductProfile}
                      analysis={analysisDetail}
                      stylePack={selectedStylePack}
                      imageType={imageType}
                      onAdjust={() => setShowSettingsModal(true)}
                    />
                  </>
                )}
              </>
            )}
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-slate-950 dark:text-stone-100">{t("planSource.title")}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-400">{t("planSource.help")}</p>
              </div>
              {outputCount > 0 && <span className="inline-flex h-8 shrink-0 items-center rounded-full bg-[rgba(91,124,255,0.1)] px-2.5 text-xs font-black text-[var(--codex-accent)]">{outputCount} {imageType === "main" ? t("units.singleImage") : t("units.singleScreen")}</span>}
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-white/5">
              {([
                { value: "smart" as const, label: "智能模式", labelKey: "planSource.modeSmart", desc: "需要智能分析", descKey: "planSource.modeSmartDesc" },
                { value: "reference" as const, label: "参考图模式", labelKey: "planSource.modeReference", desc: "上传 / 预设", descKey: "planSource.modeReferenceDesc" },
              ]).map((tab) => {
                const active = tab.value === "smart" ? mode === "smart" : isReferenceMode;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => changePlanMode(tab.value)}
                    className={`min-h-12 touch-manipulation rounded-xl px-2 py-1.5 text-center transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2 ${
                      active ? "bg-white text-[var(--codex-accent)] shadow-sm dark:bg-white/10 dark:text-[#cfd8ff]" : "text-slate-500 hover:bg-white/60 dark:text-stone-400 dark:hover:bg-white/5"
                    }`}
                  >
                    <span className="block truncate text-xs font-black">{tab.labelKey ? t(tab.labelKey) : tab.label}</span>
                    <span className="mt-0.5 block truncate text-[10px] font-bold opacity-70">{tab.descKey ? t(tab.descKey) : tab.desc}</span>
                  </button>
                );
              })}
            </div>

            {!isReferenceMode ? (
              <div className="mt-3 rounded-2xl border border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] p-3 text-xs leading-5 text-slate-500 dark:text-stone-300">
                {hasAnalyzedProduct ? (
                  <PlanRecommendationCard recommendation={planRecommendation} imageType={imageType} compact />
                ) : (
                  <p>{t("planSource.smartModeHint", { count: genCount || t("planSource.corresponding") })}</p>
                )}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-white/5">
                  {PLAN_SOURCE_TABS.filter((tab) => tab.value !== "smart").map((tab) => {
                    const active = planSourceTab === tab.value;
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => changePlanSourceTab(tab.value)}
                        className={`min-h-11 touch-manipulation rounded-xl px-2 py-1.5 text-center transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2 ${
                          active ? "bg-white text-[var(--codex-accent)] shadow-sm dark:bg-white/10 dark:text-[#cfd8ff]" : "text-slate-500 hover:bg-white/60 dark:text-stone-400 dark:hover:bg-white/5"
                        }`}
                      >
                        <span className="block truncate text-xs font-black">{tab.value === "preset" ? t("planSource.presetRef") : tab.value === "upload" ? t("planSource.uploadRef") : t("planSource.favorites")}</span>
                        <span className="mt-0.5 block truncate text-[10px] font-bold opacity-70">{tab.description}</span>
                      </button>
                    );
                  })}
                </div>

                {planSourceTab === "preset" && (
                  <div className="grid grid-cols-2 items-stretch gap-2">
                    {visiblePresetPlans.filter((plan) => plan.id !== "smart").map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        aria-pressed={selectedPlanId === plan.id}
                        onClick={() => applyPresetPlan(plan.id)}
                        className={`flex min-h-[92px] touch-manipulation flex-col rounded-2xl border p-3 text-left transition-[border-color,background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2 ${
                          selectedPlanId === plan.id
                            ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]"
                            : "border-slate-100 bg-slate-50 text-slate-600 hover:border-[rgba(91,124,255,0.3)] dark:border-white/10 dark:bg-white/5 dark:text-stone-300 dark:hover:border-[rgba(91,140,255,0.45)]"
                        }`}
                      >
                        <span className="flex min-h-5 items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-black">{plan.name}</span>
                          {plan.scenario === "womenswear" && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-600 dark:bg-white/10 dark:text-stone-300">{t("preset.womenswear")}</span>}
                        </span>
                        <span className="mt-1 block line-clamp-2 text-[11px] leading-4 opacity-75">{plan.description}</span>
                      </button>
                    ))}
                    {referenceStyleBrief && (
                      <div className="col-span-2 rounded-2xl border border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-[var(--codex-accent)]">{t("preset.selectedStyle")}</p>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--codex-accent)]">{referenceStyleBrief.replace(/[#*_`\[\]-]/g, " ").replace(/\s+/g, " ").trim()}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setReferenceStyleDraft(referenceStyleBrief);
                              setShowReferenceStyleModal(true);
                            }}
                            className="h-8 shrink-0 touch-manipulation rounded-full bg-white px-3 text-[11px] font-black text-[var(--codex-accent)] shadow-sm transition-colors hover:bg-[rgba(91,124,255,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2 dark:bg-white/10"
                          >
                            {t("common.edit")}
                          </button>
                        </div>
                        <p className="mt-2 text-[11px] leading-4 text-[var(--codex-accent)]">{t("preset.styleNote")}</p>
                      </div>
                    )}
                  </div>
                )}

                {planSourceTab === "upload" && (
                  <CustomTemplateSourcePanel
                    imageType={imageType}
                    genCount={genCount}
                    customDraft={customDraft}
                    activeCustomTemplates={activeCustomTemplates}
                    isUploadingCustomRef={isUploadingCustomRef}
                    customRefInputRef={customRefInputRef}
                    customModelRefInputRef={customModelRefInputRef}
                    customOtherRefInputRef={customOtherRefInputRef}
                    onCustomDraftChange={setCustomDraft}
                    onUploadCustomReference={uploadCustomReference}
                    onAddCustomTemplate={addCustomTemplate}
                    onRemoveCustomTemplate={(id) => {
                      setCustomTemplates((prev) => prev.filter((item) => item.id !== id));
                      resetOutput();
                    }}
                    onOpenLibrary={() => setShowTemplateModal(true)}
                  />
                )}

                {planSourceTab === "favorites" && (
                  <FavoritePlanPanel
                    embedded
                    plans={favoritePlans}
                    draftName={favoritePlanName}
                    defaultName={favoritePlanDefaultName}
                    currentPlanCount={outputCount}
                    showList
                    isLoading={isLoadingFavoritePlans}
                    isSaving={isSavingFavoritePlan}
                    onDraftNameChange={setFavoritePlanName}
                    onSave={saveCurrentPlanAsFavorite}
                    onApply={applyFavoritePlan}
                    onDelete={confirmRemoveFavoritePlan}
                  />
                )}

                <button type="button" onClick={() => setShowTemplateModal(true)} className="flex h-10 w-full touch-manipulation items-center justify-center gap-1.5 rounded-2xl border border-slate-100 bg-white text-xs font-black text-slate-600 transition-colors hover:border-[rgba(91,124,255,0.3)] hover:bg-[rgba(91,124,255,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2 dark:border-white/10 dark:bg-white/5 dark:text-stone-300 dark:hover:border-[rgba(91,140,255,0.45)] dark:hover:bg-[rgba(91,140,255,0.18)]">
                  <Layers3 aria-hidden="true" className="h-3.5 w-3.5" /> {t("planSource.openTemplateLibrary")}
                </button>
                {outputCount > 0 ? (
                  <PlanRecommendationCard recommendation={planRecommendation} imageType={imageType} compact />
                ) : (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-700">
                    {t("planSource.referenceNotice")}
                  </div>
                )}
              </div>
            )}
          </section>

          {outputCount > 0 && <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-slate-950 dark:text-stone-100">{t("generationPlan.title")}</h3>
                <p className="mt-1 text-xs text-slate-400">{showFullPlan ? t("generationPlan.fullHint") : t("generationPlan.partialHint")}</p>
              </div>
              <button
                type="button"
                aria-expanded={showFullPlan}
                onClick={() => setShowFullPlan((value) => !value)}
                className="inline-flex h-8 shrink-0 touch-manipulation items-center gap-1 rounded-full bg-[rgba(91,124,255,0.1)] px-2.5 text-xs font-black text-[var(--codex-accent)] transition-colors hover:bg-[rgba(91,124,255,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2"
              >
                {outputCount || 0} {imageType === "main" ? t("units.singleImage") : t("units.singleScreen")} · {showFullPlan ? t("common.collapse") : t("common.viewAll")}
              </button>
            </div>

            <PlanList
              templates={planTemplates}
              productProfile={effectiveProductProfile}
              limit={showFullPlan ? undefined : 3}
              onEdit={setEditingModuleIndex}
              onRemove={removePlanModule}
            />

            <button type="button" onClick={() => setShowSettingsModal(true)} className="mt-3 flex w-full touch-manipulation items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-left text-xs font-bold text-slate-600 transition-colors hover:border-slate-300 hover:bg-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2 dark:border-white/10 dark:bg-white/5 dark:text-stone-300 dark:hover:border-[rgba(91,140,255,0.45)] dark:hover:bg-white/10">
              <span className="flex min-w-0 items-center gap-2">
                <Settings2 aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="truncate">{settingsSummary}</span>
              </span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          </section>}

          {outputCount > 0 && (
            <>
              <GenerationSettingsSummary
                aiModel={aiModel}
                imageSize={imageSize}
                qualityMode={qualityMode}
                expanded={showGenerationSettings}
                onToggle={() => setShowGenerationSettings((value) => !value)}
              />
              {showGenerationSettings && (
                <ModelConfigPanel
                  aiModel={aiModel}
                  imageType={imageType}
                  imageSize={imageSize}
                  qualityMode={qualityMode}
                  supportedSizes={supportedSizes}
                  onModelChange={(value) => { setAiModel(value); resetOutput(); }}
                  onSizeChange={(value) => { setImageSize(value); resetOutput(); }}
                  onQualityChange={(value) => { setQualityMode(value); resetOutput(); }}
                />
              )}
            </>
          )}
        </div>

        <div className="studio-runbar studio-runbar-v2 border-t border-white/70 bg-white/90 px-3 py-3 backdrop-blur-xl sm:px-5">
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            className="flex h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-full bg-slate-950 text-sm font-black text-white shadow-[0_16px_36px_rgba(15,23,42,0.18)] transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Activity aria-hidden="true" className="h-4 w-4" />}
            {isGenerating ? t("run.generating") : outputCount > 0 ? t("run.generateCount", { count: Math.max(outputCount, 1), unit: outputUnit }) : mode === "smart" ? t("run.analyzeFirst") : t("run.selectReferenceFirst")}
            {outputCount > 0 && <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{cost} {t("common.lingpoints")}</span>}
          </button>
          {requiresProductConfirmation && (
            <p className="mt-2 text-center text-[11px] font-bold text-amber-600">
              {t("run.requiresConfirmation")}
            </p>
          )}
          {mode === "custom" && outputCount <= 0 && (
            <p className="mt-2 text-center text-[11px] font-bold text-amber-600">
              {t("run.selectReferenceInMode")}
            </p>
          )}
          {detailsResolutionWarning && !requiresProductConfirmation && (
            <p className="mt-2 text-center text-[11px] font-bold text-[var(--codex-accent)]">
              {t("run.detailsResolutionWarning")}
            </p>
          )}
        </div>
      </aside>

      <ResultsCanvas
        productImages={productImages}
        fallbackImage={PRODUCT_SET_EXAMPLE_GROUPS[0].images[0]}
        genCount={genCount}
        outputCount={outputCount}
        imageType={imageType}
        imageSize={imageSize}
        mode={mode}
        platform={settings.platform}
        isGenerating={isGenerating}
        error={error}
        hasResultStage={hasResultStage}
        shouldShowTaskPanel={shouldShowTaskPanel}
        hasVisibleResults={hasVisibleResults}
        progress={progress}
        moduleResults={moduleResults}
        resultUrls={resultUrls}
        activeQueueTask={activeQueueTask}
        displayedResultPlan={displayedResultPlan}
        resultSlots={resultSlots}
        visibleResultCount={visibleResultCount}
        resultSlotCount={resultSlotCount}
        hasCompletedPartialResults={hasCompletedPartialResults}
        partialFailureMessage={partialFailureMessage}
        regeneratingIndex={regeneratingIndex}
        aspectRatio={aspectRatio}
        previewIndex={previewIndex}
        previewSession={productSetPreviewSession}
        onGenerate={generate}
        onClearError={() => { setError(""); setProgress(0); }}
        onPreviewIndexChange={setPreviewIndex}
        onRegenerate={(index) => { void regenerateResult(index); }}
        onDownload={(url, index) => { void downloadResult(url, index); }}
      />

      <>
        {showSettingsModal && (
          <SettingsModal
            settings={settings}
            onSettingChange={updateSetting}
            onClose={() => setShowSettingsModal(false)}
          />
        )}

        {showProfileEditor && (
          <ProductProfileEditorModal
            profile={effectiveProductProfile}
            onClose={() => setShowProfileEditor(false)}
            onSave={(profile) => {
              saveProductProfile(profile);
              setShowProfileEditor(false);
            }}
          />
        )}

        {showReferenceStyleModal && (
          <ReferenceStyleModal
            value={referenceStyleDraft}
            onChange={setReferenceStyleDraft}
            onClose={() => setShowReferenceStyleModal(false)}
            onSave={saveReferenceStyleBrief}
          />
        )}

        {editingModuleIndex !== null && planTemplates[editingModuleIndex] && (
          <ModuleEditModal
            template={planTemplates[editingModuleIndex]}
            index={editingModuleIndex}
            override={moduleOverrides.find((item) => item.key === getProductSetModuleKey(planTemplates[editingModuleIndex], editingModuleIndex))}
            productProfile={effectiveProductProfile}
            onClose={() => setEditingModuleIndex(null)}
            onSave={(patch) => {
              upsertModuleOverride(editingModuleIndex, patch);
              setEditingModuleIndex(null);
            }}
            onRemove={() => {
              removePlanModule(editingModuleIndex);
              setEditingModuleIndex(null);
            }}
          />
        )}

        {showTemplateModal && (
          <TemplateLibraryDialog
            imageType={imageType}
            genCount={genCount}
            templates={templates}
            selectedTemplateIds={activeSelectedTemplateIds}
            activeCustomTemplates={activeCustomTemplates}
            filter={templateFilter}
            query={templateQuery}
            customDraft={customDraft}
            showCustomBuilder={showCustomBuilder}
            isUploadingCustomRef={isUploadingCustomRef}
            customRefInputRef={customRefInputRef}
            customModelRefInputRef={customModelRefInputRef}
            customOtherRefInputRef={customOtherRefInputRef}
            onFilterChange={setTemplateFilter}
            onQueryChange={setTemplateQuery}
            onToggleTemplate={toggleTemplate}
            onClose={() => setShowTemplateModal(false)}
            onShowCustomBuilder={setShowCustomBuilder}
            onCustomDraftChange={setCustomDraft}
            onUploadCustomReference={uploadCustomReference}
            onAddCustomTemplate={addCustomTemplate}
            onRemoveCustomTemplate={(id) => {
              setCustomTemplates((prev) => prev.filter((item) => item.id !== id));
              resetOutput();
            }}
          />
        )}

        <StudioMediaLightbox
          src={lightboxSrc}
          alt={t("moduleName")}
          onClose={() => setLightboxSrc(null)}
        />
        {confirmDialog}
      </>
    </div>
  );
}
