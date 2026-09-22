import { describe, expect, it, vi } from "vitest";

import {
  NonRetryableGenerationError,
  ProviderHttpResponseError,
  RetryableGenerationError,
} from "@/lib/api/generation-errors";
import {
  KIE_FILE_BASE64_UPLOAD_MAX_BYTES,
  KIE_FILE_BASE64_UPLOAD_PATH,
  KIE_FILE_BASE_URL,
  createKieReferenceImageResolver,
  defaultLoadReferenceImageBytes,
  extractMediaAssetIdFromUrl,
  isKieReachableReferenceImageUrl,
  isOwnObjectStorageImageUrl,
  uploadKieBase64File,
} from "@/lib/api/kie-reference-image.server";

/** 测试用假密钥：绝不使用真实 kie key。 */
const TEST_API_KEY = "test-kie-api-key";
const ASSET_ID = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const INTERNAL_URL = `http://192.168.31.213:3000/api/media-assets/${ASSET_ID}`;
const PUBLIC_URL = "https://cdn.example.com/reference.png";
const UPLOAD_DOWNLOAD_URL = `https://tempfile.redpandaai.co/kieai/11656613/images/user-uploads/ref-${ASSET_ID}.jpg`;

function uploadSuccessResponse(downloadUrl = UPLOAD_DOWNLOAD_URL) {
  return new Response(JSON.stringify({
    success: true,
    code: 200,
    msg: "File uploaded successfully",
    data: {
      fileName: `ref-${ASSET_ID}.jpg`,
      filePath: `kieai/11656613/images/user-uploads/ref-${ASSET_ID}.jpg`,
      downloadUrl,
      fileSize: 3,
      mimeType: "image/jpeg",
      uploadedAt: "2026-09-22T10:02:19.028Z",
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

type RecordedCall = { url: string; method: string; headers: Record<string, string>; body: unknown };

function recordingFetch(responder: (call: RecordedCall, index: number) => Response) {
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const call: RecordedCall = {
      url: String(url),
      method: String(init?.method || "GET"),
      headers: (init?.headers || {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    };
    calls.push(call);
    return responder(call, calls.length - 1);
  });
  return { fetchMock: fetchMock as unknown as typeof fetch, calls };
}

/** 参考图字节读取的打桩实现，避开存储/数据库依赖。 */
function stubBytesLoader(bytes = new Uint8Array([1, 2, 3]), contentType = "image/jpeg") {
  return vi.fn(async () => ({ bytes, contentType, sourceId: ASSET_ID }));
}

describe("kie 参考图地址判定", () => {
  it("只把公网 http(s) 地址判定为 kie 可取", () => {
    expect(isKieReachableReferenceImageUrl(PUBLIC_URL)).toBe(true);
    expect(isKieReachableReferenceImageUrl("https://tempfile.redpandaai.co/kieai/1/a.jpg")).toBe(true);
    for (const internal of [
      INTERNAL_URL,
      "http://127.0.0.1:3000/api/media-assets/" + ASSET_ID,
      "http://localhost:3000/x.png",
      "http://10.0.0.8/x.png",
      "http://172.16.5.5/x.png",
      "http://169.254.169.254/latest/meta-data",
      "/api/media-assets/" + ASSET_ID,
      "data:image/png;base64,aGVsbG8=",
    ]) {
      expect(isKieReachableReferenceImageUrl(internal), internal).toBe(false);
    }
  });

  it("从相对或内网绝对地址里取出 canonical 媒体资产 ID", () => {
    expect(extractMediaAssetIdFromUrl(INTERNAL_URL)).toBe(ASSET_ID);
    expect(extractMediaAssetIdFromUrl(`/api/media-assets/${ASSET_ID}`)).toBe(ASSET_ID);
    expect(extractMediaAssetIdFromUrl(PUBLIC_URL)).toBeNull();
  });

  it("对象存储地址在本机可读，但没有配置存储适配器时不误判", () => {
    expect(isOwnObjectStorageImageUrl(PUBLIC_URL)).toBe(false);
    expect(isOwnObjectStorageImageUrl(INTERNAL_URL)).toBe(false);
  });
});

describe("kie 文件服务 base64 上传", () => {
  it("打到唯一可用的主机与端点，并带上 bearer 与 JSON 载荷", async () => {
    const { fetchMock, calls } = recordingFetch(() => uploadSuccessResponse());

    const result = await uploadKieBase64File({
      apiKey: TEST_API_KEY,
      dataUrl: "data:image/jpeg;base64,AQID",
      fileName: `ref-${ASSET_ID}.jpg`,
      fetchImpl: fetchMock,
    });

    expect(result.downloadUrl).toBe(UPLOAD_DOWNLOAD_URL);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(KIE_FILE_BASE_URL + KIE_FILE_BASE64_UPLOAD_PATH);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers).toMatchObject({
      Authorization: "Bearer " + TEST_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    expect(calls[0].body).toEqual({
      base64Data: "data:image/jpeg;base64,AQID",
      uploadPath: "images/user-uploads",
      fileName: `ref-${ASSET_ID}.jpg`,
    });
  });

  it("拒收状态码映射到既有错误类型：鉴权可切换部署、参数不可重试、瞬时故障可重试", async () => {
    const unauthorized = recordingFetch(() => new Response(JSON.stringify({ code: 401, msg: "Unauthorized" }), { status: 401 }));
    await expect(uploadKieBase64File({
      apiKey: TEST_API_KEY, dataUrl: "data:image/jpeg;base64,AQID", fileName: "ref.jpg", fetchImpl: unauthorized.fetchMock,
    })).rejects.toMatchObject({
      name: "ProviderHttpResponseError",
      status: 401,
      safeToFailover: true,
      code: "KIE_REFERENCE_IMAGE_UPLOAD_401",
    });

    const badRequest = recordingFetch(() => new Response(JSON.stringify({ code: 400, msg: "invalid base64Data" }), { status: 400 }));
    await expect(uploadKieBase64File({
      apiKey: TEST_API_KEY, dataUrl: "data:image/jpeg;base64,AQID", fileName: "ref.jpg", fetchImpl: badRequest.fetchMock,
    })).rejects.toBeInstanceOf(NonRetryableGenerationError);

    const serverError = recordingFetch(() => new Response("upstream unavailable", { status: 503 }));
    await expect(uploadKieBase64File({
      apiKey: TEST_API_KEY, dataUrl: "data:image/jpeg;base64,AQID", fileName: "ref.jpg", fetchImpl: serverError.fetchMock,
    })).rejects.toBeInstanceOf(RetryableGenerationError);

    const networkError = vi.fn(async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    await expect(uploadKieBase64File({
      apiKey: TEST_API_KEY, dataUrl: "data:image/jpeg;base64,AQID", fileName: "ref.jpg", fetchImpl: networkError,
    })).rejects.toMatchObject({ name: "RetryableGenerationError", code: "KIE_REFERENCE_IMAGE_UPLOAD_NETWORK" });

    // 2xx 但没有可用的公网 downloadUrl：不能提交任务，也不重放。
    const emptyData = recordingFetch(() => new Response(JSON.stringify({ success: true, code: 200, data: {} }), { status: 200 }));
    await expect(uploadKieBase64File({
      apiKey: TEST_API_KEY, dataUrl: "data:image/jpeg;base64,AQID", fileName: "ref.jpg", fetchImpl: emptyData.fetchMock,
    })).rejects.toMatchObject({ name: "NonRetryableGenerationError", code: "KIE_REFERENCE_IMAGE_UPLOAD_INVALID_RESPONSE" });

    // 信封 code 非 200 时同样按状态码语义分类。
    const envelopeAuth = recordingFetch(() => new Response(JSON.stringify({ code: 401, msg: "Unauthorized" }), { status: 200 }));
    await expect(uploadKieBase64File({
      apiKey: TEST_API_KEY, dataUrl: "data:image/jpeg;base64,AQID", fileName: "ref.jpg", fetchImpl: envelopeAuth.fetchMock,
    })).rejects.toBeInstanceOf(ProviderHttpResponseError);
  });
});

describe("kie 参考图转存解析器", () => {
  it("内网参考图触发一次 base64 上传，并用 downloadUrl 替换原地址", async () => {
    const loadBytes = stubBytesLoader();
    const { fetchMock, calls } = recordingFetch(() => uploadSuccessResponse());
    const resolve = createKieReferenceImageResolver({ loadBytes, fetchImpl: fetchMock, log: () => {} });

    const resolved = await resolve({
      imageUrls: [INTERNAL_URL],
      apiKey: TEST_API_KEY,
      apiBase: "https://api.kie.ai",
      fetchImpl: fetchMock,
    });

    expect(resolved).toEqual([UPLOAD_DOWNLOAD_URL]);
    expect(loadBytes).toHaveBeenCalledOnce();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(KIE_FILE_BASE_URL + KIE_FILE_BASE64_UPLOAD_PATH);
    const body = calls[0].body as { base64Data: string; fileName: string; uploadPath: string };
    expect(body.base64Data).toBe("data:image/jpeg;base64,AQID");
    // 文件名带 assetId：同一文件名在 kie 侧会覆盖，必须保证唯一。
    expect(body.fileName).toBe(`ref-${ASSET_ID}.jpg`);
    expect(body.uploadPath).toBe("images/user-uploads");
    // 内网地址绝不能出现在上传载荷里。
    expect(JSON.stringify(calls[0].body)).not.toContain("192.168.31.213");
  });

  it("相对路径参考图与内网参考图同样触发转存", async () => {
    const loadBytes = stubBytesLoader();
    const { fetchMock, calls } = recordingFetch(() => uploadSuccessResponse());
    const resolve = createKieReferenceImageResolver({ loadBytes, fetchImpl: fetchMock, log: () => {} });

    const resolved = await resolve({
      imageUrls: [`/api/media-assets/${ASSET_ID}`],
      apiKey: TEST_API_KEY,
      apiBase: "https://api.kie.ai",
      fetchImpl: fetchMock,
    });

    expect(resolved).toEqual([UPLOAD_DOWNLOAD_URL]);
    expect(calls).toHaveLength(1);
  });

  it("公网参考图不上传，URL 原样返回", async () => {
    const loadBytes = stubBytesLoader();
    const { fetchMock, calls } = recordingFetch(() => uploadSuccessResponse());
    const resolve = createKieReferenceImageResolver({ loadBytes, fetchImpl: fetchMock, log: () => {} });

    const resolved = await resolve({
      imageUrls: [PUBLIC_URL],
      apiKey: TEST_API_KEY,
      apiBase: "https://api.kie.ai",
      fetchImpl: fetchMock,
    });

    expect(resolved).toEqual([PUBLIC_URL]);
    expect(loadBytes).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("混合输入只转存取不到的图片，并保持顺序", async () => {
    const loadBytes = stubBytesLoader();
    const { fetchMock, calls } = recordingFetch(() => uploadSuccessResponse());
    const resolve = createKieReferenceImageResolver({ loadBytes, fetchImpl: fetchMock, log: () => {} });

    const resolved = await resolve({
      imageUrls: [PUBLIC_URL, INTERNAL_URL],
      apiKey: TEST_API_KEY,
      apiBase: "https://api.kie.ai",
      fetchImpl: fetchMock,
    });

    expect(resolved).toEqual([PUBLIC_URL, UPLOAD_DOWNLOAD_URL]);
    expect(calls).toHaveLength(1);
  });

  it("同一次生成内同一张参考图只上传一次（含重试）", async () => {
    const loadBytes = stubBytesLoader();
    const { fetchMock, calls } = recordingFetch(() => uploadSuccessResponse());
    const resolve = createKieReferenceImageResolver({ loadBytes, fetchImpl: fetchMock, log: () => {} });

    const first = await resolve({ imageUrls: [INTERNAL_URL], apiKey: TEST_API_KEY, apiBase: "https://api.kie.ai", fetchImpl: fetchMock });
    const second = await resolve({ imageUrls: [INTERNAL_URL], apiKey: TEST_API_KEY, apiBase: "https://api.kie.ai", fetchImpl: fetchMock });

    expect(first).toEqual([UPLOAD_DOWNLOAD_URL]);
    expect(second).toEqual([UPLOAD_DOWNLOAD_URL]);
    expect(calls).toHaveLength(1);
    expect(loadBytes).toHaveBeenCalledOnce();
  });

  it("并发解析同一张参考图只上传一次", async () => {
    const loadBytes = stubBytesLoader();
    const { fetchMock, calls } = recordingFetch(() => uploadSuccessResponse());
    const resolve = createKieReferenceImageResolver({ loadBytes, fetchImpl: fetchMock, log: () => {} });

    const [first, second] = await Promise.all([
      resolve({ imageUrls: [INTERNAL_URL], apiKey: TEST_API_KEY, apiBase: "https://api.kie.ai", fetchImpl: fetchMock }),
      resolve({ imageUrls: [INTERNAL_URL], apiKey: TEST_API_KEY, apiBase: "https://api.kie.ai", fetchImpl: fetchMock }),
    ]);

    expect(first).toEqual(second);
    expect(calls).toHaveLength(1);
  });

  it("上传失败按既有类型抛出，并且失败结果不写入缓存（重试会重新上传）", async () => {
    const loadBytes = stubBytesLoader();
    let attempts = 0;
    const fetchMock = vi.fn(async () => {
      attempts += 1;
      return attempts === 1
        ? new Response(JSON.stringify({ code: 500, msg: "Server Error" }), { status: 500 })
        : uploadSuccessResponse();
    }) as unknown as typeof fetch;
    const resolve = createKieReferenceImageResolver({ loadBytes, fetchImpl: fetchMock, log: () => {} });

    await expect(resolve({
      imageUrls: [INTERNAL_URL], apiKey: TEST_API_KEY, apiBase: "https://api.kie.ai", fetchImpl: fetchMock,
    })).rejects.toBeInstanceOf(RetryableGenerationError);

    await expect(resolve({
      imageUrls: [INTERNAL_URL], apiKey: TEST_API_KEY, apiBase: "https://api.kie.ai", fetchImpl: fetchMock,
    })).resolves.toEqual([UPLOAD_DOWNLOAD_URL]);
    expect(attempts).toBe(2);
  });

  it("鉴权失败不可重试，并向上抛出 ProviderHttpResponseError", async () => {
    const { fetchMock } = recordingFetch(() => new Response(JSON.stringify({ code: 401, msg: "Unauthorized" }), { status: 401 }));
    const resolve = createKieReferenceImageResolver({
      loadBytes: stubBytesLoader(),
      fetchImpl: fetchMock,
      log: () => {},
    });

    await expect(resolve({
      imageUrls: [INTERNAL_URL], apiKey: TEST_API_KEY, apiBase: "https://api.kie.ai", fetchImpl: fetchMock,
    })).rejects.toMatchObject({ name: "ProviderHttpResponseError", status: 401, safeToFailover: true });
  });

  it("超过 10MB 的参考图直接给出明确错误，不发上传请求", async () => {
    const oversized = new Uint8Array(KIE_FILE_BASE64_UPLOAD_MAX_BYTES + 1);
    const { fetchMock, calls } = recordingFetch(() => uploadSuccessResponse());
    const resolve = createKieReferenceImageResolver({
      loadBytes: stubBytesLoader(oversized),
      fetchImpl: fetchMock,
      log: () => {},
    });

    await expect(resolve({
      imageUrls: [INTERNAL_URL], apiKey: TEST_API_KEY, apiBase: "https://api.kie.ai", fetchImpl: fetchMock,
    })).rejects.toMatchObject({ name: "NonRetryableGenerationError", code: "KIE_REFERENCE_IMAGE_TOO_LARGE" });
    expect(calls).toHaveLength(0);
  });

  it("字节读取失败时保留原有错误类型", async () => {
    const loadBytes = vi.fn(async () => {
      throw new NonRetryableGenerationError(
        "媒体资产不可读或尚未完成安全校验（assetId=" + ASSET_ID + "）",
        "KIE_REFERENCE_IMAGE_ASSET_UNAVAILABLE",
      );
    });
    const { fetchMock, calls } = recordingFetch(() => uploadSuccessResponse());
    const resolve = createKieReferenceImageResolver({ loadBytes, fetchImpl: fetchMock, log: () => {} });

    await expect(resolve({
      imageUrls: [INTERNAL_URL], apiKey: TEST_API_KEY, apiBase: "https://api.kie.ai", fetchImpl: fetchMock,
    })).rejects.toMatchObject({ name: "NonRetryableGenerationError", code: "KIE_REFERENCE_IMAGE_ASSET_UNAVAILABLE" });
    expect(calls).toHaveLength(0);
  });

  it("默认字节读取对既非公网、又非站内媒体资产的地址给出不可读错误", async () => {
    await expect(defaultLoadReferenceImageBytes("http://10.1.2.3:8080/private/reference.png"))
      .rejects.toMatchObject({
        name: "NonRetryableGenerationError",
        code: "KIE_REFERENCE_IMAGE_UNREADABLE",
      });
    // 站内媒体资产但缺少 bucket 配置时给出明确的不可重试错误，而不是静默降级。
    await expect(defaultLoadReferenceImageBytes(`/api/media-assets/${ASSET_ID}`))
      .rejects.toMatchObject({
        name: "NonRetryableGenerationError",
        code: "KIE_REFERENCE_IMAGE_STORAGE_NOT_CONFIGURED",
      });
  });

  it("日志只记录 assetId 与主机名，不泄露内网 URL 与密钥", async () => {
    const logs: string[] = [];
    const { fetchMock } = recordingFetch(() => uploadSuccessResponse());
    const resolve = createKieReferenceImageResolver({
      loadBytes: stubBytesLoader(),
      fetchImpl: fetchMock,
      log: (message) => logs.push(message),
    });

    await resolve({ imageUrls: [INTERNAL_URL], apiKey: TEST_API_KEY, apiBase: "https://api.kie.ai", fetchImpl: fetchMock });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain(ASSET_ID);
    expect(logs[0]).toContain("192.168.31.213");
    expect(logs[0]).not.toContain(TEST_API_KEY);
    expect(logs[0]).not.toContain("Bearer");
    expect(logs[0]).not.toContain("tempfile");
  });
});
