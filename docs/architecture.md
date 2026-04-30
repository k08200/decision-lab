# Architecture

Decision Lab is intentionally small, local-first, and dependency-free.

`.decision-lab.json` is optional. When present, the CLI uses it for default owner, workspace directories, quality gate thresholds, stale decision age, and decision debt age.

## Modules

- `bin/decision-lab.js`: CLI entrypoint and command routing
- `src/templates.js`: blank schema-compatible record templates
- `src/decision-core.js`: validation, scoring, audits, role prompts, and Markdown rendering
- `src/decision-agent.js`: local bot workflow, schema migration, pipeline artifacts, ledger, and close-out review
- `src/decision-ai.js`: patch-specific AI prompts, OpenAI Responses API patch suggestions, JSON Patch response parsing, and patch review rendering
- `src/decision-import.js`: CSV/TSV/JSON/Markdown/text/HTML/PDF/XLSX evidence extraction, evidence import, and import report rendering
- `src/decision-privacy.js`: private workspace scaffolding and public-repo privacy checks
- `src/decision-tools.js`: source notes, evidence attachment, JSON patching, checklist, graph, diff, premortem, research plan, portfolio briefing, executive summaries, integrity manifest, taxonomy reports, calendar reports, outcomes, principles, theme reports, commitment reports, dependency reports, lessons, owner reporting, repository status, operating playbooks, operating scorecards, red-team reports, scenario reports, sensitivity reports, evidence scorecards, assumption test queues, signal watchlists, decision triage, decision debt, decision agenda, risk heatmaps, hypothesis registers, question registers, guardrail reports, review packs, report catalog, archive planning, action queue, priority, and timeline rendering, due reviews, search, portfolio registers, monthly review packs, calibration, doctor, and health summaries
- `src/decision-export.js`: dashboard triage and CSV/JSON export
- `src/decision-server.js`: local product UI and JSON/Markdown API server for browsing, creating, editing, validating, saving decisions, and guiding first-run workflows
- `.github/workflows/ci.yml`: syntax and test verification
- `.github/workflows/operating-pack.yml`: scheduled and manual example operating pack generation
- `.github/workflows/release-pack.yml`: manual package tarball and operating-pack artifact generation

## Data Flow

```text
rough question
  -> private-workspace for real records
  -> privacy-check before publishing
  -> ask/inbox/pipeline
  -> decision.json
  -> migrate old records when needed
  -> validate/audit/compare
  -> graph/diff for visual inspection and change tracking
  -> premortem before commitment
  -> research plan for missing evidence
  -> prompts for role review
  -> manual or OpenAI AI patch suggestion
  -> CSV/TSV/JSON/notes/HTML/PDF/XLSX evidence import
  -> evidence/patch/set updates
  -> source notes/search/due reviews/portfolio registers/monthly review
  -> taxonomy report
  -> portfolio briefing
  -> calendar report
  -> commitment report
  -> dependency report
  -> next action queue
  -> priority review
  -> snapshots/timeline
  -> memo/brief/review-plan/dashboard/server/export/calendar/operating pack
  -> close
  -> calibration
  -> outcomes/lessons
```

## Design Rules

- Records are plain JSON.
- Outputs are generated artifacts.
- Prompts must propose edits to records, not replace records.
- Validation should fail loudly when the record shape is incomplete.
- Scoring should reward evidence quality, counterarguments, assumptions, option scoring, and review loops.
- The system should work without network access or external services.
