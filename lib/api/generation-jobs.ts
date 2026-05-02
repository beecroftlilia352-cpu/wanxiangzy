import { createClient } from "@supabase/supabase-js";
import {
  batchTryOn,
  generateImage,
  type AspectRatio,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import { failGenerationWithRefund } from "@/lib/api/credits";
import { resolveImageInputs } from "@/lib/api/image-inputs.server";
import { persistGeneratedImageUrls } from "@/lib/api/result-image-storage";
import { enforcePosePromptRequirements } from "@/lib/pose-prompt";

export type GenerationJobPayload =
  | {
      kind: "tryon";
      clothingUrls: string[];
      modelFaceUrl?: string | null;
      referenceUrl?: string | null;
      aiModel: LingyaModel;
      aspectRatio: AspectRatio;
      imageSize: ImageSize;
      style?: string;
      genCount: number;
      rawPrompt?: string;
    }
  | {
      kind: "model";
      referenceUrls: string[];
      hairReferenceUrl?: string | null;
      hairColorReferenceUrl?: string | null;
      gender?: "female" | "male";
      hairStyle?: string | null;
      hairColor?: string | null;
      aiModel: LingyaModel;
      aspectRatio: AspectRatio;
      imageSize: ImageSize;
      prompt: string;
      genCount: number;
    }
  | {
      kind: "pose";
      mainImageUrl: string;
      aiModel: LingyaModel;
      imageSize: ImageSize;
      prompt: string;
    }
  | {
      kind: "garment3d";
      garmentUrl: string;
      referenceUrl?: string | null;
      garmentType?: string;
      outputMode?: "reference" | "prompt";
      userPrompt?: string;
      aiModel: LingyaModel;
      aspectRatio: AspectRatio;
      imageSize: ImageSize;
      prompt: string;
      genCount: number;
    };

interface ClaimedJob {
  id: string;
  user_id: string;
  job_payload: unknown;
  credits_cost: number;
  job_attempts: number;
}

interface ExhaustedJob {
  id: string;
  user_id: string;
  credits_cost: number | null;
  processing_started_at: string | null;
  error_message: string | null;
}

export function startGenerationJob(generationId: string) {
  runGenerationJobById(generationId).catch((err) => {
    console.error(`[jobs] background job ${generationId} failed:`, err);
  });
}

export async function runGenerationJobById(generationId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_generation_job", {
    p_generation_id: generationId,
  });

  if (error) {
    throw new Error(`任务认领失败: ${error.message}`);
  }

  const job = getFirstRow(data);
  if (!job) return { processed: 0, skipped: 1 };

  await runClaimedJob(supabase, job);
  return { processed: 1, skipped: 0 };
}

export async function runNextGenerationJobs(limit = 2) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_next_generation_jobs", {
    p_limit: limit,
  });

  if (error) {
    throw new Error(`任务批量认领失败: ${error.message}`);
  }

  const jobs = Array.isArray(data) ? (data as ClaimedJob[]) : [];
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const job of jobs) {
    try {
      await runClaimedJob(supabase, job);
      results.push({ id: job.id, ok: true });
    } catch (err) {
      results.push({
        id: job.id,
        ok: false,
        error: err instanceof Error ? err.message : "任务失败",
      });
    }
  }

  const exhaustedRefunded = await refundExhaustedJobs(supabase);
  return { claimed: jobs.length, exhausted_refunded: exhaustedRefunded, results };
}

