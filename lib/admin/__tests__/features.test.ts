import { describe, expect, it } from "vitest";
import {
  archiveAdminFeatureConfig,
  buildDefaultAdminFeatureConfigs,
  mergeAdminFeatureConfigs,
  parseAdminFeatureConfig,
  upsertAdminFeatureConfig,
} from "../features";

describe("admin features", () => {
  it("builds defaults from frontend feature registry", () => {
    const defaults = buildDefaultAdminFeatureConfigs();

    expect(defaults.some((item) => item.key === "tryon" && item.href === "/create")).toBe(true);
    expect(defaults.some((item) => item.key === "videoImageToVideo" && item.module === "aiVideo")).toBe(true);
    expect(defaults.every((item) => item.adminHref.startsWith("/admin"))).toBe(true);
  });

  it("parses and normalizes feature config", () => {
    expect(
      parseAdminFeatureConfig({
        key: "tryon",
        label: " 服装上身 ",
        module: "aiShoots",
        href: "/create",
        enabled: false,
        navVisible: true,
        status: "disabled",
      }),
    ).toMatchObject({
      key: "tryon",
      label: "服装上身",
      enabled: false,
      status: "disabled",
    });

    expect(parseAdminFeatureConfig({ key: "x" })).toBeNull();
  });

  it("merges stored overrides and archives without deleting routes", () => {
    const defaults = buildDefaultAdminFeatureConfigs();
    const merged = mergeAdminFeatureConfigs(defaults, {
      features: [
        {
          key: "tryon",
          label: "AI 试衣",
          module: "aiShoots",
          href: "/create",
          status: "active",
          enabled: true,
          navVisible: false,
          adminHref: "/admin/features",
        },
      ],
    });

    const tryon = merged.find((item) => item.key === "tryon");
    expect(tryon).toMatchObject({ label: "AI 试衣", navVisible: false, href: "/create" });

    const archived = archiveAdminFeatureConfig(merged, "tryon");
    expect(archived.find((item) => item.key === "tryon")).toMatchObject({
      href: "/create",
      enabled: false,
      navVisible: false,
      status: "archived",
    });
  });

  it("upserts new feature configs", () => {
    const defaults = buildDefaultAdminFeatureConfigs();
    const next = upsertAdminFeatureConfig(defaults, {
      key: "customFeature",
      label: "自定义功能",
      module: "tools",
      href: "/custom",
      description: "",
      enabled: true,
      navVisible: true,
      defaultModel: "",
      creditPolicy: "",
      adminHref: "/admin/features",
      status: "active",
      notes: "",
      updatedAt: null,
    });

    expect(next.find((item) => item.key === "customFeature")).toMatchObject({ label: "自定义功能" });
  });
});
