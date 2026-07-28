---
name: product-retouch
description: Maintain and review the industrial product-retouch workflow, including faithful retouching, marketplace white backgrounds, studio polish, runtime Skill configuration, prompt constraints, batch execution, validation, retries, refunds, and release checks. Use when changing 商品精修 UI, APIs, workers, database contracts, prompts, runtime Skill versions, or production quality rules.
---

# Product Retouch

## Workflow

1. Read [references/runtime-contract.md](references/runtime-contract.md) before changing runtime behavior.
2. Treat `lib/product-retouch.ts` as the built-in runtime definition and schema source of truth.
3. Keep the runtime Skill declarative. Reject scripts, dynamic modules, arbitrary network targets, and unapproved models.
4. Preserve the prompt order: system protection constraints, mode template, category profile, product invariants, then the bounded user instruction.
5. Keep visual scoring, automatic content regeneration, and human review disabled unless the product requirement explicitly changes.
6. Preserve hard validation for downloadability, decoding, format, dimensions, blank content, duplicates, and expected output count.
7. Reuse `components/studio/*` and `components/ui/*` for user-facing UI. Add domain components only for source-to-variant grouping.
8. Preserve parent-batch visibility, hidden internal children, idempotent charging, proportional initial refunds, and separately charged retries.
9. Run focused tests, typecheck, lint, and a production build before release.

## Runtime Skill Changes

- Create a new draft in `admin_config_versions` with key `skills.product-retouch`.
- Validate the complete payload with `parseProductRetouchSkillDefinition`.
- Compare prompt samples for all three modes and representative categories.
- Publish only after batch, retry, refund, and fallback checks pass.
- Keep the previous published version available for rollback.
- Never copy production prompt bodies into this development Skill.

## UI Changes

- Keep the page responsible for state and orchestration only.
- Extend a Studio primitive when the capability is generic and has multiple consumers.
- Keep product-retouch-only grouping inside `features/product-retouch`.
- Preserve keyboard focus, dark mode, reduced motion, desktop proportions, and responsive navigation.
