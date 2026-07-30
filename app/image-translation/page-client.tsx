"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronRight,
  Images as ImagesIcon,
  Languages as LanguagesIcon,
  Sparkles,
  X,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleHeader } from "@/components/ModuleHeader";
import { ImageTranslationHero } from "@/components/studio/ImageTranslationHero";
import { ErrorStage } from "@/components/studio/ErrorStage";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import {
  StudioGenerationCountSelector,
  StudioModelSelector,
  StudioOptionGrid,
  StudioPromptTextarea,
} from "@/components/studio/StudioFormControls";
import { StudioRunBar } from "@/components/studio/StudioRunBar";
import { StudioMultiImageUpload } from "@/components/studio/StudioMultiImageUpload";
import { StudioUploadSection } from "@/components/studio/StudioUploadSection";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { LanguagePickerModal } from "@/components/studio/LanguagePickerModal";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";

import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { StudioMediaLightbox } from "@/components/studio/StudioMediaLightbox";
import { setCachedProfileCredits } from "@/lib/supabase/client";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import {
  getCreditCost,
  getSupportedImageSizes,
  normalizeAspectRatio,
  normalizeImageSize,
  normalizeLingyaModel,
  type AspectRatio,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import {
  fetchHistoryApplyDetail,
  getHistoryApplyFailureMessage,
  isHistoryApplyRowFailed,
  takeApplyDetail,
  type HistoryJobPayload,
} from "@/lib/history-apply";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem, type TaskStatusGroup } from "@/lib/task-queue";
import { showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import { createGenericImagePreviewSession } from "@/lib/studio-image-preview";
import { FAILED_RETRY_NOTICE, buildPartialFailureDetail, summarizeGenerationError } from "@/lib/studio-generation-feedback";
import {
  buildRetryPendingResultUrls,
  getRetryDisplayExpectedCount,
  mergeRetryResultUrls,
  normalizeRetryResultIndex,
} from "@/lib/result-slot-retry";
import {
  buildImageTranslationPrompt,
  enforceImageTranslationPromptRequirements,
  flattenImageTranslationLanguages,
  MAX_IMAGE_TRANSLATION_IMAGES,
  MAX_IMAGE_TRANSLATION_LANGUAGES,
  normalizeImageTranslationLanguageCodes,
  normalizeImageTranslationSourceUrls,
  type ImageTranslationExampleConfig,
  type ImageTranslationLanguageConfig,
  type ImageTranslationLanguageCode,
} from "@/lib/image-translation";

type ImageTranslationHistoryPayload = Extract<HistoryJobPayload, { kind: "imageTranslation" }>;
type ImageTranslationGenerateOptions = {
  sourceUrlsOverride?: string[];
  genCountOverride?: number;
  expectedCountOverride?: number;
  retryResultIndex?: number;
  toastMessage?: string;
};

const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "最高 4K", badge: "推荐", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/gemini.png" },
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "最高 4K", badge: "最新", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/openai.svg" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "最高 4K", badge: "推荐", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/gemini.png" },
];

const DEFAULT_ASPECT_RATIO: AspectRatio = "auto";

const IMAGE_TRANSLATION_UPLOAD_RULE = {
  title: "请上传需要翻译的商品图",
  uploadSpecText: "支持 JPG/PNG/WEBP/HEIC，单张 20KB~15MB，建议分辨率 ≥ 400×400；推荐主体完整、文字清晰、留白可读。",
  demos: [
    {
      title: "推荐示例 1",
      description: "电商详情页商品图，含中文标题/参数",
      imageUrl: "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/01.jpg",
    },
    {
      title: "推荐示例 2",
      description: "海报式商品图，含多语种可替换素材",
      imageUrl: "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/02.jpg",
    },
    {
      title: "推荐示例 3",
      description: "包装/标签类商品图，适合多地区翻译",
      imageUrl: "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/03.jpg",
    },
    {
      title: "推荐示例 4",
      description: "实物+说明文案组合图，验证翻译保真",
      imageUrl: "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/04.jpg",
    },
    {
      title: "推荐示例 5",
      description: "跨境多语种营销图，确认本地化效果",
      imageUrl: "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/05.jpg",
    },
  ],
};

const IMAGE_TRANSLATION_PREVIEW_ACTIONS = [
  { kind: "download" as const, label: "下载图片" },
  { kind: "copy" as const, label: "复制链接" },
  { kind: "regenerateAll" as const, label: "重新创作" },
  { kind: "feedback" as const, label: "反馈" },
];

