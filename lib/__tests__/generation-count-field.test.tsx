import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { GenerationCountField } from "@/components/studio/GenerationCountField";
import zhMessages from "@/messages/zh.json";

afterEach(() => cleanup());

function renderCount(
  overrides: Partial<React.ComponentProps<typeof GenerationCountField>> = {},
) {
  const props: React.ComponentProps<typeof GenerationCountField> = {
    value: 1,
    onChange: vi.fn(),
    ariaLabel: "生成数量",
    ...overrides,
  };

  return {
    props,
    ...render(
      <NextIntlClientProvider locale="zh" messages={zhMessages}>
        <GenerationCountField {...props} />
      </NextIntlClientProvider>,
    ),
  };
}

describe("GenerationCountField", () => {
  it("renders the screenshot title, row label, selector, and unit by default", () => {
    const { container, getAllByText, getByRole, getByText, queryByText } = renderCount();

    expect(getAllByText("生成数量")).toHaveLength(2);
    expect(container.querySelector(".studio-aspect-ratio-selector-title-mark")).toBeTruthy();
    expect(container.querySelector(".studio-generation-count-row")).toBeTruthy();
    expect(getByRole("button", { name: "生成数量" })).toBeTruthy();
    expect(getByText("张")).toBeTruthy();
    expect(queryByText("共")).toBeNull();
  });

  it("keeps optional description and title metadata without changing the core row", () => {
    const { getByText } = renderCount({
      title: "生成条数",
      label: "生成条数",
      description: "每次最多生成 4 条",
      titleMeta: "4 灵点/条",
      unit: "条",
    });

    expect(getByText("每次最多生成 4 条")).toBeTruthy();
    expect(getByText("4 灵点/条")).toBeTruthy();
    expect(getByText("条")).toBeTruthy();
  });

  it("opens the accessible option list and reports a selected value", () => {
    const onChange = vi.fn();
    const { getByRole } = renderCount({ onChange });

    fireEvent.click(getByRole("button", { name: "生成数量" }));
    fireEvent.click(getByRole("option", { name: "2张" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
