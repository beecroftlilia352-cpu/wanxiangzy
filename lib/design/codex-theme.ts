export const codexTheme = {
  brand: {
    name: "VastWearGen",
    subtitle: "服装视觉生产工作台",
    tagline: "面向服装品牌和电商团队的 AI 服装视觉生产工作台。",
    description: "上传服装、模特和参考图，生成上身图、商品套图、种草封面和场景版本。",
    logo: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/gemini-icon.png",
  },
  colors: {
    ink: "#050505",
    muted: "#4b5263",
    faint: "#7b8498",
    page: "#eef4ff",
    surface: "#ffffff",
    surfaceSoft: "rgba(255,255,255,0.74)",
    surfaceStrong: "rgba(255,255,255,0.92)",
    border: "rgba(17,24,39,0.12)",
    borderStrong: "rgba(17,24,39,0.2)",
    accent: "#5b7cff",
    accentSoft: "#aeb8ff",
    ice: "#dbe8ff",
    dark: "#07080d",
  },
  status: {
    success: "#22885f",
    warning: "#a66a00",
    danger: "#d13b35",
    running: "#5b7cff",
  },
  gradients: {
    page: "radial-gradient(circle at 10% 4%, rgba(82,116,255,0.62), transparent 30%), radial-gradient(circle at 86% 8%, rgba(174,184,255,0.72), transparent 35%), linear-gradient(180deg, #cfe0ff 0%, #aebeff 43%, #5d6b94 78%, #07080d 100%)",
    hero: "radial-gradient(circle at 14% 12%, rgba(91,124,255,0.78), transparent 34%), radial-gradient(circle at 82% 20%, rgba(188,180,255,0.84), transparent 36%), linear-gradient(180deg, #dbe8ff 0%, #aeb8ff 56%, #101322 100%)",
    loader: "linear-gradient(120deg, rgba(91,124,255,0.92), rgba(174,184,255,0.82), rgba(219,232,255,0.92))",
    primary: "linear-gradient(180deg, rgba(255,255,255,0.12), transparent 38%), linear-gradient(180deg, #111318 0%, #050505 100%)",
  },
  fontStack: {
    sans: 'Inter, Geist, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"SF Mono", "Cascadia Code", "JetBrains Mono", ui-monospace, monospace',
  },
  radius: {
    sm: "10px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    pill: "999px",
  },
  shadow: {
    sm: "0 1px 2px rgba(5,5,5,0.08)",
    md: "0 18px 50px rgba(14,18,38,0.14)",
    lg: "0 40px 120px rgba(7,8,13,0.34)",
  },
  upload: {
    minHeight: 224,
    compactHeight: 190,
    aspectRatio: "4 / 3",
  },
  loader: {
    minHeight: 360,
    shimmerDuration: "2.4s",
  },
} as const;

export type CodexTheme = typeof codexTheme;
export type StudioTone = "neutral" | "accent" | "primary" | "success" | "warning" | "danger";
export type StudioDensity = "compact" | "comfortable";
export type StudioState = "idle" | "uploading" | "loading" | "selected" | "error" | "disabled";
export type StudioSurfaceVariant = "surface" | "elevated" | "floating" | "canvas" | "toolbar";
