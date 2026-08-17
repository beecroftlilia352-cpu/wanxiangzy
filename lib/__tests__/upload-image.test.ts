import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadImage, type UploadResult } from "@/lib/utils";

const SUCCESS_RESULT: UploadResult = {
  url: "https://example.com/original.jpg",
  display_url: "https://example.com/display.jpg",
  delete_url: "",
  width: 1200,
  height: 1600,
};

class MockXMLHttpRequest {
  static status = 200;
  static responseText = JSON.stringify(SUCCESS_RESULT);

  status = MockXMLHttpRequest.status;
  responseText = MockXMLHttpRequest.responseText;
  timeout = 0;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: ((event: ProgressEvent) => void) | null = null;
  onerror: ((event: ProgressEvent) => void) | null = null;
  onabort: ((event: ProgressEvent) => void) | null = null;
  ontimeout: ((event: ProgressEvent) => void) | null = null;

  open() {}

  getResponseHeader(_name: string): string | null {
    return null;
  }

  send() {
    queueMicrotask(() => this.onload?.(new ProgressEvent("load")));
  }

  abort() {
    this.onabort?.(new ProgressEvent("abort"));
  }
}

class HangingImage {
  width = 3000;
  height = 3000;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  set src(_value: string) {
    // Deliberately never notify the caller. This reproduces browser decoders
    // that neither load nor reject an image payload.
  }
}

function installMockXhr(status = 200, body: unknown = SUCCESS_RESULT) {
  MockXMLHttpRequest.status = status;
  MockXMLHttpRequest.responseText = JSON.stringify(body);
  vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("uploadImage", () => {
  it("returns a successful JSON upload response", async () => {
    installMockXhr();

    await expect(uploadImage(new File(["image"], "source.jpg", { type: "image/jpeg" })))
      .resolves.toEqual(SUCCESS_RESULT);
  });

  it("rejects an invalid XHR status instead of leaving the upload pending", async () => {
    installMockXhr(0, {});

    await expect(uploadImage(new File(["image"], "source.jpg", { type: "image/jpeg" })))
      .rejects.toThrow("网络连接异常，上传失败");
  });

  it("retries a transient network failure and keeps the upload result", async () => {
    vi.useFakeTimers();
    installMockXhr();
    let attempts = 0;
    class RetryXMLHttpRequest extends MockXMLHttpRequest {
      send() {
        attempts += 1;
        queueMicrotask(() => {
          if (attempts === 1) this.onerror?.(new ProgressEvent("error"));
          else this.onload?.(new ProgressEvent("load"));
        });
      }
    }
    vi.stubGlobal("XMLHttpRequest", RetryXMLHttpRequest);

    const result = uploadImage(new File(["image"], "source.jpg", { type: "image/jpeg" }));
    await vi.advanceTimersByTimeAsync(700);

    await expect(result).resolves.toEqual(SUCCESS_RESULT);
    expect(attempts).toBe(2);
  });

  it("honors Retry-After before retrying a rate-limited upload", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    class RateLimitedXMLHttpRequest extends MockXMLHttpRequest {
      status = attempts === 0 ? 429 : 200;
      responseText = attempts === 0 ? JSON.stringify({ error: "稍后重试" }) : JSON.stringify(SUCCESS_RESULT);

      getResponseHeader(name: string) {
        return name.toLowerCase() === "retry-after" && this.status === 429 ? "2" : null;
      }

      send() {
        attempts += 1;
        queueMicrotask(() => this.onload?.(new ProgressEvent("load")));
      }
    }
    vi.stubGlobal("XMLHttpRequest", RateLimitedXMLHttpRequest);

    const result = uploadImage(new File(["image"], "source.jpg", { type: "image/jpeg" }));
    await vi.advanceTimersByTimeAsync(1_999);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual(SUCCESS_RESULT);
    expect(attempts).toBe(2);
  });

  it("falls back to the original file when browser preprocessing never settles", async () => {
    vi.useFakeTimers();
    installMockXhr();
    vi.stubGlobal("Image", HangingImage);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:hanging-image"),
      revokeObjectURL: vi.fn(),
    });
    const largeFile = new File(
      [new Uint8Array(15 * 1024 * 1024 + 1)],
      "large-source.jpg",
      { type: "image/jpeg" },
    );

    const result = uploadImage(largeFile);
    await vi.advanceTimersByTimeAsync(20_000);

    await expect(result).resolves.toEqual(SUCCESS_RESULT);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:hanging-image");
  });
});
