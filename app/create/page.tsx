"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  Upload, UserRound, Image, Sparkles,
  RefreshCw, X, Camera, ChevronRight, Wand, Loader2, ZoomIn, Eye,
  FolderOpen, CheckCircle2, XCircle, Shirt,
} from "lucide-react";

// 简单图片组件（带加载占位）
function ImgSkeleton({ src, alt, className }: {
  src: string; alt?: string; className?: string;
}) {
  return (
    <div className={`${className} bg-gray-100`}>
      <img src={src} alt={alt} className="w-full h-full object-cover" />
    </div>
  );
}
import { useTryOnStore } from "@/lib/store/tryon-store";
import { fileToBase64, MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { createClient, getCachedProfileCredits, setCachedProfileCredits } from "@/lib/supabase/client";
import { getCreditCost, getSupportedImageSizes, buildTryOnPrompt, type LingyaModel, type ImageSize, type AspectRatio } from "@/lib/api/lingya";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { RepairPromptPanel } from "@/components/RepairPromptPanel";
import { ModelPromptPreview } from "@/components/ModelPromptPreview";
import { ClientPortal } from "@/components/ClientPortal";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PreviewGuide } from "@/components/PreviewGuide";
import { LoadingStage } from "@/components/studio/LoadingStage";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { takeApplyPayload } from "@/lib/history-apply";
import { applyRepairPrompt } from "@/lib/generation-repair";
import {
  AUTO_DESIGN_BACKGROUNDS,
  AUTO_DESIGN_FRAMINGS,
  AUTO_DESIGN_PLATFORMS,
  DEFAULT_AUTO_DESIGN,
  SCENE_MODE_LABELS,
  buildAutoDesignPrompt,
  type AutoDesignSettings,
  type TryOnSceneMode,
} from "@/lib/tryon-scene";
import {
  TRYON_CLOTHING_ROLE_LABELS,
  TRYON_UPLOAD_RULES,
  normalizeTryOnClothingMode,
  normalizeTryOnClothingRole,
  type TryOnClothingMode,
  type TryOnClothingRole,
  type TryOnRuleDemo,
} from "@/lib/tryon-upload-rules";
import {
  TRYON_AGE_GROUP_LABELS,
  TRYON_GARMENT_AUDIENCE_LABELS,
  normalizeTryOnAgeGroup,
  normalizeTryOnGarmentAudience,
  type TryOnAgeGroup,
  type TryOnGarmentAudience,
} from "@/lib/tryon-prompt";

// ---- 预设数据 ----
const SUPABASE_STORAGE = "";

const PRESET_MODELS = [
  { id: "m0", name: "自然", image_url: `${SUPABASE_STORAGE}/models/model-natural-smile.jpg`, gender: "female" as const },
  { id: "m1", name: "甜妹", image_url: `${SUPABASE_STORAGE}/models/model-18542-0875a4d282bb.jpg`, gender: "female" as const },
  { id: "m2", name: "优雅", image_url: `${SUPABASE_STORAGE}/models/model-22921-89d4664cd1b0.jpg`, gender: "female" as const },
  { id: "m3", name: "红裙", image_url: `${SUPABASE_STORAGE}/models/model-26829-dca5c791efa8.jpg`, gender: "female" as const },
  { id: "m4", name: "酷飒", image_url: `${SUPABASE_STORAGE}/models/model-97612-bdc397740113.jpg`, gender: "female" as const },
  { id: "m5", name: "清纯", image_url: `${SUPABASE_STORAGE}/models/model-35127-693ee11382eb.png`, gender: "female" as const },
  { id: "m6", name: "清透", image_url: `${SUPABASE_STORAGE}/models/model-clear-black-long-20260502.png`, gender: "female" as const },
];

const PRESET_REFERENCES = [
  { id: "r1", url: `${SUPABASE_STORAGE}/references/reference-108513-b6db713a5d2f.jpg`, label: "白T街头", category: "scene" as const },
  { id: "r2", url: `${SUPABASE_STORAGE}/references/reference-56020-dc1aa74e5515.jpg`, label: "黑蕾丝夜景", category: "style" as const },
  { id: "r3", url: `${SUPABASE_STORAGE}/references/reference-23353-c281a160d01d.jpg`, label: "白衫桥边", category: "style" as const },
  { id: "r4", url: `${SUPABASE_STORAGE}/references/reference-soft-blue-cardigan.jpg`, label: "蓝衫光影", category: "pose" as const },
  { id: "r5", url: `${SUPABASE_STORAGE}/references/reference-white-top-denim-shorts.jpg`, label: "白顶牛仔", category: "pose" as const },
  { id: "r6", url: `${SUPABASE_STORAGE}/references/reference-mens-black-knitwear.jpg`, label: "男款木墙", category: "pose" as const },
  { id: "r7", url: `${SUPABASE_STORAGE}/references/reference-grey-tank-denim-culottes.jpg`, label: "灰背心牛仔", category: "style" as const },
  { id: "r8", url: `${SUPABASE_STORAGE}/references/reference-striped-top-white-skirt.png`, label: "条纹白裙", category: "scene" as const },
  { id: "r9", url: `${SUPABASE_STORAGE}/references/reference-cafe-wide-leg-pants.jpg`, label: "咖啡阔腿", category: "scene" as const },
];

const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 4分/次", badge: "最新", icon: "/model-icons/openai.svg" },
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "4K · 3分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "4K · 4分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5", desc: "4K · 2分/次", badge: "新", icon: "/model-icons/doubao.png" },
];

const GPT_ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: "3:4", label: "3:4 竖版" }, { value: "4:3", label: "4:3 横版" },
  { value: "1:1", label: "1:1 方形" }, { value: "16:9", label: "16:9 宽屏" },
  { value: "9:16", label: "9:16 手机" }, { value: "2:3", label: "2:3" },
  { value: "3:2", label: "3:2" }, { value: "4:5", label: "4:5" },
  { value: "5:4", label: "5:4" }, { value: "21:9", label: "21:9" },
  { value: "auto", label: "自动" },
];

const BANANA_ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: "3:4", label: "3:4" }, { value: "4:3", label: "4:3" },
  { value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" }, { value: "2:3", label: "2:3" },
  { value: "3:2", label: "3:2" }, { value: "4:5", label: "4:5" },
  { value: "5:4", label: "5:4" }, { value: "21:9", label: "21:9" },
  { value: "auto", label: "自动" },
];

const STYLE_PRESETS = [
  "服装纹理更清晰，保留面料厚度和真实褶皱",
  "人物肤色自然真实，不要过白、不要磨皮",
  "边缘干净清楚，避免衣服轮廓发糊",
  "保持原图光线方向，阴影自然不过曝",
  "人物比例稳定，肩颈、手臂和腿部不变形",
  "商品细节完整可见，logo、纽扣、拉链不丢失",
];

const GARMENT_AUDIENCE_OPTIONS: TryOnGarmentAudience[] = ["women", "men"];
const AGE_GROUP_OPTIONS: TryOnAgeGroup[] = ["adult", "teen", "big_child", "middle_child", "small_child", "toddler"];

const FAVORITE_REFERENCES_KEY = "vastweargen:tryon-reference-favorites";

type FavoriteReference = {
  id: string;
  url: string;
  label: string;
  category: "scene" | "style" | "pose";
  is_preset: false;
  user_id: null;
};

type ClothingItemState = {
  file: File;
  preview: string;
  url: string;
  role: TryOnClothingRole;
};

const CLOTHING_ROLE_ORDER: Record<TryOnClothingRole, number> = {
  upper: 0,
  lower: 1,
  single: 0,
  extra: 3,
};

