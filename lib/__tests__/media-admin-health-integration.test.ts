import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("media validation and lifecycle admin health", () => {
  it("loads and normalizes aggregate service-role health without exposing storage identifiers", () => {
    const route = read("app/api/admin/model-control/route.ts");
    expect(route).toContain('admin.rpc("get_media_validation_queue_health")');
    expect(route).toContain('admin.rpc("get_media_asset_lifecycle_health")');
    for (const field of [
      "pendingCount:",
      "processingCount:",
      "deadCount:",
      "uploadedWithoutJobCount:",
      "quarantinedCount:",
      "cleanupReadyCount:",
      "oldestCleanupReadyAgeSeconds:",
    ]) {
      expect(route, field).toContain(field);
    }
    expect(route).not.toMatch(/mediaValidationError:\s*mediaValidationHealth\.error/);
    expect(route).not.toMatch(/mediaAssetsError:\s*mediaAssetLifecycleHealth\.error/);
    expect(route).not.toMatch(/objectKey\s*:/i);
    expect(route).not.toMatch(/bucketName\s*:/i);
  });

  it("renders actionable validation, quarantine, cleanup, and missing-job signals", () => {
    const component = read("components/admin/AdminModelControlPlane.tsx");
    for (const label of [
      "媒体安全验证与资产生命周期",
      "待安全验证",
      "验证处理中",
      "验证死信",
      "缺失验证任务",
      "已隔离资产",
      "待清理资产",
      "资产过期租约",
    ]) {
      expect(component, label).toContain(label);
    }
    expect(component).toContain("仅展示聚合计数与等待时长");
    expect(component).not.toContain("ALIYUN_OSS_ACCESS_KEY_SECRET");
  });
});
