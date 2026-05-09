"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  BadgeCheck,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  FileText,
  ImagePlus,
  Languages,
  Loader2,
  MonitorSmartphone,
  PackageCheck,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { ClientPortal } from "@/components/ClientPortal";
import { FeatureTabs } from "@/components/FeatureTabs";
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
import { getImageVariantUrl } from "@/lib/image-variants";
import type {
  ProductSetCustomTemplate,
  ProductSetImageType,
  ProductSetModuleResult,
  ProductSetProductProfile,
  ProductSetSettings,
} from "@/lib/product-set";
import { downloadImage, generateDownloadFilename, MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";

type StepKey = "input" | "analyzing" | "planning" | "generating" | "done";

type ProductImage = {
  url: string;
  name: string;
  uploadedUrl?: string;
};

type PlanningModule = AllCategoryImagePlanItem & {
  aspectRatio: AspectRatio;
  expanded: boolean;
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

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: "input", label: "输入" },
  { key: "analyzing", label: "分析中" },
  { key: "planning", label: "确认规划" },
  { key: "generating", label: "生成中" },
  { key: "done", label: "完成" },
];
const MAX_PRODUCT_UPLOADS = 6;
const API_PRODUCT_IMAGE_LIMIT = 3;

const MODELS: Array<{ value: LingyaModel; label: string; badge?: string }> = [
  { value: "gpt-image-2", label: "GPT Image 2", badge: "默认" },
  { value: "nano-banana-2", label: "Nano Banana 2", badge: "快" },
  { value: "nano-banana-pro", label: "Nano Banana Pro", badge: "质感" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5", badge: "省" },
];

const MAIN_ASPECTS: AspectRatio[] = ["1:1", "3:4", "4:3"];
const DETAILS_ASPECTS: AspectRatio[] = ["3:4", "4:3", "1:1"];
const ANALYZE_PROGRESS_MESSAGES = ["正在识别商品主体...", "正在分析材质与卖点...", "正在生成视觉规划..."];
const GENERATE_PROGRESS_MESSAGES = [
  "正在模拟物理级光影分布...",
  "正在深度解析设计特征...",
  "正在构建创意构图与排版...",
  "正在进行高保真像素渲染...",
  "正在优化图像纹理与细节...",
  "即将完成，正在进行最后润色...",
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stepIndex(step: StepKey) {
  return STEPS.findIndex((item) => item.key === step);
}

function getDefaultCount(imageType: ProductSetImageType) {
  return imageType === "main" ? 1 : 1;
}

function getDefaultAspect(imageType: ProductSetImageType) {
  return imageType === "main" ? "1:1" : "3:4";
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

function getResultForModule(results: ProductSetModuleResult[], module: PlanningModule, index: number) {
  return results.find((item) => item.templateId === module.id || item.index === index + 1);
}

function buildResultSlots(modules: PlanningModule[], moduleResults: ProductSetModuleResult[], resultUrls: string[]) {
  return modules.map((module, index) => {
    const result = getResultForModule(moduleResults, module, index);
    return {
      module,
      result,
      url: result?.resultUrl || resultUrls[index],
      status: result?.status || (resultUrls[index] ? "completed" : "queued"),
      progress: result?.progress || 0,
      error: result?.error,
    };
  });
}

function getProgressMessage(step: StepKey, progress: number) {
  const messages = step === "generating" ? GENERATE_PROGRESS_MESSAGES : ANALYZE_PROGRESS_MESSAGES;
  const normalizedProgress = Math.min(Math.max(progress || 0, 0), 99);
  const index = Math.min(messages.length - 1, Math.floor(normalizedProgress / (100 / messages.length)));
  return messages[index];
}

export default function AllCategoryProductImagePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeStep, setActiveStep] = useState<StepKey>("input");
  const [imageType, setImageType] = useState<ProductSetImageType>("details");
  const [platform, setPlatform] = useState(DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_PLATFORM);
  const [language, setLanguage] = useState(DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGE);
  const [aiModel, setAiModel] = useState<LingyaModel>("gpt-image-2");
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
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  const defaultAspect = getDefaultAspect(imageType);
  const supportedSizes = useMemo(() => getSupportedImageSizes(aiModel, defaultAspect), [aiModel, defaultAspect]);
  const countOptions = useMemo(() => imageType === "main" ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6, 7, 8], [imageType]);
  const resultSlots = useMemo(() => buildResultSlots(modules, moduleResults, resultUrls), [moduleResults, modules, resultUrls]);
  const parsedInfo = useMemo(() => parseAllCategoryProductInfo(productInfo || userBrief), [productInfo, userBrief]);
  const activeStepIndex = stepIndex(activeStep);
  const canAnalyze = productImages.length > 0 && !isUploading && !isAnalyzing && !isGenerating;
  const canGenerate = activeStepIndex >= stepIndex("planning") && productImages.length > 0 && !isAnalyzing && !isGenerating;

  useEffect(() => {
    if (!supportedSizes.includes(imageSize)) setImageSize(supportedSizes[0] || "1K");
  }, [imageSize, supportedSizes]);

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
    if (!incoming.length) return toast.error("请上传图片文件");
    const remaining = Math.max(0, MAX_PRODUCT_UPLOADS - productImages.length);
    if (!remaining) return toast.error(`最多上传 ${MAX_PRODUCT_UPLOADS} 张 SKU 参考图`);
    const selected = incoming.slice(0, remaining);
    if (incoming.length > selected.length) toast.info(`已自动忽略超过 ${MAX_PRODUCT_UPLOADS} 张的图片`);
    const oversized = selected.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) return toast.error(`单张图片不能超过 ${MAX_FILE_SIZE_MB}MB`);

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
        toast.warning(err instanceof Error ? err.message : "图片上传失败，已保留本地预览");
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
      toast.error("请先上传商品 SKU 图");
      return null;
    }
    const imageUrls = getApiImageUrls(productImages);
    if (!imageUrls.length) {
      toast.error("当前图片只有本地预览，请重新上传后再分析");
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
      if (!res.ok) throw new Error(data.error || "视觉分析失败");

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

      if (data.source === "ai") toast.success("视觉分析师已完成商品分析");
      else toast.warning("视觉分析使用了基础结果，可继续编辑规划");
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "视觉分析失败";
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
    if (!productImages.length) {
      toast.error("请先上传商品 SKU 图");
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
    toast.success(`已选择方案 ${selectedPlanIndex + 1}`);
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
    if (!productImages.length) return toast.error("请先上传商品 SKU 图");
    if (!getApiImageUrls(productImages).length) return toast.error("当前图片只有本地预览，请重新上传后再生成");
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
      if (!res.ok || !data.generation_id) throw new Error(data.error || "生成任务提交失败");
      const initialModules = readModuleResults(data.module_results);
      if (initialModules.length) setModuleResults(initialModules);

      for (let attempt = 0; attempt < 90; attempt += 1) {
        await delay(2000);
        const poll = await fetch(`/api/product-set?generation_id=${encodeURIComponent(data.generation_id)}`);
        const state = (await poll.json().catch(() => ({}))) as GenerationResponse;
        if (!poll.ok) throw new Error(state.error || "生成状态查询失败");

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
          toast.success(isRegenerate ? "单张图片已重生完成" : "全品类商品图生成完成");
          return;
        }

        if (state.status === "failed") throw new Error(state.error || "生成失败");
      }

      toast.info("生成仍在后台继续，可稍后在作品库查看");
      setActiveStep("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "生成失败";
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
    await downloadImage(url, generateDownloadFilename("all-category-product", index, ext));
  }

  return (
    <div className="flex min-h-[calc(100dvh-64px)] flex-col bg-[#f3f3f4] lg:flex-row">
      <FeatureTabs active="allCategoryProductImage" />
      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1160px]">
          <header className="text-center">
            <div className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm">
              <Sparkles className="h-4 w-4" />
              AI 全品类商品图
            </div>
            <h1 className="mt-6 text-[30px] font-black tracking-normal text-slate-950 sm:text-[34px]">一键生成主图 & 详情图组</h1>
            <p className="mx-auto mt-3 max-w-3xl text-base leading-7 text-slate-500">
              上传产品图，AI 智能分析产品特征，自动生成电商主图及多角度、多场景的详情图组
            </p>
          </header>

          <div className="mt-14">
            <StepBar activeIndex={activeStepIndex} />
          </div>

          <div className="mt-4 grid items-start gap-8 lg:grid-cols-[350px_minmax(0,760px)]">
            <aside className="space-y-5">
              <section className="rounded-[18px] border border-slate-200 bg-white p-6 shadow-sm">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    if (event.target.files) void handleFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <ImagePlus className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-sm font-black text-slate-950">产品图</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-500">上传清晰的产品图片</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">{productImages.length}/{MAX_PRODUCT_UPLOADS}</span>
                </div>

                {productImages.length ? (
                  <div className="mt-5 grid grid-cols-3 gap-2">
                    {productImages.map((item, index) => (
                      <div key={`${item.url}-${index}`} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        <img src={getImageVariantUrl(item.url, "thumb")} alt={item.name} className="h-full w-full object-contain p-1" />
                        <span className="absolute bottom-1 left-1 rounded bg-slate-950/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">{index + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeProductImage(index)}
                          className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-slate-950/65 text-white group-hover:flex"
                          aria-label="删除图片"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {productImages.length < MAX_PRODUCT_UPLOADS && (
                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-slate-400 hover:bg-white"
                      >
                        {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="mt-5 flex h-[132px] w-full flex-col items-center justify-center rounded-[14px] border border-dashed border-slate-300 bg-white text-center transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                    </span>
                    <span className="mt-4 max-w-[230px] text-xs font-semibold leading-5 text-slate-950">
                      多图上传时建议仅上传必要的视角或sku图，图片不是越多越好
                    </span>
                  </button>
                )}

                {productImages.length > 0 && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-black text-white hover:bg-slate-800"
                    >
                      <Upload className="h-4 w-4" />
                      上传商品图
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductImages([])}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500"
                      aria-label="清空图片"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </section>

              <section className="rounded-[18px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "main", label: "商品主图" },
                    { value: "details", label: "商品详情图" },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => changeImageType(item.value as ProductSetImageType)}
                      className={cn("h-10 rounded-lg border text-sm font-black transition", imageType === item.value ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="mt-5 grid gap-4">
                  <SelectField icon={<MonitorSmartphone className="h-4 w-4" />} label="目标平台" value={platform} options={ALL_CATEGORY_PRODUCT_IMAGE_PLATFORMS} onChange={(value) => { setPlatform(value as AllCategoryProductImagePlatform); resetOutput(); }} />
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-slate-500">{imageType === "main" ? "主图要求" : "详情图要求"}</span>
                    <div className="relative">
                      <textarea
                        value={userBrief}
                        onChange={(event) => { setUserBrief(event.target.value); resetOutput(); }}
                        placeholder="建议输入：产品名称、卖点、目标人群、目标电商平台、图片风格等"
                        className="h-[118px] w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 pr-28 text-sm leading-6 text-slate-800 outline-none transition focus:border-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => void openAiWritingPlans()}
                        disabled={!productImages.length || isAnalyzing || isGenerating}
                        className="absolute bottom-3 right-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        AI帮写
                      </button>
                    </div>
                  </label>
                  <SelectField icon={<Languages className="h-4 w-4" />} label="目标语言" value={language} options={ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGES} onChange={(value) => { setLanguage(value as AllCategoryProductImageLanguage); resetOutput(); }} />
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField label="模型" value={aiModel} options={MODELS.map((item) => item.value)} labels={Object.fromEntries(MODELS.map((item) => [item.value, item.badge ? `${item.label} · ${item.badge}` : item.label]))} onChange={(value) => { setAiModel(value as LingyaModel); resetOutput(); }} />
                    <SelectField label="尺寸比例" value={defaultAspect} options={[defaultAspect]} onChange={() => undefined} disabled />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField label="画质" value={imageSize} options={supportedSizes} onChange={(value) => { setImageSize(value as ImageSize); resetOutput(); }} />
                    <SelectField label="生成数量" value={`${imageCount}张`} options={countOptions.map((count) => `${count}张`)} onChange={(value) => changeCount(Number.parseInt(value, 10) || 1)} />
                  </div>
                </div>
              </section>

              <button
                type="button"
                onClick={() => activeStepIndex >= stepIndex("planning") ? void submitGeneration() : void runAnalyze()}
                disabled={!canAnalyze && !canGenerate}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-[16px] bg-slate-950 text-base font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-[#929292] disabled:text-white disabled:opacity-100"
              >
                {isAnalyzing || isGenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : activeStepIndex >= stepIndex("planning") ? <PackageCheck className="h-5 w-5" /> : <Wand2 className="h-5 w-5" />}
                {isAnalyzing ? "分析中..." : isGenerating ? "生成中..." : activeStepIndex >= stepIndex("planning") ? `确认生成 ${modules.length} 张图片` : "分析产品"}
              </button>
            </aside>

            <section className="min-h-[820px] rounded-[18px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black text-slate-950">{activeStep === "done" ? "生成完成" : activeStep === "generating" ? "生成中..." : activeStep === "analyzing" ? "分析中..." : activeStep === "planning" ? "设计规划预览" : "生成结果"}</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {activeStep === "input" ? "上传产品图并点击分析开始" : activeStep === "planning" ? "请确认设计规范和图片规划" : activeStep === "done" ? "所有图片已生成完成" : getProgressMessage(activeStep, progress)}
                    </p>
                  </div>
                </div>
                {activeStep !== "input" && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void openAiWritingPlans()} disabled={!productImages.length || isAnalyzing || isGenerating} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    <Bot className="h-4 w-4" />
                    AI帮写
                  </button>
                  <button type="button" onClick={() => void runAnalyze()} disabled={!canAnalyze} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    <RefreshCw className="h-4 w-4" />
                    重新分析
                  </button>
                </div>
                )}
              </div>

              {(activeStep === "analyzing" || activeStep === "generating") && (
                <div className="mt-6">
                  <ProgressLine value={progress} label={getProgressMessage(activeStep, progress)} />
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
                  title="上传产品图并填写要求后"
                  description="点击分析产品开始"
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
                <ResultGrid
                  slots={resultSlots}
                  regeneratingIndex={regeneratingIndex}
                  onPreview={(url, title) => setPreviewImage({ url, title })}
                  onDownload={downloadResult}
                  onRegenerate={(index) => void submitGeneration(index)}
                />
              )}
            </section>
          </div>
        </div>
      </main>

      <ClientPortal>
        {showAiPlans && (
          <AiWritingModal
            plans={aiWritingPlans}
            selectedIndex={selectedPlanIndex}
            onSelect={setSelectedPlanIndex}
            onConfirm={applyAiWritingPlan}
            onRefresh={() => void runAnalyze({ openPlans: true })}
            onClose={() => setShowAiPlans(false)}
          />
        )}

        {previewImage && (
          <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
            <button type="button" onClick={() => setPreviewImage(null)} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="关闭预览">
              <X className="h-5 w-5" />
            </button>
            <div className="relative max-h-[92vh] max-w-[94vw] overflow-hidden rounded-lg bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <img src={previewImage.url} alt={previewImage.title} className="max-h-[92vh] max-w-[94vw] object-contain" />
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/65 px-3 py-1 text-xs font-semibold text-white">{previewImage.title}</span>
            </div>
          </div>
        )}
      </ClientPortal>
    </div>
  );
}

function StepBar({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="mx-auto flex max-w-[620px] items-center justify-center gap-2">
      {STEPS.map((step, index) => {
        const isActive = index === activeIndex;
        const isDone = index < activeIndex;
        return (
          <div key={step.key} className="flex items-center gap-2">
            <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-black", isDone || isActive ? "bg-slate-950 text-white" : "bg-transparent text-slate-500")}>
              {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span className={cn("hidden text-xs font-semibold sm:inline", isActive || isDone ? "text-slate-950" : "text-slate-500")}>{step.label}</span>
            {index < STEPS.length - 1 && <span className="h-px w-8 bg-slate-300 sm:w-10" />}
          </div>
        );
      })}
    </div>
  );
}

function SelectField({
  icon,
  label,
  value,
  options,
  labels,
  disabled,
  onChange,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  options: readonly string[];
  labels?: Record<string, string>;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        {icon}
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] || option}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[680px] items-center justify-center px-6 text-center">
      <div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Sparkles className="h-8 w-8" />
        </div>
        <h3 className="mt-5 text-sm font-semibold leading-6 text-slate-600">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function ProgressLine({ value, label }: { value: number; label: string }) {
  const display = Math.min(Math.max(Math.round(value), 0), 100);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
        <span>{label}</span>
        <span>{display}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-slate-950 transition-all duration-500" style={{ width: `${Math.max(display, 4)}%` }} />
      </div>
    </div>
  );
}

function PlanningPreview({
  productName,
  designSpec,
  editingDesignSpec,
  modules,
  imageType,
  canGenerate,
  onEditDesignSpec,
  onDesignSpecChange,
  onModuleChange,
  onGenerate,
}: {
  productName: string;
  designSpec: string;
  editingDesignSpec: boolean;
  modules: PlanningModule[];
  imageType: ProductSetImageType;
  canGenerate: boolean;
  onEditDesignSpec: () => void;
  onDesignSpecChange: (value: string) => void;
  onModuleChange: (id: string, patch: Partial<PlanningModule>) => void;
  onGenerate: () => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              <BadgeCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-950">整体设计规划预览</h3>
              <p className="truncate text-xs text-slate-500">{productName} · 所有图片遵循统一视觉标准</p>
            </div>
          </div>
          <button type="button" onClick={onEditDesignSpec} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-600 hover:bg-slate-50">
            <Edit3 className="h-3.5 w-3.5" />
            {editingDesignSpec ? "预览" : "编辑"}
          </button>
        </div>
        <div className="p-4">
          {editingDesignSpec ? (
            <textarea value={designSpec} onChange={(event) => onDesignSpecChange(event.target.value)} className="min-h-[300px] w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-6 text-slate-800 outline-none focus:border-slate-400" />
          ) : (
            <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-7 text-slate-700">{designSpec}</pre>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-950">图片规划</h3>
            <p className="mt-1 text-xs text-slate-500">共 {modules.length} 张图片，点击可编辑标题和描述</p>
          </div>
          <button type="button" onClick={onGenerate} disabled={!canGenerate} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
            <PackageCheck className="h-4 w-4" />
            确认生成 {modules.length} 张图片
          </button>
        </div>

        <div className="space-y-3">
          {modules.map((module, index) => (
            <article key={module.id} className="rounded-lg border border-slate-200">
              <button type="button" onClick={() => onModuleChange(module.id, { expanded: !module.expanded })} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-700">{index + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-slate-950">{module.title}</span>
                    <span className="block truncate text-xs text-slate-500">{module.description}</span>
                  </span>
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition", module.expanded && "rotate-180")} />
              </button>
              {module.expanded && (
                <div className="grid gap-3 border-t border-slate-100 bg-slate-50 p-4 md:grid-cols-2">
                  <EditField label="标题" value={module.title} onChange={(value) => onModuleChange(module.id, { title: value })} />
                  <SelectField label="图片比例" value={module.aspectRatio} options={imageType === "main" ? MAIN_ASPECTS : DETAILS_ASPECTS} onChange={(value) => onModuleChange(module.id, { aspectRatio: value as AspectRatio })} />
                  <EditField label="描述" value={module.description} onChange={(value) => onModuleChange(module.id, { description: value })} textarea />
                  <EditField label="生成细则" value={module.detailPrompt} onChange={(value) => onModuleChange(module.id, { detailPrompt: value })} textarea />
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function GenerationSkeleton({ title, progress }: { title: string; progress: number }) {
  return (
    <div className="flex aspect-[3/4] flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
        <Sparkles className="h-6 w-6" />
      </div>
      <p className="mt-4 text-sm font-black text-slate-700">{title}</p>
      <p className="mt-1 px-4 text-xs text-slate-500">{getProgressMessage("generating", progress)}</p>
      <p className="mt-1 text-[11px] font-semibold text-slate-400">{progress ? `${progress}%` : "等待渲染..."}</p>
    </div>
  );
}

function ResultGrid({
  slots,
  regeneratingIndex,
  onPreview,
  onDownload,
  onRegenerate,
}: {
  slots: ReturnType<typeof buildResultSlots>;
  regeneratingIndex: number | null;
  onPreview: (url: string, title: string) => void;
  onDownload: (url: string, index: number) => void;
  onRegenerate: (index: number) => void;
}) {
  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-950">生成完成</h3>
          <p className="mt-1 text-xs text-slate-500">支持预览、下载和单张重生。</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {slots.map((slot, index) => (
          <article key={`${slot.module.id}-${index}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="relative aspect-[3/4] bg-slate-50">
              {slot.url ? (
                <img src={getImageVariantUrl(slot.url, "card")} alt={slot.module.title} className="h-full w-full object-contain" />
              ) : slot.status === "failed" ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center text-red-500">
                  <X className="h-7 w-7" />
                  <p className="mt-3 text-sm font-black">生成失败</p>
                  <p className="mt-1 text-xs leading-5">{slot.error || "可尝试单张重生"}</p>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <p className="mt-3 text-sm font-black">等待结果</p>
                </div>
              )}
              {slot.url && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-950/0 opacity-0 transition hover:bg-slate-950/35 hover:opacity-100">
                  <IconButton label="预览" onClick={() => onPreview(slot.url!, slot.module.title)} icon={<ZoomIn className="h-4 w-4" />} />
                  <IconButton label="下载" onClick={() => onDownload(slot.url!, index)} icon={<Download className="h-4 w-4" />} />
                  <IconButton label="重生" onClick={() => onRegenerate(index)} icon={regeneratingIndex === index ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} />
                </div>
              )}
            </div>
            <div className="p-3">
              <h4 className="truncate text-sm font-black text-slate-950">{slot.module.title}</h4>
              <p className="mt-1 text-xs font-semibold text-slate-500">{slot.url ? "已生成" : slot.status === "failed" ? "失败" : "生成中"} · {slot.module.aspectRatio}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function IconButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg hover:bg-slate-100">
      {icon}
    </button>
  );
}

function EditField({ label, value, onChange, textarea }: { label: string; value: string; onChange: (value: string) => void; textarea?: boolean }) {
  return (
    <label className="block text-xs font-black text-slate-500">
      {label}
      {textarea ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-[96px] w-full resize-y rounded-lg border border-slate-200 bg-white p-2 text-sm font-medium leading-6 text-slate-900 outline-none focus:border-slate-400" />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-900 outline-none focus:border-slate-400" />
      )}
    </label>
  );
}

function AiWritingModal({
  plans,
  selectedIndex,
  onSelect,
  onConfirm,
  onRefresh,
  onClose,
}: {
  plans: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onConfirm: () => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
              <Wand2 className="h-5 w-5 text-slate-700" />
            </span>
            <div>
              <h2 className="text-base font-black text-slate-950">AI帮写方案选择</h2>
              <p className="mt-1 text-xs text-slate-500">选择方案后可自由编辑，确认即可使用。</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-b border-slate-100 px-5 py-3">
          <div className="flex gap-2">
            {plans.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onSelect(index)}
                className={cn("h-9 rounded-full border px-4 text-sm font-black", selectedIndex === index ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600")}
              >
                方案{index + 1}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-slate-50 p-5">
          <pre className="min-h-[360px] whitespace-pre-wrap rounded-lg bg-white p-4 text-sm leading-7 text-slate-800 shadow-sm">{plans[selectedIndex] || "暂无方案"}</pre>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-between">
          <button type="button" onClick={onRefresh} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-600 hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" />
            重新帮写
          </button>
          <button type="button" onClick={onConfirm} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-6 text-sm font-black text-white">
            <Check className="h-4 w-4" />
            确认选择
          </button>
        </div>
      </div>
    </div>
  );
}
