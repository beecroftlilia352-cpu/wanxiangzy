"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  Check,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  ImagePlus,
  Layers3,
  Loader2,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PreviewGuide } from "@/components/PreviewGuide";
import { LoadingStage } from "@/components/studio/LoadingStage";
import { ClientPortal } from "@/components/ClientPortal";
import { createClient, getCachedProfileCredits, setCachedProfileCredits } from "@/lib/supabase/client";
import { takeApplyPayload } from "@/lib/history-apply";
import { downloadImage, generateDownloadFilename, MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { getCreditCost, getSupportedImageSizes, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import {
  PRODUCT_SET_COUNTRIES,
  PRODUCT_SET_EXAMPLE_GROUPS,
  PRODUCT_SET_FONT_STYLE_LABELS,
  PRODUCT_SET_LANGUAGES,
  PRODUCT_SET_PLATFORMS,
  PRODUCT_SET_PRESET_PLANS,
  PRODUCT_SET_PROMPT_VERSION,
  PRODUCT_SET_STYLE_PACKS,
  buildProductSetPlanRecommendation,
  getProductSetModuleQualityLabel,
  getProductSetModuleKey,
  getProductSetModuleReason,
  getProductSetTemplates,
  getProductSetVisualDirectorPlanCount,
  normalizeProductSetProductProfile,
  resolveProductSetTemplates,
  shouldUseModelForTemplate,
  type ProductSetCopyDensity,
  type ProductSetCreationMode,
  type ProductSetCustomTemplate,
  type ProductSetFontStyle,
  type ProductSetImageType,
  type ProductSetApparelType,
  type ProductSetModuleOverride,
  type ProductSetModuleResult,
  type ProductSetModelStrategy,
  type ProductSetProductKind,
  type ProductSetProductProfile,
  type ProductSetResolvedTemplate,
  type ProductSetSettings,
  type ProductSetStylePack,
  type ProductSetTemplate,
  type ProductSetThemeMode,
} from "@/lib/product-set";
import {
  buildDefaultFavoritePlanName,
  buildFavoritePlanApplyState,
  buildSavedProductSetPlan,
  getSelectedPlanIdForProductSetState,
  normalizeFavoriteProductSetPlan,
  type SavedProductSetPlan,
} from "@/lib/product-set-ui-state";

const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 4分/次", badge: "最新", icon: "/model-icons/openai.svg" },
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "4K · 3分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "4K · 4分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5", desc: "4K · 2分/次", badge: "新", icon: "/model-icons/doubao.png" },
];

const CUSTOM_ASPECTS: AspectRatio[] = ["4:3", "3:4", "9:16", "16:9", "1:1", "3:2", "2:3", "21:9"];
const FAVORITE_PRODUCT_SET_PLAN_LIMIT = 24;

type ProductImage = {
  url: string;
  name: string;
};

type CustomDraft = {
  name: string;
  typeDescription: string;
  moduleRole: string;
  contentScope: string;
  layoutRules: string;
  textRules: string;
  avoidRules: string;
  aspectRatio: AspectRatio;
  referenceImageUrls: string[];
  modelReferenceImageUrls: string[];
  otherReferenceImageUrls: string[];
  extraDescription: string;
  subjectConsistency: boolean;
  modelConsistency: boolean;
  intelligentCopy: boolean;
  copyDensity: ProductSetCopyDensity;
};

type TemplateFilter = "all" | "selected" | "womenswear";
type ProductAnalysisSource = "idle" | "running" | "ai" | "fallback" | "manual" | "history" | "failed";
type ProductSetAnalysisDetail = {
  image_role?: string;
  category?: { primary?: string; secondary?: string; category_confidence?: number };
  product?: {
    name_guess?: string;
    colors?: string[];
    style_tags?: string[];
    visible_details?: string[];
    possible_selling_points?: string[];
    usage_scenarios?: string[];
  };
  image_quality?: { quality_score?: number; can_generate?: boolean };
  generation_fit?: { recommended_style?: string; recommended_style_reason?: string; recommended_output_set?: string[] };
  visual_director?: {
    strategy_name?: string;
    style_strategy?: string;
    global_strategy?: {
      core_palette?: string;
      primary_color?: string;
      secondary_colors?: string[];
      accent_color?: string;
      color_temperature?: string;
      lighting?: string;
      typography?: string;
      texture_mood?: string;
    };
    main_plan?: Array<{ module_key?: string; purpose?: string; layout?: string; copy_rule?: string }>;
    details_plan?: Array<{ module_key?: string; purpose?: string; layout?: string; copy_rule?: string }>;
    main_scripts?: Array<{ screen_no?: number; module_key?: string; title?: string; global_tone?: string; scene_design?: string; visual_composition?: string; copy_content?: string; layout_rules?: string; constraints?: string }>;
    details_scripts?: Array<{ screen_no?: number; module_key?: string; title?: string; global_tone?: string; scene_design?: string; visual_composition?: string; copy_content?: string; layout_rules?: string; constraints?: string }>;
    layout_principles?: string[];
    copy_strategy?: string;
    negative_layouts?: string[];
  };
  missing_info?: string[];
  next_step?: { message_to_user?: string; can_continue_without_more_info?: boolean };
  prompt_summary?: string;
};

const DEFAULT_SETTINGS: ProductSetSettings = {
  country: "中国",
  language: "中文",
  platform: "淘宝",
  themeMode: "auto",
  themeColor: "智能主题色",
  fontStyle: "auto",
  stylePackId: "auto",
  extraDescription: "",
  visualDirectorScript: "",
};

const DEFAULT_DRAFT: CustomDraft = {
  name: "自定义样式",
  typeDescription: "",
  moduleRole: "",
  contentScope: "",
  layoutRules: "",
  textRules: "",
  avoidRules: "",
  aspectRatio: "3:4",
  referenceImageUrls: [],
  modelReferenceImageUrls: [],
  otherReferenceImageUrls: [],
  extraDescription: "",
  subjectConsistency: true,
  modelConsistency: false,
  intelligentCopy: true,
  copyDensity: "standard",
};

export default function ProductSetPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const productInputRef = useRef<HTMLInputElement>(null);
  const customRefInputRef = useRef<HTMLInputElement>(null);
  const customModelRefInputRef = useRef<HTMLInputElement>(null);
  const customOtherRefInputRef = useRef<HTMLInputElement>(null);
  const lastAnalyzedSignatureRef = useRef("");

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
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
  const [imageType, setImageType] = useState<ProductSetImageType>("main");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("smart");
  const [customTemplates, setCustomTemplates] = useState<ProductSetCustomTemplate[]>([]);
  const [moduleOverrides, setModuleOverrides] = useState<ProductSetModuleOverride[]>([]);
  const [editingModuleIndex, setEditingModuleIndex] = useState<number | null>(null);
  const [customDraft, setCustomDraft] = useState<CustomDraft>(DEFAULT_DRAFT);
  const [aiModel, setAiModel] = useState<LingyaModel>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("3:4");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(3);
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>("all");
  const [templateQuery, setTemplateQuery] = useState("");
  const [favoritePlans, setFavoritePlans] = useState<SavedProductSetPlan[]>([]);
  const [favoritePlanName, setFavoritePlanName] = useState("");
  const [showFavoritePlans, setShowFavoritePlans] = useState(false);
  const [isLoadingFavoritePlans, setIsLoadingFavoritePlans] = useState(false);
  const [isSavingFavoritePlan, setIsSavingFavoritePlan] = useState(false);

  const templates = useMemo(() => getProductSetTemplates(imageType), [imageType]);
  const activeSelectedTemplateIds = useMemo(
    () => selectedTemplateIds.filter((id) => templates.some((template) => template.id === id)),
    [selectedTemplateIds, templates]
  );
  const activeCustomTemplates = useMemo(
    () => customTemplates.filter((template) => template.imageType === imageType),
    [customTemplates, imageType]
  );
  const productSignature = useMemo(() => productImages.map((item) => item.url).join("|"), [productImages]);
  const productInfoFields = useMemo(() => parseProductInfo(productInfo), [productInfo]);
  const displayProductInfoFields = useMemo(() => ({
    ...productInfoFields,
    name: isPlaceholderProductName(productInfoFields.name) ? "未识别出具体商品名" : productInfoFields.name,
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
  const planTemplates = useMemo(
    () => resolveProductSetTemplates({
      mode,
      imageType,
      selectedTemplateIds: activeSelectedTemplateIds,
      customTemplates: activeCustomTemplates,
      genCount,
      productProfile: effectiveProductProfile,
      settings,
      moduleOverrides,
    }),
    [mode, imageType, activeSelectedTemplateIds, activeCustomTemplates, genCount, effectiveProductProfile, settings, moduleOverrides]
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
    : getCreditCost(aiModel, imageSize, aspectRatio);
  const requiresProductConfirmation = productImages.length > 0 && !isAnalyzing && (
    analysisSource === "fallback" ||
    analysisSource === "failed" ||
    (analysisSource === "idle" && !productInfo.trim())
  );
  const canGenerate = !isGenerating && !isUploading && !isAnalyzing && !requiresProductConfirmation && productImages.length > 0 && outputCount > 0;
  const selectedStylePack = PRODUCT_SET_STYLE_PACKS.find((pack) => pack.id === settings.stylePackId) || PRODUCT_SET_STYLE_PACKS[0];
  const settingsSummary = `${settings.country} · ${settings.language} · ${settings.platform} · ${selectedStylePack.name} · ${PRODUCT_SET_FONT_STYLE_LABELS[settings.fontStyle]}`;
  const countOptions = imageType === "main" ? [1, 3, 4] : [3, 5, 7, 8];
  const outputUnit = imageType === "main" ? "张主图" : "屏详情页";
  const modeTitle = imageType === "main" ? "商品主图生成" : "详情页方案生成";
  const modeDescription = imageType === "main"
    ? "轻量生成可上架、可投放的主图/辅图，默认 3 张。"
    : "先确认详情页屏幕结构，再逐屏生成，默认推荐 5 屏。";
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
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setIsAuthenticated(true);
        setUserId(data.user.id);
        getCachedProfileCredits(data.user.id).then(setCredits);
      }
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setIsAuthenticated(true);
        setUserId(session.user.id);
        getCachedProfileCredits(session.user.id).then(setCredits);
      } else {
        setIsAuthenticated(false);
        setUserId(null);
        setCredits(null);
      }
      setAuthChecked(true);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

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
        if (!res.ok) throw new Error(data.error || "收藏方案加载失败");
        const rawPlans = data && typeof data === "object" && Array.isArray((data as { plans?: unknown }).plans)
          ? (data as { plans: unknown[] }).plans
          : [];
        const plans = rawPlans.length
          ? rawPlans.map((item) => normalizeFavoriteProductSetPlan(item, DEFAULT_SETTINGS)).filter((plan): plan is SavedProductSetPlan => Boolean(plan))
          : [];
        if (!cancelled) setFavoritePlans(plans);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "收藏方案加载失败");
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
    const applyPayload = await takeApplyPayload("productSet");
    if (cancelled || !applyPayload) return;

    const appliedImageType = applyPayload.imageType === "details" ? "details" : "main";
    setProductImages(applyPayload.productImageUrls.slice(0, 3).map((url, index) => ({ url, name: `历史商品图${index + 1}` })));
    setProductInfo(applyPayload.productInfo || "");
    setProductProfile(normalizeProductSetProductProfile(applyPayload.productProfile, applyPayload.productInfo || ""));
    setAnalysisDetail(null);
    setAnalysisSource(applyPayload.productInfo ? "history" : "idle");
    setAnalysisMessage("");
    setSettings({ ...DEFAULT_SETTINGS, ...(applyPayload.settings || {}) });
    setMode(applyPayload.mode === "custom" ? "custom" : "smart");
    setImageType(appliedImageType);
    setSelectedTemplateIds(applyPayload.selectedTemplateIds || []);
    setSelectedPlanId(applyPayload.mode === "custom" ? "custom" : "smart");
    setCustomTemplates(applyPayload.customTemplates || []);
    setModuleOverrides(applyPayload.moduleOverrides || []);
    setAiModel(applyPayload.aiModel);
    setAspectRatio(applyPayload.aspectRatio);
    setImageSize(applyPayload.imageSize);
    setGenCount(Math.min(Math.max(applyPayload.genCount || getDefaultGenerationCount(appliedImageType), 1), appliedImageType === "details" ? 8 : 6));
    resetOutput();
    toast.success("已套用历史商品套图参数");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0] || "1K");
  }, [aiModel, aspectRatio, imageSize]);

  useEffect(() => {
    if (!authChecked || !isAuthenticated || isUploading || isAnalyzing) return;
    if (!productSignature) return;
    if (productInfo.trim()) return;
    if (lastAnalyzedSignatureRef.current === productSignature) return;
    lastAnalyzedSignatureRef.current = productSignature;
    analyzeProductInfo({ silent: true });
  }, [authChecked, isAuthenticated, isUploading, isAnalyzing, productSignature, productInfo]);

  function resetOutput() {
    setResultUrls([]);
    setModuleResults([]);
    setResultPlan([]);
    setError("");
    setProgress(0);
  }

  async function processFiles(files: FileList | File[]) {
    const incoming = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (!incoming.length) return toast.error("请上传图片文件");
    const freeSlots = Math.max(0, 3 - productImages.length);
    if (!freeSlots) return toast.error("最多上传 3 张商品图");
    const filesToUpload = incoming.slice(0, freeSlots);
    if (incoming.length > filesToUpload.length) toast.info("商品图最多 3 张，已自动忽略超出的图片");
    const oversized = filesToUpload.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) return toast.error(`${oversized.name} 超过 ${MAX_FILE_SIZE_MB}MB`);

    setIsUploading(true);
    setProductInfo("");
    setProductProfile(null);
    setAnalysisDetail(null);
    setAnalysisSource("idle");
    setAnalysisMessage("");
    setSettings((prev) => ({ ...prev, visualDirectorScript: "", visualDirectorPlan: undefined }));
    setModuleOverrides([]);
    lastAnalyzedSignatureRef.current = "";
    resetOutput();
    toast.info(`正在上传 ${filesToUpload.length} 张商品图...`);
    try {
      const results = await Promise.allSettled(filesToUpload.map((file) => uploadImage(file)));
      const next: ProductImage[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          next.push({ url: result.value.url, name: filesToUpload[index].name || `商品图${productImages.length + index + 1}` });
        } else {
          toast.error(`${filesToUpload[index].name} 上传失败`);
        }
      });
      if (next.length) {
        setProductImages((prev) => [...prev, ...next].slice(0, 3));
        toast.success("商品图已上传，正在准备 AI 分析");
      }
    } finally {
      setIsUploading(false);
      if (productInputRef.current) productInputRef.current.value = "";
    }
  }

  function applyExampleGroup(group: typeof PRODUCT_SET_EXAMPLE_GROUPS[number]) {
    setProductImages(group.images.map((url, index) => ({ url, name: `${group.name} 图${index + 1}` })));
    setProductInfo("");
    setProductProfile(null);
    setAnalysisDetail(null);
    setAnalysisSource("idle");
    setAnalysisMessage("");
    setSettings((prev) => ({ ...prev, visualDirectorScript: "", visualDirectorPlan: undefined }));
    setModuleOverrides([]);
    lastAnalyzedSignatureRef.current = "";
    resetOutput();
    toast.success(`已套用${group.name}，正在准备 AI 分析`);
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
    lastAnalyzedSignatureRef.current = "";
    resetOutput();
  }

  async function analyzeProductInfo(options: { silent?: boolean } = {}) {
    if (!productImages.length) return toast.error("请先上传商品图");
    if (!isAuthenticated) {
      if (!options.silent) toast.error("请先登录后使用 AI 分析");
      return;
    }
    setIsAnalyzing(true);
    setAnalysisSource("running");
    setAnalysisMessage("");
    if (!options.silent) toast.info("正在分析商品名称、描述、受众和卖点...");
    try {
      const res = await fetch("/api/product-set/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_image_urls: productImages.map((item) => item.url) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "AI 分析失败");
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
        if (mode === "smart" && selectedPlanId === "smart") {
          setGenCount(analyzedPlanCount || getDefaultGenerationCount(imageType, nextProfile));
        }
        setShowProductInfoEditor(false);
        if (!options.silent) {
          if (nextAnalysisSource === "ai") toast.success("AI 已分析商品信息");
          else toast.warning("AI 视觉分析未完成，已先填入基础信息");
        }
      } else {
        setAnalysisSource("fallback");
        setAnalysisDetail(null);
        setAnalysisMessage("分析接口没有返回商品信息，请重新分析或手动填写。");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "AI 分析失败";
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
    if (!file.type.startsWith("image/")) return toast.error("请上传图片文件");
    if (file.size > MAX_FILE_SIZE) return toast.error(`图片不能超过 ${MAX_FILE_SIZE_MB}MB`);
    setIsUploadingCustomRef(true);
    try {
      const result = await uploadImage(file);
      setCustomDraft((prev) => {
        if (kind === "model") return { ...prev, modelReferenceImageUrls: [result.url], modelConsistency: true };
        if (kind === "other") return { ...prev, otherReferenceImageUrls: [...prev.otherReferenceImageUrls, result.url].slice(0, 3) };
        return { ...prev, referenceImageUrls: [result.url] };
      });
      toast.success("自定义参考图已上传");
    } catch {
      toast.error("参考图上传失败");
    } finally {
      setIsUploadingCustomRef(false);
      if (customRefInputRef.current) customRefInputRef.current.value = "";
      if (customModelRefInputRef.current) customModelRefInputRef.current.value = "";
      if (customOtherRefInputRef.current) customOtherRefInputRef.current.value = "";
    }
  }

  function addCustomTemplate() {
    if (!customDraft.name.trim()) return toast.error("请填写样式名称");
    if (!customDraft.typeDescription.trim()) return toast.error("请填写类型描述");
    const item: ProductSetCustomTemplate = {
      id: `custom-${Date.now()}`,
      name: customDraft.name.trim().slice(0, 20),
      imageType,
      typeDescription: customDraft.typeDescription.trim().slice(0, 600),
      aspectRatio: customDraft.aspectRatio,
      referenceImageUrls: customDraft.referenceImageUrls,
      modelReferenceImageUrls: customDraft.modelReferenceImageUrls,
      otherReferenceImageUrls: customDraft.otherReferenceImageUrls,
      extraDescription: customDraft.extraDescription.trim().slice(0, 600),
      subjectConsistency: customDraft.subjectConsistency,
      modelConsistency: customDraft.modelConsistency,
      intelligentCopy: customDraft.intelligentCopy,
      copyDensity: customDraft.copyDensity,
      moduleRole: customDraft.moduleRole.trim().slice(0, 120),
      contentScope: customDraft.contentScope.trim().slice(0, 240),
      layoutRules: customDraft.layoutRules.trim().slice(0, 320),
      textRules: customDraft.textRules.trim().slice(0, 260),
      avoidRules: customDraft.avoidRules.trim().slice(0, 320),
    };
    setMode("custom");
    setSelectedPlanId("custom");
    setCustomTemplates((prev) => [...prev, item].slice(-10));
    setModuleOverrides([]);
    setCustomDraft(DEFAULT_DRAFT);
    setShowCustomBuilder(false);
    resetOutput();
    toast.success("已添加自定义样式");
  }

  function toggleTemplate(id: number) {
    setMode("custom");
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
    toast.success("已从本次生成计划移除该模块");
  }

  async function saveCurrentPlanAsFavorite() {
    if (!isAuthenticated) return toast.error("请先登录后再收藏方案");
    if (!planTemplates.length) return toast.error("当前还没有可收藏的生成方案");
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
      if (!res.ok) throw new Error(data.error || "收藏方案保存失败");
      const savedPlan = normalizeFavoriteProductSetPlan(data.plan, DEFAULT_SETTINGS);
      if (!savedPlan) throw new Error("收藏方案保存结果无效");
      setFavoritePlans((prev) => [savedPlan, ...prev.filter((plan) => plan.id !== savedPlan.id && plan.name !== savedPlan.name)]
        .slice(0, FAVORITE_PRODUCT_SET_PLAN_LIMIT));
      setFavoritePlanName("");
      setShowFavoritePlans(true);
      toast.success(existing ? "已更新收藏方案" : "已收藏当前方案，下次可直接套用");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "收藏方案保存失败");
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
    toast.success(`已套用收藏方案「${plan.name}」`);
  }

  async function removeFavoritePlan(id: string) {
    if (!isAuthenticated) return toast.error("请先登录");
    const previousPlans = favoritePlans;
    setFavoritePlans((prev) => prev.filter((plan) => plan.id !== id));
    try {
      const res = await fetch(`/api/product-set/favorite-plans/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "删除收藏方案失败");
      toast.success("已删除收藏方案");
    } catch (err: unknown) {
      setFavoritePlans(previousPlans);
      toast.error(err instanceof Error ? err.message : "删除收藏方案失败");
    }
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

  function urlsFromModules(modules: ProductSetModuleResult[], plan: ProductSetResolvedTemplate[]) {
    return plan
      .map((template, index) => {
        const key = getProductSetModuleKey(template, index);
        return modules.find((item) => item.moduleKey === key)?.resultUrl || "";
      })
      .filter(Boolean);
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
      resetOutput();
      return;
    }

    setMode("custom");
    setImageType(plan.imageType);
    setSelectedTemplateIds((prev) => replaceSelectedTemplateIdsForImageType(prev, plan.imageType, plan.templateIds));
    setGenCount(Math.min(Math.max(plan.templateIds.length, 1), plan.imageType === "details" ? 8 : 6));
    setAspectRatio(plan.imageType === "details" ? "3:4" : "1:1");
    if (plan.id === "amazon-listing") {
      setSettings((prev) => ({ ...prev, country: "美国", language: "英语", platform: "亚马逊" }));
    } else if (plan.scenario === "womenswear") {
      setSettings((prev) => ({ ...prev, platform: plan.imageType === "main" ? "小红书" : prev.platform }));
    }
    resetOutput();
  }

  function changeImageType(value: ProductSetImageType) {
    const nextAspect = value === "details" ? "3:4" : "1:1";
    const nextSizes = getSupportedImageSizes(aiModel, nextAspect);
    const nextSelectedTemplateIds = getSelectedTemplateIdsForImageType(selectedTemplateIds, value);
    setImageType(value);
    setAspectRatio(nextAspect);
    if (value === "details" && nextSizes.includes("2K")) {
      setImageSize("2K");
    } else if (!nextSizes.includes(imageSize)) {
      setImageSize(nextSizes[0] || "1K");
    }
    if (mode === "smart") setGenCount(getDefaultGenerationCount(value, effectiveProductProfile));
    setSelectedPlanId(getSelectedPlanIdForProductSetState({
      mode,
      imageType: value,
      selectedTemplateIds: nextSelectedTemplateIds,
    }));
    resetOutput();
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
    if (!isAuthenticated) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    if (!productImages.length) return toast.error("请先上传商品图");
    if (requiresProductConfirmation) return toast.warning("请先完成 AI 分析，或手动确认商品信息后再生成");
    if (outputCount <= 0) return toast.error("请至少选择 1 个套图样式");
    if (credits !== null && credits < cost) return toast.error(`积分不足，需要 ${cost}，余额 ${credits}`);

    const currentPlan = planTemplates;
    const expectedResultCount = Math.max(1, currentPlan.length);
    setIsGenerating(true);
    setProgress(8);
    setError("");
    setResultUrls([]);
    setResultPlan(currentPlan);
    setModuleResults(createClientModuleResults(currentPlan));
    try {
      const finalSettings = {
        ...settings,
        extraDescription: [settings.extraDescription, qualityMode === "advanced" ? "生成档位：高级模式，优先提升细节、质感和版式完成度。" : ""]
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
        if (res.status === 402) {
          const nextCredits = data.balance ?? 0;
          setCredits(nextCredits);
          if (userId) setCachedProfileCredits(userId, nextCredits);
        }
        throw new Error(data.error || "生成失败");
      }
      if (data.credits_remaining !== undefined) {
        setCredits(data.credits_remaining);
        if (userId) setCachedProfileCredits(userId, data.credits_remaining);
      }
      const initialModules = readModuleResults(data.module_results);
      if (initialModules.length) setModuleResults(initialModules);

      let latestUrls: string[] = [];
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
          setProgress(!hasAllResults && rounded >= 100 ? 99 : rounded);
        }
        if (nextModules.length) {
          setModuleResults(nextModules);
          const moduleUrls = urlsFromModules(nextModules, currentPlan);
          if (moduleUrls.length) {
            latestUrls = moduleUrls;
            setResultUrls(moduleUrls);
          }
        } else if (nextUrls.length) {
          latestUrls = nextUrls;
          setResultUrls(nextUrls);
        }
        if (state.status === "completed") {
          if (!hasAllResults) continue;
          setProgress(100);
          if (nextModules.length) {
            setModuleResults(nextModules);
            setResultUrls(urlsFromModules(nextModules, currentPlan));
          } else {
            setResultUrls(nextUrls);
          }
          setIsGenerating(false);
          toast.success("商品套图生成完成");
          return;
        }
        if (state.status === "failed") throw new Error(state.error || "生成失败");
      }
      if (latestUrls.length > 0) {
        setIsGenerating(false);
        toast.info("生成仍在后台继续，可稍后在历史记录查看完整结果");
        return;
      }
      throw new Error("生成超时");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "生成失败";
      setError(message);
      toast.error(message);
      setIsGenerating(false);
    }
  }

  async function regenerateResult(index: number) {
    if (isGenerating || regeneratingIndex !== null) return toast.info("请等当前生成完成后再重生单张图片");
    const currentPlan = resultPlan.length ? resultPlan : planTemplates;
    const template = currentPlan[index];
    if (!template) return toast.error("未找到要重生的模块");
    if (!isAuthenticated) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    const singleCost = getCreditCost(aiModel, imageSize, template.aspectRatio || aspectRatio);
    if (credits !== null && credits < singleCost) return toast.error(`积分不足，需要 ${singleCost}，余额 ${credits}`);

    setRegeneratingIndex(index);
    setError("");
    try {
      const finalSettings = {
        ...settings,
        extraDescription: [settings.extraDescription, qualityMode === "advanced" ? "生成档位：高级模式，优先提升细节、质感和版式完成度。" : ""]
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
      if (!res.ok) throw new Error(data.error || "单张重生失败");
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
        if (moduleUrl || nextUrl) {
          const finalUrl = (moduleUrl || nextUrl) as string;
          setResultPlan((prev) => prev.length ? prev : currentPlan);
          setResultUrls((prev) => {
            const next = [...prev];
            next[index] = finalUrl;
            return next;
          });
          if (state.status === "completed") {
            toast.success(`第 ${index + 1} 张已重生`);
            return;
          }
        }
        if (state.status === "failed") throw new Error(state.error || "单张重生失败");
      }
      toast.info("单张仍在后台生成，可稍后在历史记录查看");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "单张重生失败";
      toast.error(message);
    } finally {
      setRegeneratingIndex(null);
    }
  }

  function downloadResult(url: string, index: number) {
    const ext = url.toLowerCase().includes(".jpg") || url.toLowerCase().includes(".jpeg") ? "jpg" : "png";
    downloadImage(url, generateDownloadFilename("product-set", index, ext));
  }

  const displayedResultPlan = resultPlan.length ? resultPlan : planTemplates;
  const resultSlotCount = Math.max(displayedResultPlan.length, resultUrls.length);
  const resultSlots = Array.from({ length: resultSlotCount }, (_, index) => {
    const template = displayedResultPlan[index];
    const module = template
      ? moduleResults.find((item) => item.moduleKey === getProductSetModuleKey(template, index))
      : undefined;
    return {
      module,
      url: template && moduleResults.length ? module?.resultUrl : resultUrls[index],
      template,
    };
  });

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="productSet" />
      <aside className="studio-parameters w-full lg:w-[480px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4">
          <ModuleHeader title="AI 商品视觉生成器" tooltip="上传 1-3 张商品多视角图，系统会自动分析商品并生成电商主图或详情页视觉。" />
          <ProductModeTabs imageType={imageType} onChange={changeImageType} />

          <section
            onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={(event) => { event.preventDefault(); setIsDragging(false); }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); setIsDragging(false); processFiles(event.dataTransfer.files); }}
            className={`rounded-3xl border bg-white p-4 shadow-sm transition ${isDragging ? "border-violet-400 ring-4 ring-violet-100" : "border-slate-100"}`}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-slate-950">商品图</h3>
                <p className="mt-1 text-xs text-slate-400">支持正面、侧面、背面或细节图，最多 3 张。</p>
              </div>
              <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-violet-50 px-2.5 text-[10px] font-bold text-violet-600">{productImages.length}/3</span>
            </div>
            <input
              ref={productInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && processFiles(event.target.files)}
            />
            <button
              type="button"
              onClick={() => productInputRef.current?.click()}
              className="flex min-h-28 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center transition hover:border-violet-200 hover:bg-violet-50/40"
            >
              {isUploading ? <Loader2 className="mb-2 h-6 w-6 animate-spin text-violet-500" /> : <ImagePlus className="mb-2 h-6 w-6 text-violet-500" />}
              <span className="text-sm font-black text-slate-900">{productImages.length ? "继续上传多视角商品图" : "上传 / 拖拽多视角商品图"}</span>
              <span className="mt-1 text-[11px] text-slate-400">jpg、png、webp，单张不超过 {MAX_FILE_SIZE_MB}MB</span>
            </button>

            {productImages.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {productImages.map((item, index) => (
                  <div key={`${item.url}-${index}`} className="studio-checkerboard group relative aspect-square overflow-hidden rounded-xl border border-white bg-white shadow-sm">
                    <img src={item.url} alt={item.name} className="h-full w-full object-contain p-1.5" />
                    <span className="absolute left-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">图{index + 1}</span>
                    <button type="button" onClick={() => removeProductImage(index)} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800/80 text-white opacity-0 transition group-hover:opacity-100">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <span className="shrink-0 text-[11px] font-bold text-slate-400">试一试</span>
              <div className="studio-scrollbar-hide flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                {PRODUCT_SET_EXAMPLE_GROUPS.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => applyExampleGroup(group)}
                    className="flex h-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition hover:border-violet-200"
                    title={group.name}
                  >
                    {group.images.map((url, index) => (
                      <span key={`${group.id}-${index}`} className="flex h-14 w-12 items-center justify-center border-r border-slate-100 last:border-r-0">
                        <img src={url} alt={`${group.name}${index + 1}`} className="h-full w-full object-contain p-1" />
                      </span>
                    ))}
                  </button>
                ))}
              </div>
              {productImages.length > 0 && (
                <button type="button" onClick={() => { setProductImages([]); setProductInfo(""); setProductProfile(null); setAnalysisDetail(null); setAnalysisSource("idle"); setAnalysisMessage(""); setModuleOverrides([]); resetOutput(); }} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-bold text-slate-400 hover:bg-red-50 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" /> 清空
                </button>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-slate-950">商品信息</h3>
                <p className="mt-1 text-xs text-slate-400">{analysisStatus.description}</p>
              </div>
              <button
                type="button"
                onClick={() => analyzeProductInfo()}
                disabled={isAnalyzing || !productImages.length}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-violet-100 bg-violet-50 px-3 text-xs font-black text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {productInfo ? "重新分析" : "AI帮写"}
              </button>
            </div>

            <ProductAnalysisNotice status={analysisStatus} />

            {productInfo && !showProductInfoEditor ? (
              <div className="space-y-2">
                <InfoField title="商品名称" value={displayProductInfoFields.name} compact />
                <InfoField title="商品描述" value={displayProductInfoFields.description} />
                <InfoField title="目标受众" value={displayProductInfoFields.audience} />
                <InfoField title="商品卖点" value={displayProductInfoFields.sellingPoints} />
                <button type="button" onClick={() => setShowProductInfoEditor(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">
                  <Edit3 className="h-3.5 w-3.5" /> 编辑原文
                </button>
              </div>
            ) : (
              <div>
                <textarea
                  value={productInfo}
                  onChange={(event) => {
                    setProductInfo(event.target.value.slice(0, 2000));
                    setProductProfile(null);
                    setAnalysisDetail(null);
                    setAnalysisSource("manual");
                    setAnalysisMessage("");
                    setSettings((prev) => ({ ...prev, visualDirectorScript: "", visualDirectorPlan: undefined }));
                  }}
                  placeholder="请输入商品信息，包括商品名称、商品描述、商品尺寸、目标受众、商品卖点。上传多视角商品图后也会自动 AI 分析。"
                  className="min-h-40 w-full resize-none rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-violet-200 focus:bg-white"
                />
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{productInfo ? "建议保留模板字段，生成文案会更稳定。" : "非必填，但补充后套图更准。"}</span>
                  <span>{productInfo.length} / 2000</span>
                </div>
              </div>
            )}

            <ProductProfileCard profile={effectiveProductProfile} analysisSource={analysisSource} onEdit={() => setShowProfileEditor(true)} />
            <ProductVisualStrategyCard
              profile={effectiveProductProfile}
              analysis={analysisDetail}
              stylePack={selectedStylePack}
              imageType={imageType}
              onAdjust={() => setShowSettingsModal(true)}
            />
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-slate-950">推荐方案</h3>
                <p className="mt-1 text-xs text-slate-400">{modeTitle} · {modeDescription}</p>
              </div>
              <button type="button" onClick={() => setShowTemplateModal(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-slate-950 px-3 text-xs font-black text-white">
                <Layers3 className="h-3.5 w-3.5" /> 模板库
              </button>
            </div>
            <div className="grid grid-cols-2 items-stretch gap-2">
              {visiblePresetPlans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => applyPresetPlan(plan.id)}
                  className={`flex min-h-[92px] flex-col rounded-2xl border p-3 text-left transition ${
                    selectedPlanId === plan.id
                      ? "border-violet-400 bg-violet-50 text-violet-800"
                      : "border-slate-100 bg-slate-50 text-slate-600 hover:border-violet-200"
                  }`}
                >
                  <span className="flex min-h-5 items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-black">{plan.name}</span>
                    {plan.id === "smart" && effectiveProductProfile.isApparel && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-black text-violet-600">已识别服装</span>}
                    {plan.scenario === "womenswear" && <span className="rounded-full bg-pink-100 px-1.5 py-0.5 text-[10px] font-black text-pink-600">女装</span>}
                  </span>
                  <span className="mt-1 block line-clamp-2 text-[11px] leading-4 opacity-75">{plan.id === "smart" ? getSmartPlanDescription(effectiveProductProfile, imageType) : plan.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-slate-950">生成计划</h3>
                <p className="mt-1 text-xs text-slate-400">{imageType === "details" ? "详情页会先确认屏幕结构，再逐屏生成。" : "主图模式会快速生成可上架的轻量图库。"}</p>
              </div>
              <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-violet-50 px-2.5 text-xs font-black text-violet-700">{outputCount || 0} {imageType === "main" ? "张" : "屏"}</span>
            </div>

            <PlanRecommendationCard recommendation={planRecommendation} imageType={imageType} />

            {mode === "smart" && (
              <div className="mb-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">{imageType === "main" ? "生成数量" : "详情页屏数"}</span>
                  <span className="font-black text-violet-600">{genCount} {imageType === "main" ? "张" : "屏"}</span>
                </div>
                <div className="grid grid-cols-4 items-stretch gap-1.5">
                  {countOptions.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => { setGenCount(value); resetOutput(); }}
                      className={`h-9 rounded-xl border text-xs font-black transition ${genCount === value ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <PlanList
              templates={planTemplates}
              productProfile={effectiveProductProfile}
              onEdit={setEditingModuleIndex}
              onRemove={removePlanModule}
            />

            <FavoritePlanPanel
              plans={favoritePlans}
              draftName={favoritePlanName}
              defaultName={favoritePlanDefaultName}
              currentPlanCount={outputCount}
              showList={showFavoritePlans}
              isLoading={isLoadingFavoritePlans}
              isSaving={isSavingFavoritePlan}
              onDraftNameChange={setFavoritePlanName}
              onSave={saveCurrentPlanAsFavorite}
              onApply={applyFavoritePlan}
              onDelete={removeFavoritePlan}
              onToggleList={() => setShowFavoritePlans((value) => !value)}
            />

            <button type="button" onClick={() => setShowSettingsModal(true)} className="mt-3 flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-left text-xs font-bold text-slate-600 hover:border-violet-200 hover:bg-violet-50/50">
              <span className="flex min-w-0 items-center gap-2">
                <Settings2 className="h-4 w-4 shrink-0 text-violet-500" />
                <span className="truncate">{settingsSummary}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          </section>

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
        </div>

        <div className="border-t border-white/70 bg-white/90 px-3 py-3 backdrop-blur-xl sm:px-5">
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            className="gradient-brand flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-black text-white shadow-xl shadow-purple-200/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {requiresProductConfirmation ? "请先确认商品信息" : `生成 ${Math.max(outputCount, 1)} ${outputUnit}`}
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{cost} 积分</span>
          </button>
          {requiresProductConfirmation && (
            <p className="mt-2 text-center text-[11px] font-bold text-amber-600">
              当前还不是可靠识别结果，请重新分析或手动补充商品名称/类目。
            </p>
          )}
          {detailsResolutionWarning && !requiresProductConfirmation && (
            <p className="mt-2 text-center text-[11px] font-bold text-violet-600">
              详情页含文字和细节，建议切到 2K 或 4K 再生成。
            </p>
          )}
        </div>
      </aside>

      <main className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 overflow-y-auto p-4 pb-24 sm:p-6 lg:p-8">
          {!isGenerating && !error && resultUrls.length === 0 && (
            <div className="mx-auto max-w-5xl">
              <section className="rounded-[32px] border border-white/80 bg-white/78 p-5 shadow-[0_18px_70px_rgba(15,23,42,0.08)] backdrop-blur">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-[11px] font-black text-violet-600">
                      <Sparkles className="h-3.5 w-3.5" /> AI Product Set
                    </p>
                    <h1 className="mt-3 text-2xl font-black text-slate-950">{modeTitle}</h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{modeDescription} 上传商品图后，左侧共享商品分析、商品资料和 AI 视觉策略。</p>
                  </div>
                  <div className="shrink-0 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-right">
                    <p className="text-[11px] font-bold text-slate-400">预计消耗</p>
                    <p className="mt-1 text-xl font-black text-slate-950">{cost} 积分</p>
                  </div>
                </div>

                <ProductModeTabs imageType={imageType} onChange={changeImageType} />

                <div className="grid auto-rows-fr gap-3 md:grid-cols-3">
                  <DashboardMetric label="商品图" value={`${productImages.length}/3`} hint={productImages.length ? "已准备" : "等待上传"} />
                  <DashboardMetric label="商品分析" value={analysisStatus.metric} hint={productInfo ? displayProductInfoFields.name || "可编辑" : "自动/手动"} />
                  <DashboardMetric label="生成计划" value={`${outputCount} ${imageType === "main" ? "张" : "屏"}`} hint={mode === "smart" ? "智能方案" : "自定义方案"} />
                </div>

                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="min-w-0 truncate text-sm font-black text-slate-950">操作引导</h2>
                    <button type="button" onClick={() => setShowTemplateModal(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">
                      <Eye className="h-3.5 w-3.5" /> 查看模板
                    </button>
                  </div>
                  <PreviewGuide
                    title="开始制作商品套图"
                    subtitle="上传商品图后，AI 会先分析品类、卖点和视觉方向，再生成主图/详情页计划。"
                    icon={<ImagePlus className="h-10 w-10" />}
                    steps={[
                      { title: "上传商品图", desc: "最多 3 张，建议包含正面、背面、细节或包装，方便 AI 判断结构与卖点。" },
                      { title: "确认商品信息", desc: "识别结果可手动修正，商品名、品类、材质和目标人群会影响生成计划。" },
                      { title: "生成商品套图", desc: "主图适合上架与投放，详情页适合逐屏讲解卖点；需要固定风格时再使用自定义方案。" },
                    ]}
                  />
                </div>
              </section>
            </div>
          )}

          {isGenerating && resultUrls.length === 0 && (
            <div className="mx-auto max-w-3xl space-y-4">
              <LoadingStage genCount={Math.max(outputCount, 1)} progress={progress} moduleName="商品套图" />
              <ModuleProgressList templates={displayedResultPlan} moduleResults={moduleResults} resultUrls={resultUrls} isGenerating={isGenerating} />
            </div>
          )}

          {error && (
            <div className="studio-result-stage flex min-h-[360px] items-center justify-center px-4">
              <div className="max-w-md rounded-[28px] border border-red-100 bg-white p-6 text-center shadow-[0_18px_70px_rgba(15,23,42,0.08)]">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                  <X className="h-7 w-7 text-red-400" />
                </div>
                <h2 className="text-base font-black text-slate-950">商品套图生成失败</h2>
                <p className="mt-2 text-sm leading-6 text-red-500">{error}</p>
                <div className="mt-5 flex justify-center gap-2">
                  <button type="button" onClick={generate} className="h-10 rounded-full bg-slate-950 px-5 text-sm font-bold text-white">重试</button>
                  <button type="button" onClick={() => { setError(""); setProgress(0); }} className="h-10 rounded-full border border-slate-200 bg-white px-5 text-sm font-bold text-slate-600">清空</button>
                </div>
              </div>
            </div>
          )}

          {resultUrls.length > 0 && !error && (
            <section className="studio-result-stage animate-fade-in">
              <div className="mb-5 rounded-[28px] border border-white/80 bg-white/82 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-black text-slate-950">{isGenerating ? "商品套图生成中" : "商品套图结果"}</h2>
                    <p className="mt-1 text-xs text-slate-400">{mode === "smart" ? "智能套图" : "自定义套图"} · {imageType === "main" ? "主图辅图" : "详情页"} · {settings.platform} · 已出 {resultUrls.length}/{resultSlotCount}</p>
                  </div>
                  <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-violet-50 px-3 text-xs font-black text-violet-700">
                    {isGenerating ? `${progress}% 继续生成` : "已完成"}
                  </span>
                </div>
                {isGenerating && (
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all" style={{ width: `${Math.min(Math.max(progress, 0), 99)}%` }} />
                  </div>
                )}
                <ModuleProgressList templates={displayedResultPlan} moduleResults={moduleResults} resultUrls={resultUrls} isGenerating={isGenerating} compact />
              </div>
              <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {resultSlots.map(({ url, template, module }, index) => {
                  return (
                    <article key={`${url || template?.id || "pending"}-${index}`} className="flex h-full flex-col overflow-hidden rounded-[24px] border border-white/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                      {url ? (
                        <button type="button" onClick={() => setLightboxSrc(url)} className="group relative aspect-[3/4] w-full overflow-hidden bg-slate-100">
                          <img src={url} alt={template?.name || `商品套图${index + 1}`} className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]" />
                          <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
                            <ZoomIn className="h-4 w-4" />
                          </span>
                        </button>
                      ) : module?.status === "failed" ? (
                        <div className="flex aspect-[3/4] w-full flex-col items-center justify-center bg-red-50 px-5 text-center">
                          <X className="h-7 w-7 text-red-400" />
                          <p className="mt-3 text-xs font-black text-red-500">该模块生成失败</p>
                          <p className="mt-1 max-w-48 text-[11px] leading-4 text-red-400">{module.error || "可单独重生这一张"}</p>
                          <button type="button" onClick={() => regenerateResult(index)} disabled={regeneratingIndex !== null || isGenerating} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-black text-red-500 shadow-sm disabled:opacity-50">
                            {regeneratingIndex === index ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            重生本张
                          </button>
                        </div>
                      ) : (
                        <div className="flex aspect-[3/4] w-full flex-col items-center justify-center bg-slate-50 text-center">
                          <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                          <p className="mt-3 text-xs font-black text-slate-500">等待生成</p>
                          <p className="mt-1 max-w-32 text-[11px] leading-4 text-slate-400">该模块完成后会自动填入预览区</p>
                        </div>
                      )}
                      <div className="flex min-h-[94px] flex-1 p-3">
                        <div className="flex w-full items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-black text-slate-900">{template?.name || `结果 ${index + 1}`}</h3>
                            <p className="mt-1 text-[11px] font-bold text-slate-400">{url ? "已生成" : "生成中"} · {template?.imageType === "details" ? "详情页模块" : "主图/辅图"} · {template?.aspectRatio || aspectRatio}</p>
                            {module?.qualityScore !== undefined && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <QualityBadge score={module.qualityScore} />
                                {module.qualityIssues?.slice(0, 1).map((issue, issueIndex) => (
                                  <span key={`${module.moduleKey}-issue-${issueIndex}`} className="line-clamp-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                                    {issue}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {url && (
                            <div className="flex shrink-0 items-center gap-1">
                              <button type="button" onClick={() => regenerateResult(index)} disabled={regeneratingIndex !== null || isGenerating} className="flex h-9 w-9 items-center justify-center rounded-full border border-violet-100 text-violet-500 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50" title="重生这一张">
                                {regeneratingIndex === index ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                              </button>
                              <button type="button" onClick={() => downloadResult(url, index)} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50" title="下载">
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>

      <ClientPortal>
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
          <TemplateLibraryModal
            imageType={imageType}
            templates={templates}
            selectedTemplateIds={activeSelectedTemplateIds}
            activeCustomTemplates={activeCustomTemplates}
            mode={mode}
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

        {lightboxSrc && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setLightboxSrc(null)}>
            <button type="button" onClick={() => setLightboxSrc(null)} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
              <X className="h-5 w-5" />
            </button>
            <img src={lightboxSrc} alt="商品套图预览" className="max-h-[92vh] max-w-[94vw] rounded-2xl object-contain shadow-2xl" />
          </div>
        )}
      </ClientPortal>
    </div>
  );
}

function ProductModeTabs({ imageType, onChange }: { imageType: ProductSetImageType; onChange: (value: ProductSetImageType) => void }) {
  const options: Array<{ value: ProductSetImageType; title: string; desc: string }> = [
    { value: "main", title: "商品主图", desc: "默认 3 张，快速上架" },
    { value: "details", title: "详情页", desc: "先方案，再逐屏生成" },
  ];

  return (
    <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-1.5 shadow-sm">
      <div className="grid grid-cols-2 items-stretch gap-1.5">
        {options.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`flex h-14 items-center gap-2.5 rounded-[18px] border px-3 text-left transition-all ${
              imageType === item.value
                ? "border-violet-400 bg-violet-50 text-slate-950 shadow-[0_10px_26px_rgba(124,58,237,0.12)]"
                : "border-transparent bg-white/70 text-slate-600 hover:border-violet-200 hover:bg-white hover:text-violet-700"
            }`}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition ${
              imageType === item.value
                ? "border-violet-200 bg-white text-violet-600"
                : "border-slate-100 bg-white text-slate-400"
            }`}>
              {item.value === "main" ? <ImagePlus className="h-4 w-4" /> : <Layers3 className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black">{item.title}</span>
              <span className={`mt-0.5 block truncate text-[11px] ${imageType === item.value ? "text-violet-500" : "text-slate-400"}`}>{item.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProductProfileCard({ profile, analysisSource, onEdit }: { profile: ProductSetProductProfile; analysisSource: ProductAnalysisSource; onEdit: () => void }) {
  const sourceLabel = analysisSource === "ai"
    ? "AI识别"
    : analysisSource === "fallback"
      ? "基础识别"
      : analysisSource === "running"
        ? "识别中"
        : analysisSource === "manual"
          ? "手动信息"
          : "智能识别";

  return (
    <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/60 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-black text-violet-700">
            <Wand2 className="h-3.5 w-3.5" /> {sourceLabel}
          </p>
          <h4 className="mt-1 truncate text-sm font-black text-slate-950">{profile.displayName}</h4>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{profile.modelBrief}</p>
        </div>
        <button type="button" onClick={onEdit} className={`inline-flex h-7 shrink-0 items-center rounded-full px-2 text-[10px] font-black transition ${profile.needsModel ? "bg-pink-100 text-pink-600 hover:bg-pink-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
          {profile.needsModel ? "建议模特" : "无需模特"} · 修改
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Array.from(new Set([profile.kind, profile.apparelType, ...profile.visualKeywords.slice(0, 3)].filter(Boolean))).map((item, index) => (
          <span key={`${item}-${index}`} className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-500">{item}</span>
        ))}
      </div>
    </div>
  );
}

function ProductVisualStrategyCard({
  profile,
  analysis,
  stylePack,
  imageType,
  onAdjust,
}: {
  profile: ProductSetProductProfile;
  analysis: ProductSetAnalysisDetail | null;
  stylePack: ProductSetStylePack;
  imageType: ProductSetImageType;
  onAdjust: () => void;
}) {
  const qualityScore = analysis?.image_quality?.quality_score;
  const qualityText = typeof qualityScore === "number" && qualityScore > 0 ? `${qualityScore.toFixed(1)} / 10` : "待评估";
  const strategyName = analysis?.visual_director?.strategy_name || "AI 视觉策略";
  const globalStrategy = analysis?.visual_director?.global_strategy;
  const globalSummary = globalStrategy ? [
    globalStrategy.primary_color,
    globalStrategy.accent_color,
    globalStrategy.color_temperature,
    globalStrategy.typography,
  ].filter(Boolean).join(" · ") : "";
  const strategyReason = analysis?.visual_director?.style_strategy || globalSummary || analysis?.generation_fit?.recommended_style_reason || stylePack.description;
  const directorPlan = imageType === "main" ? analysis?.visual_director?.main_plan : analysis?.visual_director?.details_plan;
  const directorScripts = imageType === "main" ? analysis?.visual_director?.main_scripts : analysis?.visual_director?.details_scripts;
  const directions = [
    ...(directorScripts?.map((item) => item.title || item.module_key || "") || []),
    ...(directorPlan?.map((item) => item.purpose || item.module_key || "") || []),
    ...(analysis?.visual_director?.layout_principles || []),
    ...(analysis?.generation_fit?.recommended_output_set || []),
    ...(analysis?.product?.style_tags || []),
    ...(analysis?.product?.visible_details || []),
  ].filter(Boolean).slice(0, 5);
  const missing = (analysis?.missing_info || []).filter((item) => item !== "no_missing").slice(0, 4);

  return (
    <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-black text-indigo-700">
            <Palette className="h-3.5 w-3.5" /> AI 视觉策略
          </p>
          <h4 className="mt-1 truncate text-sm font-black text-slate-950">{strategyName} · {stylePack.name}</h4>
          <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-slate-500">{strategyReason}</p>
        </div>
        <button type="button" onClick={onAdjust} className="inline-flex h-7 shrink-0 items-center rounded-full bg-white px-2 text-[10px] font-black text-indigo-600 shadow-sm hover:bg-indigo-100">
          调整风格
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 items-stretch gap-2">
        <div className="min-h-[58px] rounded-xl bg-white/75 px-2 py-2">
          <p className="text-[10px] font-black text-slate-400">图片质量</p>
          <p className="mt-1 text-xs font-black text-slate-800">{qualityText}</p>
        </div>
        <div className="min-h-[58px] rounded-xl bg-white/75 px-2 py-2">
          <p className="text-[10px] font-black text-slate-400">当前模式</p>
          <p className="mt-1 text-xs font-black text-slate-800">{imageType === "main" ? "商品主图" : "详情页"}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(directions.length ? directions : [profile.displayName, profile.modelStrategy, "智能匹配"]).map((item, index) => (
          <span key={`${item}-${index}`} className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-500">{item}</span>
        ))}
      </div>
      {missing.length > 0 && (
        <p className="mt-2 text-[11px] font-bold leading-4 text-amber-600">
          建议补充：{missing.map(formatMissingInfo).join("、")}
        </p>
      )}
    </div>
  );
}

function InfoField({ title, value, compact = false }: { title: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl bg-slate-50 px-3 py-2 ${compact ? "min-h-[62px]" : "min-h-[86px]"}`}>
      <p className="text-[11px] font-black text-slate-400">{title}</p>
      <p className={`mt-1 text-xs leading-5 text-slate-700 ${compact ? "line-clamp-1" : "line-clamp-3"}`}>{value || "待补充"}</p>
    </div>
  );
}

function ProductAnalysisNotice({ status }: { status: ReturnType<typeof getProductAnalysisStatus> }) {
  if (status.tone === "quiet") return null;
  const className = status.tone === "running"
    ? "border-violet-100 bg-violet-50 text-violet-700"
    : status.tone === "warning"
      ? "border-amber-100 bg-amber-50 text-amber-700"
      : "border-red-100 bg-red-50 text-red-600";

  return (
    <div className={`mb-3 flex items-start gap-2 rounded-2xl border px-3 py-3 text-xs leading-5 ${className}`}>
      {status.tone === "running" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> : <Wand2 className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="font-black">{status.title}</p>
        <p className="mt-0.5 opacity-80">{status.message}</p>
      </div>
    </div>
  );
}

function DashboardMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex h-full min-h-[112px] flex-col justify-center rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[11px] font-bold text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-black text-slate-950">{value}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function QualityBadge({ score }: { score?: number }) {
  const quality = getProductSetModuleQualityLabel(score);
  const className = quality.tone === "good"
    ? "bg-emerald-50 text-emerald-600"
    : quality.tone === "ok"
      ? "bg-sky-50 text-sky-600"
      : quality.tone === "warn"
        ? "bg-amber-50 text-amber-600"
        : "bg-slate-100 text-slate-400";
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2 text-[10px] font-black ${className}`}>
      {quality.label}{typeof score === "number" ? ` ${Math.round(score * 100)}` : ""}
    </span>
  );
}

function ModuleProgressList({
  templates,
  moduleResults,
  resultUrls,
  isGenerating,
  compact = false,
}: {
  templates: ProductSetResolvedTemplate[];
  moduleResults: ProductSetModuleResult[];
  resultUrls: string[];
  isGenerating: boolean;
  compact?: boolean;
}) {
  if (!templates.length) return null;
  return (
    <div className={`mt-4 grid gap-2 ${compact ? "sm:grid-cols-2 xl:grid-cols-3" : ""}`}>
      {templates.map((template, index) => {
        const module = moduleResults.find((item) => item.moduleKey === getProductSetModuleKey(template, index));
        const done = module?.status === "completed" || Boolean(module?.resultUrl || resultUrls[index]);
        const failed = module?.status === "failed";
        const current = module?.status === "running" || (isGenerating && !done && resultUrls.filter(Boolean).length === index);
        const statusText = failed ? "失败" : done ? "已完成" : current ? `${module?.progress || "生成"}%` : "排队";
        return (
          <div key={`${template.source}-${template.id}-${index}`} className={`flex min-h-11 items-center gap-2 rounded-2xl border px-3 py-2 text-xs ${failed ? "border-red-100 bg-red-50 text-red-600" : done ? "border-emerald-100 bg-emerald-50 text-emerald-700" : current ? "border-violet-100 bg-violet-50 text-violet-700" : "border-slate-100 bg-slate-50 text-slate-500"}`}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-black shadow-sm">{done ? <Check className="h-3.5 w-3.5" /> : current ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : index + 1}</span>
            <span className="min-w-0 flex-1 truncate font-black">{template.name}</span>
            {done && module?.qualityScore !== undefined && <QualityBadge score={module.qualityScore} />}
            <span className="shrink-0 text-[10px] font-bold">{statusText}</span>
          </div>
        );
      })}
    </div>
  );
}

function ProductProfileEditorModal({
  profile,
  onSave,
  onClose,
}: {
  profile: ProductSetProductProfile;
  onSave: (profile: ProductSetProductProfile) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ProductSetProductProfile>(profile);
  const kindOptions: { value: ProductSetProductKind; label: string }[] = [
    { value: "apparel", label: "服装" },
    { value: "footwear", label: "鞋靴" },
    { value: "bag", label: "箱包" },
    { value: "accessory", label: "配饰" },
    { value: "beauty", label: "美妆" },
    { value: "electronics", label: "数码电器" },
    { value: "home", label: "家居" },
    { value: "toy", label: "玩具" },
    { value: "food", label: "食品" },
    { value: "general", label: "通用商品" },
  ];
  const apparelOptions: { value: ProductSetApparelType; label: string }[] = [
    { value: "womenswear", label: "女装" },
    { value: "menswear", label: "男装" },
    { value: "kidswear", label: "童装" },
    { value: "outerwear", label: "外套/户外" },
    { value: "sportswear", label: "运动服" },
    { value: "intimate", label: "内衣" },
    { value: "swimwear", label: "泳装" },
    { value: "general", label: "通用服装" },
  ];
  const modelOptions: { value: ProductSetModelStrategy; label: string }[] = [
    { value: "none", label: "不用模特" },
    { value: "optional", label: "可选模特" },
    { value: "recommended", label: "建议模特" },
    { value: "required", label: "必须模特" },
  ];

  function setKind(kind: ProductSetProductKind) {
    const isApparel = kind === "apparel" || kind === "footwear";
    setDraft((prev) => ({
      ...prev,
      kind,
      isApparel,
      needsModel: isApparel ? prev.needsModel || prev.modelStrategy !== "none" : false,
      modelStrategy: isApparel ? (prev.modelStrategy === "none" ? "recommended" : prev.modelStrategy) : "none",
    }));
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/35 p-3 backdrop-blur-xl">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_30px_120px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-slate-950">修正商品识别</h2>
            <p className="mt-1 text-xs text-slate-400">识别结果会影响默认模板、是否使用模特和提示词安全边界。</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div>
            <p className="mb-2 text-xs font-black text-slate-700">商品类型</p>
            <div className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-5">
              {kindOptions.map((item) => (
                <button key={item.value} type="button" onClick={() => setKind(item.value)} className={`h-10 truncate rounded-xl border px-2 text-xs font-black transition ${draft.kind === item.value ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {(draft.kind === "apparel" || draft.kind === "footwear" || draft.isApparel) && (
            <div>
              <p className="mb-2 text-xs font-black text-slate-700">服装细分</p>
              <div className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-4">
                {apparelOptions.map((item) => (
                  <button key={item.value} type="button" onClick={() => setDraft((prev) => ({ ...prev, apparelType: item.value, isApparel: true }))} className={`h-10 truncate rounded-xl border px-2 text-xs font-black transition ${draft.apparelType === item.value ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-black text-slate-700">模特策略</p>
            <div className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-4">
              {modelOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, modelStrategy: item.value, needsModel: item.value === "recommended" || item.value === "required" }))}
                  className={`h-10 truncate rounded-xl border px-2 text-xs font-black transition ${draft.modelStrategy === item.value ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={draft.modelBrief}
            onChange={(event) => setDraft((prev) => ({ ...prev, modelBrief: event.target.value.slice(0, 220) }))}
            className="min-h-28 w-full resize-none rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm leading-6 outline-none focus:border-violet-200"
            placeholder="例如：成年女性模特，法式通勤场景，姿势自然，突出版型和垂感，不要夸张摆拍。"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="h-11 rounded-full bg-slate-100 px-8 text-sm font-black text-slate-600">取消</button>
          <button type="button" onClick={() => onSave(draft)} className="h-11 rounded-full bg-slate-950 px-8 text-sm font-black text-white">确认</button>
        </div>
      </div>
    </div>
  );
}

function ModuleEditModal({
  template,
  index,
  override,
  productProfile,
  onSave,
  onRemove,
  onClose,
}: {
  template: ProductSetResolvedTemplate;
  index: number;
  override?: ProductSetModuleOverride;
  productProfile: ProductSetProductProfile;
  onSave: (patch: Partial<ProductSetModuleOverride>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    name: override?.name || template.name,
    moduleRole: override?.moduleRole || template.moduleRole,
    contentScope: override?.contentScope || template.contentScope,
    layoutRules: override?.layoutRules || template.layoutRules,
    textRules: override?.textRules || template.textRules,
    avoidRules: override?.avoidRules || template.avoidRules,
    typeDescription: override?.typeDescription || template.typeDescriptionV2 || template.typeDescription,
    extraDescription: override?.extraDescription || "",
    aspectRatio: override?.aspectRatio || template.aspectRatio,
    subjectConsistency: override?.subjectConsistency ?? template.subjectConsistency,
    modelConsistency: override?.modelConsistency ?? Boolean(template.modelConsistency),
    intelligentCopy: override?.intelligentCopy ?? template.intelligentCopy,
    copyDensity: (override?.copyDensity || template.copyDensity || "standard") as ProductSetCopyDensity,
  });
  const usesModel = shouldUseModelForTemplate({ ...template, ...draft }, productProfile);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/35 p-3 backdrop-blur-xl">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_30px_120px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black text-violet-600">第 {index + 1} 张 · {template.imageType === "details" ? "详情页模块" : "主图/辅图模块"}</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">编辑生成模块</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-2xl border border-violet-100 bg-violet-50 px-3 py-3 text-xs leading-5 text-violet-700">
            {getProductSetModuleReason(template, productProfile)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldInput label="模块名称" value={draft.name} maxLength={40} onChange={(value) => setDraft((prev) => ({ ...prev, name: value }))} />
            <FieldInput label="模块职责" value={draft.moduleRole} maxLength={160} onChange={(value) => setDraft((prev) => ({ ...prev, moduleRole: value }))} />
          </div>
          <FieldTextarea label="内容范围" value={draft.contentScope} maxLength={320} onChange={(value) => setDraft((prev) => ({ ...prev, contentScope: value }))} placeholder="例如：只讲面料与版型，不重复整套卖点；或只展示模特上身与搭配氛围。" />
          <div className="grid gap-3 sm:grid-cols-3">
            <FieldTextarea label="版式规则" value={draft.layoutRules} maxLength={320} onChange={(value) => setDraft((prev) => ({ ...prev, layoutRules: value }))} placeholder="例如：左文右图、细节宫格、单人半身海报。" />
            <FieldTextarea label="文字规则" value={draft.textRules} maxLength={260} onChange={(value) => setDraft((prev) => ({ ...prev, textRules: value }))} placeholder="例如：只保留 1 个标题和 3 个短标签。" />
            <FieldTextarea label="禁忌规则" value={draft.avoidRules} maxLength={320} onChange={(value) => setDraft((prev) => ({ ...prev, avoidRules: value }))} placeholder="例如：不要重复尺码图，不要堆满卖点。" />
          </div>
          <FieldTextarea label="模板描述" value={draft.typeDescription} maxLength={700} onChange={(value) => setDraft((prev) => ({ ...prev, typeDescription: value }))} placeholder="说明这张图最终要解决什么转化问题。" />
          <div>
            <p className="mb-2 text-xs font-black text-slate-700">生图比例</p>
            <div className="grid grid-cols-4 items-stretch gap-2">
              {CUSTOM_ASPECTS.map((value) => (
                <button key={value} type="button" onClick={() => setDraft((prev) => ({ ...prev, aspectRatio: value }))} className={`h-10 rounded-xl border text-xs font-black transition ${draft.aspectRatio === value ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <ToggleButton active={draft.subjectConsistency} label="商品一致" onClick={() => setDraft((prev) => ({ ...prev, subjectConsistency: !prev.subjectConsistency }))} />
            <ToggleButton active={draft.modelConsistency} label="模特一致" onClick={() => setDraft((prev) => ({ ...prev, modelConsistency: !prev.modelConsistency }))} />
            <ToggleButton active={draft.intelligentCopy} label="智能文案" onClick={() => setDraft((prev) => ({ ...prev, intelligentCopy: !prev.intelligentCopy }))} />
            <select value={draft.copyDensity} onChange={(event) => setDraft((prev) => ({ ...prev, copyDensity: event.target.value as ProductSetCopyDensity }))} className="h-10 rounded-xl border border-slate-100 bg-slate-50 px-2 text-xs font-bold text-slate-600 outline-none">
              <option value="none">无文案</option>
              <option value="light">轻文案</option>
              <option value="standard">标准文案</option>
              <option value="rich">信息丰富</option>
            </select>
          </div>
          <div className={`rounded-2xl px-3 py-3 text-xs leading-5 ${usesModel ? "bg-pink-50 text-pink-700" : "bg-slate-50 text-slate-500"}`}>
            {usesModel ? "该模块会优先使用模特/上身场景。若不希望出现模特，可把模块职责改为白底、细节、尺码或关闭模特一致性。" : "该模块默认不使用模特，更适合白底、细节、尺寸、材质、包装或参数说明。"}
          </div>
          <FieldTextarea label="额外描述" value={draft.extraDescription} maxLength={700} onChange={(value) => setDraft((prev) => ({ ...prev, extraDescription: value }))} placeholder="只写这张图的特殊要求，例如：女装首屏海报不要底部缩略图；细节图只展示连帽、袖口、口袋三个局部。" />
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onRemove} className="h-11 shrink-0 rounded-full border border-red-100 bg-red-50 px-5 text-sm font-black text-red-500">移除本模块</button>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-11 rounded-full bg-slate-100 px-8 text-sm font-black text-slate-600">取消</button>
            <button type="button" onClick={() => onSave(draft)} className="h-11 rounded-full bg-slate-950 px-8 text-sm font-black text-white">保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldInput({ label, value, maxLength, onChange }: { label: string; value: string; maxLength: number; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black text-slate-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value.slice(0, maxLength))} className="h-10 w-full rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs outline-none focus:border-violet-200" />
    </label>
  );
}

function FieldTextarea({ label, value, maxLength, onChange, placeholder }: { label: string; value: string; maxLength: number; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black text-slate-500">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value.slice(0, maxLength))} placeholder={placeholder} className="min-h-24 w-full resize-none rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 outline-none focus:border-violet-200" />
    </label>
  );
}

function PlanRecommendationCard({ recommendation, imageType }: { recommendation: ReturnType<typeof buildProductSetPlanRecommendation>; imageType: ProductSetImageType }) {
  const riskClass = recommendation.riskLevel === "high"
    ? "border-amber-100 bg-amber-50 text-amber-700"
    : recommendation.riskLevel === "medium"
      ? "border-pink-100 bg-pink-50 text-pink-700"
      : "border-emerald-100 bg-emerald-50 text-emerald-700";
  const unit = imageType === "main" ? "张主图" : "屏详情页";

  return (
    <div className="mb-3 rounded-2xl border border-violet-100 bg-violet-50/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black text-violet-600">AI 视觉总监方案</p>
          <h4 className="mt-1 truncate text-sm font-black text-slate-950">{recommendation.title}</h4>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{recommendation.summary}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${riskClass}`}>
          {recommendation.riskLevel === "high" ? "安全模板" : recommendation.riskLevel === "medium" ? "含模特" : "低风险"}
        </span>
      </div>
      <div className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-violet-600">
        推荐生成 {recommendation.suggestedCount} {unit}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {recommendation.modules.slice(0, 6).map((module) => (
          <span key={module.key} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">
            {module.usesModel ? "模特 · " : ""}{module.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function FavoritePlanPanel({
  plans,
  draftName,
  defaultName,
  currentPlanCount,
  showList,
  isLoading,
  isSaving,
  onDraftNameChange,
  onSave,
  onApply,
  onDelete,
  onToggleList,
}: {
  plans: SavedProductSetPlan[];
  draftName: string;
  defaultName: string;
  currentPlanCount: number;
  showList: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onDraftNameChange: (value: string) => void;
  onSave: () => void;
  onApply: (plan: SavedProductSetPlan) => void;
  onDelete: (id: string) => void;
  onToggleList: () => void;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-xs font-black text-slate-800">
            <Bookmark className="h-3.5 w-3.5 text-violet-500" /> 方案收藏
          </p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">
            收藏当前 AI 视觉方案或自定义模板，下次换商品后直接套用。
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleList}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-white px-2.5 text-[11px] font-black text-violet-600 hover:bg-violet-50"
        >
          {plans.length} 套
          <ChevronRight className={`h-3.5 w-3.5 transition ${showList ? "rotate-90" : ""}`} />
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={draftName}
          onChange={(event) => onDraftNameChange(event.target.value.slice(0, 40))}
          placeholder={defaultName}
          className="h-10 min-w-0 flex-1 rounded-xl border border-slate-100 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-violet-200"
        />
        <button
          type="button"
          onClick={onSave}
          disabled={currentPlanCount <= 0 || isSaving}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          收藏
        </button>
      </div>

      {showList && (
        <div className="mt-3 space-y-2">
          {isLoading ? (
            <p className="rounded-2xl bg-white px-3 py-4 text-center text-xs text-slate-400">
              正在加载账号收藏方案...
            </p>
          ) : plans.length ? plans.map((plan) => (
            <div key={plan.id} className="rounded-2xl border border-white bg-white px-3 py-3 shadow-sm">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-slate-800">{plan.name}</p>
                  <p className="mt-0.5 truncate text-[11px] font-bold text-slate-400">
                    {formatSavedPlanMeta(plan)} · {formatSavedPlanTime(plan.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onApply(plan)}
                  className="h-8 shrink-0 rounded-full bg-violet-50 px-3 text-[11px] font-black text-violet-700 hover:bg-violet-100"
                >
                  套用
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(plan.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500"
                  title="删除收藏方案"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {plan.planPreview.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {plan.planPreview.slice(0, 4).map((module, index) => (
                    <span key={`${plan.id}-${module.name}-${index}`} className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                      {module.usesModel ? "模特 · " : ""}{module.name}
                    </span>
                  ))}
                  {plan.planPreview.length > 4 && (
                    <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                      +{plan.planPreview.length - 4}
                    </span>
                  )}
                </div>
              )}
            </div>
          )) : (
            <p className="rounded-2xl bg-white px-3 py-4 text-center text-xs text-slate-400">
              暂无账号收藏方案。先调整好当前生成计划，再点收藏。
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PlanList({
  templates,
  productProfile,
  onEdit,
  onRemove,
}: {
  templates: ProductSetResolvedTemplate[];
  productProfile: ProductSetProductProfile;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  if (!templates.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-xs text-slate-400">
        还没有选择模板，打开模板库添加。
      </div>
    );
  }

  return (
      <div className="space-y-2">
      {templates.map((template, index) => (
        <div key={`${template.source}-${template.id}-${index}`} className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-violet-600 shadow-sm">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-black text-slate-800">{template.name}</p>
            <p className="truncate text-[11px] text-slate-400">{template.imageType === "details" ? "详情页" : "主图/辅图"} · {template.aspectRatio} · {template.moduleRole}</p>
            <p className="mt-1 line-clamp-1 text-[10px] text-slate-400">{getProductSetModuleReason(template, productProfile)}</p>
          </div>
          {shouldUseModelForTemplate(template, productProfile) && (
            <span className="shrink-0 rounded-full bg-pink-50 px-2 py-1 text-[10px] font-black text-pink-600">模特</span>
          )}
          <button type="button" onClick={() => onEdit(index)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-violet-50 hover:text-violet-600" title="编辑模块">
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => onRemove(index)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500" title="移除模块">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ModelConfigPanel({
  aiModel,
  imageType,
  imageSize,
  qualityMode,
  supportedSizes,
  onModelChange,
  onSizeChange,
  onQualityChange,
}: {
  aiModel: LingyaModel;
  imageType: ProductSetImageType;
  imageSize: ImageSize;
  qualityMode: "standard" | "advanced";
  supportedSizes: ImageSize[];
  onModelChange: (value: LingyaModel) => void;
  onSizeChange: (value: ImageSize) => void;
  onQualityChange: (value: "standard" | "advanced") => void;
}) {
  return (
    <section className="space-y-3">
      <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-950">
          <Sparkles className="h-4 w-4 text-purple-500" /> 生成模型
        </h3>
        <div className="grid grid-cols-2 items-stretch gap-2">
          {MODELS.map((model) => (
            <button
              key={model.value}
              type="button"
              onClick={() => onModelChange(model.value)}
              className={`min-h-[72px] rounded-2xl border px-3 py-2.5 text-left transition-all ${
                aiModel === model.value
                  ? "border-purple-500 bg-purple-50 text-slate-950 shadow-[0_10px_26px_rgba(124,58,237,0.12)]"
                  : "border-slate-100 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <img src={model.icon} alt="" className="h-4 w-4 shrink-0 object-contain" />
                <span className="min-w-0 truncate text-[11px] font-black">{model.label}</span>
                {model.badge && (
                  <span className="shrink-0 rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-black text-purple-600">
                    {model.badge}
                  </span>
                )}
              </div>
              <p className="mt-1 truncate pl-5 text-[11px] font-semibold leading-tight text-slate-400">{model.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-black text-slate-950">分辨率</h3>
        <div className="grid grid-cols-3 gap-2">
          {supportedSizes.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onSizeChange(size)}
              className={`h-10 rounded-xl border px-2 text-xs font-bold transition-all ${
                imageSize === size
                  ? "border-purple-500 bg-purple-50 text-purple-600"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {size} · {getCreditCost(aiModel, size, "3:4")}积分
            </button>
          ))}
        </div>
        {imageType === "details" && imageSize === "1K" && (
          <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-4 text-amber-700">
            详情页有标题、标签和局部细节，1K 容易小字糊；推荐 2K 起步，质检和可读性会明显更好。
          </div>
        )}
      </div>

      <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-black text-slate-950">生成档位</h3>
        <div className="grid grid-cols-2 gap-2">
          {(["standard", "advanced"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onQualityChange(value)}
              className={`h-10 rounded-xl border px-3 text-xs font-bold transition-all ${
                qualityMode === value
                  ? "border-purple-500 bg-purple-50 text-purple-600"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {value === "standard" ? "标准模式" : "高级模式"}
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-2xl border border-purple-100 bg-purple-50 px-3 py-3">
          <p className="text-xs font-black text-purple-700">比例按模板自动</p>
          <p className="mt-1 text-[11px] leading-4 text-purple-500">首屏海报、细节图、白底主图会分别使用各自模板比例，避免整套图被一个比例误导。</p>
        </div>
      </div>
    </section>
  );
}

function SettingsModal({
  settings,
  onSettingChange,
  onClose,
}: {
  settings: ProductSetSettings;
  onSettingChange: <K extends keyof ProductSetSettings>(key: K, value: ProductSetSettings[K]) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/35 p-3 backdrop-blur-xl">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_30px_120px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-slate-950">更多设置</h2>
            <p className="mt-1 text-xs text-slate-400">用于控制目标市场、图片文案和视觉风格；模型、比例与清晰度在左侧单独配置。</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-6">
            <OptionGrid title="目标销售国家/地区" options={PRODUCT_SET_COUNTRIES} value={settings.country} onChange={(value) => onSettingChange("country", value)} />
            <OptionGrid title="图片文案语言" options={PRODUCT_SET_LANGUAGES} value={settings.language} onChange={(value) => onSettingChange("language", value)} />
            <OptionGrid title="目标平台" options={PRODUCT_SET_PLATFORMS} value={settings.platform} onChange={(value) => onSettingChange("platform", value)} />
            <div>
              <p className="mb-2 text-xs font-bold text-slate-700">主题色</p>
              <div className="grid grid-cols-2 items-stretch gap-2">
                {([
                  ["auto", "智能主题色"],
                  ["custom", "自定义颜色"],
                ] as [ProductSetThemeMode, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onSettingChange("themeMode", value)}
                    className={`flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black transition ${settings.themeMode === value ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}
                  >
                    <Palette className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
              {settings.themeMode === "custom" && (
                <input
                  value={settings.themeColor}
                  onChange={(event) => onSettingChange("themeColor", event.target.value.slice(0, 80))}
                  placeholder="例如：奶油白 + 牛仔蓝 + 玫瑰粉"
                  className="mt-2 h-10 w-full rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs outline-none focus:border-violet-200"
                />
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-bold text-slate-700">字体风格</p>
              <div className="grid grid-cols-2 items-stretch gap-2 md:grid-cols-3">
                {(Object.keys(PRODUCT_SET_FONT_STYLE_LABELS) as ProductSetFontStyle[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onSettingChange("fontStyle", value)}
                    className={`h-10 rounded-xl border px-3 text-xs font-bold transition ${settings.fontStyle === value ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}
                  >
                    {PRODUCT_SET_FONT_STYLE_LABELS[value]}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={settings.extraDescription || ""}
              onChange={(event) => onSettingChange("extraDescription", event.target.value.slice(0, 600))}
              placeholder="额外描述：例如女装要偏法式通勤、不要夸张姿势、文案短句风格等。"
              className="min-h-28 w-full resize-none rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm leading-6 outline-none focus:border-violet-200"
            />
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="h-11 rounded-full bg-slate-950 px-8 text-sm font-black text-white">确认</button>
        </div>
      </div>
    </div>
  );
}

function TemplateLibraryModal({
  imageType,
  templates,
  selectedTemplateIds,
  activeCustomTemplates,
  filter,
  query,
  customDraft,
  showCustomBuilder,
  isUploadingCustomRef,
  customRefInputRef,
  customModelRefInputRef,
  customOtherRefInputRef,
  onFilterChange,
  onQueryChange,
  onToggleTemplate,
  onClose,
  onShowCustomBuilder,
  onCustomDraftChange,
  onUploadCustomReference,
  onAddCustomTemplate,
  onRemoveCustomTemplate,
}: {
  imageType: ProductSetImageType;
  templates: ProductSetTemplate[];
  selectedTemplateIds: number[];
  activeCustomTemplates: ProductSetCustomTemplate[];
  mode: ProductSetCreationMode;
  filter: TemplateFilter;
  query: string;
  customDraft: CustomDraft;
  showCustomBuilder: boolean;
  isUploadingCustomRef: boolean;
  customRefInputRef: React.RefObject<HTMLInputElement | null>;
  customModelRefInputRef: React.RefObject<HTMLInputElement | null>;
  customOtherRefInputRef: React.RefObject<HTMLInputElement | null>;
  onFilterChange: (value: TemplateFilter) => void;
  onQueryChange: (value: string) => void;
  onToggleTemplate: (id: number) => void;
  onClose: () => void;
  onShowCustomBuilder: (value: boolean) => void;
  onCustomDraftChange: (updater: (value: CustomDraft) => CustomDraft) => void;
  onUploadCustomReference: (kind: "style" | "model" | "other", file?: File) => void;
  onAddCustomTemplate: () => void;
  onRemoveCustomTemplate: (id: string) => void;
}) {
  const visibleTemplates = templates.filter((template) => {
    if (filter === "selected" && !selectedTemplateIds.includes(template.id)) return false;
    if (filter === "womenswear" && template.scenario !== "womenswear") return false;
    if (query.trim()) {
      const keyword = query.trim().toLowerCase();
      return `${template.name} ${template.typeDescriptionV2}`.toLowerCase().includes(keyword);
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/35 p-3 backdrop-blur-xl">
      <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_30px_120px_rgba(15,23,42,0.28)]">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-slate-950">参考模板库</h2>
            <p className="mt-1 text-xs text-slate-400">模板只控制用途、版式和视觉方向，最终商品会以你上传的图片为准。</p>
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
              <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索模板" className="h-10 w-40 rounded-full border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-violet-200 sm:w-52" />
            </div>
            <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-h-0 overflow-y-auto p-5">
            <div className="mb-4 flex flex-wrap gap-2">
              {([
                ["all", imageType === "details" ? "全部详情页模板" : "全部主图模板"],
                ["womenswear", "女装场景"],
                ["selected", `已选 ${selectedTemplateIds.length}`],
              ] as [TemplateFilter, string][]).map(([value, label]) => (
                <button key={value} type="button" onClick={() => onFilterChange(value)} className={`h-9 rounded-full px-3 text-xs font-black transition ${filter === value ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  selected={selectedTemplateIds.includes(template.id)}
                  onToggle={() => onToggleTemplate(template.id)}
                />
              ))}
            </div>
          </div>
          <aside className="min-h-0 overflow-y-auto border-t border-slate-100 bg-slate-50 p-5 lg:border-l lg:border-t-0">
            <button
              type="button"
              onClick={() => onShowCustomBuilder(!showCustomBuilder)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-200 bg-white px-3 py-3 text-xs font-black text-violet-700 hover:bg-violet-50"
            >
              <Plus className="h-4 w-4" /> 添加自定义样式
            </button>

            {showCustomBuilder && (
              <div className="mt-3 space-y-3 rounded-2xl border border-slate-100 bg-white p-3">
                <div>
                  <label className="mb-1 block text-[11px] font-black text-slate-500">样式名称</label>
                  <input value={customDraft.name} onChange={(event) => onCustomDraftChange((prev) => ({ ...prev, name: event.target.value.slice(0, 20) }))} className="h-10 w-full rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs outline-none focus:border-violet-200" placeholder="例如 女装法式通勤海报" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-black text-slate-500">模块用途</label>
                  <input value={customDraft.moduleRole} onChange={(event) => onCustomDraftChange((prev) => ({ ...prev, moduleRole: event.target.value.slice(0, 120) }))} className="h-10 w-full rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs outline-none focus:border-violet-200" placeholder="例如 模特上身场景 / 面料细节 / 尺码建议" />
                </div>
                <textarea value={customDraft.typeDescription} onChange={(event) => onCustomDraftChange((prev) => ({ ...prev, typeDescription: event.target.value.slice(0, 600) }))} className="min-h-24 w-full resize-none rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 outline-none focus:border-violet-200" placeholder="类型描述：说明这张图应该解决什么问题，例如女装法式通勤详情页，强调垂感、腰线和穿搭氛围。" />
                <textarea value={customDraft.contentScope} onChange={(event) => onCustomDraftChange((prev) => ({ ...prev, contentScope: event.target.value.slice(0, 240) }))} className="min-h-16 w-full resize-none rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 outline-none focus:border-violet-200" placeholder="内容范围（可选）：例如只讲版型和面料，不要重复核心卖点。" />
                <textarea value={customDraft.layoutRules} onChange={(event) => onCustomDraftChange((prev) => ({ ...prev, layoutRules: event.target.value.slice(0, 320) }))} className="min-h-16 w-full resize-none rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 outline-none focus:border-violet-200" placeholder="版式规则（可选）：例如首屏海报、细节宫格、测量示意、左文右图。" />
                <textarea value={customDraft.textRules} onChange={(event) => onCustomDraftChange((prev) => ({ ...prev, textRules: event.target.value.slice(0, 260) }))} className="min-h-16 w-full resize-none rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 outline-none focus:border-violet-200" placeholder="文字规则（可选）：例如只要短标题，不要长段落，不要重复全部卖点。" />
                <textarea value={customDraft.avoidRules} onChange={(event) => onCustomDraftChange((prev) => ({ ...prev, avoidRules: event.target.value.slice(0, 320) }))} className="min-h-16 w-full resize-none rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 outline-none focus:border-violet-200" placeholder="禁忌规则（可选）：例如不要尺码表、不要性感姿势、不要促销贴纸。" />
                <div className="grid grid-cols-4 gap-1.5">
                  {CUSTOM_ASPECTS.map((value) => (
                    <button key={value} type="button" onClick={() => onCustomDraftChange((prev) => ({ ...prev, aspectRatio: value }))} className={`h-8 rounded-lg border px-2 text-[11px] ${customDraft.aspectRatio === value ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-500"}`}>{value}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 items-stretch gap-2">
                  <ToggleButton active={customDraft.subjectConsistency} label="商品一致性" onClick={() => onCustomDraftChange((prev) => ({ ...prev, subjectConsistency: !prev.subjectConsistency }))} />
                  <ToggleButton active={customDraft.modelConsistency} label="模特一致性" onClick={() => onCustomDraftChange((prev) => ({ ...prev, modelConsistency: !prev.modelConsistency }))} />
                  <ToggleButton active={customDraft.intelligentCopy} label="智能文案" onClick={() => onCustomDraftChange((prev) => ({ ...prev, intelligentCopy: !prev.intelligentCopy }))} />
                  <select value={customDraft.copyDensity} onChange={(event) => onCustomDraftChange((prev) => ({ ...prev, copyDensity: event.target.value as ProductSetCopyDensity }))} className="h-10 rounded-xl border border-slate-100 bg-slate-50 px-2 text-xs font-bold text-slate-600 outline-none">
                    <option value="none">无文案</option>
                    <option value="light">轻文案</option>
                    <option value="standard">标准文案</option>
                    <option value="rich">信息丰富</option>
                  </select>
                </div>
                <input ref={customRefInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => onUploadCustomReference("style", event.target.files?.[0])} />
                <input ref={customModelRefInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => onUploadCustomReference("model", event.target.files?.[0])} />
                <input ref={customOtherRefInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => onUploadCustomReference("other", event.target.files?.[0])} />
                <div className="grid gap-2">
                  <ReferenceUploadButton label="样式参考图" url={customDraft.referenceImageUrls[0]} loading={isUploadingCustomRef} onClick={() => customRefInputRef.current?.click()} />
                  <ReferenceUploadButton label="人脸/模特参考" url={customDraft.modelReferenceImageUrls[0]} loading={isUploadingCustomRef} onClick={() => customModelRefInputRef.current?.click()} />
                  <ReferenceUploadButton label={`其它参考图 ${customDraft.otherReferenceImageUrls.length}/3`} url={customDraft.otherReferenceImageUrls[0]} loading={isUploadingCustomRef} onClick={() => customOtherRefInputRef.current?.click()} />
                </div>
                <textarea value={customDraft.extraDescription} onChange={(event) => onCustomDraftChange((prev) => ({ ...prev, extraDescription: event.target.value.slice(0, 600) }))} className="min-h-20 w-full resize-none rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 outline-none focus:border-violet-200" placeholder="额外描述（可选）" />
                <button type="button" onClick={onAddCustomTemplate} className="h-10 w-full rounded-xl bg-slate-950 text-xs font-black text-white">确定添加</button>
              </div>
            )}

            <div className="mt-5">
              <h3 className="text-xs font-black text-slate-700">自定义样式</h3>
              {activeCustomTemplates.length ? (
                <div className="mt-2 space-y-2">
                  {activeCustomTemplates.map((template) => (
                    <div key={template.id} className="flex min-h-10 items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-xs">
                      <span className="min-w-0 truncate font-bold text-slate-700">{template.name}</span>
                      <button type="button" onClick={() => onRemoveCustomTemplate(template.id)} className="text-slate-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-2xl bg-white px-3 py-4 text-xs leading-5 text-slate-400">可上传自己的参考模板图，配合文字描述生成专属套图风格。</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ template, selected, onToggle }: { template: ProductSetTemplate; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`group flex h-full flex-col overflow-hidden rounded-3xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl ${
        selected ? "border-violet-400 ring-2 ring-violet-100" : "border-slate-100"
      }`}
    >
      <div className="relative aspect-[4/3] shrink-0 bg-slate-100">
        <img src={template.coverImage} alt={template.name} className="h-full w-full object-cover" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-slate-600 shadow-sm">
          {template.aspectRatio}
        </span>
        <span className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full shadow-sm ${selected ? "bg-violet-600 text-white" : "bg-white/90 text-slate-400"}`}>
          {selected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </span>
        {template.scenario === "womenswear" && <span className="absolute bottom-3 left-3 rounded-full bg-pink-100 px-2 py-1 text-[10px] font-black text-pink-600">女装</span>}
      </div>
      <div className="flex min-h-[126px] flex-1 flex-col p-3">
        <div className="flex min-h-6 items-start justify-between gap-2">
          <h3 className="min-w-0 line-clamp-1 text-sm font-black text-slate-900">{template.name}</h3>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
            {template.imageType === "main" ? "主图" : "详情"}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{template.typeDescriptionV2}</p>
        <div className="mt-auto flex items-center gap-2 pt-3 text-[10px] font-bold text-slate-400">
          <Layers3 className="h-3.5 w-3.5" />
          {template.subjectConsistency ? "主体一致" : "版式独立"}
          <ChevronRight className="ml-auto h-3.5 w-3.5" />
        </div>
      </div>
    </button>
  );
}

function ToggleButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 items-center justify-between rounded-xl border px-3 text-xs font-black transition ${active ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-100 bg-slate-50 text-slate-500"}`}
    >
      <span className="min-w-0 truncate pr-2">{label}</span>
      <span className={`h-4 w-7 shrink-0 rounded-full p-0.5 transition ${active ? "bg-violet-500" : "bg-slate-300"}`}>
        <span className={`block h-3 w-3 rounded-full bg-white transition ${active ? "translate-x-3" : ""}`} />
      </span>
    </button>
  );
}

function ReferenceUploadButton({ label, url, loading, onClick }: { label: string; url?: string; loading: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[60px] w-full items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-2 py-2 text-left text-xs font-bold text-slate-600 hover:border-violet-200 hover:bg-violet-50/50">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
        {url ? <img src={url} alt={label} className="h-full w-full object-cover" /> : loading ? <Loader2 className="h-4 w-4 animate-spin text-violet-500" /> : <Upload className="h-4 w-4 text-slate-400" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">{url ? "已上传，可替换" : "上传 / 拖拽图片"}</span>
      </span>
    </button>
  );
}

function OptionGrid({ title, options, value, onChange }: { title: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-slate-700">{title}</p>
      <div className="grid grid-cols-2 items-stretch gap-2 md:grid-cols-4">
        {options.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={`h-10 truncate rounded-xl border px-3 text-xs font-bold transition ${
              value === item ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-500 hover:border-violet-200"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatSavedPlanMeta(plan: SavedProductSetPlan) {
  const modeLabel = plan.mode === "custom" ? "自定义方案" : "AI视觉方案";
  const imageTypeLabel = plan.imageType === "details" ? "详情页" : "主图";
  const unit = plan.imageType === "details" ? "屏" : "张";
  const count = plan.planPreview.length || plan.genCount;
  return `${modeLabel} · ${imageTypeLabel} · ${count}${unit}`;
}

function formatSavedPlanTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function parseProductInfo(text: string) {
  return {
    name: extractProductField(text, "商品名称"),
    description: extractProductField(text, "商品描述"),
    audience: extractProductField(text, "目标受众"),
    sellingPoints: extractProductField(text, "商品卖点"),
  };
}

function resolveAnalysisSource(data: unknown, productInfo: string): ProductAnalysisSource {
  const source = typeof data === "object" && data && (data as { source?: unknown }).source === "ai" ? "ai" : "fallback";
  if (source !== "ai") return "fallback";
  const name = parseProductInfo(productInfo).name;
  return isPlaceholderProductName(name) ? "fallback" : "ai";
}

function isPlaceholderProductName(name: string) {
  const normalized = name.trim();
  return !normalized || /待分析|待确认|待识别|未识别/.test(normalized);
}

function getAnalysisFallbackMessage(reason: unknown) {
  const value = typeof reason === "string" ? reason : "";
  if (value === "missing_api_key" || value === "missing_base_url") return "视觉分析服务没有配置完成，当前展示的是基础模板信息。";
  if (value.startsWith("api_")) return `视觉分析接口返回 ${value.replace("api_", "")}，当前展示的是基础模板信息。`;
  if (value.startsWith("all_failed:")) return "视觉分析没有拿到可用结果，已暂停生成。请重试分析或手动确认商品名称与类目。";
  return "没有拿到可靠的视觉分析结果，已暂停生成。请重试或手动补充商品名称与类目。";
}

function getProductAnalysisStatus(params: { source: ProductAnalysisSource; hasProductInfo: boolean; message: string }) {
  if (params.source === "running") {
    return {
      tone: "running" as const,
      title: "正在分析商品图",
      description: "AI 正在识别商品名称、类目、卖点和适合的套图计划。",
      message: "分析完成前已禁用生成按钮，避免用不完整信息提交。",
      metric: "分析中",
    };
  }
  if (params.source === "fallback") {
    return {
      tone: "warning" as const,
      title: "未完成视觉分析",
      description: "已填入基础商品信息，但还没有识别出具体商品。",
      message: params.message || "当前不是完整 AI 识别结果，生成按钮已暂停；请重新分析或手动补充商品名称。",
      metric: "待确认",
    };
  }
  if (params.source === "failed") {
    return {
      tone: "error" as const,
      title: "分析失败",
      description: "商品分析失败，可重新分析或手动填写。",
      message: params.message || "分析接口没有返回可用结果。",
      metric: "失败",
    };
  }
  if (params.source === "ai") {
    return {
      tone: "quiet" as const,
      title: "AI 已完成分析",
      description: "已生成结构化商品信息，可继续编辑。",
      message: "",
      metric: "已完成",
    };
  }
  if (params.source === "manual") {
    return {
      tone: "quiet" as const,
      title: "手动信息",
      description: "已使用手动填写的商品信息。",
      message: "",
      metric: "手动",
    };
  }
  if (params.source === "history") {
    return {
      tone: "quiet" as const,
      title: "历史参数",
      description: "已套用历史商品信息，可继续编辑。",
      message: "",
      metric: "历史",
    };
  }
  return {
    tone: "quiet" as const,
    title: "待分析",
    description: params.hasProductInfo ? "已填写商品信息，可继续编辑。" : "上传图片后自动分析，也可手动填写。",
    message: "",
    metric: params.hasProductInfo ? "已填写" : "未填写",
  };
}

function getSmartPlanDescription(profile: ProductSetProductProfile, imageType: ProductSetImageType) {
  if (profile.isApparel) {
    return imageType === "details"
      ? "按服装详情页自动加入首屏、模特上身、面料版型、尺码试穿、种草和卖点模块。"
      : "按服装主图自动加入白底、模特上身、穿搭场景、街拍/搭配和细节模块。";
  }
  return imageType === "details"
    ? "按通用商品详情页自动组合首屏、卖点、细节、尺寸、材质和场景模块。"
    : "按通用商品主图自动组合白底、场景、细节、多角度和卖点模块。";
}

function getDefaultGenerationCount(imageType: ProductSetImageType, profile?: ProductSetProductProfile) {
  if (imageType === "main") return 3;
  if (!profile) return 5;
  if (profile.kind === "electronics" || profile.kind === "home") return 7;
  if (profile.apparelType === "intimate" || profile.apparelType === "swimwear") return 5;
  if (profile.apparelType === "outerwear" || profile.apparelType === "sportswear") return 5;
  return 5;
}

function formatMissingInfo(value: string) {
  const map: Record<string, string> = {
    brand_name: "品牌名",
    product_name: "商品名",
    selling_points: "核心卖点",
    product_size: "尺码/尺寸",
    target_audience: "目标人群",
    model_image: "模特图",
    face_reference: "人脸参考",
    background_reference: "背景参考",
    logo: "Logo",
  };
  return map[value] || value;
}

function extractProductField(text: string, label: string) {
  const labels = ["商品名称", "商品描述", "目标受众", "商品卖点"];
  const nextLabels = labels.filter((item) => item !== label).join("|");
  const match = text.match(new RegExp(`${label}\\s*[:：]\\s*([\\s\\S]*?)(?=\\n(?:${nextLabels})\\s*[:：]|$)`));
  return match?.[1]?.trim() || "";
}
