import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { StudioModelSelector } from "@/components/studio/StudioModelSelector";
import zhMessages from "@/messages/zh.json";

vi.mock("@/lib/use-visible-image-models", () => ({
  useVisibleImageModels: () => ({ visibleModels: null, isReady: false }),
}));

afterEach(() => cleanup());

const models = [
  {
    value: "gpt-image-2",
    label: "GPT image 2",
    desc: "复杂指令与文字排版能力更强。",
    icon: "/model-covers/gpt-image-2.png",
    badge: "NEW",
  },
  {
    value: "nano-banana-2",
    label: "香蕉2",
    desc: "快速稳定，适合日常批量生成。",
    icon: "/model-covers/banana-2.png",
  },
  {
    value: "nano-banana-pro",
    label: "香蕉Pro",
    desc: "精细控制，适合高质量商业出图。",
    icon: "/model-covers/banana-pro.png",
    badge: "PRO",
  },
] as const;

function StatefulSelector() {
  const [value, setValue] = useState<(typeof models)[number]["value"]>("nano-banana-2");
  return <StudioModelSelector models={models} value={value} onChange={setValue} />;
}

function renderSelector() {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <StatefulSelector />
    </NextIntlClientProvider>,
  );
}

describe("StudioModelSelector", () => {
  it("renders the screenshot heading and the default-model trigger", () => {
    const { container, getByRole, getByText } = renderSelector();

    expect(getByText("基础生图模型")).toBeTruthy();
    expect(container.querySelector(".studio-model-selector-title-mark")).toBeTruthy();
    expect(getByRole("button", { name: "基础生图模型" }).textContent).toContain("默认模型");
    expect(container.querySelector<HTMLImageElement>(".studio-model-selector-trigger-visual img")?.src)
      .toContain("/model-covers/banana-2.png");
  });

  it("opens on mouse hover and exposes the complete three-model catalog", () => {
    const { getAllByRole, getByRole, getByText } = renderSelector();
    const trigger = getByRole("button", { name: "基础生图模型" });

    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });

    expect(getByText("推荐基础模型")).toBeTruthy();
    expect(getByRole("radiogroup", { name: "基础生图模型" })).toBeTruthy();
    expect(getAllByRole("radio")).toHaveLength(3);
    expect(getByRole("radio", { name: /香蕉2/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("selects a model, closes the popup, and replaces the default label", () => {
    const { getByRole, queryByRole } = renderSelector();
    const trigger = getByRole("button", { name: "基础生图模型" });

    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    fireEvent.click(getByRole("radio", { name: /香蕉Pro/ }));

    expect(queryByRole("radiogroup")).toBeNull();
    expect(getByRole("button", { name: "基础生图模型" }).textContent).toContain("香蕉Pro");
  });

  it("supports keyboard entry, roving focus, and Escape focus restoration", async () => {
    const { getByRole } = renderSelector();
    const trigger = getByRole("button", { name: "基础生图模型" });

    fireEvent.focus(trigger);
    const selected = getByRole("radio", { name: /香蕉2/ });
    await waitFor(() => expect(document.activeElement).toBe(selected));

    fireEvent.keyDown(selected, { key: "ArrowRight" });
    const next = getByRole("radio", { name: /香蕉Pro/ });
    expect(document.activeElement).toBe(next);

    fireEvent.keyDown(next, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
