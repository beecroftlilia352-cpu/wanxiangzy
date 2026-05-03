import { describe, it, expect } from "vitest";
import { normalizeOpenAiCompatibleBaseUrl } from "@/lib/api/url-utils";

describe("normalizeOpenAiCompatibleBaseUrl", () => {
  it("appends /v1 when missing", () => {
    expect(normalizeOpenAiCompatibleBaseUrl("https://api.example.com")).toBe(
      "https://api.example.com/v1"
    );
  });

  it("does not duplicate /v1", () => {
    expect(normalizeOpenAiCompatibleBaseUrl("https://api.example.com/v1")).toBe(
      "https://api.example.com/v1"
    );
  });

  it("strips trailing slashes before appending /v1", () => {
    expect(normalizeOpenAiCompatibleBaseUrl("https://api.example.com/")).toBe(
      "https://api.example.com/v1"
    );
  });

  it("strips trailing slashes when already has /v1", () => {
    expect(normalizeOpenAiCompatibleBaseUrl("https://api.example.com/v1/")).toBe(
      "https://api.example.com/v1"
    );
  });

  it("returns empty string for empty input", () => {
    expect(normalizeOpenAiCompatibleBaseUrl("")).toBe("");
  });

  it("handles nested paths correctly", () => {
    expect(normalizeOpenAiCompatibleBaseUrl("https://api.example.com/proxy")).toBe(
      "https://api.example.com/proxy/v1"
    );
  });

  it("handles /v1 with nested path", () => {
    expect(normalizeOpenAiCompatibleBaseUrl("https://api.example.com/proxy/v1")).toBe(
      "https://api.example.com/proxy/v1"
    );
  });
});
