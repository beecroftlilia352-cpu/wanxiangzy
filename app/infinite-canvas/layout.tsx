import "antd/dist/reset.css";

import { InfiniteCanvasProviders } from "@/components/infinite-canvas-providers";

export default function InfiniteCanvasLayout({ children }: { children: React.ReactNode }) {
  return <InfiniteCanvasProviders>{children}</InfiniteCanvasProviders>;
}
