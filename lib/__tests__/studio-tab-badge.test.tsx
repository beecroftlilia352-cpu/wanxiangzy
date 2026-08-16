import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { StudioTabBadge } from "@/components/studio/StudioTabBadge";

afterEach(() => cleanup());

describe("StudioTabBadge", () => {
  it("normalizes the top-tab NEW badge to the screenshot label", () => {
    const { getByText } = render(<StudioTabBadge decorative={false}>NEW</StudioTabBadge>);
    const badge = getByText("New");

    expect(badge.classList.contains("studio-tab-badge-floating")).toBe(true);
    expect(badge.getAttribute("aria-hidden")).toBeNull();
  });

  it("keeps non-NEW labels and the inline navigation variant", () => {
    const { getByText } = render(<StudioTabBadge variant="inline">升级</StudioTabBadge>);
    const badge = getByText("升级");

    expect(badge.classList.contains("studio-tab-badge-inline")).toBe(true);
    expect(badge.getAttribute("aria-hidden")).toBe("true");
  });
});
