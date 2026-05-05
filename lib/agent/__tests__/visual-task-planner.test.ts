import { describe, expect, it } from "vitest";
import {
  getCommerceCreativeAspectRatio,
  getCommerceIntentKind,
} from "@/lib/agent/visual-task-planner";

describe("visual task planner", () => {
  it("detects ecommerce detail pages without falling into grass content", () => {
    expect(getCommerceIntentKind("根据这张图重新生成 淘宝详情页")).toBe("detail");
    expect(getCommerceIntentKind("做一个商品详情长图，包含卖点图和参数图")).toBe("detail");
    expect(getCommerceIntentKind("生成小红书种草图")).toBeNull();
  });

  it("keeps ecommerce creative formats distinct from detail pages", () => {
    expect(getCommerceIntentKind("生成淘宝主图")).toBe("creative");
    expect(getCommerceIntentKind("做一张横版 banner")).toBe("creative");
    expect(getCommerceCreativeAspectRatio("做一张横版 banner")).toBe("16:9");
    expect(getCommerceCreativeAspectRatio("生成淘宝主图")).toBe("1:1");
  });
});