export default function ImageTranslationPage() {
  const router = useRouter();
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const [sourceUrls, setSourceUrls] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [languageLabels, setLanguageLabels] = useState<string[]>([]);
  const [languageConfig, setLanguageConfig] = useState<ImageTranslationLanguageConfig>([]);
  const [languageConfigLoading, setLanguageConfigLoading] = useState(true);
  const [exampleResources, setExampleResources] = useState<ImageTranslationExampleConfig>([]);
  const [userPrompt, setUserPrompt] = useState("");
  const [aiModel, setAiModel] = useState<LingyaModel>("nano-banana-2");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(DEFAULT_ASPECT_RATIO);
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [genCount, setGenCount] = useState(1);
  const [isSourceDragging, setIsSourceDragging] = useState(false);
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [runningExpectedCount, setRunningExpectedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);

  const { authChecked, isAuthenticated, userId, credits, setCredits, refreshCredits, refreshAuth } = useStudioAuth();

  const allLanguages = useMemo(() => flattenImageTranslationLanguages(languageConfig), [languageConfig]);
  const languageLabelMap = useMemo(() => {
    const map = new Map<string, ImageTranslationLanguageCode>();
    allLanguages.forEach((lang) => map.set(lang.code, lang));
    return map;
  }, [allLanguages]);

  const primarySourceUrl = sourceUrls[0] || "";
  const requestedResultCount = sourceUrls.length * languages.length * genCount;
  const activeResultExpectedCount = isGenerating
    ? runningExpectedCount || requestedResultCount
    : runningExpectedCount || Math.max(resultUrls.length, 1);
  const displayedResultUrls = resultUrls.filter(Boolean);
  const partialFailureMessage = buildPartialFailureDetail({
    failedCount: activeResultExpectedCount - displayedResultUrls.length,
  });
  const hasCompletedPartialResults = Boolean(
    !isGenerating
    && activeResultExpectedCount > displayedResultUrls.length
    && displayedResultUrls.length > 0
  );
  const retryDisabled = isGenerating;

  const finalPrompt = useMemo(
    () =>
      promptOverride ??
      buildImageTranslationPrompt({
        sourceCount: sourceUrls.length,
        languages,
        languageLabels,
        userPrompt,
        aiModel,
        imageSize,
      }),
    [promptOverride, sourceUrls.length, languages, languageLabels, userPrompt, aiModel, imageSize]
  );

  const unitCost = getCreditCost(aiModel, imageSize, aspectRatio);
  const cost = unitCost * requestedResultCount;
  const taskQueue = useTaskQueueGeneration({
    module: "imageTranslation",
    title: "图片翻译",
    defaultExpectedCount: requestedResultCount,
    applyPath: "/image-translation",
  });

  // 拉取语言配置（无需鉴权，公开缓存）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/image-translation-languages", { method: "GET", cache: "no-store" });
        if (!res.ok) throw new Error("failed");
        const json = (await res.json()) as { data?: ImageTranslationLanguageConfig };
        if (cancelled) return;
        if (Array.isArray(json.data)) setLanguageConfig(json.data);
      } catch {
        if (!cancelled) setLanguageConfig([]);
      } finally {
        if (!cancelled) setLanguageConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 拉取示例资源
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/image-translation-resources", { method: "GET", cache: "no-store" });
        if (!res.ok) throw new Error("failed");
        const json = (await res.json()) as { data?: ImageTranslationExampleConfig };
        if (cancelled) return;
        if (Array.isArray(json.data) && json.data.length) setExampleResources(json.data);
      } catch {
        if (!cancelled) setExampleResources([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 历史任务回填
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const detail = await takeApplyDetail("imageTranslation");
      if (cancelled || !detail) return;
      applyHistoryPayload(detail.payload, detail.resultUrls, { silent: true });
      if (isHistoryApplyRowFailed(detail.row)) {
        setError(getHistoryApplyFailureMessage(detail.row));
      }
      toast.success("已套用历史参数");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const nextSizes = getSupportedImageSizes(aiModel, aspectRatio);
    if (!nextSizes.includes(imageSize)) setImageSize(nextSizes[0]);
  }, [aiModel, aspectRatio, imageSize]);

  const applyHistoryPayload = (
    payload: ImageTranslationHistoryPayload,
    historyResultUrls: string[] = [],
    options?: { silent?: boolean }
  ) => {
    const known = allLanguages;
    const restoredLanguages = normalizeImageTranslationLanguageCodes(payload.languages, known);
    setSourceUrls(normalizeImageTranslationSourceUrls(payload.sourceUrls, payload.sourceUrl));
    setLanguages(restoredLanguages);
    setLanguageLabels(Array.isArray(payload.languageLabels) ? payload.languageLabels : restoredLanguages);
    setAiModel(normalizeLingyaModel(payload.aiModel));
    setAspectRatio(normalizeAspectRatio(payload.aspectRatio || DEFAULT_ASPECT_RATIO, DEFAULT_ASPECT_RATIO));
    setImageSize(normalizeImageSize(payload.aiModel, payload.imageSize, aspectRatio));
    setGenCount(Math.min(Math.max(Number(payload.genCount) || 1, 1), 4));
    setPromptOverride(enforceImageTranslationPromptRequirements(payload.prompt, {
      sourceCount: payload.sourceUrls.length,
      languages: restoredLanguages,
      languageLabels: Array.isArray(payload.languageLabels) ? payload.languageLabels : restoredLanguages,
    }));
    setRunningExpectedCount(null);
    setResultUrls(historyResultUrls);
    setIsGenerating(false);
    setProgress(historyResultUrls.length ? 100 : 0);
    setError(null);
    if (!options?.silent) toast.success("已套用历史参数");
  };

  const handleLanguageConfirm = (next: string[]) => {
    const labels = next.map((code) => languageLabelMap.get(code)?.label || code);
    setLanguages(next);
    setLanguageLabels(labels);
    setLanguageModalOpen(false);
    setPromptOverride(null);
  };

  const handleSourceUpload = useCallback(
    async (files: File[]) => {
      const valid = files.filter((file) => {
        if (!file.type.startsWith("image/")) {
          toast.error(`"${file.name}" 不是图片格式`);
          return false;
        }
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`"${file.name}" 超过 ${MAX_FILE_SIZE_MB}MB`);
          return false;
        }
        return true;
      });
      if (!valid.length) return;
      const remaining = Math.max(MAX_IMAGE_TRANSLATION_IMAGES - sourceUrls.length, 0);
      if (remaining === 0) {
        toast.error(`原图最多 ${MAX_IMAGE_TRANSLATION_IMAGES} 张`);
        return;
      }
      const slice = valid.slice(0, remaining);
      toast.info(`正在上传 ${slice.length} 张原图...`);
      setIsUploadingSource(true);
      try {
        const uploads = await Promise.all(slice.map((file) => uploadImage(file)));
        setSourceUrls((prev) => {
          const merged = [...prev, ...uploads.map((item) => item.url)];
          return merged.slice(0, MAX_IMAGE_TRANSLATION_IMAGES);
        });
        setPromptOverride(null);
        toast.success(`已上传 ${uploads.length} 张原图`);
      } catch {
        toast.error("上传失败，请重试");
      } finally {
        setIsUploadingSource(false);
      }
    },
    [sourceUrls.length]
  );

  const handleApplyDemo = (demo: { title?: string; imageUrl: string }) => {
    setSourceUrls([demo.imageUrl]);
    setPromptOverride(null);
    toast.success(`已套用示例：${demo.title || "推荐示例"}`);
  };

  const runDisabledReason = !sourceUrls.length
    ? "请先上传需要翻译的商品图"
    : !languages.length
      ? "请选择至少 1 种目标语言"
      : credits !== null && credits < cost
        ? `灵点不足，生成需要 ${cost} 灵点`
        : undefined;

  function handleRetryFailedResult(index: number) {
    if (retryDisabled) return;
    const perSourceCount = Math.max(1, languages.length * Math.max(genCount, 1));
    const sourceIndex = Math.min(
      Math.max(0, Math.floor(index / perSourceCount)),
      Math.max(sourceUrls.length - 1, 0)
    );
    const retrySourceUrl = sourceUrls[sourceIndex] || sourceUrls[0];
    if (!retrySourceUrl) {
      toast.error("未找到要重试的原图");
      return;
    }
    void generate(undefined, {
      sourceUrlsOverride: [retrySourceUrl],
      genCountOverride: 1,
      expectedCountOverride: languages.length || 1,
      retryResultIndex: index,
      toastMessage: `正在补位重试第 ${index + 1} 张，失败图已退款，完成后会回填到当前结果中...`,
    });
  }


  const perSourceCount = languages.length * Math.max(1, Math.min(genCount || 1, 4));
  const activeSourceIdx = previewIndex !== null
    ? Math.min(sourceUrls.length - 1, Math.max(0, Math.floor(previewIndex / Math.max(1, perSourceCount))))
    : 0;
  const activeSourceUrl = sourceUrls[activeSourceIdx] || "";

  const previewSession = useMemo(
    () =>
      createGenericImagePreviewSession({
        module: "imageTranslation",
        title: "图片翻译",
        urls: resultUrls,
        expectedCount: activeResultExpectedCount,
        isGenerating,
        statusGroup: isGenerating ? "running" : undefined,
        references: activeSourceUrl
          ? [{ url: activeSourceUrl, label: sourceUrls.length > 1 ? `原图 ${activeSourceIdx + 1}` : "原图", role: "source" }]
          : [],
        promptText: userPrompt || undefined,
        metaItems: [
          { label: "源图数量", value: sourceUrls.length },
          { label: "目标语言", value: languageLabels.length ? languageLabels.join(" / ") : languages.join(" / ") },
          { label: "模型", value: aiModel },
          { label: "分辨率", value: imageSize },
          { label: "每张生成数", value: genCount },
        ],
        resultTitlePrefix: "翻译结果",
      }),
    [activeResultExpectedCount, aiModel, genCount, imageSize, isGenerating, languageLabels, languages, resultUrls, sourceUrls, userPrompt, activeSourceUrl, activeSourceIdx]
  );

  function handleRunningTask(item: TaskQueueItem) {
    setRunningExpectedCount(clampTaskExpectedCount(item, 1, MAX_IMAGE_TRANSLATION_IMAGES * MAX_IMAGE_TRANSLATION_LANGUAGES * 4));
    setIsGenerating(true);
    setProgress(Math.min(Math.max(Math.round(Number(item.progress) || 12), 1), 99));
    setError(null);
    setResultUrls(safeTaskQueueUrls(item.resultThumbnails));
  }

  async function handleCompletedTask(item: TaskQueueItem, session: TaskSelectionSession) {
    try {
      const detail = await fetchHistoryApplyDetail(item.id, "imageTranslation", session.signal);
      if (!session.isCurrent()) return true;
      applyHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails));
      if (item.statusGroup === "failed" || isHistoryApplyRowFailed(detail.row)) {
        setError(getHistoryApplyFailureMessage(detail.row, item.error || "生成失败"));
      }
      return true;
    } catch (err) {
      if (session.signal.aborted || !session.isCurrent()) return true;
      toast.error(err instanceof Error ? err.message : "历史参数加载失败");
      return true;
    }
  }

  function handleContinueCreate() {
    setSourceUrls([]);
    setLanguages([]);
    setLanguageLabels([]);
    setUserPrompt("");
    setAiModel("nano-banana-2");
    setAspectRatio(DEFAULT_ASPECT_RATIO);
    setImageSize("1K");
    setGenCount(1);
    setPromptOverride(null);
    setIsGenerating(false);
    setRunningExpectedCount(null);
    setProgress(0);
    setResultUrls([]);
    setError(null);
    setLightboxSrc(null);
    if (sourceInputRef.current) sourceInputRef.current.value = "";
  }

  async function generate(_promptForRun?: string, options: ImageTranslationGenerateOptions = {}) {
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    const runSourceUrls = options.sourceUrlsOverride?.length ? options.sourceUrlsOverride : sourceUrls;
    if (runSourceUrls.length === 0) {
      toast.error("请先上传需要翻译的商品图");
      return;
    }
    if (languages.length === 0) {
      toast.error("请选择至少 1 种目标语言");
      return;
    }
    const runGenCount = Math.min(Math.max(Math.round(Number(options.genCountOverride ?? genCount) || 1), 1), 4);
    const runExpectedCount = Math.max(
      1,
      Math.round(
        Number(options.expectedCountOverride ?? runSourceUrls.length * languages.length * runGenCount) || runGenCount
      )
    );
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

    setIsGenerating(true);
    setRunningExpectedCount(displayExpectedCount);
    setProgress(10);
    setResultUrls(buildRetryPendingResultUrls(retryPreviousResultUrls, retryResultIndex, displayExpectedCount));
    setError(null);
    if (options.toastMessage) toast.info(options.toastMessage);

    const runTaskInputThumbnails = runSourceUrls.slice();
    const provisionalTask = taskQueue.startTask({
      expectedCount: displayExpectedCount,
      inputThumbnails: runTaskInputThumbnails,
      progress: 10,
    });
    let activeTaskId = provisionalTask.id;
    let latestTaskResultUrls: string[] = [];

    try {
      const res = await fetch("/api/image-translation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_url: runSourceUrls[0] || "",
          source_urls: runSourceUrls,
          languages,
          language_labels: languageLabels,
          ai_model: aiModel,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          gen_count: runGenCount,
          user_prompt: userPrompt,
          prompt: finalPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          await refreshAuth();
          taskQueue.removeTask(activeTaskId);
          setIsGenerating(false);
          router.push("/login");
          return;
        }
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
      setProgress(25);
      if (typeof data.generation_id === "string" && data.generation_id) {
        const serverTask = taskQueue.replaceWithServerTask(activeTaskId, {
          id: data.generation_id,
          expectedCount: displayExpectedCount,
          inputThumbnails: runTaskInputThumbnails,
          status: data.status || "processing_tryon",
          progress: 25,
        });
        activeTaskId = serverTask.id;
      }

      for (let attempts = 0; attempts < 180; attempts++) {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await fetch(`/api/image-translation?generation_id=${data.generation_id}`);
        if (!poll.ok) continue;
        const state = await poll.json();
        if (Array.isArray(state.result_urls) && state.result_urls.length) {
          latestTaskResultUrls = mergeRetryResultUrls(
            retryPreviousResultUrls,
            retryResultIndex,
            state.result_urls,
            displayExpectedCount
          );
          const nextResultUrls = [...latestTaskResultUrls];
          setResultUrls((current) => sameResultSlots(current, nextResultUrls) ? current : nextResultUrls);
        }
        // 处理中如果状态短暂显示 failed 但已有部分结果 → 当作部分完成处理，不要 throw
        const transientFailed = state.status === "failed";
        const hasResultsSoFar = (latestTaskResultUrls.filter(Boolean).length) > 0;
        if (transientFailed && hasResultsSoFar && attempts < 60) {
          setProgress(Math.min(95, 60 + Math.round(attempts * 0.5)));
          taskQueue.markRunning(activeTaskId, {
            expectedCount: displayExpectedCount,
            inputThumbnails: runTaskInputThumbnails,
            resultThumbnails: latestTaskResultUrls,
            progress: Math.min(95, 60 + Math.round(attempts * 0.5)),
            status: "running",
          });
          continue;
        }
        if (state.status === "completed" || (state.status === "failed" && hasResultsSoFar)) {
          const finalUrls = mergeRetryResultUrls(
            retryPreviousResultUrls,
            retryResultIndex,
            Array.isArray(state.result_urls) ? state.result_urls : latestTaskResultUrls,
            displayExpectedCount
          );
          const finalResultCount = finalUrls.filter(Boolean).length;
          const partialFailure = state.partial_failure && typeof state.partial_failure === "object"
            ? (state.partial_failure as { message?: unknown })
            : null;
          const completedError = state.error || partialFailure?.message || "";
          setProgress(100);
          setResultUrls(finalUrls);
          setIsGenerating(false);
          taskQueue.markCompleted(activeTaskId, {
            expectedCount: displayExpectedCount,
            inputThumbnails: runTaskInputThumbnails,
            resultThumbnails: finalUrls,
            resultCount: finalResultCount,
            error: completedError ? summarizeGenerationError(completedError) : "",
          });
          if (completedError || finalResultCount < displayExpectedCount) {
            void refreshCredits();
            toast.warning(
              `图片翻译部分完成：已生成 ${finalResultCount}/${displayExpectedCount} 张，失败图片灵点会自动退回`
            );
          } else {
            toast.success("图片翻译生成完成");
          }
          return;
        }
        if (state.status === "failed") throw new Error(state.error || "生成失败");
        const nextProgress = Number(state.progress);
        const runningProgress = Number.isFinite(nextProgress)
          ? Math.min(Math.max(Math.round(nextProgress), 0), 99)
          : Math.min(25 + attempts * 1.2, 90);
        setProgress(runningProgress);
        taskQueue.markRunning(activeTaskId, {
          expectedCount: displayExpectedCount,
          inputThumbnails: runTaskInputThumbnails,
          resultThumbnails: latestTaskResultUrls,
          progress: runningProgress,
          status: state.status,
        });
      }
      throw new Error("生成超时");
    } catch (err: unknown) {
      const message = summarizeGenerationError(err instanceof Error ? err.message : "生成失败");
      setError(message);
      taskQueue.markFailed(activeTaskId, message, {
        expectedCount: displayExpectedCount,
        inputThumbnails: runTaskInputThumbnails,
        resultThumbnails: latestTaskResultUrls,
      });
      toast.error(message);
      void refreshCredits();
      setIsGenerating(false);
    }
  }

  function sameResultSlots(current: string[], next: string[]) {
    return current.length === next.length && current.every((url, index) => url === next[index]);
  }

  const examplesForUpload = useMemo(() => {
    const list = exampleResources.length ? exampleResources : IMAGE_TRANSLATION_UPLOAD_RULE.demos.map((demo) => ({ picUrl: demo.imageUrl, title: demo.title }));
    return list.map((item) => ({
      url: item.picUrl,
      title: item.title || "推荐示例",
    }));
  }, [exampleResources]);

  const authIsAnonymous = authChecked && !isAuthenticated;
  const summary = (() => {
    if (!sourceUrls.length) return `等待上传原图 · ${genCount} 张`;
    if (!languages.length) return `已上传 ${sourceUrls.length} 张原图 · 请选择目标语言`;
    return `${sourceUrls.length} 张原图 × ${languages.length} 种语言 × ${genCount} · ${imageSize}`;
  })();

  let statusGroup: TaskStatusGroup | undefined;
  if (isGenerating) statusGroup = "running";
  else if (resultUrls.length > 0) statusGroup = "completed";

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="imageTranslation" />
      <ModuleTaskRail module="imageTranslation" moduleLabel="图片翻译" onContinue={handleContinueCreate} onRunningTask={handleRunningTask} onCompletedTask={handleCompletedTask} />

      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-5">
          <ModuleHeader
            title="图片翻译"
            tooltip="上传需要本地化的商品图，选择 1~20 种目标语言，模型会按图1 中的可见文字逐处翻译，保留品牌、Logo、产品名、参数和价格原样。"
            actions={(
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-black text-violet-600">
                NEW
              </span>
            )}
          />

          <StudioUploadSection
            title="待翻译原图"
            inputRef={sourceInputRef}
            multiple
            isDragging={isSourceDragging}
            setDragging={setIsSourceDragging}
            onFiles={handleSourceUpload}
          >
            {(openFileDialog) => (
              <StudioMultiImageUpload
                urls={sourceUrls}
                maxCount={MAX_IMAGE_TRANSLATION_IMAGES}
                title="已上传商品图"
                emptyTitle="上传需要翻译的商品图"
                description="支持同时上传多张原图批量翻译，每张原图 × 目标语言 × 生成数量 = 实际结果图。"
                emptyDescription="图1 是唯一商品事实来源；建议上传文字清晰、构图完整的电商商品图。"
                itemLabelPrefix="图"
                loading={isUploadingSource}
                isDragging={isSourceDragging}
                uploadLabel="从本地上传"
                libraryLabel="从作品选择"
                summary={sourceUrls.length ? `已上传 ${sourceUrls.length} 张` : undefined}
                footnote={`支持 JPG / PNG / WEBP / HEIC，最多 ${MAX_IMAGE_TRANSLATION_IMAGES} 张。`}
                tips={[
                  { label: "说明", text: "保留品牌、Logo、产品名、参数、价格、链接、二维码、条形码原样。" },
                  { label: "推荐", text: "文字清晰可读、构图完整，避免过小文字或大面积模糊。" },
                ]}
                imageFit="cover"
                onUploadClick={openFileDialog}
                onLibraryClick={() => toast.info("作品库选择即将接入")}
                onPreview={(url) => setLightboxSrc(url)}
                onRemove={(_, index) => {
                  setSourceUrls((prev) => prev.filter((__, i) => i !== index));
                  setPromptOverride(null);
                }}
                onClear={() => {
                  setSourceUrls([]);
                  setPromptOverride(null);
                }}
                examples={{
                  label: "试一试",
                  images: examplesForUpload,
                  disabled: isUploadingSource,
                  onSelect: (image) =>
                    handleApplyDemo({ title: image.title, imageUrl: image.url }),
                }}
              />
            )}
          </StudioUploadSection>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <LanguagesIcon className="h-4 w-4 text-violet-500" />
                目标语言 <span className="text-xs font-normal text-slate-400">· 可多选</span>
              </h3>
              <span className="text-xs text-slate-400">已选 {languages.length}/{MAX_IMAGE_TRANSLATION_LANGUAGES}</span>
            </div>
            <button
              type="button"
              onClick={() => setLanguageModalOpen(true)}
              className="flex w-full items-center justify-between rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
            >
              <span className="truncate">
                {languageLabels.length
                  ? languageLabels.join(" / ")
                  : "点击选择目标语言（支持 180+ 国家及地区）"}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
            {languages.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {languages.map((code, index) => {
                  const label = languageLabels[index] || code;
                  return (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700"
                    >
                      {label}
                      <button
                        type="button"
                        aria-label={`移除 ${label}`}
                        onClick={() => {
                          setLanguages((prev) => prev.filter((item) => item !== code));
                          setLanguageLabels((prev) => prev.filter((_, i) => i !== index));
                          setPromptOverride(null);
                        }}
                        className="rounded-full p-0.5 hover:bg-violet-200"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
              <ImagesIcon className="h-4 w-4 text-violet-500" />
              补充说明 <span className="text-xs font-normal text-slate-400">· 可选</span>
            </h3>
            <StudioPromptTextarea
              value={userPrompt}
              onChange={(event) => {
                setUserPrompt(event.target.value);
                setPromptOverride(null);
              }}
              rows={3}
              placeholder="例如：标题使用美式英文，参数保持阿拉伯数字与单位；或：日语使用敬体，避免片假名过多。"
            />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              提示词可进一步控制语言风格（如「美式英文」「繁体中文」「阿拉伯 RTL 排版」），但不会改写品牌名、Logo、产品名、参数、价格或链接。
            </p>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
              <Sparkles className="h-4 w-4 text-violet-500" />
              生成模型
            </h3>
            <StudioModelSelector
              models={MODELS}
              value={aiModel}
              onChange={setAiModel}
              ariaLabel="生成模型"
              getMeta={(model) => `${model.desc} · 当前 ${unitCost} 灵点/张`}
            />
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">图片比例</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                默认跟随原图
              </span>
            </div>
            <StudioOptionGrid
              options={[{ value: "auto" as AspectRatio, label: "智能（原图比例）", description: "由后端从原图推断" }]}
              value={aspectRatio}
              onChange={(value) => setAspectRatio(normalizeAspectRatio(value, DEFAULT_ASPECT_RATIO))}
              columns={1}
              ariaLabel="图片比例"
            />
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-900">分辨率</h3>
            <StudioOptionGrid
              options={getSupportedImageSizes(aiModel, aspectRatio).map((size) => ({
                value: size,
                label: `${size} · ${getCreditCost(aiModel, size, aspectRatio)} 灵点`,
              }))}
              value={imageSize}
              onChange={setImageSize}
              columns={3}
              ariaLabel="分辨率"
            />
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-900">每张图片 & 语言生成张数</h3>
            <StudioGenerationCountSelector value={genCount} onChange={setGenCount} ariaLabel="生成数量" />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              共计 {sourceUrls.length * Math.max(languages.length, 1) * genCount} 张结果图（源图数 × 语种数 × 张数）。
            </p>
          </section>

          {!isGenerating && !resultUrls.length && !error && primarySourceUrl ? (
            <section className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
              <p className="mb-2 text-[11px] font-semibold text-slate-500">图1预览（将作为翻译原图）</p>
              <div className="relative overflow-hidden rounded-xl bg-white">
                <RawPreviewImage src={primarySourceUrl} alt="图1" className="aspect-[3/4] w-full object-contain" />
                <button
                  type="button"
                  onClick={() => setLightboxSrc(primarySourceUrl)}
                  className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-slate-500 shadow-sm hover:text-violet-600"
                  aria-label="放大预览"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <CheckCircle2 className="absolute left-2 top-2 h-5 w-5 rounded-full bg-white text-emerald-500" />
              </div>
            </section>
          ) : null}
        </div>

        <StudioRunBar
          summary={summary}
          costLabel={authIsAnonymous ? "登录后查看灵点" : `消耗 ${cost} · 余额 ${credits ?? "-"}`}
          disabled={isGenerating || Boolean(runDisabledReason)}
          disabledReason={runDisabledReason}
          primaryLabel={
            authIsAnonymous
              ? "登录后生成"
              : isGenerating
                ? `生成中 ${Math.round(progress)}%`
                : `生成 ${sourceUrls.length * Math.max(languages.length, 1) * genCount} 张`
          }
          isLoading={isGenerating}
          onPrimaryAction={() => generate()}
        />
      </div>

      <div className="studio-canvas relative flex-1 min-h-[520px] lg:h-full overflow-hidden mt-3 mb-6 lg:mt-0 lg:mb-0">
        {!isGenerating && resultUrls.length === 0 && !error ? (
          <div className="studio-empty-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center px-4">
            <ImageTranslationHero
              title="上传商品图，一键多语言本地化"
              description="保留品牌、Logo、产品名、参数和价格；支持 180+ 国家及地区语言，原文位置逐处翻译，地区本地化写法（美式/英式英文、简繁中文、阿拉伯字形、印地语天城文等）。"
            />
          </div>
        ) : null}

        {(isGenerating || resultUrls.length > 0 || error) && (
          <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:h-full flex flex-col gap-6 animate-fade-in">
            {sourceUrls.length === 0 && languages.length === 0 ? null : sourceUrls.map((sourceUrl, sIndex) => {
              const start = sIndex * languages.length * Math.max(1, Math.min(genCount || 1, 4));
              const perLanguage = Math.max(1, Math.min(genCount || 1, 4));
              const expectedPerSource = languages.length * perLanguage;
              const urlsForSource: string[] = Array.from({ length: expectedPerSource }, (_, i) => resultUrls[start + i] || "");
              const labelsForSource: string[] = Array.from({ length: expectedPerSource }, (_, i) => {
                const langIndex = Math.floor(i / perLanguage);
                return languageLabels[langIndex] || languages[langIndex] || "";
              });
              return (
                <ResultImageGrid
                  key={`image-translation-group-${sIndex}-${sourceUrl}`}
                  urls={urlsForSource}
                  filenamePrefix={`image-translation-s${sIndex + 1}`}
                  expectedCount={expectedPerSource}
                  isGenerating={isGenerating}
                  statusGroup={statusGroup}
                  variant="task"
                  inputReferences={[{ url: sourceUrl, label: `原图 ${sIndex + 1}` }]}
                  cellLabels={labelsForSource}
                  reducePendingMotion
                  markMissingAsFailed={hasCompletedPartialResults}
                  markMissingAsCompleted={statusGroup === "completed" && !hasCompletedPartialResults}
                  missingFailureLabel="本张翻译失败"
                  missingFailureDetail={partialFailureMessage ?? undefined}
                  missingFailureActionLabel="重试本张"
                  onMissingFailureAction={(idx) => handleRetryFailedResult(start + idx)}
                  missingFailureActionDisabled={retryDisabled}
                  onOpen={(_, idx) => setPreviewIndex(start + idx)}
                
                  tileAspectRatio={aspectRatio}
                />
              );
            })}
            <StudioImagePreviewDialog
              open={previewIndex !== null}
              onClose={() => setPreviewIndex(null)}
              session={previewSession}
              selectedIndex={previewIndex || 0}
              onSelectedIndexChange={setPreviewIndex}
              filenamePrefix="image-translation"
              actions={IMAGE_TRANSLATION_PREVIEW_ACTIONS}
              onRegenerateAll={() => void generate()}
            />
          </div>
        )}

        {error ? (
          <ErrorStage
            error={summarizeGenerationError(error)}
            onRetry={() => {
              setError(null);
              void generate();
            }}
            isGenerating={isGenerating}
            retryDisabled={retryDisabled}
            retryLabel="重新生成"
            notice={FAILED_RETRY_NOTICE}
          />
        ) : null}
      </div>

      <LanguagePickerModal
        open={languageModalOpen}
        onClose={() => setLanguageModalOpen(false)}
        config={languageConfig}
        selected={languages}
        onChange={handleLanguageConfirm}
        title="全部语言"
        description={languageConfigLoading ? "正在加载语言分组..." : "支持 180+ 国家与地区语言，本地化写法保留变音符号、简繁与字符集。"}
        maxCount={MAX_IMAGE_TRANSLATION_LANGUAGES}
      />

      <StudioMediaLightbox src={lightboxSrc} alt="图片翻译预览" onClose={() => setLightboxSrc(null)} />
    </div>
  );
}
