import { describe, expect, it, vi } from "vitest";
import type {
  AiToolCreateRequest,
  AiToolSubmitResult,
  MattingOptions,
} from "@/lib/ai-tools/types";
import {
  beginAiToolTaskSubmission,
  claimAiToolOutputPersistence,
  createAiToolRequestFingerprint,
  getReusableAiToolTaskResult,
  type AiToolTaskRecord,
} from "@/lib/api/ai-tools/task-repository.server";

describe("AI tool durable task repository", () => {
  it("creates a stable request fingerprint independent of object key order", () => {
    const first = request({
      subject: "auto",
      background: "transparent",
      edge_refinement: "standard",
      output_format: "png",
    });
    const second = request({
      output_format: "png",
      edge_refinement: "standard",
      background: "transparent",
      subject: "auto",
    });

    expect(createAiToolRequestFingerprint(first)).toBe(createAiToolRequestFingerprint(second));
    expect(createAiToolRequestFingerprint(first)).not.toBe(createAiToolRequestFingerprint({
      ...first,
      source_url: "https://assets.example.com/other.png",
    }));
  });

  it("inserts the ownership binding before provider submission", async () => {
    const row = databaseRow();
    const builder = insertBuilder({ data: row, error: null });
    const client = repositoryClient({ from: vi.fn(() => builder) });

    const result = await beginAiToolTaskSubmission({
      userId: "00000000-0000-4000-8000-000000000010",
      request: request(mattingOptions()),
      provider: "aliyun-segmentation",
      sourceOwnership: {
        assetId: "00000000-0000-4000-8000-000000000020",
        url: "https://assets.example.com/source.png",
        width: 800,
        height: 600,
        proof: "resource_asset",
      },
    }, client);

    expect(result).toMatchObject({ state: "claimed", task: { requestId: "request-1234" } });
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "00000000-0000-4000-8000-000000000010",
      request_id: "request-1234",
      source_asset_id: "00000000-0000-4000-8000-000000000020",
      status: "submitting",
    }));
  });

  it("returns a previously persisted idempotent response instead of claiming again", async () => {
    const persisted = submitResult();
    const duplicate = insertBuilder({ data: null, error: { code: "23505", message: "duplicate" } });
    const lookup = lookupBuilder({
      data: databaseRow({
        provider_task_id: persisted.task_id,
        status: "completed",
        output_persistence_status: "completed",
        output_signature: "b".repeat(64),
        outputs: persisted.outputs,
        result_urls: persisted.result_urls,
        response_payload: persisted,
      }),
      error: null,
    });
    const from = vi.fn()
      .mockReturnValueOnce(duplicate)
      .mockReturnValueOnce(lookup);

    const result = await beginAiToolTaskSubmission({
      userId: "00000000-0000-4000-8000-000000000010",
      request: request(mattingOptions()),
      provider: "aliyun-segmentation",
      sourceOwnership: {
        assetId: null,
        url: "https://assets.example.com/source.png",
        width: 800,
        height: 600,
        proof: "upload_token",
      },
    }, repositoryClient({ from }));

    expect(result).toMatchObject({ state: "existing", result: { task_id: persisted.task_id } });
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("uses the atomic persistence claim RPC and reuses its durable response", async () => {
    const persisted = submitResult();
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        claim_state: "cached",
        persisted_outputs: persisted.outputs,
        persisted_response: persisted,
      }],
      error: null,
    });

    const result = await claimAiToolOutputPersistence({
      task: taskRecord({
        providerTaskId: persisted.task_id,
        status: "completed",
        outputPersistenceStatus: "completed",
        responsePayload: persisted,
      }),
      userId: "00000000-0000-4000-8000-000000000010",
      outputSignature: "b".repeat(64),
    }, repositoryClient({ rpc }));

    expect(result).toEqual({ state: "cached", result: persisted });
    expect(rpc).toHaveBeenCalledWith("claim_ai_tool_output_persistence", expect.objectContaining({
      p_output_signature: "b".repeat(64),
    }));
  });

  it("reports a missing SQL migration as a non-retryable structured 503", async () => {
    const client = repositoryClient({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST202", message: "Could not find claim_ai_tool_output_persistence" },
      }),
    });

    await expect(claimAiToolOutputPersistence({
      task: taskRecord(),
      userId: "00000000-0000-4000-8000-000000000010",
      outputSignature: "c".repeat(64),
    }, client)).rejects.toMatchObject({
      code: "AI_TOOL_TASK_STORE_MIGRATION_REQUIRED",
      status: 503,
      retryable: false,
    });
  });

  it("never reuses an unpersisted completed provider payload", () => {
    const provider = submitResult();
    const task = taskRecord({
      providerTaskId: provider.task_id,
      status: "completed",
      outputPersistenceStatus: "processing",
      responsePayload: provider,
    });

    expect(getReusableAiToolTaskResult(task)).toBeNull();
  });
});

