export const STUDIO_NAVIGATION_REQUEST_EVENT = "wanxiang:studio-navigation-request";

export type StudioNavigationRequestDetail = {
  href: string;
  proceed: () => Promise<void>;
  cancel: () => void;
};

/**
 * Routes imperative navigation through the same unsaved-changes gate used by
 * links. Without this, task cards can call router.push() before the page has a
 * chance to ask whether the user wants to leave.
 */
export function requestStudioNavigation(
  href: string,
  navigate: () => void | Promise<void>,
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const detail: StudioNavigationRequestDetail = {
      href,
      proceed: async () => {
        if (settled) return;
        try {
          await navigate();
          finish(true);
        } catch (error) {
          settled = true;
          reject(error);
        }
      },
      cancel: () => finish(false),
    };
    const event = new CustomEvent<StudioNavigationRequestDetail>(
      STUDIO_NAVIGATION_REQUEST_EVENT,
      { cancelable: true, detail },
    );

    if (window.dispatchEvent(event)) {
      void detail.proceed();
    }
  });
}
