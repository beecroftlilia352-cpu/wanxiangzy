import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import zhMessages from "@/messages/zh.json";

/**
 * 「商品标题」按钮 + 弹窗组件单测（第二版：用户给条件、点生成才请求）。
 * fetch 全 mock：GET /api/product-title/models 与 POST /api/product-title 都由 mock 提供。
 * canvas 压缩在 jsdom 里跑不了，因此 mock 掉 @/lib/product-title/client 的压缩函数。
 */

const mocks = vi.hoisted(() => ({
  compressProductTitleFile: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock("@/lib/product-title/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/product-title/client")>()),
  compressProductTitleFile: mocks.compressProductTitleFile,
}));

import { ProductTitleButton } from "@/features/general-image/product-title-button";

const TITLES = [
  { en: "Ceramic Pour-Over Coffee Dripper for Home Brewing", zh: "家用陶瓷手冲咖啡滤杯", angle: "功能卖点" },
  { en: "Minimalist Kitchen Gift for Coffee Lovers", zh: "送给咖啡爱好者的极简厨房礼物", angle: "场景人群" },
  { en: "Matte Glazed Stoneware Dripper 1-2 Cups", zh: "哑光釉面陶瓷滤杯 1-2 人份", angle: "材质规格" },
];

const MODELS = [
  { id: "deepseek-flash", name: "DeepSeek-V4.1-Flash", vision: true, contextWindow: 1_048_576, maxOutputTokens: 393_216, effortLevels: ["low", "high", "max"] },
  { id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro", vision: false, contextWindow: 1_048_576, maxOutputTokens: 393_216, effortLevels: ["low", "high", "max"] },
];

const fetchMock = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);
let postBodies: Array<Record<string, unknown>> = [];

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function modelsResponse(payload: unknown = { ok: true, models: MODELS, fallback: false }) {
  return jsonResponse(payload);
}

function titlesResponse() {
  return jsonResponse({ ok: true, model: "deepseek-flash", titles: TITLES });
}

function renderButton() {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <ProductTitleButton />
    </NextIntlClientProvider>,
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "商品标题" }));
}

function generateButton() {
  return screen.getByRole("button", { name: "生成" }) as HTMLButtonElement;
}

function fileInput() {
  return screen.getByTestId("product-title-file-input") as HTMLInputElement;
}

function fakeFiles(count: number): File[] {
  return Array.from({ length: count }, (_, index) => new File(["x"], `photo-${index + 1}.jpg`, { type: "image/jpeg" }));
}

function postCalls() {
  return fetchMock.mock.calls.filter((call) => String(call[0]) === "/api/product-title");
}

function modelSelect() {
  return screen.getByTestId("product-title-model-select") as HTMLSelectElement;
}