function createPlaceholderFile(name: string) {
  return new File([], name, { type: "image/jpeg" });
}

export default function CreatePage() {
  const router = useRouter();
  const supabase = createClient();
  const store = useTryOnStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rulesButtonRef = useRef<HTMLButtonElement>(null);
  const rulesHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [genCount, setGenCount] = useState(1);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [aiModel, setAiModel] = useState<LingyaModel>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("3:4");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [customStyle, setCustomStyle] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [sceneMode, setSceneMode] = useState<TryOnSceneMode>("system_reference");
  const [autoDesign, setAutoDesign] = useState<AutoDesignSettings>(DEFAULT_AUTO_DESIGN);
  const [favoriteReferences, setFavoriteReferences] = useState<FavoriteReference[]>([]);
  const [clothingMode, setClothingMode] = useState<TryOnClothingMode>("single");
  const [clothingRoles, setClothingRoles] = useState<TryOnClothingRole[]>([]);
  const [garmentAudience, setGarmentAudience] = useState<TryOnGarmentAudience>("women");
  const [ageGroup, setAgeGroup] = useState<TryOnAgeGroup>("adult");
  const [pendingClothingRole, setPendingClothingRole] = useState<TryOnClothingRole>("single");
  const [showClothingRules, setShowClothingRules] = useState(false);
  const [rulesPopoverStyle, setRulesPopoverStyle] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const [customModelPreview, setCustomModelPreview] = useState<string | null>(null);
  const [customRefPreview, setCustomRefPreview] = useState<string | null>(null);
  const [isDraggingClothing, setIsDraggingClothing] = useState(false);
  const [isDraggingModel, setIsDraggingModel] = useState(false);
  const [isDraggingRef, setIsDraggingRef] = useState(false);

  // 已上传的服装 URL 列表（选择后立即上传）
  const [uploadedClothingUrls, setUploadedClothingUrls] = useState<string[]>([]);

  // 大图预览
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const aspects = aiModel === "gpt-image-2" ? GPT_ASPECTS : BANANA_ASPECTS;
  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const effectiveReferenceUrl = sceneMode === "auto_design" ? null : store.referenceImage?.url || null;
  const autoDesignPrompt = sceneMode === "auto_design" ? buildAutoDesignPrompt(autoDesign) : "";
  const stylePrompt = [autoDesignPrompt, customStyle.trim()].filter(Boolean).join("\n");
  const clothingItems = store.clothingPreviews.map((preview, index) => ({
    preview,
    url: uploadedClothingUrls[index],
    role: clothingRoles[index] || (clothingMode === "multi" ? index === 0 ? "upper" : index === 1 ? "lower" : "extra" : "single"),
  })).filter((item) => item.url);
  const currentUploadRule = TRYON_UPLOAD_RULES[clothingMode];
  const upperClothing = clothingItems.find((item) => item.role === "upper");
  const lowerClothing = clothingItems.find((item) => item.role === "lower");
  const singleClothing = clothingItems[0] || null;

  const cancelRulesHide = () => {
    if (rulesHideTimerRef.current) {
      clearTimeout(rulesHideTimerRef.current);
      rulesHideTimerRef.current = null;
    }
  };

  const openRulesPopover = () => {
    cancelRulesHide();
    const rect = rulesButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(760, window.innerWidth - 32);
    const top = Math.max(16, Math.min(rect.top - 10, window.innerHeight - 360));
    const left = Math.max(16, Math.min(rect.right + 12, window.innerWidth - width - 16));
    setRulesPopoverStyle({
      top,
      left,
      maxHeight: Math.max(320, window.innerHeight - top - 16),
    });
    setShowClothingRules(true);
  };

  const scheduleRulesHide = () => {
    cancelRulesHide();
    rulesHideTimerRef.current = setTimeout(() => {
      setShowClothingRules(false);
      setRulesPopoverStyle(null);
    }, 120);
  };

  const persistFavoriteReferences = (items: FavoriteReference[]) => {
    setFavoriteReferences(items);
    window.localStorage.setItem(FAVORITE_REFERENCES_KEY, JSON.stringify(items));
  };

  const switchSceneMode = (mode: TryOnSceneMode) => {
    setSceneMode(mode);
    setPromptOverride(null);
    if (mode === "auto_design") {
      store.setReferenceImage(null);
      setCustomRefPreview(null);
    } else if (mode === "system_reference" && store.referenceImage && !store.referenceImage.is_preset) {
      store.setReferenceImage(null);
      setCustomRefPreview(null);
    } else if (mode === "upload_reference" && store.referenceImage?.is_preset) {
      store.setReferenceImage(null);
      setCustomRefPreview(null);
    } else if (mode === "favorites" && store.referenceImage && !favoriteReferences.some((item) => item.url === store.referenceImage?.url)) {
      store.setReferenceImage(null);
      setCustomRefPreview(null);
    }
  };

  const updateGarmentAudience = (value: TryOnGarmentAudience) => {
    setGarmentAudience(value);
    setPromptOverride(null);
    store.setPromptUsed("");
  };

  const updateAgeGroup = (value: TryOnAgeGroup) => {
    setAgeGroup(value);
    setPromptOverride(null);
    store.setPromptUsed("");
  };

  const addCurrentReferenceToFavorites = () => {
    if (!store.referenceImage?.url) {
      toast.error("请先选择参考图");
      return;
    }
    const nextItem: FavoriteReference = {
      id: `fav-${Date.now()}`,
      url: store.referenceImage.url,
      label: store.referenceImage.label || "收藏参考图",
      category: store.referenceImage.category || "scene",
      is_preset: false,
      user_id: null,
    };
    const next = [nextItem, ...favoriteReferences.filter((item) => item.url !== nextItem.url)].slice(0, 24);
    persistFavoriteReferences(next);
    toast.success("已收藏参考图");
  };

  const removeFavoriteReference = (id: string) => {
    persistFavoriteReferences(favoriteReferences.filter((item) => item.id !== id));
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setIsAuthenticated(true);
        setUserId(data.user.id);
        getCachedProfileCredits(data.user.id).then(setCredits);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        setIsAuthenticated(true);
        setUserId(session.user.id);
        getCachedProfileCredits(session.user.id).then(setCredits);
      } else { setIsAuthenticated(false); setUserId(null); setCredits(null); }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    return () => cancelRulesHide();
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITE_REFERENCES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setFavoriteReferences(parsed.filter((item) => item?.url && item?.label).slice(0, 24));
      }
    } catch {
      window.localStorage.removeItem(FAVORITE_REFERENCES_KEY);
    }
  }, []);

  useEffect(() => {
    if (!aspects.find(a => a.value === aspectRatio)) setAspectRatio("3:4");
    const nextImageSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextImageSizes.includes(imageSize)) setImageSize(nextImageSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  useEffect(() => {
    const payload = takeApplyPayload("tryon");
    if (!payload) return;

    const files = payload.clothingUrls.map((_, index) =>
      new File([], `history-clothing-${index + 1}.jpg`, { type: "image/jpeg" })
    );
    store.setClothing(files, payload.clothingUrls);
    setUploadedClothingUrls(payload.clothingUrls);
    const nextClothingMode = normalizeTryOnClothingMode(payload.clothingMode || (payload.clothingUrls.length > 1 ? "multi" : "single"));
    setClothingMode(nextClothingMode);
    setClothingRoles(payload.clothingUrls.map((_, index) => normalizeTryOnClothingRole(
      payload.clothingRoles?.[index],
      nextClothingMode === "multi" ? index === 0 ? "upper" : index === 1 ? "lower" : "extra" : "single"
    )));
    setGarmentAudience(normalizeTryOnGarmentAudience(payload.garmentAudience));
    setAgeGroup(normalizeTryOnAgeGroup(payload.ageGroup));
    if (payload.modelFaceUrl) {
      store.setSelectedModel({
        id: "history-model",
        name: "历史模特",
        image_url: payload.modelFaceUrl,
        gender: "female",
        is_preset: false,
        user_id: null,
      });
    } else {
      store.setSelectedModel(null);
    }
    if (payload.referenceUrl) {
      store.setReferenceImage({
        id: "history-reference",
        url: payload.referenceUrl,
        label: "历史参考",
        category: "style",
        is_preset: false,
        user_id: null,
      });
    } else {
      store.setReferenceImage(null);
    }
    setSceneMode(payload.sceneMode || (payload.referenceUrl ? "upload_reference" : "system_reference"));
    setAutoDesign(payload.autoDesign || DEFAULT_AUTO_DESIGN);
    setAiModel(payload.aiModel);
    setAspectRatio(payload.aspectRatio);
    setImageSize(payload.imageSize);
    setGenCount(payload.genCount);
    setCustomStyle(payload.style || "");
    setPromptOverride(payload.rawPrompt || null);
    store.setPromptUsed(payload.rawPrompt || "");
    toast.success("已套用历史参数");
  }, []);

  const costPerImage = getCreditCost(aiModel, imageSize, aspectRatio);
  const totalCost = costPerImage * genCount;
  const promptPreview = buildTryOnPrompt({
    clothingCount: store.clothingFiles.length || 1,
    clothingMode,
    clothingRoles,
    garmentAudience,
    ageGroup,
    aspectRatio,
    hasModelFace: !!store.selectedModel,
    hasReference: !!effectiveReferenceUrl,
    style: stylePrompt || undefined,
  });
  const analysisBasePrompt = buildTryOnPrompt({
    clothingCount: store.clothingFiles.length || 1,
    clothingMode,
    clothingRoles,
    garmentAudience,
    ageGroup,
    aspectRatio,
    hasModelFace: !!store.selectedModel,
    hasReference: !!effectiveReferenceUrl,
  });
  const finalPrompt = promptOverride ?? (store.promptUsed || promptPreview.prompt);

  // ---- 智能优化提示词 ----
  const handleOptimizePrompt = async () => {
    if (!customStyle.trim()) { toast.error("请先输入风格描述"); return; }
    setOptimizing(true);
    try {
      const res = await fetch("/api/optimize-prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style: customStyle }),
      });
      const data = await res.json();
      if (data.optimized) { setCustomStyle(data.optimized); toast.success("提示词已优化"); }
    } catch { toast.error("优化失败"); }
    setOptimizing(false);
  };

  const handleAnalyzeFullPrompt = async () => {
    if (!uploadedClothingUrls.length) { toast.error("请先上传衣服"); return; }
    setOptimizing(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch("/api/analyze-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          clothing_urls: uploadedClothingUrls,
          clothing_mode: clothingMode,
          clothing_roles: clothingRoles,
          garment_audience: garmentAudience,
          age_group: ageGroup,
          aspect_ratio: aspectRatio,
          model_face_url: store.selectedModel?.image_url,
          reference_url: effectiveReferenceUrl,
          base_prompt: analysisBasePrompt.prompt,
          user_style: stylePrompt || undefined,
        }),
      }).finally(() => clearTimeout(timeout));

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.prompt) {
        setPromptOverride(data.prompt);
        store.setPromptUsed(data.prompt);
        toast.success("视觉分析已优化完整提示词");
      } else {
        toast.error(data.error || "暂时没有返回优化结果");
      }
    } catch (err: any) {
      toast.error(err?.name === "AbortError" ? "视觉分析超时" : "视觉分析失败");
    } finally {
      setOptimizing(false);
    }
  };

  const applyClothingItems = (items: ClothingItemState[]) => {
    const sortedItems = [...items].sort((a, b) => CLOTHING_ROLE_ORDER[a.role] - CLOTHING_ROLE_ORDER[b.role]);
    store.setClothing(sortedItems.map((item) => item.file), sortedItems.map((item) => item.preview));
    setUploadedClothingUrls(sortedItems.map((item) => item.url));
    setClothingRoles(sortedItems.map((item) => item.role));
    setPromptOverride(null);
    store.setPromptUsed("");
  };

  const getCurrentClothingItemStates = (): ClothingItemState[] => store.clothingPreviews
    .map((preview, index) => ({
      file: store.clothingFiles[index] || createPlaceholderFile(`clothing-${index + 1}.jpg`),
      preview,
      url: uploadedClothingUrls[index],
      role: clothingRoles[index] || (clothingMode === "multi" ? index === 0 ? "upper" : index === 1 ? "lower" : "extra" : "single"),
    }))
    .filter((item) => item.url);

  const switchClothingMode = (mode: TryOnClothingMode) => {
    if (mode === clothingMode) return;
    setClothingMode(mode);
    setPendingClothingRole(mode === "multi" ? "upper" : "single");
    applyClothingItems([]);
  };

  const openClothingPicker = (role: TryOnClothingRole) => {
    setPendingClothingRole(role);
    fileInputRef.current?.click();
  };

  const applyRuleDemo = (demo: TryOnRuleDemo) => {
    const nextMode: TryOnClothingMode = demo.images.length > 1 ? "multi" : "single";
    setClothingMode(nextMode);
    setPendingClothingRole(nextMode === "multi" ? "upper" : "single");
    applyClothingItems(demo.images.map((image) => ({
      file: createPlaceholderFile(`demo-${image.role}.jpg`),
      preview: image.url,
      url: image.url,
      role: image.role,
    })));
    setShowClothingRules(false);
    setRulesPopoverStyle(null);
    toast.success(`已套用${demo.title}`);
  };

  // ---- 文件处理：选择后立即上传到图床 ----
  const processFiles = async (files: FileList | File[], targetRole: TryOnClothingRole = pendingClothingRole) => {
    const arr = Array.from(files);
    if (!arr.length) return;

    const rolePlan: TryOnClothingRole[] = clothingMode === "multi" && arr.length > 1
      ? (["upper", "lower"] as TryOnClothingRole[]).slice(0, arr.length)
      : [clothingMode === "multi" ? targetRole === "lower" ? "lower" : "upper" : "single"];
    const filesToUpload = arr.slice(0, rolePlan.length);

    if (arr.length > filesToUpload.length) {
      toast.info(clothingMode === "multi" ? "多件模式最多一次处理上装和下装各 1 张" : "单件模式只需上传 1 张服装图");
    }

    setIsUploading(true);
    const validItems: { file: File; preview: string; role: TryOnClothingRole }[] = [];

    for (let index = 0; index < filesToUpload.length; index++) {
      const file = filesToUpload[index];
      if (!file.type.startsWith("image/")) { toast.error(`${file.name} 不是图片`); continue; }
      if (file.size > MAX_FILE_SIZE) { toast.error(`${file.name} 超过 ${MAX_FILE_SIZE_MB}MB`); continue; }
      try {
        validItems.push({ file, preview: await fileToBase64(file), role: rolePlan[index] });
      } catch {
        toast.error(`${file.name} 处理失败`);
      }
    }

    if (validItems.length > 0) {
      toast.info(`正在上传 ${validItems.length} 张图片到图床...`);
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
          toast.error(`${validItems[index].file.name} 上传失败，请重试`);
        }
      });

      if (uploadedItems.length > 0) {
        const replaceRoles = new Set(uploadedItems.map((item) => item.role));
        const retainedItems = clothingMode === "single"
          ? []
          : getCurrentClothingItemStates().filter((item) => !replaceRoles.has(item.role));
        applyClothingItems([...retainedItems, ...uploadedItems]);
        toast.success(clothingMode === "multi" ? "搭配服装已就绪" : "单件服装已就绪");
      }
    }
    setIsUploading(false);
  };

  // 删除服装时同步删除已上传的 URL
  const removeClothing = (index: number) => {
    store.removeClothing(index);
    setUploadedClothingUrls(prev => prev.filter((_, i) => i !== index));
    setClothingRoles(prev => prev.filter((_, i) => i !== index));
    setPromptOverride(null);
    store.setPromptUsed("");
  };

  const handleCustomModel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const base64 = await fileToBase64(file);
    setCustomModelPreview(base64);
    toast.info("正在上传模特图...");
    try {
      const result = await uploadImage(file);
      store.setSelectedModel({ id: "custom", name: "自定义", image_url: result.url, gender: "female", is_preset: false, user_id: null });
      setPromptOverride(null);
      toast.success("模特已选择");
    } catch {
      setCustomModelPreview(null);
      toast.error("模特图上传失败，请重试");
    }
  };

  const handleCustomRef = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const base64 = await fileToBase64(file);
    setCustomRefPreview(base64);
    toast.info("正在上传参考图...");
    try {
      const result = await uploadImage(file);
      store.setReferenceImage({ id: "custom", url: result.url, label: "自定义参考", category: "style", is_preset: false, user_id: null });
      setSceneMode("upload_reference");
      setPromptOverride(null);
      toast.success("参考图已选择");
    } catch {
      setCustomRefPreview(null);
      toast.error("参考图上传失败，请重试");
    }
  };

  // ---- 生成（识图 → 生成提示词 → 生成图片） ----
  const handleGenerate = async (promptForRun?: string) => {
    if (!isAuthenticated) { toast.error("请先登录"); router.push("/login"); return; }
    if (!uploadedClothingUrls.length) { toast.error("请上传衣服"); return; }
    if (clothingMode === "multi") {
      const hasUpper = clothingItems.some((item) => item.role === "upper");
      const hasLower = clothingItems.some((item) => item.role === "lower");
      if (!hasUpper || !hasLower) {
        toast.error("多件上身请分别上传上装和下装");
        return;
      }
    }
    if (credits !== null && credits < totalCost) { toast.error(`积分不足 ${totalCost}，余额 ${credits}`); return; }

    store.startGeneration();

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
      console.log("[generate] 跳过自动图片分析，使用当前提示词");

      store.updateProgress(15);
      toast.info("正在提交生成任务...");

      // ---- Step 2: 调用生成 API ----
      const res = await fetch("/api/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clothing_urls: uploadedClothingUrls,
          clothing_mode: clothingMode,
          clothing_roles: clothingRoles,
          garment_audience: garmentAudience,
          age_group: ageGroup,
          model_face_url: store.selectedModel?.image_url,
          reference_url: effectiveReferenceUrl,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          style: usedAiPrompt ? undefined : finalStyle,
          raw_prompt: usedAiPrompt ? finalStyle : undefined,
          gen_count: genCount,
          scene_mode: sceneMode,
          auto_design: sceneMode === "auto_design" ? autoDesign : undefined,
        }),
      });

      if (!res.ok) {
        const e = await res.json();
        if (res.status === 402) {
          const nextCredits = e.balance ?? 0;
          toast.error(e.error);
          setCredits(nextCredits);
          if (userId) setCachedProfileCredits(userId, nextCredits);
          store.setError(e.error);
          return;
        }
        throw new Error(e.error || "生成失败");
      }

      const { generation_id, credits_remaining } = await res.json();
      if (credits_remaining !== undefined) {
        setCredits(credits_remaining);
        if (userId) setCachedProfileCredits(userId, credits_remaining);
      }
      store.updateProgress(25);

      // ---- Step 3: 轮询进度 ----
      let attempts = 0;
      while (attempts < 120) {
        await new Promise(r => setTimeout(r, 2000));
        attempts++;

        const pollRes = await fetch(`/api/tryon?generation_id=${generation_id}`);
        if (!pollRes.ok) continue;

        const pollData = await pollRes.json();

        if (pollData.status === "processing_tryon") {
          store.updateProgress(Math.min(25 + attempts * 1.5, 90));
        } else if (pollData.status === "completed") {
          store.updateProgress(100);
          store.setResult(pollData.result_urls);
          toast.success("生成完成！");
          return;
        } else if (pollData.status === "failed") {
          throw new Error(pollData.error || "生成失败");
        }
      }
      throw new Error("生成超时");
    } catch (err: any) {
      store.setError(err.message);
      toast.error(err.message);
    }
  };

  const handleRepairGenerate = (repairValue: string) => {
    const repairedPrompt = applyRepairPrompt(finalPrompt, "tryon", repairValue);
    setPromptOverride(repairedPrompt);
    store.setPromptUsed(repairedPrompt);
    toast.info("已加入修复指令，正在重新生成...");
    handleGenerate(repairedPrompt);
  };

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="tryon" />
      {/* ========== LEFT PANEL ========== */}
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-6">
          <ModuleHeader
            title="服装上身"
            tooltip="上传单件或多件服装，选择模特与参考场景，生成可直接用于商品展示、主图延展和内容投放的成片。"
          />

          {/* ---- 服装（整个区域可拖拽） ---- */}
          <section
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingClothing(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingClothing(false); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingClothing(false); processFiles(e.dataTransfer.files); }}
            className={`relative rounded-xl transition-all ${isDraggingClothing ? "ring-2 ring-purple-400 ring-offset-2" : ""}`}
          >
            {/* 拖拽遮罩 */}
            {isDraggingClothing && (
              <div className="absolute inset-0 z-10 bg-purple-500/10 border-2 border-dashed border-purple-400 rounded-xl flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Upload className="w-8 h-8 mx-auto text-purple-500 mb-1" />
                  <p className="text-sm font-medium text-purple-600">松开上传服装</p>
                </div>
              </div>
            )}
            <div className="studio-upload-header">
              <h3 className="studio-upload-title">
                <Upload className="w-4 h-4 text-purple-500" /> 上传服装
                {isUploading && <Loader2 className="w-3 h-3 animate-spin text-purple-400" />}
              </h3>
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
                图片规则 <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple={clothingMode === "multi"}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) processFiles(e.target.files, pendingClothingRole);
                e.currentTarget.value = "";
              }}
            />

            <div className="mb-3 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
              {([
                ["single", "单件上身", "1 张服装图"],
                ["multi", "多件上身", "上装 + 下装"],
              ] as const).map(([mode, label, desc]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => switchClothingMode(mode)}
                  className={`rounded-xl px-3 py-2 text-left transition-all ${
                    clothingMode === mode ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span className="block text-xs font-bold">{label}</span>
                  <span className="mt-0.5 block text-[10px] opacity-70">{desc}</span>
                </button>
              ))}
            </div>

            {clothingMode === "single" ? (
              <div className="relative overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50/70">
                {singleClothing ? (
                  <div className="studio-checkerboard relative aspect-[4/3]">
                    <img src={singleClothing.preview} className="h-full w-full object-contain p-3" />
                    <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
                      {TRYON_CLOTHING_ROLE_LABELS.single}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeClothing(0)}
                      className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex min-h-44 flex-col items-center justify-center px-4 py-8 text-center">
                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                      <Shirt className="h-7 w-7 text-violet-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800">上传单件衣服</p>
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                      <button type="button" onClick={() => openClothingPicker("single")} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-violet-700">
                        <Upload className="h-3.5 w-3.5" /> 从本地上传
                      </button>
                      <button type="button" onClick={() => toast.info("作品库选择即将接入")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300">
                        <FolderOpen className="h-3.5 w-3.5" /> 从作品选择
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">{currentUploadRule.uploadSpecText}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["upper", "上传上装图", upperClothing],
                  ["lower", "上传下装图", lowerClothing],
                ] as const).map(([role, title, item]) => {
                  const itemIndex = clothingItems.findIndex((clothing) => clothing.role === role);
                  return (
                    <div key={role} className="relative overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50/70">
                      {item ? (
                        <div className="studio-checkerboard relative aspect-square">
                          <img src={item.preview} className="h-full w-full object-contain p-3" />
                          <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm">
                            {TRYON_CLOTHING_ROLE_LABELS[role]}
                          </span>
                          <button
                            type="button"
                            onClick={() => itemIndex >= 0 && removeClothing(itemIndex)}
                            className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm hover:text-red-500"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex min-h-44 flex-col items-center justify-center px-3 py-6 text-center">
                          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                            <Shirt className="h-6 w-6 text-violet-400" />
                          </div>
                          <p className="text-sm font-semibold text-slate-800">{title}</p>
                          <div className="mt-3 space-y-2">
                            <button type="button" onClick={() => openClothingPicker(role)} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-violet-700">
                              <Upload className="h-3.5 w-3.5" /> 从本地上传
                            </button>
                            <button type="button" onClick={() => toast.info("作品库选择即将接入")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300">
                              <FolderOpen className="h-3.5 w-3.5" /> 从作品选择
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <span className="shrink-0 text-[11px] font-medium text-slate-400">试一试</span>
              <div className="studio-scrollbar-hide flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                {currentUploadRule.demos.map((demo, demoIndex) => (
                  <button
                    key={`${clothingMode}-${demo.title}-${demoIndex}`}
                    type="button"
                    onClick={() => applyRuleDemo(demo)}
                    className="group flex h-14 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 shadow-sm transition-all hover:border-violet-200"
                    title={demo.title}
                  >
                    {demo.images.map((image) => (
                      <span key={`${demo.title}-${image.role}`} className="flex h-14 w-14 items-center justify-center bg-slate-50">
                        <img src={image.url} alt={image.title} className="h-full w-full object-contain p-1" />
                      </span>
                    ))}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* ---- 服装人群 ---- */}
          <section className="rounded-2xl border border-violet-100 bg-white/78 p-3 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  服装人群 <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">可选</span>
                </h3>
                <p className="mt-1 truncate text-[11px] text-slate-400">
                  影响人物性别线和年龄比例，默认女装成人。
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-500">
                影响比例
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {GARMENT_AUDIENCE_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateGarmentAudience(value)}
                  className={`rounded-xl border px-2 py-2 text-xs font-bold transition-all ${
                    garmentAudience === value
                      ? "border-violet-400 bg-violet-50 text-violet-700 shadow-sm"
                      : "border-slate-200 bg-white text-slate-500 hover:border-violet-200 hover:text-violet-600"
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
                    className={`rounded-xl border px-2 py-1.5 text-[11px] font-medium transition-all ${
                      ageGroup === value
                        ? "border-violet-400 bg-violet-50 text-violet-700 shadow-sm"
                        : "border-slate-200 bg-white text-slate-500 hover:border-violet-200 hover:text-violet-600"
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
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingRef(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingRef(false); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation(); setIsDraggingRef(false);
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith("image/")) {
                handleCustomRef({ target: { files: [file] } } as any);
              }
            }}
            className={`relative rounded-xl transition-all ${isDraggingRef ? "ring-2 ring-purple-400 ring-offset-2" : ""}`}
          >
            {isDraggingRef && (
              <div className="absolute inset-0 z-10 bg-purple-500/10 border-2 border-dashed border-purple-400 rounded-xl flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Upload className="w-8 h-8 mx-auto text-purple-500 mb-1" />
                  <p className="text-sm font-medium text-purple-600">松开上传参考图</p>
                </div>
              </div>
            )}
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Image className="w-4 h-4 text-purple-500" /> 参考图 / 场景
                </h3>
                <p className="mt-1 text-[11px] text-gray-400">参考图和自动设计互斥；自动设计不会使用参考图</p>
              </div>
              {store.referenceImage && sceneMode !== "auto_design" && (
                <button
                  onClick={addCurrentReferenceToFavorites}
                  className="px-2 py-1 rounded-full border text-[10px] text-gray-500 hover:text-purple-600 hover:border-purple-300"
                >
                  收藏
                </button>
              )}
            </div>

            <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-gray-100 p-1">
              {(Object.keys(SCENE_MODE_LABELS) as TryOnSceneMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => switchSceneMode(mode)}
                  className={`py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    sceneMode === mode ? "bg-white text-purple-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {SCENE_MODE_LABELS[mode]}
                </button>
              ))}
            </div>

            {sceneMode === "system_reference" && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 p-3">
                <p className="mb-2 text-[11px] font-medium text-gray-500">选择系统参考图，姿势、场景、构图会以参考图为最高优先级</p>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_REFERENCES.map((ref) => (
                    <div key={ref.id} role="button" tabIndex={0}
                      onClick={() => {
                        switchSceneMode("system_reference");
                        store.setReferenceImage({ ...ref, is_preset: true, user_id: null } as any);
                        setCustomRefPreview(null);
                        setPromptOverride(null);
                      }}
                      className={`group relative rounded-lg overflow-hidden border-2 bg-white transition-all cursor-pointer ${
                        store.referenceImage?.id === ref.id ? "border-purple-500 ring-1 ring-purple-200" : "border-transparent hover:border-gray-300"
                      }`}>
                      <ImgSkeleton src={ref.url} className="w-full aspect-[3/4] object-cover" />
                      <button onClick={(e) => { e.stopPropagation(); setLightboxSrc(ref.url); }}
                        className="absolute right-1 top-1 w-7 h-7 rounded-full bg-white/85 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <ZoomIn className="w-3.5 h-3.5 text-gray-600" />
                      </button>
                      <div className="p-1 text-center"><span className="text-[10px] font-medium">{ref.label}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sceneMode === "upload_reference" && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 p-3">
                <input data-ref-input type="file" accept="image/*" className="hidden" onChange={handleCustomRef} />
                <button onClick={() => document.querySelector<HTMLInputElement>('[data-ref-input]')?.click()}
                  className="w-full min-h-32 rounded-xl border-2 border-dashed border-gray-200 bg-white hover:border-purple-300 flex flex-col items-center justify-center overflow-hidden transition-all">
                  {(customRefPreview || store.referenceImage?.url)
                    ? <img src={customRefPreview || store.referenceImage?.url} className="w-full max-h-52 object-cover" />
                    : <><Camera className="w-6 h-6 text-gray-300 mb-2" /><span className="text-xs text-gray-500">上传参考图</span><span className="text-[11px] text-gray-400 mt-1">用于锁定姿势、背景、构图和镜头</span></>
                  }
                </button>
                {store.referenceImage && (
                  <button
                    onClick={() => { store.setReferenceImage(null); setCustomRefPreview(null); setPromptOverride(null); }}
                    className="mt-2 text-xs text-gray-400 hover:text-red-500"
                  >
                    移除上传参考图
                  </button>
                )}
              </div>
            )}

            {sceneMode === "auto_design" && (
              <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-3 space-y-4">
                <div>
                  <p className="mb-2 text-xs font-bold text-gray-800">摄影方案</p>
                  <div className="grid grid-cols-2 gap-2">
                    {AUTO_DESIGN_PLATFORMS.map((item) => (
                      <button
                        key={item.value}
                        onClick={() => { setAutoDesign((prev) => ({ ...prev, platform: item.value })); setPromptOverride(null); }}
                        className={`text-left rounded-lg border px-3 py-2 transition-all ${
                          autoDesign.platform === item.value ? "border-purple-500 bg-white text-purple-600 shadow-sm" : "border-white bg-white/70 text-gray-600 hover:border-purple-200"
                        }`}
                      >
                        <span className="block text-xs font-bold">{item.label}</span>
                        <span className="mt-0.5 block text-[10px] text-gray-400">{item.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold text-gray-800">构图</p>
                  <div className="flex flex-wrap gap-2">
                    {AUTO_DESIGN_FRAMINGS.map((item) => (
                      <button
                        key={item.value}
                        onClick={() => { setAutoDesign((prev) => ({ ...prev, framing: item.value })); setPromptOverride(null); }}
                        className={`px-3 py-1.5 rounded-lg border text-[11px] font-medium ${
                          autoDesign.framing === item.value ? "border-purple-500 bg-white text-purple-600" : "border-white bg-white/70 text-gray-500 hover:border-purple-200"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold text-gray-800">背景</p>
                  <div className="flex gap-2">
                    {AUTO_DESIGN_BACKGROUNDS.map((item) => (
                      <button
                        key={item.value}
                        onClick={() => { setAutoDesign((prev) => ({ ...prev, background: item.value })); setPromptOverride(null); }}
                        className={`flex-1 py-1.5 rounded-lg border text-[11px] font-medium ${
                          autoDesign.background === item.value ? "border-purple-500 bg-white text-purple-600" : "border-white bg-white/70 text-gray-500 hover:border-purple-200"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {sceneMode === "favorites" && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 p-3">
                {favoriteReferences.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-400">还没有收藏参考图</div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {favoriteReferences.map((ref) => (
                      <div key={ref.id} role="button" tabIndex={0}
                        onClick={() => {
                          switchSceneMode("favorites");
                          store.setReferenceImage(ref as any);
                          setCustomRefPreview(null);
                          setPromptOverride(null);
                        }}
                        className={`group relative rounded-lg overflow-hidden border-2 bg-white transition-all cursor-pointer ${
                          store.referenceImage?.url === ref.url ? "border-purple-500 ring-1 ring-purple-200" : "border-transparent hover:border-gray-300"
                        }`}>
                        <ImgSkeleton src={ref.url} className="w-full aspect-[3/4] object-cover" />
                        <button onClick={(e) => { e.stopPropagation(); removeFavoriteReference(ref.id); }}
                          className="absolute right-1 top-1 w-6 h-6 rounded-full bg-white/85 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <X className="w-3 h-3 text-gray-500" />
                        </button>
                        <div className="p-1 text-center"><span className="text-[10px] font-medium">{ref.label}</span></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ---- 模特（整个区域可拖拽·可选） ---- */}
          <section
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingModel(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingModel(false); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation(); setIsDraggingModel(false);
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith("image/")) {
                handleCustomModel({ target: { files: [file] } } as any);
              }
            }}
            className={`relative rounded-xl transition-all ${isDraggingModel ? "ring-2 ring-purple-400 ring-offset-2" : ""}`}
          >
            {/* 拖拽遮罩 */}
            {isDraggingModel && (
              <div className="absolute inset-0 z-10 bg-purple-500/10 border-2 border-dashed border-purple-400 rounded-xl flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Upload className="w-8 h-8 mx-auto text-purple-500 mb-1" />
                  <p className="text-sm font-medium text-purple-600">松开上传模特图</p>
                </div>
              </div>
            )}
            <h3 className="font-bold text-sm mb-1 flex items-center gap-2">
              <UserRound className="w-4 h-4 text-purple-500" /> 模特 <span className="text-purple-400 font-normal text-xs">· 控制脸部</span>
              <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 text-[9px]">可选</span>
            </h3>
            <p className="text-[11px] text-gray-400 mb-3">不选则使用参考图中的人物面部 · 可拖拽图片到此处</p>
            <input type="file" accept="image/*" className="hidden" onChange={handleCustomModel} />
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  store.setSelectedModel(null);
                  setCustomModelPreview(null);
                  toast.success("已设为不替换脸部");
                }}
                className={`rounded-lg border-2 flex flex-col items-center justify-center aspect-square transition-all ${
                  !store.selectedModel ? "border-purple-500 bg-purple-50 ring-1 ring-purple-200" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <UserRound className={`w-5 h-5 mb-1 ${!store.selectedModel ? "text-purple-500" : "text-gray-300"}`} />
                <span className={`text-[10px] font-medium ${!store.selectedModel ? "text-purple-600" : "text-gray-400"}`}>
                  不选默认
                </span>
              </button>
              {PRESET_MODELS.map((m) => (
                <div key={m.id} role="button" tabIndex={0}
                  onClick={() => {
                    setCustomModelPreview(null);
                    store.setSelectedModel({ ...m, is_preset: true, user_id: null });
                    setPromptOverride(null);
                  }}
                  className={`group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                    store.selectedModel?.id === m.id ? "border-purple-500 ring-1 ring-purple-200" : "border-transparent hover:border-gray-300"
                  }`}>
                  <ImgSkeleton src={m.image_url} className="w-full aspect-square object-cover" />
                  <div className="absolute inset-0 pointer-events-none flex items-end justify-end bg-violet-950/0 p-1 opacity-0 transition-all group-hover:bg-violet-950/10 group-hover:opacity-100">
                    <button onClick={(e) => { e.stopPropagation(); setLightboxSrc(m.image_url); }}
                      className="pointer-events-auto w-7 h-7 rounded-full bg-white/80 flex items-center justify-center hover:bg-white shadow-sm">
                      <ZoomIn className="w-3.5 h-3.5 text-gray-600" />
                    </button>
                  </div>
                  <div className="p-1 text-center"><span className="text-[10px] font-medium">{m.name}</span></div>
                </div>
              ))}
              <button onClick={() => document.querySelector<HTMLInputElement>('[data-model-input]')?.click()}
                className="rounded-lg border-2 border-dashed border-gray-200 hover:border-purple-300 flex flex-col items-center justify-center aspect-square transition-all">
                {customModelPreview
                  ? <img src={customModelPreview} className="w-full h-full object-cover rounded-lg" />
                  : <><Camera className="w-5 h-5 text-gray-300" /><span className="text-[10px] text-gray-400">点击上传</span></>
                }
              </button>
              <input data-model-input type="file" accept="image/*" className="hidden" onChange={handleCustomModel} />
            </div>
          </section>

          {/* ---- 生成模型 ---- */}
          <section>
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" /> 生成模型
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {MODELS.map((opt) => (
                <button key={opt.value} onClick={() => setAiModel(opt.value)}
                  className={`text-left px-3 py-2 rounded-lg border transition-all ${
                    aiModel === opt.value ? "border-purple-500 bg-purple-50" : "border-gray-100 hover:border-gray-300"
                  }`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <img src={opt.icon} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" />
                    <span className="text-[11px] font-semibold truncate min-w-0">{opt.label}</span>
                    {opt.badge && <span className="text-[9px] px-1 py-0.5 rounded-full bg-purple-100 text-purple-600 flex-shrink-0">{opt.badge}</span>}
                  </div>
                  <p className="text-[10px] text-gray-400 pl-5 leading-tight truncate">{opt.desc} · 当前{getCreditCost(opt.value, imageSize, aspectRatio)}分</p>
                </button>
              ))}
            </div>
          </section>

          {/* ---- 比例 ---- */}
          <section>
            <h3 className="font-bold text-sm mb-3">图片比例</h3>
            <div className="flex flex-wrap gap-1.5">
              {aspects.map((a) => (
                <button key={a.value} onClick={() => setAspectRatio(a.value)}
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                    aspectRatio === a.value ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"
                  }`}>{a.label}</button>
              ))}
            </div>
          </section>

          {/* ---- 分辨率 ---- */}
          {imageSizes.length > 1 && (
            <section>
              <h3 className="font-bold text-sm mb-3">分辨率</h3>
              <div className="flex gap-2">
                {imageSizes.map((s) => (
                  <button key={s} onClick={() => setImageSize(s)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                      imageSize === s ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"
                    }`}>{s} · {getCreditCost(aiModel, s, aspectRatio)}积分</button>
                ))}
              </div>
            </section>
          )}

          {/* ---- 细节补充 + 智能整理 ---- */}
          <section>
            <h3 className="font-bold text-sm mb-3">细节补充（可选）</h3>
            <div className="relative">
              <textarea value={customStyle} onChange={(e) => { setCustomStyle(e.target.value); setPromptOverride(null); }}
                placeholder="可选：补充不改变主风格的细节要求，如面料、肤色、光线、商品细节..."
                className="w-full px-3 py-2 pr-10 rounded-lg border text-xs focus:ring-2 focus:ring-purple-200 outline-none resize-none h-14" />
              <button onClick={handleOptimizePrompt} disabled={optimizing || !customStyle.trim()}
                className="absolute right-2 top-2 p-1.5 rounded-md bg-purple-50 text-purple-500 hover:bg-purple-100 disabled:opacity-30"
                title="智能整理提示词">
                {optimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {STYLE_PRESETS.map((s, i) => (
                <button key={i} onClick={() => { setCustomStyle(s); setPromptOverride(null); }}
                  className="px-2 py-0.5 rounded-full bg-gray-50 border text-[10px] text-gray-500 hover:bg-purple-50 hover:text-purple-600 transition-all">{s}</button>
              ))}
            </div>

            {/* 查看提示词 */}
            <button
              type="button"
              data-prompt-trigger="tryon"
              aria-label="查看完整提示词"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowPromptPreview(true);
              }}
              className="studio-prompt-trigger mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all">
              <Eye className="w-3.5 h-3.5" />
              查看完整提示词
            </button>
          </section>

          {/* ---- 生成数量 ---- */}
          <section>
            <h3 className="font-bold text-sm mb-3">生成数量</h3>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button key={n} onClick={() => setGenCount(n)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                    genCount === n ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 hover:border-gray-300"
                  }`}>
                  {n} 张
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* ---- 底部 ---- */}
        <div className="studio-runbar border-t p-3 sm:p-4 space-y-2 sticky bottom-0 z-10 lg:static">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{clothingMode === "multi" ? "多件搭配" : "单件上身"} · {store.clothingFiles.length} 张输入 · {costPerImage} × {genCount} 张</span>
            {isAuthenticated
              ? <span className="font-bold text-amber-600">消耗 {totalCost} · 余额 {credits ?? "—"}</span>
              : <span className="text-gray-400">登录后查看积分</span>
            }
          </div>
          <button onClick={() => handleGenerate()} disabled={store.isGenerating || !uploadedClothingUrls.length}
            className="w-full py-3 rounded-xl gradient-brand text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 shadow-lg shadow-purple-200">
            <Sparkles className="w-4 h-4" />
            {!isAuthenticated ? "登录后生成" : store.isGenerating ? "生成中..." : `生成 ${genCount} 张`}
          </button>
        </div>
      </div>

      {/* ========== RIGHT PANEL ========== */}
      <div className="studio-canvas min-h-[260px] sm:min-h-[360px] lg:min-h-0 flex-1 relative overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {/* Idle */}
        {!store.isGenerating && store.resultUrls.length === 0 && !store.error && (
          <div className="min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center relative overflow-hidden px-4">
            {/* 渐变背景 */}
            <div className="studio-empty-stage absolute inset-0" />
            {/* 装饰圆 */}
            <div className="absolute top-20 right-20 w-64 h-64 rounded-full bg-purple-100/30 blur-3xl" />
            <div className="absolute bottom-20 left-20 w-48 h-48 rounded-full bg-pink-100/30 blur-3xl" />

            <div className="relative w-full px-4 animate-fade-in">
              <PreviewGuide
                title="开始制作服装上身图"
                subtitle="先确定服装硬参考，再选择模特和场景，生成可直接用于商品展示的成片。"
                imageSrc="/home-showcase/model-striped-top-white-skirt.png"
                imageAlt="服装上身指引"
                steps={[
                  { title: "上传服装", desc: "单件模式上传 1 张服装图，多件模式分别上传上装和下装。" },
                  { title: "选择模特 / 场景", desc: "可用系统模特、上传模特图；场景参考只控制姿势、背景、构图和镜头。" },
                  { title: "生成上身图", desc: "保持服装款式、颜色、图案和穿搭关系不变，输出真实成片。" },
                ]}
              />
            </div>
          </div>
        )}

        {/* ==== 生成中：毛玻璃流光卡片 ==== */}
        {store.isGenerating && (
          <LoadingStage genCount={genCount} progress={store.generationProgress} />
        )}

        {/* Result */}
        {store.resultUrls.length > 0 && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 pb-24 sm:p-6 sm:pb-28 lg:h-full animate-fade-in">
            <div className="flex min-h-full items-center justify-center">
              <ResultImageGrid urls={store.resultUrls} filenamePrefix="tryon" onOpen={setLightboxSrc} />
            </div>
          </div>
        )}

        {/* Error */}
        {store.error && (
          <ErrorStage
            error={store.error}
            onRetry={() => { store.setError(null); handleGenerate(); }}
            onRepair={handleRepairGenerate}
            isGenerating={store.isGenerating}
            repairKind="tryon"
          />
        )}

        {/* Bottom bar */}
        {store.resultUrls.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 border-t border-white/70 bg-white/78 backdrop-blur-2xl px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-[0_-18px_45px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">服装上身结果</span>
              {store.promptUsed && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setShowPromptPreview(true);
                  }}
                  className="text-xs text-purple-500 hover:text-purple-700 underline">
                  查看提示词
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <RepairPromptPanel
                kind="tryon"
                onRepair={handleRepairGenerate}
                disabled={store.isGenerating}
                className="max-w-xl flex-1"
              />
              <button onClick={() => store.reset()}
                className="px-4 py-1.5 rounded-full border text-xs font-medium flex items-center gap-1.5 hover:bg-gray-50">
                <RefreshCw className="w-3 h-3" /> 重新创作
              </button>
              <a href="/history" className="px-4 py-1.5 rounded-full gradient-brand text-white text-xs font-medium flex items-center gap-1.5">
                历史记录 <ChevronRight className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </div>

      {showClothingRules && rulesPopoverStyle && (
        <ClientPortal>
          <div
            className="fixed z-[240] w-[min(760px,calc(100vw-32px))] overflow-hidden rounded-[24px] border border-white/80 bg-white/[0.96] shadow-[0_28px_90px_rgba(15,23,42,0.18)] backdrop-blur-2xl animate-fade-in"
            style={{
              top: rulesPopoverStyle.top,
              left: rulesPopoverStyle.left,
              maxHeight: rulesPopoverStyle.maxHeight,
            }}
            onMouseEnter={cancelRulesHide}
            onMouseLeave={scheduleRulesHide}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-500">{currentUploadRule.shortTitle}</p>
                <h3 className="mt-1 text-base font-bold text-slate-950">{currentUploadRule.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{currentUploadRule.uploadSpecText}</p>
              </div>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-600">Hover 预览</span>
            </div>

            <div className="studio-scrollbar-hide overflow-y-auto px-5 py-4" style={{ maxHeight: rulesPopoverStyle.maxHeight - 88 }}>
              <div className={`grid gap-3 ${clothingMode === "multi" ? "md:grid-cols-3" : "md:grid-cols-5"}`}>
                {currentUploadRule.demos.map((demo, demoIndex) => (
                  <div key={`${clothingMode}-${demo.title}-${demoIndex}`} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-2">
                    <div className={`grid gap-1 ${demo.images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                      {demo.images.map((image, imageIndex) => (
                        <div key={`${demo.title}-${image.role}-${imageIndex}-${image.url}`} className="relative overflow-hidden rounded-xl bg-white">
                          <img src={image.url} alt={image.title} className="aspect-square w-full object-cover" />
                          <CheckCircle2 className="absolute right-2 top-2 h-5 w-5 rounded-full bg-white text-emerald-500" />
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-700">{demo.title}</p>
                      <button
                        type="button"
                        onClick={() => applyRuleDemo(demo)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-violet-200 hover:text-violet-600"
                      >
                        试一试
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl bg-red-50/40 p-3">
                <p className="mb-3 text-center text-xs font-medium text-slate-500">{currentUploadRule.deprecatedTitle}</p>
                <div className="mx-auto grid max-w-lg grid-cols-3 gap-3">
                  {currentUploadRule.deprecatedImages.map((image) => (
                    <div key={image.title} className="rounded-2xl border border-red-100 bg-white/70 p-2 text-center">
                      <div className="relative overflow-hidden rounded-xl bg-white">
                        <img src={image.url} alt={image.title} className="aspect-square w-full object-cover" />
                        <XCircle className="absolute right-2 top-2 h-5 w-5 rounded-full bg-white text-red-500" />
                      </div>
                      <p className="mt-2 text-xs font-medium text-slate-600">{image.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </ClientPortal>
      )}

      {/* ========== 大图 Lightbox ========== */}
      {lightboxSrc && (
        <ClientPortal>
          <div className="fixed inset-0 z-[180] flex cursor-zoom-out items-center justify-center bg-slate-950/66 p-4 backdrop-blur-xl sm:p-8"
            onClick={() => setLightboxSrc(null)}>
            <img src={lightboxSrc}
              className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_32px_120px_rgba(0,0,0,0.45)]" />
            <button onClick={() => setLightboxSrc(null)}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/85 bg-white/90 text-slate-700 shadow-[0_12px_34px_rgba(15,23,42,0.22)] backdrop-blur transition-colors hover:bg-white hover:text-slate-950 sm:right-6 sm:top-6">
              <X className="w-5 h-5" />
            </button>
          </div>
        </ClientPortal>
      )}

      {/* ========== 提示词预览 ========== */}
      {showPromptPreview && (
        <ClientPortal>
        <div className="fixed inset-0 z-[220] flex min-h-dvh w-dvw items-center justify-center bg-slate-950/38 p-4 backdrop-blur-xl sm:p-6"
          onClick={() => setShowPromptPreview(false)}>
          <div className="max-h-[86dvh] w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/80 bg-white/[0.94] shadow-[0_32px_100px_rgba(15,23,42,0.22)] backdrop-blur-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-bold text-sm">{promptOverride || store.promptUsed ? "完整提示词" : "默认提示词模板"}</h3>
              <button onClick={() => setShowPromptPreview(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-2 bg-gray-50 border-b">
              <div className="flex gap-2 flex-wrap">
                {promptPreview.imageRoles.map((role, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-medium">
                    图{i + 1}：{role}
                  </span>
                ))}
                {customStyle && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">
                    + 风格补充
                  </span>
                )}
                {sceneMode === "auto_design" && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-medium">
                    + 自动设计
                  </span>
                )}
              </div>
            </div>

            <div className="px-5 py-4 overflow-y-auto max-h-[64dvh] space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["模型", aiModel],
                  ["比例", aspectRatio],
                  ["分辨率", imageSize],
                  ["生成张数", `${genCount}`],
                  ["上身模式", clothingMode === "multi" ? "多件上身" : "单件上身"],
                  ["服装角色", clothingRoles.map((role) => TRYON_CLOTHING_ROLE_LABELS[role]).join("、") || "未上传"],
                  ["服装人群", TRYON_GARMENT_AUDIENCE_LABELS[garmentAudience]],
                  ["年龄段", TRYON_AGE_GROUP_LABELS[ageGroup]],
                  ["服装数量", `${uploadedClothingUrls.length}`],
                  ["模特脸", store.selectedModel ? "已使用" : "未使用"],
                  ["场景模式", SCENE_MODE_LABELS[sceneMode]],
                  ["参考图", effectiveReferenceUrl ? "已使用" : "未使用"],
                  ["自动设计", sceneMode === "auto_design" ? AUTO_DESIGN_PLATFORMS.find((item) => item.value === autoDesign.platform)?.label || "-" : "未使用"],
                  ["用户输入", customStyle || "无"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-gray-50 px-3 py-2">
                    <p className="text-[10px] text-gray-400">{label}</p>
                    <p className="text-xs font-medium text-gray-700 break-words">{value}</p>
                  </div>
                ))}
              </div>
              <textarea
                value={finalPrompt}
                onChange={(e) => {
                  setPromptOverride(e.target.value);
                  store.setPromptUsed(e.target.value);
                }}
                className="w-full min-h-[320px] px-3 py-2 rounded-lg border text-xs text-gray-700 leading-relaxed outline-none focus:ring-2 focus:ring-purple-200 resize-y"
              />
              <ModelPromptPreview kind="tryon" model={aiModel} prompt={finalPrompt} className="mt-3" />
              <button
                onClick={handleAnalyzeFullPrompt}
                disabled={optimizing || !uploadedClothingUrls.length}
                className="w-full py-2 rounded-lg border border-dashed border-purple-200 text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {optimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
                分析图片并优化提示词
              </button>
            </div>

            <div className="px-5 py-3 border-t bg-gray-50 flex justify-between gap-2">
              <button onClick={() => {
                setPromptOverride(null);
                store.setPromptUsed("");
                toast.success("已重置为默认提示词");
              }}
                className="px-4 py-1.5 rounded-full border border-dashed border-gray-300 text-xs font-medium text-gray-500 hover:border-purple-300 hover:text-purple-600 transition-colors">重置默认</button>
              <div className="flex gap-2">
                <button onClick={() => { navigator.clipboard.writeText(finalPrompt); toast.success("已复制"); }}
                  className="px-4 py-1.5 rounded-full border text-xs font-medium hover:bg-gray-50">复制</button>
                <button onClick={() => setShowPromptPreview(false)}
                  className="px-4 py-1.5 rounded-full gradient-brand text-white text-xs font-medium">关闭</button>
              </div>
            </div>
          </div>
        </div>
        </ClientPortal>
      )}
    </div>
  );
}
