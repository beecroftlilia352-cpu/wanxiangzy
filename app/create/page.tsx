"use client";

import type { ChangeEvent, CSSProperties, KeyboardEvent } from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { 
  Upload, UserRound, Image, Sparkles,
  RefreshCw, X, Camera, ChevronRight, Wand, Loader2, ZoomIn, Eye,
  FolderOpen, CheckCircle2, XCircle,
} from "lucide-react";
import { useTryOnStore } from "@/lib/store/tryon-store";
import { fileToBase64, MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { getCreditCost, getSupportedImageSizes, buildTryOnPrompt, isNanoBananaModel, type LingyaModel, type ImageSize, type AspectRatio } from "@/lib/api/lingya";
import { toast } from "sonner";
import { RepairPromptPanel } from "@/components/RepairPromptPanel";
import { ModelPromptPreview } from "@/components/ModelPromptPreview";
import { ClientPortal } from "@/components/ClientPortal";
import { ModuleHeader } from "@/components/ModuleHeader";
import { LoadingStage } from "@/components/studio/LoadingStage";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ResultImageGrid, type ResultInputReference } from "@/components/ResultImageGrid";
import { ImgSkeleton } from "@/components/studio/ImgSkeleton";
import { StudioControlPanel } from "@/components/studio/StudioControlPanel";
import { StudioEmptyState } from "@/components/studio/StudioEmptyState";
import { StudioPageShell } from "@/components/studio/StudioPageShell";
import { StudioResultViewport, type StudioResultStatus } from "@/components/studio/StudioResultViewport";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { StudioSection } from "@/components/studio/StudioSection";
import { StudioSegmentedControl } from "@/components/studio/StudioSegmentedControl";
import { StudioTaskRail } from "@/components/studio/StudioTaskRail";
import { StudioUploadTile } from "@/components/studio/StudioUploadTile";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import { useTaskSelectionSession, type TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { useStableFileDrag } from "@/components/studio/useStableFileDrag";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import { StudioGenerationCountSelector, StudioModelSelector, StudioOptionGrid, StudioPromptTextarea } from "@/components/studio/StudioFormControls";
import { fetchHistoryApplyDetail, takeApplyPayload, type HistoryJobPayload } from "@/lib/history-apply";
import { applyRepairPrompt } from "@/lib/generation-repair";
import { clampTaskExpectedCount, isTaskRunning, safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";
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
import { TryOnSourceLibraryDialog } from "@/components/tryon/TryOnSourceLibraryDialog";
import { useTryOnSourceLibrary } from "@/components/tryon/useTryOnSourceLibrary";
import type { TryOnSourceLibraryItem } from "@/lib/tryon-source-library";
import { buildTryOnInputReferences } from "@/lib/tryon-input-references";

type FavoriteReference = {
  id: string;
  url: string;
  label: string;
  category: "scene" | "style" | "pose";
  is_preset: false;
  user_id: null;
};

type TryOnHistoryPayload = Extract<HistoryJobPayload, { kind: "tryon" }>;

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

const TRYON_STATUS_POLL_TIMEOUT_MS = 10 * 60 * 1000;
const TRYON_STATUS_FETCH_TIMEOUT_MS = 8_000;
const TRYON_STATUS_HIDDEN_POLL_MS = 30_000;
const TRYON_STATUS_QUEUE_REFRESH_MS = 20_000;
const activeTryOnStatusWatchers = new Map<string, AbortController>();
const TRYON_FACE_MODEL_BANANA_NOTICE = "已选择模特脸时，Banana 暂不可用。建议用 GPT-Image-2 直接融合；如果想用 Banana 的换装效果，先不选模特图完成换装，再到换脸模块处理脸部。";

function createPlaceholderFile(name: string) {
  return new File([], name, { type: "image/jpeg" });
}

function normalizeAssetUrl(value?: string | null) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.toLowerCase();
  } catch {
    return value.split("?")[0].trim().toLowerCase();
  }
}

