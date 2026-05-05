import { describe, expect, it } from "vitest";
import {
  getForbiddenAgentModules,
  getCommerceCreativeAspectRatio,
  getCommerceIntentKind,
  getUserBoundaryLines,
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

  it("understands negative module constraints", () => {
    expect(getForbiddenAgentModules("生成淘宝详情页，不要做成小红书种草图")).toContain("grass");
    expect(getForbiddenAgentModules("参考这张图重新设计，不是换装，不要上身")).toContain("tryon");
    expect(getForbiddenAgentModules("只要单张海报，不要四宫格姿势裂变")).toContain("pose");
    expect(getUserBoundaryLines("不要种草，只做详情页").join("\n")).toContain("不要把任务改成小红书种草");
  });
});
