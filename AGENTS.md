# Agent Guide

This repository is a schema-first decision operating system. Agents should improve the decision loop, not turn the project into a loose prompt collection.

## Core Loop

Preserve this workflow:

1. Frame the decision.
2. State hypotheses.
3. Compare options.
4. Attach evidence.
5. Register assumptions.
6. Red-team the thesis.
7. Score and audit the record.
8. Render operating artifacts.
9. Review the outcome and extract lessons.

## Change Rules

- Keep decision records plain JSON.
- Keep generated outputs reproducible from CLI commands.
- Prefer deterministic local logic over network-dependent behavior.
- Add or update tests for every CLI/report/schema behavior change.
- Update README, docs, roadmap, and changelog when adding user-facing behavior.
- Keep examples valid with `npm run verify`.
- Do not weaken validation just to make an incomplete record pass.

## Useful Commands

```bash
npm run verify
node bin/decision-lab.js catalog
node bin/decision-lab.js executive examples --as-of 2026-08-01
node bin/decision-lab.js playbook examples --as-of 2026-08-01
node bin/decision-lab.js red-team examples
node bin/decision-lab.js pack examples --as-of 2026-08-01 --out-dir outputs/packs/example
node bin/decision-lab.js weekly examples --as-of 2026-08-01 --out-dir outputs/weekly/example
```

## Good Agent Work

- Tighten the schema and preserve backwards migration.
- Add reports that reveal decision quality, fragility, evidence gaps, or learning loops.
- Improve examples so reports show realistic investment, business, finance, and reviewed outcomes.
- Make operating packs easier to scan and automate.

## Avoid

- Adding generic chat prompts without schema impact.
- Adding dependencies for small deterministic reports.
- Rewriting examples into vague placeholders.
- Removing counterarguments, risks, review dates, or change-my-mind conditions.