function sameAssetUrl(left?: string | null, right?: string | null) {
  const normalizedLeft = normalizeAssetUrl(left);
  const normalizedRight = normalizeAssetUrl(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function findPresetModelByUrl(url?: string | null) {
  return PRESET_MODELS.find((model) => sameAssetUrl(model.image_url, url));
}

function findPresetReferenceByUrl(url?: string | null) {
  return PRESET_REFERENCES.find((reference) => sameAssetUrl(reference.url, url));
}

export default function CreatePage() {
  const router = useRouter();
  const store = useTryOnStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rulesButtonRef = useRef<HTMLButtonElement>(null);
  const rulesHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeGenerationRef = useRef<string | null>(null);
  const generationSubmitRef = useRef<{ id: string; controller: AbortController } | null>(null);
  const watchedGenerationIdsRef = useRef<Set<string>>(new Set());
  const statusWatcherControllersRef = useRef<Map<string, AbortController>>(new Map());
  const {
    pendingId: applyingTaskId,
    begin: beginTaskSelection,
    cancel: cancelTaskSelection,
  } = useTaskSelectionSession();
  const [genCount, setGenCount] = useState(1);

  const {
    authChecked,
    isAuthenticated,
    userId,
    credits,
    setCredits,
    refreshAuth,
  } = useStudioAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingClothingRoles, setUploadingClothingRoles] = useState<TryOnClothingRole[]>([]);
  const [aiModel, setAiModel] = useState<LingyaModel>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [customStyle, setCustomStyle] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [sceneMode, setSceneMode] = useState<TryOnSceneMode>("auto_design");
  const [autoDesign, setAutoDesign] = useState<AutoDesignSettings>(DEFAULT_AUTO_DESIGN);
  const [favoriteReferences, setFavoriteReferences] = useState<FavoriteReference[]>([]);
  const [isLoadingFavoriteReferences, setIsLoadingFavoriteReferences] = useState(false);
  const [isSavingFavoriteReference, setIsSavingFavoriteReference] = useState(false);
  const [clothingMode, setClothingMode] = useState<TryOnClothingMode>("multi");
  const [clothingRoles, setClothingRoles] = useState<TryOnClothingRole[]>([]);
  const [garmentAudience, setGarmentAudience] = useState<TryOnGarmentAudience>("women");
  const [ageGroup, setAgeGroup] = useState<TryOnAgeGroup>("adult");
  const [isIntimateGarment, setIsIntimateGarment] = useState(false);
  const [pendingClothingRole, setPendingClothingRole] = useState<TryOnClothingRole>("upper");
  const [showClothingRules, setShowClothingRules] = useState(false);
  const [rulesPopoverStyle, setRulesPopoverStyle] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const [customModelPreview, setCustomModelPreview] = useState<string | null>(null);
  const [customRefPreview, setCustomRefPreview] = useState<string | null>(null);
  const [isDraggingClothing, setIsDraggingClothing] = useState(false);
  const [isDraggingModel, setIsDraggingModel] = useState(false);
  const [isDraggingRef, setIsDraggingRef] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeQueueTask, setActiveQueueTask] = useState<TaskQueueItem | null>(null);
  const [activeTaskReferences, setActiveTaskReferences] = useState<ResultInputReference[]>([]);
  const taskQueue = useTaskQueueGeneration({
    module: "tryon",
    title: "服装上身",
    defaultExpectedCount: genCount,
    applyPath: "/create",
  });
  const clothingDrag = useStableFileDrag<HTMLElement>({
    isDragging: isDraggingClothing,
    setDragging: setIsDraggingClothing,
    stopPropagation: true,
    fileFilter: (file) => file.type.startsWith("image/"),
    onFiles: (files) => processFiles(files, pendingClothingRole),
  });
  const referenceDrag = useStableFileDrag<HTMLElement>({
    isDragging: isDraggingRef,
    setDragging: setIsDraggingRef,
    stopPropagation: true,
    fileFilter: (file) => file.type.startsWith("image/"),
    onFiles: (files) => handleCustomRefFile(files[0]),
  });
  const modelDrag = useStableFileDrag<HTMLElement>({
    isDragging: isDraggingModel,
    setDragging: setIsDraggingModel,
    stopPropagation: true,
    fileFilter: (file) => file.type.startsWith("image/"),
    onFiles: (files) => handleCustomModelFile(files[0]),
  });
  const customRefInputRef = useRef<HTMLInputElement>(null);
  const customModelInputRef = useRef<HTMLInputElement>(null);
  const sourceLibrary = useTryOnSourceLibrary({
    ensureAuthenticated: refreshAuth,
    isAuthenticated,
    onUnauthenticated: () => {
      toast.error("请先登录后使用作品库");
      router.push("/login");
    },
  });

  // 已上传的服装 URL 列表（选择后立即上传）
  const [uploadedClothingUrls, setUploadedClothingUrls] = useState<string[]>([]);

  // 大图预览
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);

  const aspects = aiModel === "gpt-image-2" ? GPT_ASPECTS : BANANA_ASPECTS;
  const imageSizes = getSupportedImageSizes(aiModel, aspectRatio);
  const effectiveReferenceUrl = sceneMode === "auto_design" ? null : store.referenceImage?.url || null;
  const hasModelFace = Boolean(store.selectedModel?.image_url);
  const isBananaDisabledByModelFace = hasModelFace;
  const selectableModels = MODELS.map((model) => ({
    ...model,
    disabled: isBananaDisabledByModelFace && isNanoBananaModel(model.value),
  }));
  const isCurrentReferenceFavorited = Boolean(
    store.referenceImage?.url && favoriteReferences.some((item) => item.url === store.referenceImage?.url)
  );
  const resolvedAutoDesign = normalizeAutoDesignSettings(autoDesign);
  const autoDesignBackgroundOptions = resolvedAutoDesign.platform === "ecommerce_clean"
    ? AUTO_DESIGN_BACKGROUNDS.filter((item) => item.value === "white")
    : AUTO_DESIGN_BACKGROUNDS;
  const autoDesignPrompt = sceneMode === "auto_design" ? buildAutoDesignPrompt(resolvedAutoDesign) : "";
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
  const selectedReferencePreviewUrl = customRefPreview || store.referenceImage?.url || "";
  const openLightbox = (src: string, alt: string) => {
    setLightboxImage({ src, alt });
  };

  const handlePreviewKeyDown = (event: KeyboardEvent, action: () => void) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    action();
  };

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

  const resetScenePrompt = () => {
    setPromptOverride(null);
    store.setPromptUsed("");
  };

  const applyPresetReference = (ref: typeof PRESET_REFERENCES[number]) => {
    store.setReferenceImage({ ...ref, is_preset: true, user_id: null } as any);
    setCustomRefPreview(null);
    resetScenePrompt();
  };

  const applyFavoriteReference = (ref: FavoriteReference) => {
    store.setReferenceImage(ref as any);
    setCustomRefPreview(null);
    resetScenePrompt();
  };

  const switchSceneMode = (mode: TryOnSceneMode) => {
    setSceneMode(mode);
    resetScenePrompt();

    if (mode === "auto_design") {
      store.setReferenceImage(null);
      setCustomRefPreview(null);
      return;
    }

    if (mode === "system_reference") {
      if (!store.referenceImage?.is_preset) {
        const firstPreset = PRESET_REFERENCES[0];
        if (firstPreset) applyPresetReference(firstPreset);
      }
      return;
    }

    if (mode === "upload_reference") {
      if (store.referenceImage?.is_preset || favoriteReferences.some((item) => item.url === store.referenceImage?.url)) {
        store.setReferenceImage(null);
        setCustomRefPreview(null);
      }
      return;
    }

    const currentFavorite = favoriteReferences.find((item) => item.url === store.referenceImage?.url);
    const nextFavorite = currentFavorite || favoriteReferences[0];
    if (nextFavorite) {
      applyFavoriteReference(nextFavorite);
    } else {
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
    if (value !== "adult" && isIntimateGarment) {
      setIsIntimateGarment(false);
      toast.info("内衣/泳衣类服装仅支持成人模特，已关闭该选项");
    }
    setAgeGroup(value);
    setPromptOverride(null);
    store.setPromptUsed("");
  };

  const updateIntimateGarment = (checked: boolean) => {
    if (checked && ageGroup !== "adult") {
      toast.error("内衣/泳衣类服装仅支持成人模特，请先将年龄段改为成人");
      return;
    }
    setIsIntimateGarment(checked);
    setPromptOverride(null);
    store.setPromptUsed("");
  };

  const addCurrentReferenceToFavorites = async () => {
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error("请先登录后收藏");
      router.push("/login");
      return;
    }
    if (!store.referenceImage?.url) {
      toast.error("请先选择参考图");
      return;
    }

    setIsSavingFavoriteReference(true);
    try {
      const res = await fetch("/api/tryon/reference-favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: store.referenceImage.url,
          label: store.referenceImage.label || "收藏参考图",
          category: normalizeReferenceCategory(store.referenceImage.category),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "收藏失败");

      const favorite = normalizeFavoriteReference(data.favorite);
      if (!favorite) throw new Error("收藏数据异常");
      setFavoriteReferences((prev) => [
        favorite,
        ...prev.filter((item) => item.id !== favorite.id && item.url !== favorite.url),
      ].slice(0, 24));
      toast.success(isCurrentReferenceFavorited ? "已更新收藏" : "已收藏参考图");
    } catch (err: any) {
      toast.error(err?.message || "收藏失败");
    } finally {
      setIsSavingFavoriteReference(false);
    }
  };

  const removeFavoriteReference = async (id: string) => {
    const removed = favoriteReferences.find((item) => item.id === id);
    if (!removed) return;
    setFavoriteReferences((prev) => prev.filter((item) => item.id !== id));
    if (store.referenceImage?.url === removed.url) {
      store.setReferenceImage(null);
      setCustomRefPreview(null);
    }
    try {
      const res = await fetch(`/api/tryon/reference-favorites/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "删除失败");
      toast.success("已移除收藏");
    } catch (err: any) {
      setFavoriteReferences((prev) => [removed, ...prev].slice(0, 24));
      toast.error(err?.message || "删除失败");
    }
  };

  function normalizeFavoriteReference(value: unknown): FavoriteReference | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.url !== "string") return null;
    return {
      id: record.id,
      url: record.url,
      label: typeof record.label === "string" && record.label.trim() ? record.label : "收藏参考图",
      category: normalizeReferenceCategory(record.category),
      is_preset: false,
      user_id: null,
    };
  }

  function normalizeReferenceCategory(value: unknown): FavoriteReference["category"] {
    return value === "style" || value === "pose" || value === "scene" ? value : "scene";
  }

  useEffect(() => {
    return () => cancelRulesHide();
  }, []);

  useEffect(() => {
    return () => {
      generationSubmitRef.current?.controller.abort();
      generationSubmitRef.current = null;
      statusWatcherControllersRef.current.forEach((controller) => controller.abort());
      statusWatcherControllersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!authChecked) return;
    if (!isAuthenticated) {
      setFavoriteReferences([]);
      setIsLoadingFavoriteReferences(false);
      return;
    }

    setIsLoadingFavoriteReferences(true);
    fetch("/api/tryon/reference-favorites")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "收藏加载失败");
        return Array.isArray(data.favorites)
          ? data.favorites.map(normalizeFavoriteReference).filter(Boolean) as FavoriteReference[]
          : [];
      })
      .then((items) => {
        if (!cancelled) setFavoriteReferences(items.slice(0, 24));
      })
      .catch((err: any) => {
        if (!cancelled) toast.error(err?.message || "收藏加载失败");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingFavoriteReferences(false);
      });

    return () => { cancelled = true; };
  }, [authChecked, isAuthenticated]);

  useEffect(() => {
    if (sceneMode !== "favorites" || isLoadingFavoriteReferences || favoriteReferences.length === 0) return;
    if (favoriteReferences.some((item) => item.url === store.referenceImage?.url)) return;
    applyFavoriteReference(favoriteReferences[0]);
  }, [sceneMode, isLoadingFavoriteReferences, favoriteReferences, store.referenceImage?.url]);

  useEffect(() => {
    if (!aspects.find(a => a.value === aspectRatio)) setAspectRatio("3:4");
    const nextImageSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextImageSizes.includes(imageSize)) setImageSize(nextImageSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  useEffect(() => {
    if (!hasModelFace || !isNanoBananaModel(aiModel)) return;
    setAiModel("gpt-image-2");
    toast.info(TRYON_FACE_MODEL_BANANA_NOTICE);
  }, [aiModel, hasModelFace]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
    const payload = await takeApplyPayload("tryon");
    if (cancelled || !payload) return;

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
      const presetModel = findPresetModelByUrl(payload.modelFaceUrl);
      if (presetModel) {
        setCustomModelPreview(null);
        store.setSelectedModel({ ...presetModel, is_preset: true, user_id: null });
      } else {
        setCustomModelPreview(payload.modelFaceUrl);
        store.setSelectedModel({
          id: "history-model",
          name: "历史模特",
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
    const presetReference = findPresetReferenceByUrl(payload.referenceUrl);
    const appliedSceneMode = payload.sceneMode || (presetReference ? "system_reference" : payload.referenceUrl ? "upload_reference" : "auto_design");
    if (appliedSceneMode !== "auto_design" && payload.referenceUrl) {
      if (presetReference) {
        setCustomRefPreview(null);
        store.setReferenceImage({ ...presetReference, is_preset: true, user_id: null } as any);
      } else {
        setCustomRefPreview(payload.referenceUrl);
        store.setReferenceImage({
          id: "history-reference",
          url: payload.referenceUrl,
          label: "历史参考",
          category: "style",
          is_preset: false,
          user_id: null,
        });
      }
    } else {
      setCustomRefPreview(null);
      store.setReferenceImage(null);
    }
    setSceneMode(appliedSceneMode);
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
      clothingRoles: payload.clothingRoles,
      referenceUrl: appliedSceneMode === "auto_design" ? null : payload.referenceUrl,
      modelFaceUrl: payload.modelFaceUrl,
    }));
    toast.success("已套用历史参数");
    })();
    return () => {
      cancelled = true;
    };
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
          garment_category: isIntimateGarment ? "intimate" : "regular",
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
    if (isUploading) {
      toast.info("图片上传中，请稍候再切换模式");
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
    toast.success(`已从作品库加入${TRYON_CLOTHING_ROLE_LABELS[nextRole] || "服装"}`);
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
    setShowClothingRules(false);
    setRulesPopoverStyle(null);
    toast.success(`已套用${demo.title}`);
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
    toast.success(`已套用${image.title}`);
  };

  // ---- 文件处理：选择后立即上传到图床 ----
  const processFiles = async (files: FileList | File[], targetRole: TryOnClothingRole = pendingClothingRole) => {
    if (isUploading) {
      toast.info("图片上传中，请稍候");
      return;
    }
    const arr = Array.from(files);
    if (!arr.length) return;

    const rolePlan: TryOnClothingRole[] = clothingMode === "multi" && arr.length > 1
      ? (["upper", "lower"] as TryOnClothingRole[]).slice(0, arr.length)
      : [clothingMode === "multi" ? targetRole === "lower" ? "lower" : "upper" : "single"];
    const filesToUpload = arr.slice(0, rolePlan.length);

    if (arr.length > filesToUpload.length) {
      toast.info(clothingMode === "multi" ? "换上下装最多一次处理上装和下装各 1 张" : "换连体只需上传 1 张服装图");
    }

    setIsUploading(true);
    setUploadingClothingRoles([...new Set(rolePlan.slice(0, filesToUpload.length))]);
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
        toast.success(clothingMode === "multi" ? "服装槽位已就绪" : "连体服装已就绪");
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
    setPromptOverride(null);
    store.setPromptUsed("");
  };

  const handleCustomModelFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("请上传图片文件");
    if (file.size > MAX_FILE_SIZE) return toast.error(`${file.name} 超过 ${MAX_FILE_SIZE_MB}MB`);

    toast.info("正在上传模特图...");
    try {
      const base64 = await fileToBase64(file);
      setCustomModelPreview(base64);
      const result = await uploadImage(file);
      store.setSelectedModel({ id: "custom", name: "自定义", image_url: result.url, gender: "female", is_preset: false, user_id: null });
      setPromptOverride(null);
      toast.success("模特已选择");
    } catch {
      setCustomModelPreview(null);
      toast.error("模特图上传失败，请重试");
    }
  };

  const handleCustomModel = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    void handleCustomModelFile(file).finally(() => {
      input.value = "";
    });
  };

  const handleCustomRefFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("请上传图片文件");
    if (file.size > MAX_FILE_SIZE) return toast.error(`${file.name} 超过 ${MAX_FILE_SIZE_MB}MB`);

    toast.info("正在上传参考图...");
    try {
      const base64 = await fileToBase64(file);
      setCustomRefPreview(base64);
      const result = await uploadImage(file);
      store.setReferenceImage({ id: "custom", url: result.url, label: "自定义参考", category: "style", is_preset: false, user_id: null });
      setSceneMode("upload_reference");
      setPromptOverride(null);
      store.setPromptUsed("");
      toast.success("参考图已选择");
    } catch {
      setCustomRefPreview(null);
      toast.error("参考图上传失败，请重试");
    }
  };

  const handleCustomRef = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    void handleCustomRefFile(file).finally(() => {
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

  const watchGeneration = useCallback(async (generationId: string, expectedCount: number) => {
    if (watchedGenerationIdsRef.current.has(generationId)) return;
    const globalWatcher = activeTryOnStatusWatchers.get(generationId);
    if (globalWatcher && !globalWatcher.signal.aborted) return;

    const watcherController = new AbortController();
    activeTryOnStatusWatchers.set(generationId, watcherController);
    statusWatcherControllersRef.current.set(generationId, watcherController);
    watchedGenerationIdsRef.current.add(generationId);
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
      while (!watcherController.signal.aborted && Date.now() - startedAt < TRYON_STATUS_POLL_TIMEOUT_MS) {
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
          const pollRes = await fetchTryOnGenerationStatus(generationId, watcherController.signal);
          if (!pollRes.ok) continue;

          const pollData = await pollRes.json();
          if (pollData.status === "processing_tryon" || pollData.status === "processing" || pollData.status === "pending") {
            const partialResultUrls = Array.isArray(pollData.result_urls) ? pollData.result_urls.filter(Boolean) : [];
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
              resultCount: partialResultUrls.length,
              ...(partialResultUrls.length ? {
                resultThumbnails: partialResultUrls,
                thumbnails: partialResultUrls.slice(0, 2),
              } : {}),
            });
            if (Date.now() - lastQueueRefreshAt >= TRYON_STATUS_QUEUE_REFRESH_MS) {
              lastQueueRefreshAt = Date.now();
              refreshTaskQueue();
            }
            continue;
          }

          if (pollData.status === "completed") {
            const resultUrls = Array.isArray(pollData.result_urls) ? pollData.result_urls.filter(Boolean) : [];
            if (isActive) {
              store.updateProgress(100);
              store.setResult(resultUrls);
              toast.success("生成完成");
            }
            updateActiveTask({
              status: "completed",
              statusGroup: "completed",
              progress: 100,
              resultCount: resultUrls.length,
              expectedCount: Math.max(expectedCount, resultUrls.length || 1),
              resultThumbnails: resultUrls,
              thumbnails: resultUrls.slice(0, 2),
              completedAt: new Date().toISOString(),
            });
            refreshTaskQueue();
            return;
          }

          if (pollData.status === "failed") {
            const message = pollData.error || "生成失败";
            if (isActive) {
              store.setError(message);
              toast.error(message);
            }
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
        const message = "生成超时";
        store.setError(message);
        updateActiveTask({ status: "timeout", statusGroup: "failed", error: message, progress: 100 });
        toast.error(message);
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
  }, [refreshTaskQueue, store, taskQueue]);

  const handleContinueCreate = useCallback(() => {
    cancelTaskSelection();
    const pendingSubmitId = generationSubmitRef.current?.id || "";
    generationSubmitRef.current?.controller.abort();
    statusWatcherControllersRef.current.forEach((controller) => controller.abort());
    statusWatcherControllersRef.current.clear();
    if (pendingSubmitId.startsWith("local-")) removeTaskQueueItem(pendingSubmitId);
    generationSubmitRef.current = null;
    activeGenerationRef.current = null;
    setActiveQueueTask(null);
    setIsSubmitting(false);
    setUploadedClothingUrls([]);
    setClothingRoles([]);
    setCustomModelPreview(null);
    setCustomRefPreview(null);
    setPromptOverride(null);
    setActiveTaskReferences([]);
    setSceneMode("auto_design");
    setAutoDesign(DEFAULT_AUTO_DESIGN);
    store.reset();
  }, [cancelTaskSelection, removeTaskQueueItem, store]);

  const applyTryOnHistoryPayload = useCallback((
    payload: TryOnHistoryPayload,
    options?: { resultUrls?: string[]; selectedTask?: TaskQueueItem | null; errorMessage?: string | null; silent?: boolean }
  ) => {
    const files = payload.clothingUrls.map((_, index) =>
      new File([], `history-clothing-${index + 1}.jpg`, { type: "image/jpeg" })
    );
    store.setClothing(files, payload.clothingUrls);
    setUploadedClothingUrls(payload.clothingUrls);

    const nextClothingMode = normalizeTryOnClothingMode(
      payload.clothingMode || (payload.clothingUrls.length > 1 ? "multi" : "single")
    );
    setClothingMode(nextClothingMode);
    setClothingRoles(payload.clothingUrls.map((_, index) => normalizeTryOnClothingRole(
      payload.clothingRoles?.[index],
      nextClothingMode === "multi" ? index === 0 ? "upper" : index === 1 ? "lower" : "extra" : "single"
    )));
    setGarmentAudience(normalizeTryOnGarmentAudience(payload.garmentAudience));
    setAgeGroup(normalizeTryOnAgeGroup(payload.ageGroup));

    if (payload.modelFaceUrl) {
      const presetModel = findPresetModelByUrl(payload.modelFaceUrl);
      if (presetModel) {
        setCustomModelPreview(null);
        store.setSelectedModel({ ...presetModel, is_preset: true, user_id: null });
      } else {
        setCustomModelPreview(payload.modelFaceUrl);
        store.setSelectedModel({
          id: "history-model",
          name: "历史模特",
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

    const presetReference = findPresetReferenceByUrl(payload.referenceUrl);
    const appliedSceneMode = payload.sceneMode || (presetReference ? "system_reference" : payload.referenceUrl ? "upload_reference" : "auto_design");
    if (appliedSceneMode !== "auto_design" && payload.referenceUrl) {
      if (presetReference) {
        setCustomRefPreview(null);
        store.setReferenceImage({ ...presetReference, is_preset: true, user_id: null } as any);
      } else {
        setCustomRefPreview(payload.referenceUrl);
        store.setReferenceImage({
          id: "history-reference",
          url: payload.referenceUrl,
          label: "历史参考",
          category: "style",
          is_preset: false,
          user_id: null,
        });
      }
    } else {
      setCustomRefPreview(null);
      store.setReferenceImage(null);
    }

    setSceneMode(appliedSceneMode);
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
      clothingRoles: payload.clothingRoles,
      referenceUrl: appliedSceneMode === "auto_design" ? null : payload.referenceUrl,
      modelFaceUrl: payload.modelFaceUrl,
    }));
    store.setResult(options?.resultUrls || []);
    store.setError(options?.errorMessage || null);
    activeGenerationRef.current = null;
    setActiveQueueTask(options?.selectedTask ?? null);
    if (!options?.silent) toast.success("已套用历史参数");
  }, [store]);

  const handleTaskSelect = useCallback(async (item: TaskQueueItem, railSelection?: TaskSelectionSession) => {
    const selection = beginTaskSelection(item.id, railSelection?.reason ?? "manual");
    setActiveTaskReferences([]);

    if (isTaskRunning(item)) {
      const expectedCount = clampTaskExpectedCount(item, 1, 4);
      const partialResultUrls = safeTaskQueueUrls(item.resultThumbnails);
      const progress = Math.min(Math.max(Math.round(Number(item.progress) || 10), 1), 99);
      activeGenerationRef.current = item.id;
      setActiveQueueTask(item);
      setGenCount(expectedCount);
      store.startGeneration();
      if (partialResultUrls.length) store.setPartialResult(partialResultUrls);
      store.updateProgress(progress);
      try {
        const detail = await fetchHistoryApplyDetail(item.id, "tryon", selection.signal);
        if (!selection.isCurrent()) return;
        const nextExpectedCount = clampTaskExpectedCount(
          { ...item, expectedCount: detail.payload.genCount },
          1,
          4,
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
        const errorMessage = isFailedTask ? item.error || "任务失败，可重新生成" : null;
        activeGenerationRef.current = null;
        setActiveQueueTask(item);
        store.setResult(resultUrls);
        store.setError(errorMessage);
        try {
          const detail = await fetchHistoryApplyDetail(item.id, "tryon", selection.signal);
          if (!selection.isCurrent()) return;
          applyTryOnHistoryPayload(detail.payload, {
            resultUrls: detail.resultUrls.length ? detail.resultUrls : resultUrls,
            selectedTask: item,
            errorMessage,
            silent: selection.reason === "restore",
          });
        } catch (err: any) {
          if (selection.signal.aborted || !selection.isCurrent()) return;
          toast.error(err?.message || "历史参数加载失败");
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
        store.setError(item.error || "任务失败，可重新生成");
      }
      selection.finish();
      return;
    }
  }, [applyTryOnHistoryPayload, beginTaskSelection, router, store, watchGeneration]);

  const handleGenerate = async (promptForRun?: string) => {
    if (isSubmitting || generationSubmitRef.current) return;
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    if (!uploadedClothingUrls.length) { toast.error("请上传衣服"); return; }
    if (isIntimateGarment && ageGroup !== "adult") {
      toast.error("内衣/泳衣类服装仅支持成人模特生成");
      return;
    }
    if (credits !== null && credits < totalCost) { toast.error(`积分不足 ${totalCost}，余额 ${credits}`); return; }

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
      referenceUrl: effectiveReferenceUrl,
      modelFaceUrl: store.selectedModel?.image_url,
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
      expectedCount: genCount,
      resultCount: 0,
      inputThumbnails: taskInputThumbnails,
      resultThumbnails: [],
      thumbnails: taskInputThumbnails.slice(0, 2),
      applyUrl: "",
    });
    setActiveQueueTask(provisionalTask);
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
        signal: submitController.signal,
        body: JSON.stringify({
          clothing_urls: uploadedClothingUrls,
          clothing_mode: clothingMode,
          clothing_roles: clothingRoles,
          garment_audience: garmentAudience,
          age_group: ageGroup,
          garment_category: isIntimateGarment ? "intimate" : "regular",
          is_intimate_garment: isIntimateGarment,
          model_face_url: store.selectedModel?.image_url,
          reference_url: effectiveReferenceUrl,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          style: usedAiPrompt ? undefined : finalStyle,
          raw_prompt: usedAiPrompt ? finalStyle : undefined,
          gen_count: genCount,
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
        throw new Error(e.error || "生成失败");
      }

      const { generation_id, credits_remaining } = await res.json();
      if (!isCurrentSubmit()) return;
      if (credits_remaining !== undefined) {
        setCredits(credits_remaining);
        if (userId) setCachedProfileCredits(userId, credits_remaining);
      }
      store.updateProgress(25);

      if (!generation_id) throw new Error("任务提交失败");
      const now = new Date().toISOString();
      const optimisticTask: TaskQueueItem = {
        id: generation_id,
        module: "tryon",
        title: "服装上身",
        status: "processing_tryon",
        statusGroup: "running",
        time: "0:00",
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        error: "",
        progress: 25,
        expectedCount: genCount,
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
      toast.success("任务已提交，可继续创建");
      setIsSubmitting(false);
      generationSubmitRef.current = null;
      void watchGeneration(generation_id, genCount);
      return;
    } catch (err: any) {
      if (err?.name === "AbortError" || !isCurrentSubmit()) return;
      store.setError(err.message);
      setActiveQueueTask((prev) => prev?.id === provisionalTaskId ? null : prev);
      removeTaskQueueItem(provisionalTaskId);
      toast.error(err.message);
      setIsSubmitting(false);
      generationSubmitRef.current = null;
    }
  };

  const handleRepairGenerate = (repairValue: string) => {
    const repairedPrompt = applyRepairPrompt(finalPrompt, "tryon", repairValue);
    setPromptOverride(repairedPrompt);
    store.setPromptUsed(repairedPrompt);
    toast.info("已加入修复指令，正在重新生成...");
    handleGenerate(repairedPrompt);
  };

  const resultStatus: StudioResultStatus = store.error
      ? "error"
      : store.isGenerating || store.resultUrls.length > 0
        ? "results"
        : "empty";
  const retryDisabled = store.isGenerating || Boolean(applyingTaskId);
  const runDisabled = isSubmitting || !uploadedClothingUrls.length;
  const authIsAnonymous = authChecked && !isAuthenticated;
  const runDisabledReason = isSubmitting
    ? "正在提交任务，请稍候。"
    : !uploadedClothingUrls.length
      ? "请先上传服装图，或从作品库选择一张历史结果。"
      : undefined;

  return (
    <>
      <StudioPageShell
        activeFeature="tryon"
        taskRail={(
          <StudioTaskRail
            module="tryon"
            moduleLabel="服装上身"
            onContinue={handleContinueCreate}
            onSelectTask={handleTaskSelect}
          />
        )}
        header={(
          <ModuleHeader
            title="服装上身"
            tooltip="按上装、下装或连体槽位上传服装，选择模特与参考场景，生成可直接用于商品展示、主图延展和内容投放的成片。"
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
                图片规则 <ChevronRight className="h-3 w-3" />
              </button>
            )}
          />
        )}
        controlPanel={(
          <StudioControlPanel>
          {/* ---- 服装（整个区域可拖拽） ---- */}
          <StudioSection
            title="上传服装"
            description={currentUploadRule.uploadSpecText}
            badge={isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" /> : null}
            {...clothingDrag.dragHandlers}
            className={`studio-clothing-upload-section studio-stable-upload-boundary relative rounded-xl transition-all ${isDraggingClothing ? "ring-2 ring-[rgba(91,124,255,0.38)] ring-offset-2" : ""}`}
          >
            {/* 拖拽遮罩 */}
            {isDraggingClothing && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-[rgba(91,124,255,0.48)] bg-[rgba(91,124,255,0.10)] pointer-events-none">
                <div className="text-center">
                  <Upload className="w-8 h-8 mx-auto text-[var(--codex-accent)] mb-1" />
                  <p className="text-sm font-medium text-[var(--codex-accent)]">松开上传服装</p>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple={clothingMode === "multi"}
              className="hidden"
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
              ariaLabel="选择服装上身模式"
              onChange={switchClothingMode}
              options={[
                { value: "multi", label: TRYON_CLOTHING_MODE_LABELS.multi, description: "上装 + 下装", disabled: isUploading },
                { value: "single", label: TRYON_CLOTHING_MODE_LABELS.single, description: "连体 / 全身", disabled: isUploading },
              ]}
            />

            {clothingMode === "single" ? (
              <div className="studio-clothing-slot-stack" data-mode="single">
                <StudioUploadTile
                  title="上传 / 拖拽【连体/全身】"
                  description="图1会按连衣裙、套装或全身服装处理，建议主体完整、边缘清晰。"
                  imageUrl={singleClothing?.preview}
                  imageAlt="已上传的连体/全身服装"
                  isDragging={isDraggingClothing}
                  disabled={isUploading}
                  loading={isUploading && uploadingClothingRoles.includes("single")}
                  supportBadge="1张服装图"
                  onUploadClick={() => openClothingPicker("single")}
                  onLibraryClick={() => sourceLibrary.open("single")}
                  onPreview={singleClothing ? () => openLightbox(singleClothing.preview, "已上传的连体/全身服装") : undefined}
                  onRemove={singleClothing ? () => removeClothing(0) : undefined}
                  onDropFile={(file) => {
                    if (file) processFiles([file], "single");
                  }}
                  dragContext={clothingDrag}
                  libraryLabel="从资源库导入"
                  footnote="连体/全身服装建议主体完整、边缘清晰、无遮挡，生成会更稳定。"
                  examples={{
                    label: "试一试",
                    images: TRYON_UPLOAD_SLOT_EXAMPLES.overall,
                    disabled: isUploading,
                    onSelect: (image) => applyRuleImage(image as TryOnRuleImage),
                  }}
                />
              </div>
            ) : (
              <div className="studio-clothing-slot-stack" data-mode="multi">
                {([
                  ["upper", "上传 / 拖拽【上装】", upperClothing],
                  ["lower", "上传 / 拖拽【下装】", lowerClothing],
                ] as const).map(([role, title, item]) => {
                  const itemIndex = clothingItems.findIndex((clothing) => clothing.role === role);
                  return (
                    <div key={role} className="studio-clothing-slot-card">
                      <StudioUploadTile
                        title={title}
                        description={`${TRYON_CLOTHING_ROLE_LABELS[role]}会锁定到对应身体区域，可单独上传也可上下装组合。`}
                        imageUrl={item?.preview}
                        imageAlt={`已上传的${TRYON_CLOTHING_ROLE_LABELS[role]}`}
                        isDragging={isDraggingClothing}
                        disabled={isUploading}
                        loading={isUploading && uploadingClothingRoles.includes(role)}
                        supportBadge="可单独上传"
                        onUploadClick={() => openClothingPicker(role)}
                        onLibraryClick={() => sourceLibrary.open(role)}
                        onPreview={item ? () => openLightbox(item.preview, `已上传的${TRYON_CLOTHING_ROLE_LABELS[role]}`) : undefined}
                        onRemove={item && itemIndex >= 0 ? () => removeClothing(itemIndex) : undefined}
                        onDropFile={(file) => {
                          if (file) processFiles([file], role);
                        }}
                        dragContext={clothingDrag}
                        libraryLabel="从资源库导入"
                        footnote="款式图上传无遮挡、无码图；平铺、人台或干净上身图效果更稳。"
                        examples={{
                          label: "试一试",
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

            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-slate-100 bg-white/70 px-3 py-2 text-xs text-slate-700 transition-colors hover:border-violet-200">
              <input
                type="checkbox"
                checked={isIntimateGarment}
                onChange={(event) => updateIntimateGarment(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <span>
                <span className="font-semibold">上传服装为内衣、泳衣、情趣内衣类服装</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">
                  勾选后按成人商品图安全处理，生成会避免裸露、挑逗姿势和未成年人场景。
                </span>
              </span>
            </label>
          </StudioSection>

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
            {...referenceDrag.dragHandlers}
            className={`studio-stable-upload-boundary relative rounded-xl transition-all ${isDraggingRef ? "ring-2 ring-[rgba(91,124,255,0.38)] ring-offset-2" : ""}`}
          >
            {isDraggingRef && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-[rgba(91,124,255,0.48)] bg-[rgba(91,124,255,0.10)] pointer-events-none">
                <div className="text-center">
                  <Upload className="w-8 h-8 mx-auto text-[var(--codex-accent)] mb-1" />
                  <p className="text-sm font-medium text-[var(--codex-accent)]">松开上传参考图</p>
                </div>
              </div>
            )}
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Image className="w-4 h-4 text-purple-500" /> 参考图 / 场景
                </h3>
                <p className="mt-1 text-[11px] text-gray-400">智能模式不使用参考图；预设、上传、收藏会作为参考来源</p>
              </div>
              {store.referenceImage && sceneMode !== "auto_design" && (
                <button
                  onClick={addCurrentReferenceToFavorites}
                  disabled={isSavingFavoriteReference}
                  className="px-2 py-1 rounded-full border text-[10px] text-gray-500 hover:text-purple-600 hover:border-purple-300 disabled:opacity-50"
                >
                  {isSavingFavoriteReference ? "保存中" : isCurrentReferenceFavorited ? "已收藏" : "收藏"}
                </button>
              )}
            </div>

            <StudioOptionGrid
              options={SCENE_MODE_TABS.map((tab) => ({
                value: tab.value,
                label: tab.label,
              }))}
              value={sceneMode}
              onChange={switchSceneMode}
              columns={4}
              ariaLabel="参考图 / 场景"
              className="mb-3"
            />

            {sceneMode === "system_reference" && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 p-3">
                <p className="mb-2 text-[11px] font-medium text-gray-500">选择系统参考图，姿势、场景、构图会以参考图为最高优先级</p>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_REFERENCES.map((ref) => (
                    <div key={ref.id} role="button" tabIndex={0}
                      aria-label={`选择系统参考图：${ref.label}`}
                      onClick={() => {
                        switchSceneMode("system_reference");
                        applyPresetReference(ref);
                      }}
                      onKeyDown={(event) => handlePreviewKeyDown(event, () => {
                        switchSceneMode("system_reference");
                        applyPresetReference(ref);
                      })}
                      className={`group relative rounded-lg overflow-hidden border-2 bg-white transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                        store.referenceImage?.id === ref.id ? "border-purple-500 ring-1 ring-purple-200" : "border-transparent hover:border-gray-300"
                      }`}>
                      <ImgSkeleton src={ref.url} alt={`系统参考图：${ref.label}`} className="w-full aspect-[3/4] object-cover" />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openLightbox(ref.url, `系统参考图：${ref.label}`); }}
                        onKeyDown={(e) => { e.stopPropagation(); }}
                        className="absolute right-1 top-1 w-7 h-7 rounded-full bg-white/85 shadow-sm flex items-center justify-center opacity-100 transition-opacity hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                        aria-label={`预览系统参考图：${ref.label}`}
                        title={`预览系统参考图：${ref.label}`}
                      >
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
                <input ref={customRefInputRef} type="file" accept="image/*" className="hidden" onChange={handleCustomRef} />
                {selectedReferencePreviewUrl ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => openLightbox(selectedReferencePreviewUrl, "已上传的参考图")}
                      className="studio-fixed-upload-slot group w-full rounded-xl border-2 border-dashed border-gray-200 bg-white hover:border-purple-300 flex flex-col items-center justify-center overflow-hidden transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                      style={{ "--studio-fixed-upload-height": "132px" } as CSSProperties}
                      aria-label="放大预览上传参考图"
                    >
                      <img src={selectedReferencePreviewUrl} alt="已上传的参考图" className="h-full w-full object-contain p-2" />
                      <span className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm transition group-hover:bg-white">
                        <ZoomIn className="h-4 w-4" />
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => customRefInputRef.current?.click()}
                      className="absolute bottom-2 right-2 z-10 rounded-full bg-white/92 px-3 py-1 text-[11px] font-bold text-slate-600 shadow-sm transition hover:bg-white hover:text-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                    >
                      更换
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => customRefInputRef.current?.click()}
                    className="studio-fixed-upload-slot w-full rounded-xl border-2 border-dashed border-gray-200 bg-white hover:border-purple-300 flex flex-col items-center justify-center overflow-hidden transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                    style={{ "--studio-fixed-upload-height": "132px" } as CSSProperties}
                    aria-label="上传参考图"
                  >
                    <Camera className="w-6 h-6 text-gray-300 mb-2" />
                    <span className="text-xs text-gray-500">上传参考图</span>
                    <span className="text-[11px] text-gray-400 mt-1">用于锁定姿势、背景、构图和镜头</span>
                  </button>
                )}
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
              <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <div>
                  <p className="mb-2 text-xs font-bold text-gray-800">摄影方案</p>
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
                    ariaLabel="摄影方案"
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold text-gray-800">构图</p>
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
                    ariaLabel="构图"
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold text-gray-800">背景</p>
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
                    ariaLabel="背景"
                  />
                </div>
              </div>
            )}

            {sceneMode === "favorites" && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 p-3">
                {authIsAnonymous ? (
                  <div className="py-8 text-center text-xs text-gray-400">登录后查看收藏参考图</div>
                ) : isLoadingFavoriteReferences ? (
                  <div className="py-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    加载收藏中
                  </div>
                ) : favoriteReferences.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-400">还没有收藏参考图</div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {favoriteReferences.map((ref) => (
                      <div key={ref.id} role="button" tabIndex={0}
                        aria-label={`选择收藏参考图：${ref.label}`}
                        onClick={() => {
                          switchSceneMode("favorites");
                          applyFavoriteReference(ref);
                        }}
                        onKeyDown={(event) => handlePreviewKeyDown(event, () => {
                          switchSceneMode("favorites");
                          applyFavoriteReference(ref);
                        })}
                        className={`group relative rounded-lg overflow-hidden border-2 bg-white transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                          store.referenceImage?.url === ref.url ? "border-purple-500 ring-1 ring-purple-200" : "border-transparent hover:border-gray-300"
                        }`}>
                        <ImgSkeleton src={ref.url} alt={`收藏参考图：${ref.label}`} className="w-full aspect-[3/4] object-cover" />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openLightbox(ref.url, `收藏参考图：${ref.label}`); }}
                          onKeyDown={(e) => { e.stopPropagation(); }}
                          className="absolute left-1 top-1 w-6 h-6 rounded-full bg-white/85 shadow-sm flex items-center justify-center opacity-100 transition-opacity hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                          aria-label={`预览收藏参考图：${ref.label}`}
                          title={`预览收藏参考图：${ref.label}`}
                        >
                          <ZoomIn className="w-3 h-3 text-gray-500" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeFavoriteReference(ref.id); }}
                          onKeyDown={(e) => { e.stopPropagation(); }}
                          className="absolute right-1 top-1 w-6 h-6 rounded-full bg-white/85 shadow-sm flex items-center justify-center opacity-100 transition-opacity hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                          aria-label={`移除收藏参考图：${ref.label}`}
                          title={`移除收藏参考图：${ref.label}`}
                        >
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
            {...modelDrag.dragHandlers}
            className={`studio-stable-upload-boundary relative rounded-xl transition-all ${isDraggingModel ? "ring-2 ring-[rgba(91,124,255,0.38)] ring-offset-2" : ""}`}
          >
            {/* 拖拽遮罩 */}
            {isDraggingModel && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-[rgba(91,124,255,0.48)] bg-[rgba(91,124,255,0.10)] pointer-events-none">
                <div className="text-center">
                  <Upload className="w-8 h-8 mx-auto text-[var(--codex-accent)] mb-1" />
                  <p className="text-sm font-medium text-[var(--codex-accent)]">松开上传模特图</p>
                </div>
              </div>
            )}
            <h3 className="font-bold text-sm mb-1 flex items-center gap-2">
              <UserRound className="w-4 h-4 text-purple-500" /> 模特 <span className="text-purple-400 font-normal text-xs">· 控制脸部</span>
              <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 text-[9px]">可选</span>
            </h3>
            <p className="text-[11px] text-gray-400 mb-3">不选则使用参考图中的人物面部 · 可拖拽图片到此处</p>
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
                  aria-label={`选择模特：${m.name}`}
                  onClick={() => {
                    setCustomModelPreview(null);
                    store.setSelectedModel({ ...m, is_preset: true, user_id: null });
                    setPromptOverride(null);
                  }}
                  onKeyDown={(event) => handlePreviewKeyDown(event, () => {
                    setCustomModelPreview(null);
                    store.setSelectedModel({ ...m, is_preset: true, user_id: null });
                    setPromptOverride(null);
                  })}
                  className={`group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                    store.selectedModel?.id === m.id ? "border-purple-500 ring-1 ring-purple-200" : "border-transparent hover:border-gray-300"
                  }`}>
                  <ImgSkeleton src={m.image_url} alt={`模特：${m.name}`} className="w-full aspect-square object-cover" />
                  <div className="absolute inset-0 pointer-events-none flex items-end justify-end bg-violet-950/0 p-1 opacity-100 transition-all sm:opacity-0 sm:group-hover:bg-violet-950/10 sm:group-hover:opacity-100 sm:group-focus-within:bg-violet-950/10 sm:group-focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openLightbox(m.image_url, `模特：${m.name}`); }}
                      onKeyDown={(e) => { e.stopPropagation(); }}
                      className="pointer-events-auto w-7 h-7 rounded-full bg-white/80 flex items-center justify-center hover:bg-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                      aria-label={`预览模特：${m.name}`}
                      title={`预览模特：${m.name}`}
                    >
                      <ZoomIn className="w-3.5 h-3.5 text-gray-600" />
                    </button>
                  </div>
                  <div className="p-1 text-center"><span className="text-[10px] font-medium">{m.name}</span></div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => customModelInputRef.current?.click()}
                className="rounded-lg border-2 border-dashed border-gray-200 hover:border-purple-300 flex flex-col items-center justify-center aspect-square transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                aria-label={customModelPreview ? "更换上传模特图" : "上传模特图"}
              >
                {customModelPreview
                  ? <img src={customModelPreview} alt="已上传的模特图" className="h-full w-full rounded-lg object-contain p-1" />
                  : <><Camera className="w-5 h-5 text-gray-300" /><span className="text-[10px] text-gray-400">点击上传</span></>
                }
              </button>
              <input ref={customModelInputRef} type="file" accept="image/*" className="hidden" onChange={handleCustomModel} />
            </div>
          </section>

          {/* ---- 生成模型 ---- */}
          <section>
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" /> 生成模型
            </h3>
            <StudioModelSelector
              models={selectableModels}
              value={aiModel}
              onChange={(value) => {
                if (hasModelFace && isNanoBananaModel(value)) {
                  toast.info(TRYON_FACE_MODEL_BANANA_NOTICE);
                  return;
                }
                setAiModel(value);
              }}
              ariaLabel="生成模型"
              getMeta={(model) => (
                hasModelFace && isNanoBananaModel(model.value)
                  ? "带模特脸时暂不可用"
                  : `${model.desc} · 当前${getCreditCost(model.value, imageSize, aspectRatio)}分`
              )}
            />
            {hasModelFace && (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                已选择模特脸，Banana 会临时关闭。当前推荐用 GPT-Image-2 做“参考图 + 模特脸”融合；如果想保留 Banana 的换装质感，先取消模特脸完成换装，再去
                <a href="/face-swap" className="mx-1 font-bold text-amber-900 underline decoration-amber-400 underline-offset-2">换脸模块</a>
                替换脸部。
              </div>
            )}
          </section>

          {/* ---- 比例 ---- */}
          <section>
            <h3 className="font-bold text-sm mb-3">图片比例</h3>
            <StudioOptionGrid options={aspects} value={aspectRatio} onChange={setAspectRatio} ariaLabel="图片比例" />
          </section>

          {/* ---- 分辨率 ---- */}
          {imageSizes.length > 1 && (
            <section>
              <h3 className="font-bold text-sm mb-3">分辨率</h3>
              <StudioOptionGrid
                options={imageSizes.map((size) => ({ value: size, label: `${size} · ${getCreditCost(aiModel, size, aspectRatio)}积分` }))}
                value={imageSize}
                onChange={setImageSize}
                ariaLabel="分辨率"
              />
            </section>
          )}

          {/* ---- 细节补充 + 智能整理 ---- */}
          <section>
            <StudioPromptTextarea
              title="补充要求"
              badge="可选"
              value={customStyle}
              onChange={(e) => { setCustomStyle(e.target.value); setPromptOverride(null); store.setPromptUsed(""); }}
              placeholder="可选：补充不改变主风格的细节要求，如面料、肤色、光线、商品细节..."
              rows={4}
              action={(
                <button
                  type="button"
                  onClick={handleOptimizePrompt}
                  disabled={optimizing || !customStyle.trim()}
                  className="studio-prompt-icon-action"
                  title="智能整理提示词"
                >
                  {optimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
                </button>
              )}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {STYLE_PRESETS.map((s, i) => (
                <button key={i} onClick={() => { setCustomStyle(s); setPromptOverride(null); store.setPromptUsed(""); }}
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
          <StudioSection title="生成数量" description="结果张数越多，消耗积分越高。">
            <StudioGenerationCountSelector
              value={genCount}
              onChange={setGenCount}
              ariaLabel="选择生成数量"
            />
          </StudioSection>
          </StudioControlPanel>
        )}
        runBar={(
          <StudioRunBar
            summary={`${TRYON_CLOTHING_MODE_LABELS[clothingMode]} · ${store.clothingFiles.length} 张输入 · ${costPerImage} × ${genCount} 张`}
            costLabel={authIsAnonymous ? "登录后查看积分" : `消耗 ${totalCost} · 余额 ${credits ?? "—"}`}
            disabled={runDisabled}
            disabledReason={runDisabledReason}
            primaryLabel={authIsAnonymous ? "登录后生成" : isSubmitting ? "提交中..." : `生成 ${genCount} 张`}
            isLoading={isSubmitting}
            onPrimaryAction={() => handleGenerate()}
          />
        )}

        canvas={(
          <StudioResultViewport
            status={resultStatus}
            emptyState={(
              <div className="flex min-h-[320px] items-center justify-center p-4 sm:min-h-[420px] lg:h-full">
                <StudioEmptyState
                  title="开始制作服装上身图"
                  description="先选择上装、下装或连体槽位，再选择模特和场景，生成可直接用于商品展示的成片。"
                  imageSrc="https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/model-striped-top-white-skirt.png"
                  imageAlt="服装上身指引"
                  steps={[
                    { title: "选择槽位", description: "换上下装时明确上传上装或下装；换连体时上传整件连体/全身服装。" },
                    { title: "选择模特 / 场景", description: "可用系统模特、上传模特图；场景参考只控制姿势、背景、构图和镜头。" },
                    { title: "生成上身图", description: "保持服装款式、颜色、图案和穿搭关系不变，输出真实成片。" },
                  ]}
                  actions={(
                    <>
                      <button
                        type="button"
                        onClick={() => openClothingPicker(clothingMode === "multi" ? "upper" : "single")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                      >
                        <Upload className="h-3.5 w-3.5" /> 上传服装
                      </button>
                      <button
                        type="button"
                        onClick={() => sourceLibrary.open(clothingMode === "multi" ? "upper" : "single")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-violet-200 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                      >
                        <FolderOpen className="h-3.5 w-3.5" /> 从作品库选择
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
                moduleName="服装上身"
                referenceImages={[
                  { label: clothingMode === "multi" ? "上装/下装参考" : "连体服装参考", url: store.clothingPreviews[0] },
                  { label: "模特参考", url: store.selectedModel?.image_url },
                  { label: "姿势/场景参考", url: store.referenceImage?.url },
                ]}
                metaItems={[aspectRatio, imageSize]}
              />
            )}
            errorState={store.error ? (
              <ErrorStage
                error={store.error}
                onRetry={() => { store.setError(null); handleGenerate(); }}
                onRepair={handleRepairGenerate}
                isGenerating={store.isGenerating}
                retryDisabled={retryDisabled}
                retryLabel={applyingTaskId ? "正在套用..." : undefined}
                repairKind="tryon"
              />
            ) : null}
            results={(
              <div className="relative min-h-[320px] sm:min-h-[420px] lg:h-full">
                <div className="studio-result-stage min-h-[320px] overflow-y-auto overflow-x-hidden p-4 pb-32 sm:min-h-[420px] sm:p-6 sm:pb-32 lg:h-full">
                  <div className="flex min-h-full items-start justify-start">
                    <ResultImageGrid
                      urls={store.resultUrls}
                      filenamePrefix="tryon"
                      onOpen={(url, index) => openLightbox(url, `服装上身结果 ${index + 1}`)}
                      imageAltPrefix="服装上身结果"
                      expectedCount={activeQueueTask ? clampTaskExpectedCount(activeQueueTask, 1, 4, genCount) : genCount}
                      isGenerating={store.isGenerating}
                      inputThumbnails={safeTaskQueueUrls(activeQueueTask?.inputThumbnails)}
                      inputReferences={activeTaskReferences}
                      createdAt={activeQueueTask?.createdAt}
                      statusGroup={activeQueueTask?.statusGroup}
                      variant="task"
                      renderKey={activeQueueTask?.id || "tryon-create"}
                    />
                  </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-2 border-t border-white/70 bg-white/86 px-4 py-3 shadow-[0_-18px_45px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">服装上身结果</span>
                    {store.promptUsed && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setShowPromptPreview(true);
                        }}
                        className="text-xs font-semibold text-violet-600 underline-offset-2 hover:text-violet-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                      >
                        查看提示词
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <RepairPromptPanel
                      kind="tryon"
                      onRepair={handleRepairGenerate}
                      disabled={store.isGenerating}
                      className="max-w-xl flex-1"
                    />
                    <button
                      type="button"
                      onClick={handleContinueCreate}
                      className="inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-medium transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                    >
                      <RefreshCw className="h-3 w-3" /> 重新创作
                    </button>
                    <a href="/history" className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2">
                      历史记录 <ChevronRight className="h-3 w-3" />
                    </a>
                  </div>
                </div>
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
      {lightboxImage && (
        <ClientPortal>
          <div
            className="fixed inset-0 z-[180] flex cursor-zoom-out items-center justify-center bg-slate-950/66 p-4 backdrop-blur-xl sm:p-8"
            role="dialog"
            aria-modal="true"
            aria-label={lightboxImage.alt}
            onClick={() => setLightboxImage(null)}
          >
            <img
              src={lightboxImage.src}
              alt={lightboxImage.alt}
              className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_32px_120px_rgba(0,0,0,0.45)]" />
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/85 bg-white/90 text-slate-700 shadow-[0_12px_34px_rgba(15,23,42,0.22)] backdrop-blur transition-colors hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:right-6 sm:top-6"
              aria-label="关闭图片预览"
              title="关闭图片预览"
            >
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
                    + 智能模式
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
                  ["上身模式", TRYON_CLOTHING_MODE_LABELS[clothingMode]],
                  ["服装角色", clothingRoles.map((role) => TRYON_CLOTHING_ROLE_LABELS[role]).join("、") || "未上传"],
                  ["服装人群", TRYON_GARMENT_AUDIENCE_LABELS[garmentAudience]],
                  ["年龄段", TRYON_AGE_GROUP_LABELS[ageGroup]],
                  ["服装类别", isIntimateGarment ? "内衣/泳衣类" : "常规服装"],
                  ["服装数量", `${uploadedClothingUrls.length}`],
                  ["模特脸", store.selectedModel ? "已使用" : "未使用"],
                  ["场景模式", SCENE_MODE_LABELS[sceneMode]],
                  ["参考图", effectiveReferenceUrl ? "已使用" : "未使用"],
                  ["智能方案", sceneMode === "auto_design" ? AUTO_DESIGN_PLATFORMS.find((item) => item.value === resolvedAutoDesign.platform)?.label || "-" : "未使用"],
                  ["智能背景", sceneMode === "auto_design" ? AUTO_DESIGN_BACKGROUNDS.find((item) => item.value === resolvedAutoDesign.background)?.label || "-" : "未使用"],
                  ["用户输入", customStyle || "无"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-gray-50 px-3 py-2">
                    <p className="text-[10px] text-gray-400">{label}</p>
                    <p className="text-xs font-medium text-gray-700 break-words">{value}</p>
                  </div>
                ))}
              </div>
              <StudioPromptTextarea
                value={finalPrompt}
                onChange={(e) => {
                  setPromptOverride(e.target.value);
                  store.setPromptUsed(e.target.value);
                }}
                className="studio-prompt-textarea-tall"
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
    </>
  );
}

function getTryOnStatusPollDelayMs(attempts: number) {
  if (attempts < 1) return 5_000;
  if (attempts < 3) return 7_000;
  if (attempts < 8) return 10_000;
  return 15_000;
}

function waitForTryOnStatusPoll(attempts: number, signal: AbortSignal) {
  const delay = typeof document !== "undefined" && document.visibilityState === "hidden"
    ? TRYON_STATUS_HIDDEN_POLL_MS
    : getTryOnStatusPollDelayMs(attempts);
  return waitForAbortableDelay(delay, signal);
}

function waitForAbortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function fetchTryOnGenerationStatus(generationId: string, watcherSignal: AbortSignal) {
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  watcherSignal.addEventListener("abort", relayAbort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), TRYON_STATUS_FETCH_TIMEOUT_MS);

  try {
    return await fetch(`/api/tryon?generation_id=${encodeURIComponent(generationId)}`, {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
    watcherSignal.removeEventListener("abort", relayAbort);
  }
}

function isAbortLikeError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
