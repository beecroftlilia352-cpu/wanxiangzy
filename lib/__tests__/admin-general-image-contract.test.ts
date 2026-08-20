import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminData = readFileSync(resolve(process.cwd(), "lib/admin/data.ts"), "utf8");
const mediaRoute = readFileSync(resolve(process.cwd(), "app/api/media-assets/[assetId]/route.ts"), "utf8");
const viewerResolver = readFileSync(resolve(process.cwd(), "lib/api/media-asset-viewer.server.ts"), "utf8");

describe("admin general image contract", () => {
  it("distinguishes text-to-image from image-to-image and hides text inputs", () => {
    expect(adminData).toContain('value.includes("image-to-image")');
    expect(adminData).toContain('? "图生图"');
    expect(adminData).toContain('? "文生图"');
    expect(adminData).toContain('generalImageMode === "text-to-image" ? [] : arrayOfStrings(row.input_thumbnails)');
  });

  it("keeps owner checks and allows read-only admin fallback for verified media", () => {
    expect(mediaRoute).toContain("resolveVerifiedMediaAssetForViewer(assetId, user.id)");
    expect(viewerResolver).toContain('hasAdminPermission(access.context.role, "tasks:read")');
    expect(viewerResolver).toContain('admin.rpc("resolve_media_asset_object"');
    expect(viewerResolver).toContain('admin.rpc("resolve_verified_media_asset_for_worker"');
  });
});
