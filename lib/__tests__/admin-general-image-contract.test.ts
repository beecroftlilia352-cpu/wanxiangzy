import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminData = readFileSync(resolve(process.cwd(), "lib/admin/data.ts"), "utf8");
const adminPage = readFileSync(resolve(process.cwd(), "app/admin/generations/page.tsx"), "utf8");
const adminRoute = readFileSync(resolve(process.cwd(), "app/api/admin/generations/route.ts"), "utf8");
const adminDetailPage = readFileSync(resolve(process.cwd(), "app/admin/generations/[id]/page.tsx"), "utf8");
const generationJobs = readFileSync(resolve(process.cwd(), "lib/api/generation-jobs.ts"), "utf8");
const mediaRoute = readFileSync(resolve(process.cwd(), "app/api/media-assets/[assetId]/route.ts"), "utf8");
const viewerResolver = readFileSync(resolve(process.cwd(), "lib/api/media-asset-viewer.server.ts"), "utf8");

describe("admin general image contract", () => {
  it("distinguishes text-to-image from image-to-image and hides text inputs", () => {
    expect(adminData).toContain('value.includes("image-to-image")');
    expect(adminData).toContain('? "图生图"');
    expect(adminData).toContain('? "文生图"');
    expect(adminData).toContain('generalImageMode === "text-to-image" ? [] : arrayOfStrings(row.input_thumbnails)');
  });

  it("hydrates image-to-image inputs for the initial page and API pagination", () => {
    expect(adminPage).toContain("hydratePreviews: true");
    expect(adminRoute).toContain("hydratePreviews: true");
    expect(adminData).toContain('.select("id,result_urls,job_payload,clothing_urls,model_face_url,reference_url")');
    expect(adminData).toContain("inferInputThumbnails(row, payload)");
  });

  it("shows response values and associates provider attempts with their generation", () => {
    expect(adminDetailPage).toContain('label="响应值" value={detail.response}');
    expect(adminData).toContain('response: buildGenerationAdminResponse(generation.row, routeAttempts)');
    expect(generationJobs).toContain("runWithAiRouteContext(");
    expect(generationJobs).toContain("generationId: job.id");
    expect(generationJobs).toContain("userId: job.user_id");
    expect(generationJobs).toContain('serviceTier: job.service_tier === "vip" ? "vip" : "standard"');
  });

  it("keeps owner checks and allows read-only admin fallback for verified media", () => {
    expect(mediaRoute).toContain("resolveVerifiedMediaAssetForViewer(assetId, user.id)");
    expect(viewerResolver).toContain('hasAdminPermission(access.context.role, "tasks:read")');
    expect(viewerResolver).toContain('admin.rpc("resolve_media_asset_object"');
    expect(viewerResolver).toContain('admin.rpc("resolve_verified_media_asset_for_worker"');
  });
});
