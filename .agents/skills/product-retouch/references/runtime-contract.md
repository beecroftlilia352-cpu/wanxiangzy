# Product Retouch Runtime Contract

## Sources of truth

- `lib/product-retouch.ts`: public types, normalization, built-in Skill, schema parsing, prompt assembly.
- `lib/product-retouch-skill.server.ts`: published configuration loading, 60-second cache, content hashing, built-in fallback.
- `app/api/admin/product-retouch-skill/configs/`: strict draft creation, history reads, atomic publish, archive, rollback, and audit.
- `app/api/product-retouch/`: authenticated batch creation, reads, and retries.
- `lib/api/generation-jobs.ts`: one-output child execution and hard-validation handoff.
- `supabase/product-retouch.sql`: atomic charge, batch/output records, aggregation, duplicate rejection, refund, and task visibility.

## Invariants

- Accept 1–8 unique PNG, JPEG, or WebP source images.
- Generate 1–4 output slots per source, with at most 32 child jobs.
- Use one user-visible parent generation and hide internal child generations.
- Snapshot the Skill version, content hash, and definition on every batch.
- Debit the initial batch once under a request idempotency key.
- Refund failed initial slots exactly once after all initial slots settle.
- Charge a manual retry separately and let the standard generation refund cover retry failure.
- Preserve product structure, count, proportions, color, material, brand, Logo, text, and packaging facts.

## Runtime configuration

Use config key `skills.product-retouch`. Require:

- `id: "product-retouch"`
- `schemaVersion: 1`
- all three modes
- an `auto` category profile
- at least one invariant
- an allowed model list containing its default
- limits no greater than 8 sources and 4 variants
- JPEG, PNG, or WebP hard-validation formats

Fall back to the built-in definition when the published row is missing, unavailable, or invalid. Log the fallback without exposing prompts or user data.
Set `PRODUCT_RETOUCH_RUNTIME_SKILL_ENABLED=false` to force the built-in runtime definition without hiding the product-retouch entry. Set `NEXT_PUBLIC_PRODUCT_RETOUCH_ENABLED=false` to close the entry and API.

## Release verification

1. Verify navigation order: 商品精修, 商品套图, 全品类商品图.
2. Verify 1 source × 1 output and 8 sources × 4 outputs.
3. Verify idempotent submission with the same `requestId`.
4. Verify partial failure refunds only failed initial slots.
5. Verify manual retry charges once and is hidden from task history.
6. Verify malformed, blank, oversized, unsupported, and duplicate results fail hard validation.
7. Verify published, invalid, unavailable, and rolled-back Skill configurations.
8. Verify batch restoration, preview, source ZIP, full ZIP, keyboard flow, dark mode, and responsive navigation.