function request(options: MattingOptions): AiToolCreateRequest {
  return {
    request_id: "request-1234",
    operation: "matting",
    source_url: "https://assets.example.com/source.png",
    reference_urls: [],
    options,
  };
}

function mattingOptions(): MattingOptions {
  return {
    subject: "auto",
    background: "transparent",
    edge_refinement: "standard",
    output_format: "png",
  };
}

function submitResult(): AiToolSubmitResult {
  const url = "https://bucket.example/generated/result.png";
  return {
    task_id: "provider-task-1234",
    request_id: "request-1234",
    operation: "matting",
    status: "completed",
    stage: "completed",
    progress: 100,
    expected_count: 1,
    result_urls: [url],
    outputs: [{
      url,
      role: "result",
      kind: "image",
      mime_type: "image/png",
      dimensions: { width: 800, height: 600 },
    }],
    warnings: [],
    error: null,
    execution_mode: "live",
    provider: "aliyun-segmentation",
    capability: "segment",
  };
}

function taskRecord(overrides: Partial<AiToolTaskRecord> = {}): AiToolTaskRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000010",
    requestId: "request-1234",
    provider: "aliyun-segmentation",
    providerTaskId: null,
    operation: "matting",
    requestFingerprint: createAiToolRequestFingerprint(request(mattingOptions())),
    sourceAssetId: null,
    sourceUrl: "https://assets.example.com/source.png",
    sourceWidth: 800,
    sourceHeight: 600,
    sourceOwnership: {},
    requestPayload: request(mattingOptions()),
    status: "submitting",
    providerPayload: {},
    outputs: [],
    resultUrls: [],
    responsePayload: {},
    outputSignature: null,
    outputPersistenceStatus: "pending",
    submissionLeaseToken: "00000000-0000-4000-8000-000000000099",
    submissionLeaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    outputLeaseToken: null,
    outputLeaseExpiresAt: null,
    generationId: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function databaseRow(overrides: Record<string, unknown> = {}) {
  const task = taskRecord();
  return {
    id: task.id,
    user_id: task.userId,
    request_id: task.requestId,
    provider: task.provider,
    provider_task_id: task.providerTaskId,
    operation: task.operation,
    request_fingerprint: task.requestFingerprint,
    source_asset_id: task.sourceAssetId,
    source_url: task.sourceUrl,
    source_width: task.sourceWidth,
    source_height: task.sourceHeight,
    source_ownership: task.sourceOwnership,
    request_payload: task.requestPayload,
    status: task.status,
    provider_payload: task.providerPayload,
    outputs: task.outputs,
    result_urls: task.resultUrls,
    response_payload: task.responsePayload,
    output_signature: task.outputSignature,
    output_persistence_status: task.outputPersistenceStatus,
    submission_lease_token: task.submissionLeaseToken,
    submission_lease_expires_at: task.submissionLeaseExpiresAt,
    output_lease_token: task.outputLeaseToken,
    output_lease_expires_at: task.outputLeaseExpiresAt,
    generation_id: task.generationId,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    ...overrides,
  };
}

function insertBuilder(response: { data: unknown; error: unknown }) {
  const builder = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(response),
  };
  builder.insert.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  return builder;
}

function lookupBuilder(response: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(response),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  return builder;
}

function repositoryClient(overrides: { from?: unknown; rpc?: unknown }) {
  return {
    from: overrides.from || vi.fn(),
    rpc: overrides.rpc || vi.fn(),
  } as unknown as NonNullable<Parameters<typeof beginAiToolTaskSubmission>[1]>;
}
