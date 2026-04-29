# Architecture

Decision Lab is intentionally small, local-first, and dependency-free.

`.decision-lab.json` is optional. When present, the CLI uses it for default owner, workspace directories, quality gate thresholds, and stale decision age.

## Modules

- `bin/decision-lab.js`: CLI entrypoint and command routing
- `src/templates.js`: blank schema-compatible record templates
- `src/decision-core.js`: validation, scoring, audits, role prompts, and Markdown rendering
- `src/decision-agent.js`: local bot workflow, schema migration, pipeline artifacts, ledger, and close-out review
- `src/decision-tools.js`: source notes, evidence attachment, JSON patching, checklist, graph, diff, premortem, research plan, portfolio briefing, action queue, priority, and timeline rendering, due reviews, search, portfolio registers, monthly review packs, calibration, doctor, and health summaries
- `src/decision-export.js`: dashboard triage and CSV/JSON export

## Data Flow

```text
rough question
  -> ask/inbox/pipeline
  -> decision.json
  -> migrate old records when needed
  -> validate/audit/compare
  -> graph/diff for visual inspection and change tracking
  -> premortem before commitment
  -> research plan for missing evidence
  -> prompts for role review
  -> evidence/patch/set updates
  -> source notes/search/due reviews/portfolio registers/monthly review
  -> portfolio briefing
  -> next action queue
  -> priority review
  -> snapshots/timeline
  -> memo/brief/review-plan/dashboard/export/operating pack
  -> close
  -> calibration
```

## Design Rules

- Records are plain JSON.
- Outputs are generated artifacts.
- Prompts must propose edits to records, not replace records.
- Validation should fail loudly when the record shape is incomplete.
- Scoring should reward evidence quality, counterarguments, assumptions, option scoring, and review loops.
- The system should work without network access or external services.