describe("ProductTitleButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postBodies = [];
    vi.stubGlobal("fetch", fetchMock);
    mocks.compressProductTitleFile.mockImplementation(async (file: File) => ({
      dataUrl: `data:image/jpeg;base64,${btoa(file.name)}`,
      bytes: 512,
    }));
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/product-title/models") return modelsResponse();
      if (url === "/api/product-title") {
        postBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return titlesResponse();
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("按钮仍是插槽里的「商品标题」样式，打开弹窗不会自动请求生成（只拉模型清单）", async () => {
    renderButton();

    const trigger = screen.getByRole("button", { name: "商品标题" });
    expect(trigger.className).toContain("studio-result-primary-download");
    expect(trigger.className).toContain("studio-result-beside-download");

    openDialog();

    // 弹窗内容出现，但没有任何生成请求
    expect(await screen.findByText("商品图片")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/product-title/models", expect.anything()));
    expect(postCalls()).toHaveLength(0);
    expect(screen.queryByText(TITLES[0].en)).toBeNull();
  });

  it("模型下拉默认选支持图片的模型，并显示是否支持图片", async () => {
    renderButton();
    openDialog();

    await waitFor(() => expect(modelSelect().value).toBe("deepseek-flash"));
    const options = Array.from(modelSelect().options).map((option) => option.textContent);
    expect(options).toEqual([
      "DeepSeek-V4.1-Flash（支持图片）",
      "DeepSeek-V4-Pro（不支持图片，仅文字）",
    ]);
  });

  it("无图无描述时「生成」禁用，填了描述后可用；点生成才发 POST 且 body 含 images/description/model", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(generateButton().disabled).toBe(true);

    fireEvent.change(textarea, { target: { value: "陶瓷手冲滤杯，配不锈钢滤网" } });
    expect(generateButton().disabled).toBe(false);

    fireEvent.click(generateButton());

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(postBodies[0]).toEqual({
      images: [],
      description: "陶瓷手冲滤杯，配不锈钢滤网",
      model: "deepseek-flash",
    });
    expect(await screen.findByText(TITLES[0].en)).toBeTruthy();
    expect(screen.getByText("共 3 条候选")).toBeTruthy();
  });

  it("上传图片（浏览器侧压缩）后才允许只图生成，POST body 带 data URL 与所选模型", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(fileInput(), { target: { files: fakeFiles(2) } });

    await waitFor(() => expect(mocks.compressProductTitleFile).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("已选 2/5 张")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "删除这张图片" })).toHaveLength(2);

    fireEvent.change(modelSelect(), { target: { value: "deepseek-v4-pro" } });
    expect(modelSelect().value).toBe("deepseek-v4-pro");
    // 纯文本模型的提示
    expect(screen.getByText(/不支持图片输入/)).toBeTruthy();

    fireEvent.click(generateButton());

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(postBodies[0]).toEqual({
      images: ["data:image/jpeg;base64,cGhvdG8tMS5qcGc=", "data:image/jpeg;base64,cGhvdG8tMi5qcGc="],
      description: "",
      model: "deepseek-v4-pro",
    });
  });

  it("上传超过 5 张时只接受 5 张并提示", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(fileInput(), { target: { files: fakeFiles(6) } });

    await waitFor(() => expect(screen.getAllByRole("button", { name: "删除这张图片" })).toHaveLength(5));
    expect(await screen.findByText(/最多只能上传 5 张图片/)).toBeTruthy();
    expect(mocks.compressProductTitleFile).toHaveBeenCalledTimes(5);
    expect(screen.getByText("已选 5/5 张")).toBeTruthy();
  });

  it("非图片类型与压缩后过大的图片会被拒绝并给出提示", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(fileInput(), { target: { files: [new File(["x"], "note.txt", { type: "text/plain" })] } });
    expect(await screen.findByText(/只支持图片文件/)).toBeTruthy();

    mocks.compressProductTitleFile.mockResolvedValueOnce({ dataUrl: "data:image/jpeg;base64,QUJD", bytes: 3 * 1024 * 1024 });
    fireEvent.change(fileInput(), { target: { files: fakeFiles(1) } });
    expect(await screen.findByText(/超过 2MB/)).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: "删除这张图片" })).toHaveLength(0);
  });

  it("删除已选图片", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(fileInput(), { target: { files: fakeFiles(3) } });
    await waitFor(() => expect(screen.getAllByRole("button", { name: "删除这张图片" })).toHaveLength(3));

    fireEvent.click(screen.getAllByRole("button", { name: "删除这张图片" })[1]);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "删除这张图片" })).toHaveLength(2));
    expect(screen.getByText("已选 2/5 张")).toBeTruthy();
  });

  it("每条可复制「英文\\n中文」，复制全部包含三条", async () => {
    renderButton();
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "陶瓷滤杯" } });
    fireEvent.click(generateButton());
    await screen.findByText(TITLES[0].en);

    fireEvent.click(screen.getAllByRole("button", { name: "复制" })[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${TITLES[0].en}\n${TITLES[0].zh}`));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("已复制该标题");

    fireEvent.click(screen.getByRole("button", { name: "复制全部" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      `${TITLES[0].en}\n${TITLES[0].zh}\n\n${TITLES[1].en}\n${TITLES[1].zh}\n\n${TITLES[2].en}\n${TITLES[2].zh}`,
    ));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("已复制全部标题");
  });

  it("关闭弹窗不丢结果与已选条件，再次打开不自动请求", async () => {
    renderButton();
    openDialog();
    fireEvent.change(fileInput(), { target: { files: fakeFiles(1) } });
    await waitFor(() => expect(screen.getAllByRole("button", { name: "删除这张图片" })).toHaveLength(1));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "陶瓷滤杯" } });
    fireEvent.click(generateButton());
    await screen.findByText(TITLES[0].en);

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByText(TITLES[0].en)).toBeNull());

    openDialog();

    // 结果与条件都还在
    expect(await screen.findByText(TITLES[0].en)).toBeTruthy();
    expect(screen.getByText("已选 1/5 张")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("陶瓷滤杯");
    // 也只请求过一次生成
    expect(postCalls()).toHaveLength(1);
  });

  it("再次点「生成」用当前条件重新请求并覆盖结果", async () => {
    renderButton();
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "第一版描述" } });
    fireEvent.click(generateButton());
    await screen.findByText(TITLES[0].en);

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/product-title/models") return modelsResponse();
      postBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({
        ok: true,
        model: "deepseek-flash",
        titles: [{ en: "Second Run Title", zh: "第二次标题", angle: "场景人群" }],
      });
    });

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "第二版描述" } });
    fireEvent.click(generateButton());

    expect(await screen.findByText("Second Run Title")).toBeTruthy();
    await waitFor(() => expect(postCalls()).toHaveLength(2));
    expect(postBodies[1].description).toBe("第二版描述");
  });

  it("失败时显示中文错误与「重试」，重试成功后展示结果", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/product-title/models") return modelsResponse();
      postBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (postBodies.length === 1) {
        return jsonResponse({
          ok: false,
          error: "商品标题功能暂不可用：模型控制台里找不到已启用的 DeepSeek 供应商，请联系管理员。",
          code: "PRODUCT_TITLE_PROVIDER_UNAVAILABLE",
        }, 503);
      }
      return titlesResponse();
    });

    renderButton();
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "陶瓷滤杯" } });
    fireEvent.click(generateButton());

    expect(await screen.findByText(/找不到已启用的 DeepSeek 供应商/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText(TITLES[0].en)).toBeTruthy();
    expect(postCalls()).toHaveLength(2);
  });

  it("纯文本模型的错误提示可直接展示（deepseek-v4-pro 不支持图片输入）", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/product-title/models") return modelsResponse();
      postBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({
        ok: false,
        error: "deepseek-v4-pro 不支持图片输入，请填写文字描述或改用 deepseek-flash。",
        code: "PRODUCT_TITLE_MODEL_REQUIRES_TEXT",
      }, 400);
    });

    renderButton();
    openDialog();
    fireEvent.change(fileInput(), { target: { files: fakeFiles(1) } });
    await waitFor(() => expect(screen.getAllByRole("button", { name: "删除这张图片" })).toHaveLength(1));
    fireEvent.change(modelSelect(), { target: { value: "deepseek-v4-pro" } });
    fireEvent.click(generateButton());

    expect(await screen.findByText(/deepseek-v4-pro 不支持图片输入/)).toBeTruthy();
  });

  it("模型清单拉取失败时用内置两个选项，不阻塞使用", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/product-title/models") throw new Error("offline");
      postBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return titlesResponse();
    });

    renderButton();
    openDialog();

    await waitFor(() => expect(modelSelect().options).toHaveLength(2));
    expect(Array.from(modelSelect().options).map((option) => option.value)).toEqual(["deepseek-flash", "deepseek-v4-pro"]);
    expect(screen.getByText(/已使用内置选项/)).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "陶瓷滤杯" } });
    fireEvent.click(generateButton());
    expect(await screen.findByText(TITLES[0].en)).toBeTruthy();
  });

  it("请求中可以取消（AbortController）且不报错", async () => {
    let rejectPending: ((reason?: unknown) => void) | null = null;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/product-title/models") return modelsResponse();
      postBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Promise<Response>((_resolve, reject) => {
        rejectPending = reject;
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    renderButton();
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "陶瓷滤杯" } });
    fireEvent.click(generateButton());

    expect(await screen.findByText("正在生成商品标题…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "取消请求" }));

    await waitFor(() => expect(screen.queryByText("正在生成商品标题…")).toBeNull());
    expect(screen.queryByText(/失败|网络异常/)).toBeNull();
    expect(rejectPending).not.toBeNull();
    // 取消后按钮回到可用状态，可以再次生成
    await waitFor(() => expect(generateButton().disabled).toBe(false));
  });

  it("复制失败时降级提示", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    renderButton();
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "陶瓷滤杯" } });
    fireEvent.click(generateButton());
    await screen.findByText(TITLES[0].en);

    fireEvent.click(screen.getAllByRole("button", { name: "复制" })[0]);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("复制失败，请手动选择文本复制"));
  });
});
