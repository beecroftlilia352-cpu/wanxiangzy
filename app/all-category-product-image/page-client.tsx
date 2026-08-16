"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from "react";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  Bot,
  Check,
  ChevronDown,
  Download,
  Edit3,
  ImagePlus,
  Languages,
  Loader2,
  MonitorSmartphone,
  PackageCheck,
  RefreshCw,
  Trash2,
  Upload,
  Brush,
  X,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { GenerationCountField } from "@/components/studio/GenerationCountField";
import { ResolutionSelector } from "@/components/studio/ResolutionSelector";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGES,
  ALL_CATEGORY_PRODUCT_IMAGE_PLATFORMS,
  DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGE,
  DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_PLATFORM,
  createAllCategoryImagePlan,
  generateAllCategoryAiWritingPlans,
  generateAllCategoryDesignSpecMarkdown,
  parseAllCategoryProductInfo,
  type AllCategoryImagePlanItem,
  type AllCategoryProductImageLanguage,
  type AllCategoryProductImagePlatform,
} from "@/lib/all-category-product-image";
import { getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { useVisibleImageModels } from "@/lib/use-visible-image-models";
import { getImageVariantUrl } from "@/lib/image-variants";
import type {
  ProductSetCustomTemplate,
  ProductSetImageType,
  ProductSetModuleResult,
  ProductSetProductProfile,
  ProductSetSettings,
} from "@/lib/product-set";
import { getProductSetModuleQualityLabel } from "@/lib/product-set";
import { downloadImage, generateDownloadFilename, MAX_FILE_SIZE, MAX_FILE_SIZE_MB, safeDownloadImage, uploadImage } from "@/lib/utils";
import { createProductSetPreviewSession, takeSourceImageFromLocation, type ImagePreviewAction, type ImagePreviewResultStatus } from "@/lib/studio-image-preview";
import { cn } from "@/lib/utils";
import {
  buildResultSlots,
  DETAILS_ASPECTS,
  getAspectRatioLabel,
  getProgressMessage,
  MAIN_ASPECTS,
  STEPS,
  type PlanningModule,
  type StepKey,
} from "@/features/all-category-product-image/shared";
import { AiWritingModal } from "@/features/all-category-product-image/AiWritingModal";
import { EditField } from "@/features/all-category-product-image/EditField";
import { EmptyState } from "@/features/all-category-product-image/EmptyState";
import { GenerationSkeleton } from "@/features/all-category-product-image/GenerationSkeleton";
import { IconButton } from "@/features/all-category-product-image/IconButton";
import { PlanningPreview } from "@/features/all-category-product-image/PlanningPreview";
import { ProgressLine } from "@/features/all-category-product-image/ProgressLine";
import { ResultGrid } from "@/features/all-category-product-image/ResultGrid";
import { SelectField } from "@/features/all-category-product-image/SelectField";
import { StepBar } from "@/features/all-category-product-image/StepBar";

type ProductImage = {
  url: string;
  name: string;
  uploadedUrl?: string;
};

type ProductSetAnalysisDetail = {
  product?: {
    name_guess?: string;
    colors?: string[];
    material_guess?: string[];
    style_tags?: string[];
    visible_details?: string[];
    possible_selling_points?: string[];
    target_audience_guess?: string[];
    usage_scenarios?: string[];
  };
  image_quality?: { quality_score?: number; can_generate?: boolean };
  generation_fit?: { recommended_style?: string; recommended_style_reason?: string; recommended_output_set?: string[] };
  visual_director?: {
    strategy_name?: string;
    style_strategy?: string;
    global_strategy?: {
      primary_color?: string;
      secondary_colors?: string[];
      accent_color?: string;
      lighting?: string;
      typography?: string;
      texture_mood?: string;
    };
    layout_principles?: string[];
    copy_strategy?: string;
  };
  prompt_summary?: string;
};

type AnalyzeResponse = {
  product_info?: string;
  product_profile?: ProductSetProductProfile;
  analysis?: ProductSetAnalysisDetail;
  settings_patch?: Partial<ProductSetSettings>;
  source?: "ai" | "fallback";
  reason?: string;
  error?: string;
};

type GenerationResponse = {
  generation_id?: string;
  credits_cost?: number;
  credits_remaining?: number;
  module_results?: ProductSetModuleResult[];
  result_urls?: string[];
  status?: string;
  progress?: number;
  error?: string;
};

const MAX_PRODUCT_UPLOADS = 6;
const API_PRODUCT_IMAGE_LIMIT = 3;

const MODELS: Array<{ value: LingyaModel; label: string; badge?: string; badgeKey?: string }> = [
  { value: "nano-banana-2", label: "Nano Banana 2", badge: "默认", badgeKey: "AllCategoryProduct.models.badgeDefault" },
  { value: "gpt-image-2", label: "GPT Image 2", badge: "高质感", badgeKey: "AllCategoryProduct.models.badgeHighQuality" },
  { value: "nano-banana-pro", label: "Nano Banana Pro", badge: "质感", badgeKey: "AllCategoryProduct.models.badgeTexture" },
];

const ALL_CATEGORY_PREVIEW_ACTIONS: ImagePreviewAction[] = [
  { kind: "download", label: "下载图片" },
  { kind: "copy", label: "复制链接" },
  { kind: "regenerateOne", label: "重生本张" },
  { kind: "aiVideo", label: "AI视频" },
  { kind: "modelBackground", label: "换背景" },
  { kind: "pose", label: "姿势裂变" },
  { kind: "productSet", label: "商品套图" },
  { kind: "feedback", label: "反馈" },
];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stepIndex(step: StepKey) {
  return STEPS.findIndex((item) => item.key === step);
}

function getDefaultCount(imageType: ProductSetImageType) {
  return imageType === "main" ? 1 : 1;
}

function getDefaultAspect(): AspectRatio {
  return "auto";
}

function createPlanningModules(imageType: ProductSetImageType, count = getDefaultCount(imageType)): PlanningModule[] {
  const aspects = imageType === "main" ? MAIN_ASPECTS : DETAILS_ASPECTS;
  return createAllCategoryImagePlan(imageType, count).map((item, index) => ({
    ...item,
    aspectRatio: aspects[index % aspects.length],
    expanded: index === 0,
  }));
}

function analysisToText(analysis?: ProductSetAnalysisDetail | null) {
  if (!analysis) return "";
  const director = analysis.visual_director;
  return [
    director?.strategy_name ? `视觉总监方案：${director.strategy_name}` : "",
    director?.style_strategy,
    director?.copy_strategy ? `文案策略：${director.copy_strategy}` : "",
    analysis.generation_fit?.recommended_style_reason,
    analysis.prompt_summary,
    analysis.product?.style_tags?.length ? `风格标签：${analysis.product.style_tags.join("、")}` : "",
    analysis.product?.visible_details?.length ? `可见细节：${analysis.product.visible_details.join("、")}` : "",
  ].filter(Boolean).join("\n");
}

function getApiImageUrls(images: ProductImage[]) {
  return images.map((item) => item.uploadedUrl || item.url).filter((url) => /^https?:\/\//i.test(url)).slice(0, API_PRODUCT_IMAGE_LIMIT);
}

function mapPlatformForProductSet(platform: string) {
  return platform === DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_PLATFORM ? "智能匹配" : platform;
}

function mapLanguageForProductSet(language: string) {
  return language === DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGE ? "无文字(纯视觉)" : language;
}

function toCustomTemplates(modules: PlanningModule[], imageType: ProductSetImageType, language: string): ProductSetCustomTemplate[] {
  return modules.map((module, index) => ({
    id: `all-category-${imageType}-${index + 1}`,
    name: module.title.slice(0, 40),
    imageType,
    typeDescription: module.description,
    aspectRatio: module.aspectRatio,
    moduleRole: module.title,
    contentScope: module.description,
    layoutRules: module.detailPrompt,
    textRules: language === DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGE
      ? "无文字纯视觉，避免生成可读文字、乱码和密集标签。"
      : `使用${language}短句，大字号、少文字，不要密集小字。`,
    avoidRules: "不要改变商品外形、颜色、材质、Logo、结构和配件；不要虚构参数、功效、认证或价格。",
    extraDescription: module.detailPrompt,
    subjectConsistency: true,
    intelligentCopy: language !== DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGE,
    copyDensity: language === DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGE ? "none" : "standard",
  }));
}

function readModuleResults(value: unknown): ProductSetModuleResult[] {
  return Array.isArray(value)
    ? value.filter((item): item is ProductSetModuleResult => Boolean(item && typeof item === "object" && "moduleKey" in item))
    : [];
}

export default function AllCategoryProductImagePage() {
  const t = useTranslations("AllCategoryProduct");
  const tAny = useTranslations(); // 数据键全路径（AllCategoryProduct.models.*）
  const inputRef = useRef<HTMLInputElement>(null);
  const aiPlansReturnFocusRef = useRef<HTMLElement | null>(null);
  const [activeStep, setActiveStep] = useState<StepKey>("input");
  const [imageType, setImageType] = useState<ProductSetImageType>("details");
  const [platform, setPlatform] = useState(DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_PLATFORM);
  const [language, setLanguage] = useState(DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGE);
  const [aiModel, setAiModel] = useState<LingyaModel>("nano-banana-2");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [imageCount, setImageCount] = useState(getDefaultCount("details"));
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [productInfo, setProductInfo] = useState("");
  const [productProfile, setProductProfile] = useState<ProductSetProductProfile | null>(null);
  const [analysisDetail, setAnalysisDetail] = useState<ProductSetAnalysisDetail | null>(null);
  const [settingsPatch, setSettingsPatch] = useState<Partial<ProductSetSettings>>({});
  const [userBrief, setUserBrief] = useState("");
  const [designSpec, setDesignSpec] = useState(() => generateAllCategoryDesignSpecMarkdown({ imageType: "details" }));
  const [modules, setModules] = useState<PlanningModule[]>(() => createPlanningModules("details"));
  const [aiWritingPlans, setAiWritingPlans] = useState<string[]>([]);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [moduleResults, setModuleResults] = useState<ProductSetModuleResult[]>([]);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [showAiPlans, setShowAiPlans] = useState(false);
  const [editingDesignSpec, setEditingDesignSpec] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const { visibleModels } = useVisibleImageModels();
  const visibleModelEntries = useMemo(
    () => MODELS.filter((model) => !visibleModels || visibleModels.has(model.value)),
    [visibleModels],
  );

  const defaultAspect = getDefaultAspect();
  const supportedSizes = useMemo(() => getSupportedImageSizes(aiModel, defaultAspect), [aiModel, defaultAspect]);
  const countOptions = useMemo(() => imageType === "main" ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6, 7, 8], [imageType]);
  const resultSlots = useMemo(() => buildResultSlots(modules, moduleResults, resultUrls), [moduleResults, modules, resultUrls]);
  const parsedInfo = useMemo(() => parseAllCategoryProductInfo(productInfo || userBrief), [productInfo, userBrief]);
  const activeStepIndex = stepIndex(activeStep);
  const canAnalyze = productImages.length > 0 && !isUploading && !isAnalyzing && !isGenerating;
  const canGenerate = activeStepIndex >= stepIndex("planning") && productImages.length > 0 && !isAnalyzing && !isGenerating;
  const allCategoryPreviewSession = useMemo(
    () => createProductSetPreviewSession({
      module: "allCategoryProductImage",
      urls: resultSlots.map((slot) => slot.url || ""),
      expectedCount: Math.max(resultSlots.length, modules.length, 1),
      isGenerating,
      statusGroup: isGenerating ? "running" : activeStep === "done" ? "completed" : undefined,
      references: productImages.map((image, index) => ({
        url: image.uploadedUrl || image.url,
        label: image.name || t("productImageSlot", { index: index + 1 }),
        role: "product" as const,
      })),
      promptText: userBrief,
      metaItems: [
        { label: t("imageTypeLabel"), value: imageType === "main" ? t("imageTypeMain") : t("imageTypeDetails") },
        { label: t("platformLabel"), value: platform },
        { label: t("languageLabel"), value: language },
        { label: t("modelLabel"), value: aiModel },
        { label: t("resolutionLabel"), value: imageSize },
        { label: t("genCountLabel"), value: modules.length },
      ],
      titles: resultSlots.map((slot, index) => slot.module.title || t("productImageSlot", { index: index + 1 })),
      subtitles: resultSlots.map((slot) => `${slot.module.description} · ${getAspectRatioLabel(slot.module.aspectRatio || defaultAspect, t)}`),
      statuses: resultSlots.map((slot) => (slot.url ? "completed" : slot.status || (isGenerating ? "running" : "queued")) as ImagePreviewResultStatus),
      errors: resultSlots.map((slot) => slot.error || null),
      qualities: resultSlots.map((slot) => {
        if (slot.result?.qualityScore === undefined && !slot.result?.qualitySummary && !slot.result?.qualityIssues?.length) return null;
        return {
          score: slot.result.qualityScore,
          label: getProductSetModuleQualityLabel(slot.result.qualityScore).label,
          summary: slot.result.qualitySummary,
          issues: slot.result.qualityIssues || [],
        };
      }),
      aspectRatio: defaultAspect,
    }),
    [activeStep, aiModel, defaultAspect, imageSize, imageType, isGenerating, language, modules.length, platform, productImages, resultSlots, t, userBrief]
  );

  useEffect(() => {
    if (!supportedSizes.includes(imageSize)) setImageSize(supportedSizes[0] || "1K");
  }, [imageSize, supportedSizes]);

  useEffect(() => {
    const sourceImage = takeSourceImageFromLocation();
    if (sourceImage) {
      setProductImages([{ url: sourceImage, name: t("fromPreview"), uploadedUrl: sourceImage }]);
      setActiveStep("input");
      toast.success(t("broughtInPreview"));
    }
  }, []);

  function resetOutput() {
    setResultUrls([]);
    setModuleResults([]);
    setError("");
    setProgress(0);
    if (activeStep === "done" || activeStep === "generating") setActiveStep("planning");
  }

  function changeImageType(nextType: ProductSetImageType) {
    setImageType(nextType);
    const nextCount = getDefaultCount(nextType);
    setImageCount(nextCount);
    setModules(createPlanningModules(nextType, nextCount));
    setDesignSpec(generateAllCategoryDesignSpecMarkdown({
      imageType: nextType,
      productInfo: productInfo || userBrief,
      analysis: analysisToText(analysisDetail),
      platform,
      language,
    }));
    resetOutput();
  }

  function changeCount(nextCount: number) {
    const count = Math.min(Math.max(nextCount, 1), imageType === "main" ? 4 : 8);
    setImageCount(count);
    setModules(createPlanningModules(imageType, count));
    resetOutput();
  }

  async function handleFiles(files: FileList | File[]) {
    const incoming = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (!incoming.length) return toast.error(t("uploadImageFile"));
    const remaining = Math.max(0, MAX_PRODUCT_UPLOADS - productImages.length);
    if (!remaining) return toast.error(t("maxSkuImages", { max: MAX_PRODUCT_UPLOADS }));
    const selected = incoming.slice(0, remaining);
    if (incoming.length > selected.length) toast.info(t("ignoredOverMax", { max: MAX_PRODUCT_UPLOADS }));
    const oversized = selected.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) return toast.error(t("singleImageMax", { mb: MAX_FILE_SIZE_MB }));

    setIsUploading(true);
    const optimistic = selected.map((file) => ({ url: URL.createObjectURL(file), name: file.name }));
    setProductImages((prev) => [...prev, ...optimistic]);
    setActiveStep("input");
    resetOutput();

    const uploaded: ProductImage[] = [];
    for (let index = 0; index < selected.length; index += 1) {
      const file = selected[index];
      try {
        const result = await uploadImage(file);
        uploaded.push({
          name: file.name,
          url: result.display_url || result.url,
          uploadedUrl: result.url,
        });
      } catch (err) {
        uploaded.push(optimistic[index]);
        toast.warning(err instanceof Error ? err.message : t("uploadFailedLocalPreview"));
      }
    }

    setProductImages((prev) => [...prev.slice(0, prev.length - optimistic.length), ...uploaded]);
    setIsUploading(false);
  }

  function removeProductImage(index: number) {
    setProductImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    resetOutput();
    if (productImages.length <= 1) {
      setProductInfo("");
      setAnalysisDetail(null);
      setProductProfile(null);
      setActiveStep("input");
    }
  }

  async function runAnalyze(options: { openPlans?: boolean } = {}) {
    if (!productImages.length) {
      toast.error(t("uploadSkuFirst"));
      return null;
    }
    const imageUrls = getApiImageUrls(productImages);
    if (!imageUrls.length) {
      toast.error(t("localPreviewOnlyAnalyze"));
      return null;
    }

    setIsAnalyzing(true);
    setActiveStep("analyzing");
    setProgress(12);
    setError("");

    try {
      const progressTimer = window.setInterval(() => {
        setProgress((value) => Math.min(value + 8, 88));
      }, 420);
      const res = await fetch("/api/product-set/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_image_urls: imageUrls }),
      });
      window.clearInterval(progressTimer);
      const data = (await res.json().catch(() => ({}))) as AnalyzeResponse;
      if (!res.ok) throw new Error(data.error || t("visualAnalyzeFailed"));

      const nextProductInfo = data.product_info?.trim() || userBrief || productInfo || "";
      const nextAnalysis = data.analysis || null;
      const analysisText = analysisToText(nextAnalysis);
      const nextPlans = generateAllCategoryAiWritingPlans({
        imageType,
        productInfo: nextProductInfo || userBrief,
        analysis: analysisText,
        platform,
        language,
      });
      const nextSpec = generateAllCategoryDesignSpecMarkdown({
        imageType,
        productInfo: nextProductInfo || userBrief,
        analysis: analysisText,
        platform,
        language,
      });
      const nextModules = createPlanningModules(imageType, imageCount);

      setProductInfo(nextProductInfo);
      setProductProfile(data.product_profile || null);
      setAnalysisDetail(nextAnalysis);
      setSettingsPatch(data.settings_patch || {});
      setAiWritingPlans(nextPlans);
      setSelectedPlanIndex(0);
      setDesignSpec(nextSpec);
      setModules(nextModules);
      setProgress(100);
      setActiveStep("planning");
      setShowAiPlans(Boolean(options.openPlans));

      if (data.source === "ai") toast.success(t("analyzeDone"));
      else toast.warning(t("analyzeFallback"));
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : t("visualAnalyzeFailed");
      setError(message);
      setProgress(0);
      setActiveStep("input");
      toast.error(message);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function openAiWritingPlans() {
    aiPlansReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (!productImages.length) {
      toast.error(t("uploadSkuFirst"));
      return;
    }
    if (!aiWritingPlans.length) {
      await runAnalyze({ openPlans: true });
      return;
    }
    setShowAiPlans(true);
  }

  function applyAiWritingPlan() {
    const selected = aiWritingPlans[selectedPlanIndex];
    if (!selected) return;
    setUserBrief(selected);
    setDesignSpec(generateAllCategoryDesignSpecMarkdown({
      imageType,
      productInfo: [productInfo, selected].filter(Boolean).join("\n\n"),
      analysis: analysisToText(analysisDetail),
      platform,
      language,
    }));
    setShowAiPlans(false);
    setActiveStep("planning");
    toast.success(t("planSelected", { index: selectedPlanIndex + 1 }));
  }

  function buildProductSetSettings(): ProductSetSettings {
    const visualDirectorPlan = settingsPatch.visualDirectorPlan;
    return {
      country: "中国",
      language: mapLanguageForProductSet(language),
      platform: mapPlatformForProductSet(platform),
      themeMode: "auto",
      themeColor: "智能主题色",
      fontStyle: "auto",
      stylePackId: settingsPatch.stylePackId || "auto",
      extraDescription: [userBrief, designSpec].filter(Boolean).join("\n\n").slice(0, 2000),
      visualDirectorScript: [settingsPatch.visualDirectorScript, designSpec].filter(Boolean).join("\n\n").slice(0, 3000),
      ...(visualDirectorPlan ? { visualDirectorPlan } : {}),
    };
  }

  function buildGenerationBody(regenerateIndex?: number) {
    const imageUrls = getApiImageUrls(productImages);
    const settings = buildProductSetSettings();
    const customTemplates = toCustomTemplates(modules, imageType, language);
    return {
      product_image_urls: imageUrls,
      product_info: [productInfo, userBrief].filter(Boolean).join("\n\n").slice(0, 2400),
      product_profile: productProfile || undefined,
      mode: "custom",
      image_type: imageType,
      settings,
      selected_template_ids: [],
      custom_templates: customTemplates,
      module_overrides: [],
      gen_count: modules.length,
      regenerate_index: regenerateIndex,
      ai_model: aiModel,
      aspect_ratio: defaultAspect,
      image_size: imageSize,
    };
  }

  async function submitGeneration(regenerateIndex?: number) {
    if (!productImages.length) return toast.error(t("uploadSkuFirst"));
    if (!getApiImageUrls(productImages).length) return toast.error(t("localPreviewOnlyGenerate"));
    const isRegenerate = typeof regenerateIndex === "number";
    if (!isRegenerate) {
      setActiveStep("generating");
      setResultUrls([]);
      setModuleResults(modules.map((module, index) => ({
        moduleKey: `custom:all-category-${imageType}-${index + 1}`,
        index: index + 1,
        templateId: module.id,
        templateSource: "custom",
        name: module.title,
        imageType,
        aspectRatio: module.aspectRatio,
        moduleRole: module.title,
        contentScope: module.description,
        status: "queued",
        progress: 0,
      })));
    } else {
      setRegeneratingIndex(regenerateIndex);
    }
    setIsGenerating(true);
    setProgress(isRegenerate ? progress : 8);
    setError("");

    try {
      const res = await fetch("/api/product-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildGenerationBody(regenerateIndex)),
      });
      const data = (await res.json().catch(() => ({}))) as GenerationResponse;
      if (!res.ok || !data.generation_id) throw new Error(data.error || t("generationSubmitFailed"));
      const initialModules = readModuleResults(data.module_results);
      if (initialModules.length) setModuleResults(initialModules);

      for (let attempt = 0; attempt < 90; attempt += 1) {
        await delay(2000);
        const poll = await fetch(`/api/product-set?generation_id=${encodeURIComponent(data.generation_id)}`);
        const state = (await poll.json().catch(() => ({}))) as GenerationResponse;
        if (!poll.ok) throw new Error(state.error || t("generationStatusQueryFailed"));

        const nextModules = readModuleResults(state.module_results);
        if (nextModules.length) setModuleResults(nextModules);
        if (Array.isArray(state.result_urls)) setResultUrls(state.result_urls);
        setProgress(Math.min(Math.max(Math.round(Number(state.progress || 0)), 0), 100));

        if (state.status === "completed") {
          const completedModules = nextModules.length ? nextModules : moduleResults;
          const urls = state.result_urls || completedModules.map((item) => item.resultUrl).filter((url): url is string => Boolean(url));
          setResultUrls(urls);
          if (nextModules.length) setModuleResults(nextModules);
          setProgress(100);
          setActiveStep("done");
          toast.success(isRegenerate ? t("regenerateOneDone") : t("allDone"));
          return;
        }

        if (state.status === "failed") throw new Error(state.error || t("generationFailed"));
      }

      toast.info(t("continueBackground"));
      setActiveStep("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("generationFailed");
      setError(message);
      toast.error(message);
      if (!isRegenerate) setActiveStep("planning");
    } finally {
      setIsGenerating(false);
      setRegeneratingIndex(null);
    }
  }

  function updateModule(id: string, patch: Partial<PlanningModule>) {
    setModules((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    resetOutput();
  }

  async function downloadResult(url: string, index: number) {
    const ext = url.toLowerCase().includes(".jpg") || url.toLowerCase().includes(".jpeg") ? "jpg" : url.toLowerCase().includes(".webp") ? "webp" : "png";
    try {
      await downloadImage(url, generateDownloadFilename("all-category-product", index, ext));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("downloadFailed"));
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-64px)] flex-col bg-[#f3f3f4] lg:flex-row">
      <FeatureTabs active="allCategoryProductImage" />
      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1160px]">
          <header className="text-center">
            <div className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--codex-border)] bg-white px-4 text-sm font-semibold text-codex-ink shadow-sm">
              <PackageCheck aria-hidden="true" className="h-4 w-4" />
              {t("moduleLabel")}
            </div>
            <h1 className="mt-6 text-[30px] font-black tracking-normal text-codex-ink sm:text-[34px]" style={{ textWrap: "balance" }}>{t("heroTitle")}</h1>
            <p className="mx-auto mt-3 max-w-3xl text-base leading-7 text-codex-muted">
              {t("heroSubtitle")}
            </p>
          </header>

          <div className="mt-14">
            <StepBar activeIndex={activeStepIndex} />
          </div>

          <div className="mt-4 grid items-start gap-8 lg:grid-cols-[350px_minmax(0,760px)]">
            <aside className="space-y-5">
              <section className="rounded-2xl border border-[var(--codex-border)] bg-white p-6 shadow-sm">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  aria-label={t("uploadProductImageAria")}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    if (event.target.files) void handleFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--codex-surface-soft)] text-codex-muted">
                      <ImagePlus aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-sm font-black text-codex-ink">{t("productImagesTitle")}</h2>
                      <p className="mt-1 text-xs leading-5 text-codex-muted">{t("productImagesSubtitle")}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-codex-muted">{productImages.length}/{MAX_PRODUCT_UPLOADS}</span>
                </div>

                {productImages.length ? (
                  <div className="mt-5 grid grid-cols-3 gap-2">
                    {productImages.map((item, index) => (
                      <div key={`${item.url}-${index}`} className="studio-checkerboard group relative aspect-square overflow-hidden rounded-lg border border-[var(--codex-border)]">
                        <RawPreviewImage src={getImageVariantUrl(item.url, "thumb")} alt={item.name} className="h-full w-full object-contain p-1" />
                        <span className="absolute bottom-1 left-1 rounded bg-codex-ink/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">{index + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeProductImage(index)}
                          className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-codex-ink/65 text-white group-hover:flex group-focus-within:flex focus-visible:flex"
                          aria-label={t("deleteImage", { index: index + 1 })}
                        >
                          <X aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {productImages.length < MAX_PRODUCT_UPLOADS && (
                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-[var(--codex-border-strong)] bg-[var(--codex-surface-soft)] text-codex-muted hover:border-[var(--codex-border-strong)] hover:bg-white"
                      >
                        {isUploading ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : <ImagePlus aria-hidden="true" className="h-6 w-6" />}
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="mt-5 flex h-[132px] w-full flex-col items-center justify-center rounded-[14px] border border-dashed border-[var(--codex-border-strong)] bg-white text-center transition hover:border-[var(--codex-border-strong)] hover:bg-[var(--codex-surface-soft)]"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--codex-surface-soft)] text-codex-muted">
                      {isUploading ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : <Upload aria-hidden="true" className="h-5 w-5" />}
                    </span>
                    <span className="mt-4 max-w-[230px] text-xs font-semibold leading-5 text-codex-ink">
                      {t("multiUploadHint")}
                    </span>
                  </button>
                )}

                {productImages.length > 0 && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-codex-ink px-3 text-sm font-black text-white hover:bg-codex-muted"
                    >
                      <Upload aria-hidden="true" className="h-4 w-4" />
                      {t("uploadProduct")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductImages([])}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--codex-border)] text-codex-muted"
                      aria-label={t("clearImages")}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-[var(--codex-border)] bg-white p-6 shadow-sm">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "main", label: t("mainImage") },
                    { value: "details", label: t("detailImage") },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => changeImageType(item.value as ProductSetImageType)}
                      aria-pressed={imageType === item.value}
                      className={cn("h-10 rounded-lg border text-sm font-black transition", imageType === item.value ? "border-codex-ink bg-codex-ink text-white shadow-sm" : "border-[var(--codex-border)] bg-white text-codex-ink hover:bg-[var(--codex-surface-soft)]")}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="mt-5 grid gap-4">
                  <SelectField icon={<MonitorSmartphone aria-hidden="true" className="h-4 w-4" />} label={t("targetPlatform")} value={platform} options={ALL_CATEGORY_PRODUCT_IMAGE_PLATFORMS} onChange={(value) => { setPlatform(value as AllCategoryProductImagePlatform); resetOutput(); }} />
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-codex-muted">{imageType === "main" ? t("mainRequirement") : t("detailRequirement")}</span>
                    <div className="relative">
                      <textarea
                        value={userBrief}
                        onChange={(event) => { setUserBrief(event.target.value); resetOutput(); }}
                        placeholder={t("briefPlaceholder")}
                        aria-label={imageType === "main" ? t("mainRequirementAria") : t("detailRequirementAria")}
                        className="h-[118px] w-full resize-none rounded-lg border border-[var(--codex-border)] bg-[var(--codex-surface-soft)] px-3 py-3 pr-28 text-sm leading-6 text-codex-ink outline-none transition focus:border-[var(--codex-border-strong)]"
                      />
                      <button
                        type="button"
                        onClick={() => void openAiWritingPlans()}
                        disabled={!productImages.length || isAnalyzing || isGenerating}
                        className="absolute bottom-3 right-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--codex-border)] bg-white px-3 text-xs font-black text-codex-ink shadow-sm hover:bg-[var(--codex-surface-soft)] disabled:opacity-50"
                      >
                        <Brush aria-hidden="true" className="h-3.5 w-3.5" />
                        {t("aiAssist")}
                      </button>
                    </div>
                  </label>
                  <SelectField icon={<Languages aria-hidden="true" className="h-4 w-4" />} label={t("targetLanguage")} value={language} options={ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGES} onChange={(value) => { setLanguage(value as AllCategoryProductImageLanguage); resetOutput(); }} />
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField label={t("modelLabel")} value={aiModel} options={visibleModelEntries.map((item) => item.value)} labels={Object.fromEntries(visibleModelEntries.map((item) => [item.value, item.badge ? `${item.label} · ${item.badgeKey ? tAny(item.badgeKey) : item.badge}` : item.label]))} onChange={(value) => { setAiModel(value as LingyaModel); resetOutput(); }} />
                    <SelectField label={t("sizeRatio")} value={defaultAspect} options={[defaultAspect]} onChange={() => undefined} disabled />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <ResolutionSelector
                        titleKey="quality"
                        options={supportedSizes.map((size) => ({
                          value: size,
                          label: size,
                        }))}
                        value={imageSize}
                        onChange={(value) => { setImageSize(value as ImageSize); resetOutput(); }}
                        ariaLabel={t("quality")}
                      />
                    </div>
                    <div>
                      <span className="mb-2 block text-xs font-semibold text-codex-muted">{t("genCount")}</span>
                      <GenerationCountField
                        value={imageCount}
                        onChange={changeCount}
                        counts={countOptions}
                        ariaLabel={t("genCount")}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <button
                type="button"
                onClick={() => activeStepIndex >= stepIndex("planning") ? void submitGeneration() : void runAnalyze()}
                disabled={!canAnalyze && !canGenerate}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-codex-ink text-base font-black text-white shadow-sm transition hover:bg-codex-muted disabled:cursor-not-allowed disabled:bg-[#929292] disabled:text-white disabled:opacity-100"
              >
                {isAnalyzing || isGenerating ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : activeStepIndex >= stepIndex("planning") ? <PackageCheck aria-hidden="true" className="h-5 w-5" /> : <Brush aria-hidden="true" className="h-5 w-5" />}
                {isAnalyzing ? t("analyzingDots") : isGenerating ? t("generatingDots") : activeStepIndex >= stepIndex("planning") ? t("confirmGenerate", { count: modules.length }) : t("analyzeProduct")}
              </button>
            </aside>

            <section className="min-h-[820px] rounded-2xl border border-[var(--codex-border)] bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--codex-surface-soft)] text-codex-muted">
                      <PackageCheck aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black text-codex-ink">{activeStep === "done" ? t("generationDone") : activeStep === "generating" ? t("generatingDots") : activeStep === "analyzing" ? t("analyzingDots") : activeStep === "planning" ? t("designPreview") : t("generationResult")}</h2>
                    <p className="mt-1 text-xs leading-5 text-codex-muted">
                      {activeStep === "input" ? t("inputStepHint") : activeStep === "planning" ? t("planningStepHint") : activeStep === "done" ? t("doneStepHint") : getProgressMessage(t, activeStep, progress)}
                    </p>
                  </div>
                </div>
                {activeStep !== "input" && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void openAiWritingPlans()} disabled={!productImages.length || isAnalyzing || isGenerating} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--codex-border)] bg-white px-3 text-sm font-black text-codex-ink hover:bg-[var(--codex-surface-soft)] disabled:opacity-50">
                    <Bot aria-hidden="true" className="h-4 w-4" />
                    {t("aiAssist")}
                  </button>
                  <button type="button" onClick={() => void runAnalyze()} disabled={!canAnalyze} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--codex-border)] bg-white px-3 text-sm font-black text-codex-ink hover:bg-[var(--codex-surface-soft)] disabled:opacity-50">
                    <RefreshCw aria-hidden="true" className="h-4 w-4" />
                    {t("reanalyze")}
                  </button>
                </div>
                )}
              </div>

              {(activeStep === "analyzing" || activeStep === "generating") && (
                <div className="mt-6">
                  <ProgressLine value={progress} label={getProgressMessage(t, activeStep, progress)} />
                  {activeStep === "generating" && (
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      {resultSlots.map((slot, index) => (
                        <GenerationSkeleton key={`${slot.module.id}-${index}`} title={slot.module.title} progress={slot.progress || progress} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="mt-5 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                  {error}
                </div>
              )}

              {activeStep === "input" && !resultUrls.length && (
                <EmptyState
                  title={t("emptyStateTitle")}
                  description={t("emptyStateDesc")}
                />
              )}

              {activeStepIndex >= stepIndex("planning") && activeStep !== "generating" && !resultUrls.length && (
                <PlanningPreview
                  productName={parsedInfo.productName}
                  designSpec={designSpec}
                  editingDesignSpec={editingDesignSpec}
                  modules={modules}
                  onEditDesignSpec={() => setEditingDesignSpec((value) => !value)}
                  onDesignSpecChange={(value) => { setDesignSpec(value); resetOutput(); }}
                  onModuleChange={updateModule}
                  onGenerate={() => void submitGeneration()}
                  canGenerate={canGenerate}
                  imageType={imageType}
                />
              )}

              {(resultUrls.length > 0 || activeStep === "done") && activeStep !== "generating" && (
                <div className="mt-6">
                  <ResultGrid
                    slots={resultSlots}
                    regeneratingIndex={regeneratingIndex}
                    onPreview={(_, __, index) => setPreviewIndex(index)}
                    onDownload={downloadResult}
                    onRegenerate={(index) => void submitGeneration(index)}
                  />
                  <StudioImagePreviewDialog
                    open={previewIndex !== null}
                    onClose={() => setPreviewIndex(null)}
                    session={allCategoryPreviewSession}
                    selectedIndex={previewIndex || 0}
                    onSelectedIndexChange={setPreviewIndex}
                    filenamePrefix="all-category-product-image"
                    actions={ALL_CATEGORY_PREVIEW_ACTIONS.map((a) => {
                      const key: Record<string, string> = {
                        download: "actionDownload",
                        copy: "actionCopy",
                        regenerateOne: "actionRegenerateOne",
                        aiVideo: "actionAiVideo",
                        modelBackground: "actionModelBackground",
                        pose: "actionPose",
                        productSet: "actionProductSet",
                        feedback: "actionFeedback",
                      };
                      return { ...a, label: t(key[a.kind]) };
                    })}
                    onRegenerateOne={(_, index) => void submitGeneration(index)}
                  />
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      <AiWritingModal
        open={showAiPlans}
        returnFocusRef={aiPlansReturnFocusRef}
        plans={aiWritingPlans}
        selectedIndex={selectedPlanIndex}
        onSelect={setSelectedPlanIndex}
        onConfirm={applyAiWritingPlan}
        onRefresh={() => void runAnalyze({ openPlans: true })}
        onClose={() => setShowAiPlans(false)}
      />

    </div>
  );
}

