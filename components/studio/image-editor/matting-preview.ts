export function resolveMattingPreviewBase<T>({
  source,
  foreground,
  alpha,
}: {
  source: T;
  foreground: T | null;
  alpha: T | null;
}) {
  return {
    baseImage: foreground ?? (alpha ? source : null),
    alphaImage: alpha,
  };
}
