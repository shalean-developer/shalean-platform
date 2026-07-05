type AppRouterNavigate = {
  replace: (href: string, options?: { scroll?: boolean }) => void;
  push: (href: string, options?: { scroll?: boolean }) => void;
  refresh: () => void;
};

/**
 * Next.js 16 throws "Router action dispatched before initialization" when
 * `router.replace/push/refresh` run before the App Router action queue mounts.
 * Schedule navigation on the next frame so guards can redirect safely from effects.
 */
export function scheduleAppRouterReplace(
  router: AppRouterNavigate,
  href: string,
  options?: { scroll?: boolean },
): void {
  if (typeof window === "undefined") return;

  const run = () => {
    router.replace(href, options);
  };

  queueMicrotask(() => {
    requestAnimationFrame(run);
  });
}

export function scheduleAppRouterPush(
  router: AppRouterNavigate,
  href: string,
  options?: { scroll?: boolean },
): void {
  if (typeof window === "undefined") return;

  const run = () => {
    router.push(href, options);
  };

  queueMicrotask(() => {
    requestAnimationFrame(run);
  });
}

export function scheduleAppRouterRefresh(router: AppRouterNavigate): void {
  if (typeof window === "undefined") return;

  const run = () => {
    router.refresh();
  };

  queueMicrotask(() => {
    requestAnimationFrame(run);
  });
}
