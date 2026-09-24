import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCT_TITLE_DEFAULT_DESCRIPTION, PRODUCT_TITLE_SPEC } from "@/lib/product-title/prompt";
import { PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH } from "@/lib/product-title/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import zhMessages from "@/messages/zh.json";

/**
 * 「商品标题」按钮 + 弹窗组件单测（第四版：SHEIN 欧洲站规范 → 3 条纯英文标题 + 逐条字符数）。
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
  "Foldable Laundry Drying Rack for Small Balcony, Space Saving Clothes Hanger",
  "Wall Mounted Clothes Drying Rack for Balcony Apartment, Collapsible Organizer",
  "Space Saving Laundry Drying Rack for Indoor Outdoor Use, Portable Airer",
];
const TITLE = TITLES[0];

/** 服务端给的中文对照（逐条对应上面的英文标题；只作展示，不参与任何判定）。 */
const ZH = [
  "可折叠晾衣架，适合小阳台，省空间的衣物晾晒架",
  "阳台公寓用壁挂式衣物晾衣架，可折叠收纳",
  "室内室外两用的省空间晾衣架，便携式晾衣架",
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

/** 一条候选（默认干净、带中文对照；按需覆盖 title/zh/charCount/overLimit/lint）。 */
function item(index: number, overrides: Record<string, unknown> = {}) {
  return {
    title: TITLES[index],
    zh: ZH[index],
    charCount: TITLES[index].length,
    overLimit: false,
    lint: { hasForbidden: false, hits: [] },
    ...overrides,
  };
}

/** 成功响应：默认 3 条干净标题，字符数由服务端给。 */
function titleResponse(overrides: Record<string, unknown> = {}) {
  return jsonResponse({
    ok: true,
    model: "deepseek-flash",
    titles: [item(0), item(1), item(2)],
    ...overrides,
  });
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

/** 第 1 条结果（结果区是 3 条，逐条 testid 带序号）。 */
function result() {
  return screen.getByTestId("product-title-title-1");
}

function titleAt(index: number) {
  return screen.getByTestId(`product-title-title-${index}`);
}

function charCountAt(index: number) {
  return screen.getByTestId(`product-title-char-count-${index}`);
}

/** 该条英文标题下方的中文对照行（缺失时这一行不存在）。 */
function zhAt(index: number) {
  return screen.getByTestId(`product-title-zh-${index}`);
}

function copyButtonAt(index: number) {
  return screen.getByRole("button", { name: `复制第 ${index} 条` });
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

/**
 * 造一个「像 DataTransfer」的剪贴板对象：jsdom 没有 DataTransfer / ClipboardEvent，
 * 但 readProductTitleClipboardPaste 只要求结构一致（files / items / types / getData）。
 * 不带 text 时 getData 返回空串 —— 正是截图 / 复制图片文件时真实剪贴板的样子。
 */
function clipboardData(input: { files?: File[]; text?: string; html?: string } = {}) {
  const files = input.files ?? [];
  return {
    files,
    items: files.map((file) => ({ kind: "file", type: file.type, getAsFile: () => file })),
    types: [
      ...(files.length ? ["Files"] : []),
      ...(input.text ? ["text/plain"] : []),
      ...(input.html ? ["text/html"] : []),
    ],
    getData: (format: string) => {
      if (format === "text/plain") return input.text ?? "";
      if (format === "text/html") return input.html ?? "";
      return "";
    },
  };
}

/** 在给定节点上派发一次 paste；返回 false = 被拦截（preventDefault），true = 放行给浏览器。 */
function pasteAt(node: Element, input: { files?: File[]; text?: string; html?: string } = {}) {
  return fireEvent.paste(node, { clipboardData: clipboardData(input) });
}

/**
 * 真实浏览器粘贴一张截图时剪贴板的真实形状：clipboardData.files 与
 * clipboardData.items[i].getAsFile() 是**两个内容/元数据相同但对象不同**的 File。
 * 上面的 clipboardData() 两个来源放的是同一个对象，拓不到「粘一次加两张」这一层。
 */
function browserClipboardData(name = "screenshot.png", type = "image/png") {
  const viaFiles = new File(["pasted"], name, { type, lastModified: 1_700_000_000_000 });
  const viaItems = new File(["pasted"], name, { type, lastModified: 1_700_000_000_000 });
  return {
    clipboardData: {
      files: [viaFiles],
      items: [{ kind: "file", type, getAsFile: () => viaItems }],
      types: ["Files"],
      getData: () => "",
    },
  };
}

function dropzone() {
  return screen.getByTestId("product-title-dropzone");
}

function selectedImageButtons() {
  return screen.queryAllByRole("button", { name: "删除这张图片" });
}

/** 粘贴用的图片文件（截图/复制图片文件在浏览器里就是带着真实 MIME 的 File）。 */
function pastedImage(name: string, type = "image/png"): File {
  return new File(["pasted"], name, { type });
}

function pastedFileNames(): string[] {
  return mocks.compressProductTitleFile.mock.calls.map((call) => (call[0] as File).name);
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
        return titleResponse();
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
    expect(screen.queryByTestId("product-title-title-1")).toBeNull();
  });

  it("描述输入框默认带整段规范文案，标签/占位覆盖「商品名称 / 商品信息」语义", async () => {
    renderButton();
    openDialog();

    expect(await screen.findByText("商品名称 / 商品信息")).toBeTruthy();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    // 默认值与上游拼装同源（prompt.ts 的规范常量），不是组件里写死的另一份文案
    expect(textarea.value).toBe(PRODUCT_TITLE_DEFAULT_DESCRIPTION);
    expect(textarea.value).toContain("SHEIN");
    expect(textarea.value).toContain("4. 禁词：");
    expect(textarea.value).toContain("生成前自行检查：≤250字符、无禁词、无虚构属性、关键词高度相关、英文自然，符合欧洲消费者搜索表达。");
    expect(textarea.getAttribute("placeholder")).toContain("商品名称");
    expect(textarea.getAttribute("placeholder")).toContain("商品信息");
    expect(textarea.getAttribute("maxlength")).toBe(String(PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH));
    // 计数器上限跟着常量走（现在放宽到 6000）
    expect(screen.getByText(`${PRODUCT_TITLE_DEFAULT_DESCRIPTION.length}/${PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH} 字`)).toBeTruthy();
    // 打开弹窗就把光标放到末尾，方便接着往后补充
    expect(textarea.selectionStart).toBe(PRODUCT_TITLE_DEFAULT_DESCRIPTION.length);
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

  it("文本框默认内容可直接生成；清空后「生成」禁用；点生成只发一次 POST 且 body 含 images/description/model", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    // 默认已带整段规范：不用用户输入任何东西就能生成
    expect(generateButton().disabled).toBe(false);

    // 用户清空后按实际内容走（按钮禁用），不强行回填默认值
    fireEvent.change(textarea, { target: { value: "" } });
    expect(textarea.value).toBe("");
    expect(generateButton().disabled).toBe(true);

    fireEvent.change(textarea, { target: { value: "折叠晾衣架，家用阳台" } });
    expect(generateButton().disabled).toBe(false);

    fireEvent.click(generateButton());

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(postBodies[0]).toEqual({
      images: [],
      description: "折叠晾衣架，家用阳台",
      model: "deepseek-flash",
    });
    // 3 条都展示出来，每条都有自己的字符数
    expect(screen.getByTestId("product-title-results")).toBeTruthy();
    expect(screen.getAllByTestId(/^product-title-title-\d$/)).toHaveLength(3);
    TITLES.forEach((title, index) => {
      expect(titleAt(index + 1).textContent).toBe(title);
      // 标题文本就是纯英文（中文对照在它下面单独一行，不混进标题里）
      expect(titleAt(index + 1).textContent).not.toMatch(/[\u4e00-\u9fa5]/);
      expect(charCountAt(index + 1).textContent).toBe(`字符数 ${title.length}`);
      // 每条英文标题下方都有一行中文对照
      expect(zhAt(index + 1).textContent).toBe(ZH[index]);
    });
    // 顶部：共 N 条候选 + 「复制全部」
    expect(screen.getByText("共 3 条候选")).toBeTruthy();
    expect(screen.getByRole("button", { name: "复制全部" })).toBeTruthy();
    // 结果区不再出现卖点角度
    const resultAreaText = screen.getByTestId("product-title-results").textContent ?? "";
    expect(resultAreaText).not.toContain("卖点角度");
  });

  it("中文对照排在英文标题下方，用次要样式（更小字号、降低对比度、可选中、可换行）", async () => {
    renderButton();
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "折叠晾衣架" } });
    fireEvent.click(generateButton());

    await waitFor(() => expect(titleAt(1).textContent).toBe(TITLE));

    const en = titleAt(1);
    const zh = zhAt(1);

    // 英文标题：原来的主要样式（字号/字重不变）
    expect(en.className).toContain("text-sm");
    expect(en.className).toContain("font-semibold");
    expect(en.className).toContain("text-foreground");
    expect(en.className).toContain("select-text");
    // 中文对照：次要样式 + 可选中 + 允许换行
    expect(zh.className).toContain("text-xs");
    expect(zh.className).toContain("text-muted-foreground/90");
    expect(zh.className).toContain("select-text");
    expect(zh.className).toContain("break-words");

    // 同一行 li 里：英文标题在前、中文对照紧跟其后（中间不是别的元素）
    const li = en.closest("li") as HTMLElement;
    const textOrder = li.textContent ?? "";
    expect(textOrder.indexOf(TITLE)).toBeGreaterThanOrEqual(0);
    expect(textOrder.indexOf(ZH[0])).toBeGreaterThan(textOrder.indexOf(TITLE));
    expect(en.nextElementSibling).toBe(zh);

    // 每条都有自己的一行中文对照（共 3 行）
    expect(screen.getAllByTestId(/^product-title-zh-\d$/)).toHaveLength(3);
  });

  it("中文对照缺失/非字符串/空白时不渲染那一行（不留空白占位），标题与字符数照常展示", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/product-title/models") return modelsResponse();
      postBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({
        ok: true,
        model: "deepseek-flash",
        titles: [
          item(0),
          // zh 是空白串 → 当没有
          item(1, { zh: "   " }),
          // 完全没有 zh 字段
          { title: TITLES[2], charCount: TITLES[2].length, overLimit: false, lint: { hasForbidden: false, hits: [] } },
        ],
      });
    });

    renderButton();
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "折叠晾衣架" } });
    fireEvent.click(generateButton());

    await waitFor(() => expect(titleAt(1).textContent).toBe(TITLES[0]));

    // 只有第 1 条有中文对照 → 只渲染 1 行，另外两条不留空白占位
    expect(screen.getAllByTestId(/^product-title-zh-\d$/)).toHaveLength(1);
    expect(zhAt(1).textContent).toBe(ZH[0]);
    expect(screen.queryByTestId("product-title-zh-2")).toBeNull();
    expect(screen.queryByTestId("product-title-zh-3")).toBeNull();
    // 3 条英文标题与字符数都不受影响
    expect(screen.getAllByTestId(/^product-title-title-\d$/)).toHaveLength(3);
    expect(titleAt(3).textContent).toBe(TITLES[2]);
    expect(charCountAt(3).textContent).toBe(`字符数 ${TITLES[2].length}`);
  });

  it("模型少给 1 条时按实际条数展示（不报错、不硬凑 3 条）", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/product-title/models") return modelsResponse();
      postBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({ ok: true, model: "deepseek-flash", titles: [item(0)] });
    });

    renderButton();
    openDialog();
    fireEvent.click(generateButton());

    await waitFor(() => expect(titleAt(1).textContent).toBe(TITLE));
    expect(screen.getAllByTestId(/^product-title-title-\d$/)).toHaveLength(1);
    expect(screen.getByText("共 1 条候选")).toBeTruthy();
  });

  it("不改文本框时把默认的整段规范一起发给上游；「恢复默认文案」可一键还原", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: `${PRODUCT_TITLE_DEFAULT_DESCRIPTION}\n\n折叠晾衣架，家用阳台` } });
    fireEvent.click(generateButton());
    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(postBodies[0].description).toBe(`${PRODUCT_TITLE_DEFAULT_DESCRIPTION}\n\n折叠晾衣架，家用阳台`);

    // 用户在规范中间删改后，一键恢复默认文案
    fireEvent.change(textarea, { target: { value: "折叠晾衣架" } });
    expect(textarea.value).toBe("折叠晾衣架");
    fireEvent.click(screen.getByRole("button", { name: "恢复默认文案" }));
    expect(textarea.value).toBe(PRODUCT_TITLE_DEFAULT_DESCRIPTION);
    expect(textarea.value).toBe(PRODUCT_TITLE_SPEC);

    // 恢复后不会自动重新请求
    expect(postCalls()).toHaveLength(1);
  });

  it("文本框长度上限按常量（6000）生效，超出部分被截断", async () => {
    renderButton();
    openDialog();

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH).toBe(6000);
    fireEvent.change(textarea, { target: { value: "描".repeat(PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH + 500) } });
    expect(textarea.value).toHaveLength(PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH);
    expect(screen.getByText(`${PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH}/${PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH} 字`)).toBeTruthy();
  });

  it("每条的字符数以服务端返回值逐条为准（即使与前端按长度算的不同）", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/product-title/models") return modelsResponse();
      postBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({
        ok: true,
        model: "deepseek-flash",
        titles: [item(0, { charCount: 140 }), item(1, { charCount: 199 }), item(2)],
      });
    });

    renderButton();
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "折叠晾衣架" } });
    fireEvent.click(generateButton());

    await waitFor(() => expect(charCountAt(1).textContent).toBe("字符数 140"));
    expect(charCountAt(2).textContent).toBe("字符数 199");
    expect(charCountAt(3).textContent).toBe(`字符数 ${TITLES[2].length}`);
    expect(titleAt(1).textContent).toBe(TITLE);
  });

  it("单条复制只复制那一条纯英文标题（不带字符数、不带中文对照），并且只高亮那一条", async () => {
    renderButton();
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "折叠晾衣架" } });
    fireEvent.click(generateButton());
    await waitFor(() => expect(result().textContent).toBe(TITLE));

    // 那一条确实带着中文对照（在英文标题下面一行）
    expect(zhAt(2).textContent).toBe(ZH[1]);

    fireEvent.click(copyButtonAt(2));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TITLES[1]));
    expect(writeText).toHaveBeenCalledTimes(1);
    // 复制内容里绝不包含中文对照
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining(ZH[1]));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("已复制第 2 条标题");
    // 只有被点的那一条切成「已复制」状态，其余两条仍是「复制第 N 条」
    expect(screen.getByRole("button", { name: "已复制" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "复制第 1 条" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "复制第 3 条" })).toBeTruthy();
  });

  it("「复制全部」把 3 条以换行分隔复制（只复制英文标题，不含中文对照）", async () => {
    renderButton();
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "折叠晾衣架" } });
    fireEvent.click(generateButton());
    await waitFor(() => expect(result().textContent).toBe(TITLE));

    // 三条都带中文对照，但复制全部只取英文
    expect(screen.getAllByTestId(/^product-title-zh-\d$/)).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "复制全部" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TITLES.join("\n")));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining(ZH[0]));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("已复制全部标题");
  });

  it("某一条超长（overLimit）时只在那一条下方给低对比度提示", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/product-title/models") return modelsResponse();
      postBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({
        ok: true,
        model: "deepseek-flash",
        titles: [item(0), item(1, { charCount: 319, overLimit: true }), item(2)],
        repaired: false,
      });
    });

    renderButton();
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "折叠晾衣架" } });
    fireEvent.click(generateButton());

    expect(await screen.findByText("标题超过 250 字符上限，请人工精简后再上架。")).toBeTruthy();
    // 只有第 2 条超长 → 提示只出现一次
    expect(screen.getAllByText("标题超过 250 字符上限，请人工精简后再上架。")).toHaveLength(1);
    expect(charCountAt(2).textContent).toBe("字符数 319");
    expect(charCountAt(1).textContent).toBe(`字符数 ${TITLES[0].length}`);
  });

  it("逐条 lint 命中禁词时提示并列出该条命中原词（材质/尺寸词不算命中、不提示）", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/product-title/models") return modelsResponse();
      postBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({
        ok: true,
        model: "deepseek-flash",
        titles: [
          // 材质词（Stainless Steel）与尺寸数字（45cm）属于新规范要求的标题结构：lint 为空、不提示
          item(0, {
            title: "Stainless Steel Mop Head 45cm Washable",
            charCount: "Stainless Steel Mop Head 45cm Washable".length,
            lint: { hasForbidden: false, hits: [] },
          }),
          item(1, { lint: { hasForbidden: true, hits: ["Safe"] } }),
          item(2, { lint: { hasForbidden: true, hits: ["Recyclable"] } }),
        ],
        repaired: false,
      });
    });

    renderButton();
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "超细纤维清洁头" } });
    fireEvent.click(generateButton());

    expect(await screen.findByText(/（Safe）/)).toBeTruthy();
    expect(screen.getByText(/（Recyclable）/)).toBeTruthy();
    // 干净的那条（哪怕带材质/尺寸词）不提示 → 一共 2 条提示
    expect(screen.getAllByText(/标题可能含平台禁词/)).toHaveLength(2);
    // 依然原样展示 3 条，不静默改写
    expect(titleAt(1).textContent).toBe("Stainless Steel Mop Head 45cm Washable");
    expect(titleAt(2).textContent).toBe(TITLES[1]);
    expect(titleAt(3).textContent).toBe(TITLES[2]);
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

    // 清空文本框后就是「只图生成」（清空不回填默认值）
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
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

  it("关闭弹窗不丢结果与已选条件，再次打开不自动请求", async () => {
    renderButton();
    openDialog();
    fireEvent.change(fileInput(), { target: { files: fakeFiles(1) } });
    await waitFor(() => expect(screen.getAllByRole("button", { name: "删除这张图片" })).toHaveLength(1));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "折叠晾衣架" } });
    fireEvent.click(generateButton());
    await waitFor(() => expect(result().textContent).toBe(TITLE));

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByTestId("product-title-title-1")).toBeNull());

    openDialog();

    // 结果与条件都还在
    expect((await screen.findByTestId("product-title-title-1")).textContent).toBe(TITLE);
    expect(screen.getByText("已选 1/5 张")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("折叠晾衣架");
    // 也只请求过一次生成
    expect(postCalls()).toHaveLength(1);
  });

  it("再次点「生成」用当前条件重新请求并覆盖结果", async () => {
    renderButton();
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "第一版描述" } });
    fireEvent.click(generateButton());
    await waitFor(() => expect(result().textContent).toBe(TITLE));

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/product-title/models") return modelsResponse();
      postBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return titleResponse({ titles: [item(0, { title: "Second Run Title", charCount: "Second Run Title".length }), item(1), item(2)] });
    });

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "第二版描述" } });
    fireEvent.click(generateButton());

    await waitFor(() => expect(result().textContent).toBe("Second Run Title"));
    expect(charCountAt(1).textContent).toBe(`字符数 ${"Second Run Title".length}`);
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
      return titleResponse();
    });

    renderButton();
    openDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "折叠晾衣架" } });
    fireEvent.click(generateButton());

    expect(await screen.findByText(/找不到已启用的 DeepSeek 供应商/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => expect(result().textContent).toBe(TITLE));
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
      return titleResponse();
    });

    renderButton();
    openDialog();

    await waitFor(() => expect(modelSelect().options).toHaveLength(2));
    expect(Array.from(modelSelect().options).map((option) => option.value)).toEqual(["deepseek-flash", "deepseek-v4-pro"]);
    expect(screen.getByText(/已使用内置选项/)).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "折叠晾衣架" } });
    fireEvent.click(generateButton());
    await waitFor(() => expect(result().textContent).toBe(TITLE));
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
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "折叠晾衣架" } });
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
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "折叠晾衣架" } });
    fireEvent.click(generateButton());
    await waitFor(() => expect(result().textContent).toBe(TITLE));

    fireEvent.click(copyButtonAt(1));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("复制失败，请手动选择文本复制"));
  });

  /* ------------------------------------------------------------------------ *
   * 第三版：上传区支持直接 Ctrl+V 粘贴图片（截图 / 从文件夹复制的图片文件）。
   * jsdom 里没有 DataTransfer，用与真实剪贴板同形的普通对象派发 paste 事件。
   * ------------------------------------------------------------------------ */

  it("上传区有「可以直接粘贴图片」的浅色提示文案（新增 i18n key，不硬编码）", async () => {
    renderButton();
    openDialog();

    const hint = await screen.findByText(zhMessages.ProductTitle.imagesPasteHint);
    // 样式与既有的上传区提示一致：更小字号 + 降低对比度
    expect(hint.className).toContain("text-xs");
    expect(hint.className).toContain("text-muted-foreground");
    expect(zhMessages.ProductTitle.imagesPasteHint).toContain("粘贴");
    expect(zhMessages.ProductTitle.imagesPasteHint).toContain("Ctrl");
  });

  it("弹窗内直接粘贴截图 → 走与点击选择同一条管道（压缩 → 待上传列表 → 请求体 data URL）", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const shot = pastedImage("screenshot.png");
    // 返回 false = 被拦下来当待上传图片处理（阻止默认的「粘成一个文件」行为）
    expect(pasteAt(dropzone(), { files: [shot] })).toBe(false);

    await waitFor(() => expect(mocks.compressProductTitleFile).toHaveBeenCalledTimes(1));
    // 送进压缩管道的正是剪贴板里那个 File（与点击选择/拖拽完全同一条路径）
    expect(mocks.compressProductTitleFile).toHaveBeenCalledWith(shot);

    // 缩略图预览 + 计数
    await waitFor(() => expect(selectedImageButtons()).toHaveLength(1));
    expect(screen.getByText("已选 1/5 张")).toBeTruthy();
    expect((screen.getByAltText("screenshot.png") as HTMLImageElement).src).toBe(`data:image/jpeg;base64,${btoa("screenshot.png")}`);

    // 清空文本框 → 只图生成，粘贴进来的 data URL 确实进了请求体
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    fireEvent.click(generateButton());

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(postBodies[0]).toEqual({
      images: [`data:image/jpeg;base64,${btoa("screenshot.png")}`],
      description: "",
      model: "deepseek-flash",
    });
  });

  it("一次粘贴多张图按顺序依次加入；已有 4 张时再粘 2 张只收 1 张并沿用现有上限提示", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const first = pastedImage("pasted-1.png");
    const second = pastedImage("pasted-2.png");
    pasteAt(dropzone(), { files: [first, second] });

    await waitFor(() => expect(selectedImageButtons()).toHaveLength(2));
    expect(screen.getByText("已选 2/5 张")).toBeTruthy();
    // 剪贴板里的顺序 = 加入顺序
    expect(pastedFileNames()).toEqual(["pasted-1.png", "pasted-2.png"]);

    // 再用「点击选择」补到 4 张（两条路径混用，共用同一个列表）
    fireEvent.change(fileInput(), { target: { files: fakeFiles(2) } });
    await waitFor(() => expect(selectedImageButtons()).toHaveLength(4));

    // 已有 4 张，剪贴板里 2 张 → 只收 1 张，第 2 张按上限拒绝
    const third = pastedImage("pasted-3.png");
    const fourth = pastedImage("pasted-4.png");
    pasteAt(dropzone(), { files: [third, fourth] });

    await waitFor(() => expect(screen.getByText("已选 5/5 张")).toBeTruthy());
    expect(selectedImageButtons()).toHaveLength(5);
    // 沿用既有 key 的文案（没有新造同义文案）
    expect(await screen.findByText(zhMessages.ProductTitle.imageLimitReached.replace("{max}", "5"))).toBeTruthy();
    expect(screen.getByAltText("pasted-3.png")).toBeTruthy();
    expect(screen.queryByAltText("pasted-4.png")).toBeNull();
    // 超出的那张根本没进压缩管道
    expect(pastedFileNames()).not.toContain("pasted-4.png");
  });

  it("真实浏览器：一次粘贴只加入一张（items 与 files 给的是同一张图的两个 File 实例）", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // files 与 items 里是「内容相同但不是同一个对象」的两个 File —— 真实浏览器就是这样
    const twin = browserClipboardData("screenshot.png");
    const viaFiles = twin.clipboardData.files[0];
    const viaItems = twin.clipboardData.items[0].getAsFile();
    expect(viaFiles).not.toBe(viaItems);

    // 返回 false = 被拦下来当待上传图片处理
    expect(fireEvent.paste(dropzone(), twin)).toBe(false);

    // 只加一张：界面上不该出现「已选 2/5 张」+ 两个相同缩略图
    await waitFor(() => expect(selectedImageButtons()).toHaveLength(1));
    expect(screen.getByText("已选 1/5 张")).toBeTruthy();
    expect(screen.queryByText("已选 2/5 张")).toBeNull();
    expect(screen.getAllByAltText("screenshot.png")).toHaveLength(1);
    // 也只走了一次压缩管道（用的是 files 那份）
    expect(mocks.compressProductTitleFile).toHaveBeenCalledTimes(1);
    expect(mocks.compressProductTitleFile).toHaveBeenCalledWith(viaFiles);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("一次粘贴两张不同的图（每张都在 items/files 各有一份）→ 只加这两张，不多不少", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const files = [pastedImage("shot-1.png"), pastedImage("shot-2.png")];
    fireEvent.paste(dropzone(), {
      clipboardData: {
        files,
        items: files.map((file) => ({ kind: "file", type: file.type, getAsFile: () => new File(["pasted"], file.name, { type: file.type, lastModified: 1_700_000_000_000 }) })),
        types: ["Files"],
        getData: () => "",
      },
    });

    await waitFor(() => expect(selectedImageButtons()).toHaveLength(2));
    expect(screen.getByText("已选 2/5 张")).toBeTruthy();
    expect(pastedFileNames()).toEqual(["shot-1.png", "shot-2.png"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("分两次粘贴同一张图不会被拦（跨次粘贴保持用户自由，不去重、不提示）", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.paste(dropzone(), browserClipboardData("screenshot.png"));
    await waitFor(() => expect(selectedImageButtons()).toHaveLength(1));

    fireEvent.paste(dropzone(), browserClipboardData("screenshot.png"));
    await waitFor(() => expect(selectedImageButtons()).toHaveLength(2));
    expect(screen.getByText("已选 2/5 张")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("只有 files（items 为空）的浏览器同样能粘图：走同一条压缩管道", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const shot = pastedImage("files-only.png");
    expect(fireEvent.paste(dropzone(), { clipboardData: { files: [shot], items: [], types: ["Files"], getData: () => "" } })).toBe(false);

    await waitFor(() => expect(selectedImageButtons()).toHaveLength(1));
    expect(mocks.compressProductTitleFile).toHaveBeenCalledWith(shot);
    expect(screen.getByText("已选 1/5 张")).toBeTruthy();
  });

  it("只有 items（files 为空）的浏览器也能回退取图，同样走同一条压缩管道", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const shot = pastedImage("items-only.png");
    expect(fireEvent.paste(dropzone(), {
      clipboardData: {
        files: [],
        items: [{ kind: "file", type: shot.type, getAsFile: () => shot }],
        types: ["Files"],
        getData: () => "",
      },
    })).toBe(false);

    await waitFor(() => expect(selectedImageButtons()).toHaveLength(1));
    expect(mocks.compressProductTitleFile).toHaveBeenCalledWith(shot);
    expect(screen.getByText("已选 1/5 张")).toBeTruthy();
  });

  it("焦点在描述文本框、剪贴板是纯文本 → 放行不拦截，文本框正常插字、图片列表不变", async () => {
    renderButton();
    openDialog();

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.focus();
    const pasted = "\n\n折叠晾衣架，家用阳台，可伸缩";
    const before = textarea.value;

    // 返回 true = 没有 preventDefault，浏览器会照常把文字插进文本框
    expect(pasteAt(textarea, { text: pasted })).toBe(true);

    // jsdom 不实现剪贴板的默认插入行为 —— 这里补上「浏览器本来会做的事」
    fireEvent.change(textarea, { target: { value: `${before}${pasted}` } });
    expect(textarea.value).toBe(`${before}${pasted}`);
    expect(textarea.value.startsWith(PRODUCT_TITLE_DEFAULT_DESCRIPTION)).toBe(true);

    // 图片列表与压缩管道完全没被碰过
    expect(mocks.compressProductTitleFile).not.toHaveBeenCalled();
    expect(selectedImageButtons()).toHaveLength(0);
    expect(screen.getByText("已选 0/5 张")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("焦点在描述文本框、剪贴板只有图片 → 收下图片并阻止默认插入（描述一个字都不变）", async () => {
    renderButton();
    openDialog();

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.focus();

    // 返回 false = 拦下来当图片处理
    expect(pasteAt(textarea, { files: [pastedImage("screenshot.png")] })).toBe(false);

    await waitFor(() => expect(selectedImageButtons()).toHaveLength(1));
    expect(screen.getByText("已选 1/5 张")).toBeTruthy();
    expect(textarea.value).toBe(PRODUCT_TITLE_DEFAULT_DESCRIPTION);
  });

  it("焦点在描述文本框、剪贴板同时有文本和图片 → 文本框粘贴优先（不拦截、不收图）", async () => {
    renderButton();
    openDialog();

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.focus();
    const shot = pastedImage("screenshot.png");

    expect(pasteAt(textarea, { files: [shot], text: "折叠晾衣架" })).toBe(true);
    expect(mocks.compressProductTitleFile).not.toHaveBeenCalled();
    expect(selectedImageButtons()).toHaveLength(0);

    // 同一个剪贴板，焦点不在可编辑控件（上传区）时 → 按图片处理
    expect(pasteAt(dropzone(), { files: [shot], text: "折叠晾衣架" })).toBe(false);
    await waitFor(() => expect(selectedImageButtons()).toHaveLength(1));
  });

  it("剪贴板是非图片文件（PDF / txt）→ 完全忽略：列表不变、不报错、不插队", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const pdf = new File(["x"], "spec.pdf", { type: "application/pdf" });
    const txt = new File(["x"], "note.txt", { type: "text/plain" });

    // 纯非图片：连拦都不拦（返回 true），更不会有任何提示
    expect(pasteAt(dropzone(), { files: [pdf] })).toBe(true);
    expect(pasteAt(dropzone(), { files: [txt] })).toBe(true);

    expect(mocks.compressProductTitleFile).not.toHaveBeenCalled();
    expect(selectedImageButtons()).toHaveLength(0);
    expect(screen.getByText("已选 0/5 张")).toBeTruthy();
    expect(screen.queryByText(/只支持图片文件/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    // 图片 + 非图片混着粘：只收图片，非图片静默丢弃（不报「只支持图片文件」）
    pasteAt(dropzone(), { files: [txt, pastedImage("shot.png")] });

    await waitFor(() => expect(selectedImageButtons()).toHaveLength(1));
    expect(pastedFileNames()).toEqual(["shot.png"]);
    expect(screen.queryByText(/只支持图片文件/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("MIME 缺失的截图（少数平台只给个空 type）也能按扩展名补回图片类型并正常加入", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const blank = new File(["x"], "Screenshot 2026-09-24.png", { type: "" });
    pasteAt(dropzone(), { files: [blank] });

    await waitFor(() => expect(selectedImageButtons()).toHaveLength(1));
    // 补回 MIME 后走的是正常的类型校验 + 压缩管道（不会被判成「非图片」）
    expect(mocks.compressProductTitleFile).toHaveBeenCalledTimes(1);
    expect(screen.getByAltText("Screenshot 2026-09-24.png")).toBeTruthy();
    expect(screen.queryByText(/只支持图片文件/)).toBeNull();
  });

  it("弹窗关闭后不再监听：paste 不再被拦截、也不再加入图片（监听器已清理）", async () => {
    renderButton();
    openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    pasteAt(dropzone(), { files: [pastedImage("screenshot.png")] });
    await waitFor(() => expect(selectedImageButtons()).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByTestId("product-title-dropzone")).toBeNull());

    // 关闭后再派发 paste（在 document 上，模拟焦点丢失时的粘贴）：没有任何监听器
    expect(pasteAt(document.body, { files: [pastedImage("later.png")] })).toBe(true);
    expect(mocks.compressProductTitleFile).toHaveBeenCalledTimes(1);
    expect(pastedFileNames()).toEqual(["screenshot.png"]);

    // 重新打开：状态照旧（仍是 1 张），说明关闭期间的粘贴确实没生效
    openDialog();
    expect(await screen.findByText("已选 1/5 张")).toBeTruthy();
  });
});