async function runClaimedJob(
  supabase: ReturnType<typeof createAdminClient>,
  job: ClaimedJob
) {
  try {
    const payload = parseJobPayload(job.job_payload);
    const resultUrls = await executePayload(payload);
    const persistedResultUrls = await persistGeneratedImageUrls(resultUrls, job.id);

    const { data, error } = await supabase
      .from("generations")
      .update({
        status: "completed",
        result_urls: persistedResultUrls,
        processing_started_at: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("user_id", job.user_id)
      .eq("status", "processing_tryon")
      .select("id")
      .maybeSingle();

    if (error) throw new Error(`更新任务结果失败: ${error.message}`);
    if (!data) {
      console.warn(`[jobs] generation ${job.id} was no longer processing; skipped completion write`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成失败";
    await failGenerationWithRefund(supabase, {
      userId: job.user_id,
      generationId: job.id,
      amount: Number(job.credits_cost || 0),
      reason: "生成失败退还",
      errorMessage: message,
    });
    throw err;
  }
}

async function executePayload(payload: GenerationJobPayload): Promise<string[]> {
  if (payload.kind === "tryon") {
    const resultUrls: string[] = [];

    for (let i = 0; i < payload.genCount; i++) {
      const imageInputs = await resolveImageInputs({
        clothingUrls: payload.clothingUrls,
        modelFaceUrl: payload.modelFaceUrl || undefined,
        referenceUrl: payload.referenceUrl || undefined,
      });
      const result = await batchTryOn({
        model: payload.aiModel,
        clothingUrls: imageInputs.clothingUrls,
        modelFaceUrl: imageInputs.modelFaceUrl,
        referenceUrl: imageInputs.referenceUrl,
        aspect_ratio: payload.aspectRatio,
        image_size: payload.imageSize,
        style: payload.style,
        raw_prompt: payload.rawPrompt,
      });
      resultUrls.push(...result.resultUrls);
    }

    return resultUrls;
  }

  if (payload.kind === "model") {
    const references = [
      ...payload.referenceUrls,
      payload.hairReferenceUrl,
      payload.hairColorReferenceUrl,
    ].filter(Boolean) as string[];
    const imageInputs = await resolveImageInputs({ clothingUrls: references });
    const resultUrls: string[] = [];

    for (let i = 0; i < payload.genCount; i++) {
      const result = await generateImage({
        model: payload.aiModel,
        prompt: payload.prompt,
        aspect_ratio: payload.aspectRatio,
        image: imageInputs.clothingUrls,
        image_size: payload.imageSize,
      });
      resultUrls.push(getResultUrl(result));
    }

    return resultUrls;
  }

  if (payload.kind === "pose") {
    const imageInputs = await resolveImageInputs({ clothingUrls: [payload.mainImageUrl] });
    const result = await generateImage({
      model: payload.aiModel,
      prompt: enforcePosePromptRequirements(payload.prompt),
      aspect_ratio: "3:4",
      image: imageInputs.clothingUrls,
      image_size: payload.imageSize,
    });

    return [getResultUrl(result)];
  }

  const imageInputs = await resolveImageInputs({
    clothingUrls: [
      payload.garmentUrl,
      ...(payload.referenceUrl ? [payload.referenceUrl] : []),
    ],
  });
  const resultUrls: string[] = [];

  for (let i = 0; i < payload.genCount; i++) {
    const result = await generateImage({
      model: payload.aiModel,
      prompt: payload.prompt,
      aspect_ratio: payload.aspectRatio,
      image: imageInputs.clothingUrls,
      image_size: payload.imageSize,
    });
    resultUrls.push(getResultUrl(result));
  }

  return resultUrls;
}

function getResultUrl(result: { url?: string; b64_json?: string }) {
  const resultUrl = result.url || result.b64_json;
  if (!resultUrl) throw new Error("图片生成接口未返回结果 URL");
  return resultUrl;
}

function parseJobPayload(value: unknown): GenerationJobPayload {
  if (!isJobPayload(value)) {
    throw new Error("任务 payload 无效，请重新提交生成");
  }

  return value;
}

function isJobPayload(value: unknown): value is GenerationJobPayload {
  if (!isRecord(value) || typeof value.kind !== "string") return false;

  if (value.kind === "tryon") {
    return hasStringArray(value.clothingUrls) &&
      typeof value.aiModel === "string" &&
      typeof value.aspectRatio === "string" &&
      typeof value.imageSize === "string" &&
      typeof value.genCount === "number";
  }

  if (value.kind === "model") {
    return hasStringArray(value.referenceUrls) &&
      typeof value.aiModel === "string" &&
      typeof value.aspectRatio === "string" &&
      typeof value.imageSize === "string" &&
      typeof value.prompt === "string" &&
      typeof value.genCount === "number";
  }

  if (value.kind === "pose") {
    return typeof value.mainImageUrl === "string" &&
      typeof value.aiModel === "string" &&
      typeof value.imageSize === "string" &&
      typeof value.prompt === "string";
  }

  if (value.kind === "garment3d") {
    return typeof value.garmentUrl === "string" &&
      typeof value.aiModel === "string" &&
      typeof value.aspectRatio === "string" &&
      typeof value.imageSize === "string" &&
      typeof value.prompt === "string" &&
      typeof value.genCount === "number";
  }

  return false;
}

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getFirstRow(data: unknown): ClaimedJob | null {
  return Array.isArray(data) && data.length > 0 ? (data[0] as ClaimedJob) : null;
}

async function refundExhaustedJobs(supabase: ReturnType<typeof createAdminClient>) {
  const cutoffMs = Date.now() - getStaleMinutes() * 60 * 1000;
  const { data, error } = await supabase
    .from("generations")
    .select("id,user_id,credits_cost,processing_started_at,error_message")
    .eq("status", "processing_tryon")
    .gte("job_attempts", 3)
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    console.error("[jobs] query exhausted jobs failed:", error.message);
    return 0;
  }

  const jobs = (Array.isArray(data) ? data : []) as ExhaustedJob[];
  const staleJobs = jobs.filter((job) => {
    if (!job.processing_started_at) return true;
    return Date.parse(job.processing_started_at) < cutoffMs;
  });

  for (const job of staleJobs) {
    await failGenerationWithRefund(supabase, {
      userId: job.user_id,
      generationId: job.id,
      amount: Number(job.credits_cost || 0),
      reason: "生成多次失败退还",
      errorMessage: job.error_message || "任务多次重试后仍未完成",
    });
  }

  return staleJobs.length;
}

function getStaleMinutes() {
  const value = Number(process.env.GENERATION_JOB_STALE_MINUTES || 8);
  if (!Number.isFinite(value)) return 8;
  return Math.min(Math.max(value, 1), 60);
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase 服务端环境变量未配置");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}
