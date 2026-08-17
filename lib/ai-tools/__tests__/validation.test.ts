import { describe, expect, it } from "vitest";
import { parseAiToolCreateRequest } from "@/lib/ai-tools/types";

describe("AI tool request validation", () => {
  it("normalizes a valid outpaint request with strict defaults", () => {
    const result = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "outpaint",
      source_url: "https://assets.example.com/source.png",
      options: {
        target_width: 1600,
        target_height: 1200,
        prompt: "延展简洁摄影棚背景",
      },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        request_id: "request-1234",
        operation: "outpaint",
        source_url: "https://assets.example.com/source.png",
        reference_urls: [],
        options: {
          model: "nano-banana-2",
          target_width: 1600,
          target_height: 1200,
          anchor: "center",
          position_x: 0.5,
          position_y: 0.5,
          source_scale: 1,
          prompt: "延展简洁摄影棚背景",
          mask_feather: 8,
          output_format: "png",
        },
      },
    });
  });

  it("validates normalized outpaint source positions", () => {
    const valid = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "outpaint",
      source_url: "https://assets.example.com/source.png",
      options: { target_width: 1600, target_height: 1200, position_x: 0.2, position_y: 0.8 },
    });
    expect(valid).toMatchObject({
      ok: true,
      data: { options: { position_x: 0.2, position_y: 0.8 } },
    });

    const invalid = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "outpaint",
      source_url: "https://assets.example.com/source.png",
      options: { target_width: 1600, target_height: 1200, position_y: -0.1 },
    });
    expect(invalid).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ path: "$.options.position_y" })]),
    });
  });

  it("accepts only published image-model identifiers for generative tools", () => {
    const valid = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "erase",
      source_url: "https://assets.example.com/source.png",
      mask_url: "https://assets.example.com/mask.png",
      options: { model: "gpt-image-2" },
    });
    expect(valid).toMatchObject({ ok: true, data: { options: { model: "gpt-image-2" } } });

    const invalid = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "erase",
      source_url: "https://assets.example.com/source.png",
      mask_url: "https://assets.example.com/mask.png",
      options: { model: "api.new.bi/custom-model" },
    });
    expect(invalid).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "$.options.model", code: "invalid_value" }),
      ]),
    });
  });

  it.each([
    ["center", 0.5, 0.5],
    ["left", 0, 0.5],
    ["right", 1, 0.5],
    ["top", 0.5, 0],
    ["bottom", 0.5, 1],
  ] as const)("maps legacy %s anchors to canonical gateway positions", (anchor, x, y) => {
    const result = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "outpaint",
      source_url: "https://assets.example.com/source.png",
      options: { target_width: 1600, target_height: 1200, anchor },
    });

    expect(result).toMatchObject({
      ok: true,
      data: { options: { anchor, position_x: x, position_y: y } },
    });
  });

  it("keeps explicit normalized positions authoritative over a legacy anchor", () => {
    const result = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "outpaint",
      source_url: "https://assets.example.com/source.png",
      options: {
        target_width: 1600,
        target_height: 1200,
        anchor: "left",
        position_x: 0.75,
        position_y: 0.25,
      },
    });

    expect(result).toMatchObject({
      ok: true,
      data: { options: { anchor: "left", position_x: 0.75, position_y: 0.25 } },
    });
  });

  it("rejects unknown options and missing required dimensions", () => {
    const result = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "resize",
      source_url: "https://assets.example.com/source.png",
      options: { width: 800, surprise: true },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "$.options.surprise", code: "unknown_field" }),
        expect.objectContaining({ path: "$.options.height", code: "missing_field" }),
      ]));
    }
  });

  it("validates normalized resize crop focal points", () => {
    const valid = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "resize",
      source_url: "https://assets.example.com/source.png",
      options: { width: 800, height: 600, fit: "cover", position_x: 0.2, position_y: 0.8 },
    });
    expect(valid).toMatchObject({
      ok: true,
      data: { options: { position_x: 0.2, position_y: 0.8 } },
    });

    const invalid = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "resize",
      source_url: "https://assets.example.com/source.png",
      options: { width: 800, height: 600, fit: "cover", position_x: 1.1 },
    });
    expect(invalid).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ path: "$.options.position_x" })]),
    });
  });

  it("rejects private-network image URLs", () => {
    const result = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "matting",
      source_url: "http://127.0.0.1/internal.png",
      options: {},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({ path: "$.source_url" }));
    }
  });

  it("normalizes a legacy limb repair request to the both target", () => {
    const result = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "repair-limbs",
      source_url: "https://assets.example.com/person.png",
      options: { preserve_identity: false },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        request_id: "request-1234",
        operation: "repair-limbs",
        source_url: "https://assets.example.com/person.png",
        reference_urls: [],
        options: {
          model: "nano-banana-2",
          mask_feather: 8,
          output_format: "png",
          preserve_identity: false,
          target: "both",
        },
      },
    });
  });

  it("accepts strict limb targets and rejects unsupported values", () => {
    const valid = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "repair-limbs",
      source_url: "https://assets.example.com/person.png",
      options: { target: "hands" },
    });
    expect(valid).toMatchObject({ ok: true, data: { options: { target: "hands" } } });

    const result = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "repair-limbs",
      source_url: "https://assets.example.com/person.png",
      options: { target: "arms" },
    });

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "$.options.target", code: "invalid_value" }),
      ]),
    });
  });

  it("requires a strict garment reference type", () => {
    const valid = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "repair-garment",
      source_url: "https://assets.example.com/person.png",
      reference_urls: ["https://assets.example.com/garment.png"],
      reference_mask_url: "https://assets.example.com/reference-mask.png",
      options: { reference_type: "model" },
    });
    expect(valid).toMatchObject({
      ok: true,
      data: { options: { reference_type: "model" } },
    });

    const missing = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "repair-garment",
      source_url: "https://assets.example.com/person.png",
      reference_urls: ["https://assets.example.com/garment.png"],
      reference_mask_url: "https://assets.example.com/reference-mask.png",
      options: {},
    });
    expect(missing).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "$.options.reference_type", code: "missing_field" }),
      ]),
    });

    const invalid = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "repair-garment",
      source_url: "https://assets.example.com/person.png",
      reference_urls: ["https://assets.example.com/garment.png"],
      reference_mask_url: "https://assets.example.com/reference-mask.png",
      options: { reference_type: "mannequin" },
    });
    expect(invalid).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "$.options.reference_type", code: "invalid_value" }),
      ]),
    });
  });

  it("requires reference masks only for the live garment branches that expose a reference editor", () => {
    const flatStyle = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "repair-garment",
      source_url: "https://assets.example.com/person.png",
      reference_urls: ["https://assets.example.com/garment.png"],
      options: { repair_mode: "style", reference_type: "flat" },
    });
    expect(flatStyle).toMatchObject({ ok: true });

    for (const options of [
      { repair_mode: "style", reference_type: "model" },
      { repair_mode: "detail", reference_type: "flat" },
    ]) {
      const missing = parseAiToolCreateRequest({
        request_id: "request-1234",
        operation: "repair-garment",
        source_url: "https://assets.example.com/person.png",
        reference_urls: ["https://assets.example.com/garment.png"],
        options,
      });
      expect(missing).toMatchObject({
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ path: "$.reference_mask_url", code: "missing_field" }),
        ]),
      });
    }

    const unexpected = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "repair-garment",
      source_url: "https://assets.example.com/person.png",
      reference_urls: ["https://assets.example.com/garment.png"],
      reference_mask_url: "https://assets.example.com/reference-mask.png",
      options: { repair_mode: "style", reference_type: "flat" },
    });
    expect(unexpected).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "$.reference_mask_url", code: "invalid_value" }),
      ]),
    });
  });

  it("requires one reference image and its mask for footwear repair", () => {
    const result = parseAiToolCreateRequest({
      request_id: "request-1234",
      operation: "repair-footwear",
      source_url: "https://assets.example.com/person.png",
      reference_urls: ["https://assets.example.com/shoe.png"],
      options: {},
    });
    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "$.reference_mask_url", code: "missing_field" }),
      ]),
    });
  });
});
