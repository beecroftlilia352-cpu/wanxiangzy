import { describe, expect, it } from "vitest";
import { parseAiToolMattingComposeRequest } from "@/lib/ai-tools/matting-compose";

describe("AI tool matting compose request", () => {
  it("accepts a provider base alpha and an additive editor mask", () => {
    expect(parseAiToolMattingComposeRequest({
      request_id: "request-1234",
      source_url: "https://assets.example.com/source.png",
      base_mask_url: "https://provider.example.com/alpha.png",
      base_mask_kind: "alpha",
      edit_mask_url: "https://assets.example.com/edit.png",
      edit_operation: "add",
    })).toEqual({
      ok: true,
      data: {
        request_id: "request-1234",
        source_url: "https://assets.example.com/source.png",
        base_mask_url: "https://provider.example.com/alpha.png",
        base_mask_kind: "alpha",
        edit_mask_url: "https://assets.example.com/edit.png",
        edit_operation: "add",
      },
    });
  });

  it("requires edit_operation exactly when edit_mask_url is present", () => {
    const missingOperation = parseAiToolMattingComposeRequest({
      request_id: "request-1234",
      source_url: "https://assets.example.com/source.png",
      base_mask_url: "https://assets.example.com/base.png",
      base_mask_kind: "mask",
      edit_mask_url: "https://assets.example.com/edit.png",
    });
    expect(missingOperation).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ path: "$.edit_operation", code: "missing_field" })],
    });

    const orphanOperation = parseAiToolMattingComposeRequest({
      request_id: "request-1234",
      source_url: "https://assets.example.com/source.png",
      base_mask_url: "https://assets.example.com/base.png",
      base_mask_kind: "mask",
      edit_operation: "subtract",
    });
    expect(orphanOperation).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ path: "$.edit_operation", code: "invalid_value" })],
    });
  });

  it("rejects unknown fields and unsafe URLs", () => {
    const result = parseAiToolMattingComposeRequest({
      request_id: "request-1234",
      source_url: "http://127.0.0.1/private.png",
      base_mask_url: "https://user:secret@assets.example.com/base.png",
      base_mask_kind: "mask",
      debug: true,
    });

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "$.source_url", code: "invalid_value" }),
        expect.objectContaining({ path: "$.base_mask_url", code: "invalid_value" }),
        expect.objectContaining({ path: "$.debug", code: "unknown_field" }),
      ]),
    });
  });
});
