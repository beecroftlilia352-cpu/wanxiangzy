import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestStudioNavigation,
  STUDIO_NAVIGATION_REQUEST_EVENT,
  type StudioNavigationRequestDetail,
} from "@/lib/studio-navigation";

describe("studio navigation gate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("waits for the guard before an imperative route change", async () => {
    const navigate = vi.fn();
    let pending: StudioNavigationRequestDetail | null = null;
    const guard = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<StudioNavigationRequestDetail>;
      event.preventDefault();
      pending = event.detail;
    };
    window.addEventListener(STUDIO_NAVIGATION_REQUEST_EVENT, guard);

    const result = requestStudioNavigation("/model", navigate);
    expect(navigate).not.toHaveBeenCalled();
    await pending!.proceed();
    await expect(result).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);

    window.removeEventListener(STUDIO_NAVIGATION_REQUEST_EVENT, guard);
  });

  it("keeps the current page selected when the guard is cancelled", async () => {
    const navigate = vi.fn();
    const guard = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<StudioNavigationRequestDetail>;
      event.preventDefault();
      event.detail.cancel();
    };
    window.addEventListener(STUDIO_NAVIGATION_REQUEST_EVENT, guard);

    await expect(requestStudioNavigation("/model", navigate)).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    window.removeEventListener(STUDIO_NAVIGATION_REQUEST_EVENT, guard);
  });
});
