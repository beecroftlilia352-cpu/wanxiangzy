import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { PromptTextarea } from "@/components/studio/PromptTextarea";
import zhMessages from "@/messages/zh.json";

afterEach(() => cleanup());

function renderPrompt(
  overrides: Partial<React.ComponentProps<typeof PromptTextarea>> = {},
) {
  const props: React.ComponentProps<typeof PromptTextarea> = {
    title: "文本描述",
    value: "",
    onChange: vi.fn(),
    onClear: vi.fn(),
    placeholder: "请输入图像编辑指令",
    ...overrides,
  };

  return {
    props,
    ...render(
      <NextIntlClientProvider locale="zh" messages={zhMessages}>
        <PromptTextarea {...props} />
      </NextIntlClientProvider>,
    ),
  };
}

describe("PromptTextarea", () => {
  it("renders the screenshot shell, reserved actions, and default counter", () => {
    const { container, getByText, getByLabelText, queryByText } = renderPrompt();

    expect(getByText("文本描述")).toBeTruthy();
    expect(container.querySelector(".studio-prompt-textarea-title-mark")).toBeTruthy();
    expect(container.querySelector(".studio-prompt-textarea-shell .studio-prompt-field")).toBeTruthy();
    expect(getByText("词库")).toBeTruthy();
    expect(getByLabelText("保存到我的提示词")).toBeTruthy();
    expect(getByText("0")).toBeTruthy();
    expect(getByText("/ 2000")).toBeTruthy();
    expect(queryByText("AI帮写")).toBeNull();
  });

  it("shows AI assist only when the page provides the capability", () => {
    const onOptimizePrompt = vi.fn();
    const { getByText } = renderPrompt({ hasAiAssistant: true, onOptimizePrompt });

    fireEvent.click(getByText("AI帮写"));
    expect(onOptimizePrompt).toHaveBeenCalledTimes(1);
  });

  it("keeps word-library and save callbacks ready for later integration", () => {
    const onOpenWordLibrary = vi.fn();
    const onSaveToMyPrompts = vi.fn();
    const { getByText, getByLabelText } = renderPrompt({
      onOpenWordLibrary,
      onSaveToMyPrompts,
    });

    fireEvent.click(getByText("词库"));
    fireEvent.click(getByLabelText("保存到我的提示词"));
    expect(onOpenWordLibrary).toHaveBeenCalledTimes(1);
    expect(onSaveToMyPrompts).toHaveBeenCalledTimes(1);
  });

  it("requires confirmation before clearing non-empty text", async () => {
    const onClear = vi.fn();
    const { getByLabelText, getByText } = renderPrompt({ value: "需要保留的描述", onClear });

    fireEvent.click(getByLabelText("清空"));
    expect(getByText("清空当前内容？")).toBeTruthy();
    expect(onClear).not.toHaveBeenCalled();

    fireEvent.click(getByText("仍要清空"));
    await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1));
  });
});
