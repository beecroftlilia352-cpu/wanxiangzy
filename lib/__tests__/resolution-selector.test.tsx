import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ResolutionSelector } from "@/components/studio/ResolutionSelector";
import zhMessages from "@/messages/zh.json";
import enMessages from "@/messages/en.json";

afterEach(() => cleanup());

function renderResolution(
  overrides: Partial<React.ComponentProps<typeof ResolutionSelector>> = {},
) {
  const props: React.ComponentProps<typeof ResolutionSelector> = {
    title: "清晰度",
    value: "2K",
    onChange: vi.fn(),
    ariaLabel: "选择清晰度",
    options: [
      { value: "1K", label: "1K", description: "4 灵点" },
      { value: "2K", label: "2K", description: "6 灵点" },
      { value: "4K", label: "4K", description: "8 灵点" },
    ],
    ...overrides,
  };

  return {
    props,
    ...render(
      <NextIntlClientProvider locale="zh" messages={zhMessages}>
        <ResolutionSelector {...props} />
      </NextIntlClientProvider>,
    ),
  };
}

describe("ResolutionSelector", () => {
  it("renders the screenshot clarity labels and recommends only 2K", () => {
    const { container, getByText } = renderResolution();

    expect(getByText("清晰度")).toBeTruthy();
    expect(container.querySelector(".studio-resolution-selector-title-mark")).toBeTruthy();
    expect(Array.from(container.querySelectorAll(".studio-resolution-selector-clarity")).map((node) => node.textContent)).toEqual([
      "标清",
      "高清",
      "超清",
    ]);
    expect(getByText("推荐")).toBeTruthy();
    expect(container.querySelectorAll(".studio-resolution-selector-badge")).toHaveLength(2);
    expect(container.querySelector('[data-tier="recommended"]')?.textContent).toContain("2K");
    expect(container.querySelector('[data-tier="enterprise"]')?.textContent).toContain("4K");
  });

  it("uses compact English badge labels that cannot squeeze the resolution text", () => {
    const { container, getByText } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ResolutionSelector
          title="Clarity"
          value="2K"
          onChange={vi.fn()}
          options={[
            { value: "1K", label: "1K" },
            { value: "2K", label: "2K" },
            { value: "4K", label: "4K" },
          ]}
        />
      </NextIntlClientProvider>,
    );

    expect(getByText("REC")).toBeTruthy();
    expect(getByText("PRO")).toBeTruthy();
    expect(container.querySelectorAll(".studio-resolution-selector-label")[0]?.textContent)
      .toBe("1K\u00a0STD");
    expect(container.querySelectorAll(".studio-resolution-selector-label")[2]?.textContent)
      .toBe("4K\u00a0UHD");
    expect(Array.from(container.querySelectorAll(".studio-resolution-selector-badge")).map((node) => node.textContent))
      .toEqual(["REC", "PRO"]);
  });

  it("changes the selected resolution through the radio group", () => {
    const onChange = vi.fn();
    const { getByRole } = renderResolution({ onChange });

    fireEvent.click(getByRole("radio", { name: "4K · 超清 · 8 灵点" }));
    expect(onChange).toHaveBeenCalledWith("4K");
  });

  it("keeps arbitrary video resolutions and their descriptions intact", () => {
    const { getByText, queryByText } = renderResolution({
      value: "1080p",
      options: [
        { value: "720p", label: "720p", description: "标准视频" },
        { value: "1080p", label: "1080p", description: "高清视频" },
      ],
    });

    expect(getByText("标准视频")).toBeTruthy();
    expect(getByText("高清视频")).toBeTruthy();
    expect(queryByText("推荐")).toBeNull();
  });
});
