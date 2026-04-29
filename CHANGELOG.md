# Changelog

## 2.12.0

### Added

- Owner report command for active records, reviewed records, due reviews, and explicit actions by owner
- Operating packs now include `owners.md`

## 2.11.0

### Added

- Human note templates for decision intake, investment notes, business decisions, finance hypotheses, and reviews

## 2.10.0

### Added

- Repository status command for portfolio health, status/type counts, weak records, and due reviews
- Archive plan command for reviewed or outcome-bearing decision records
- Operating packs now include `status.md`

## 2.9.0

### Added

- Lessons report command for reviewed outcomes, lessons, and lesson themes
- Operating packs now include `lessons.md`

## 2.8.0

### Added

- Integrity manifest command with validation status, quality score, and SHA-256 hash for each decision record
- Operating packs now include `manifest.md`

## 2.7.0

### Added

- Portfolio briefing command for a one-page view of snapshot, top priorities, high-impact risks, and due reviews
- Operating packs now include `briefing.md`

## 2.6.0

### Added

- Operating loop guide for daily triage, pre-commit review, weekly review, monthly packs, and post-outcome calibration

## 2.5.0

### Added

- Type-specific decision checklist command for investment, business, finance, and general records

## 2.4.0

### Added

- Dashboard priority, high-risk, due-review, and action-count fields for portfolio triage

## 2.3.0

### Added

- Priority review command that ranks decisions by status, quality gap, high-impact risks, deadlines, and due reviews
- Operating packs now include `priorities.md`

## 2.2.0

### Added

- Research plan command that converts weak evidence, assumptions, open questions, and disconfirming signals into research tasks

## 2.1.0

### Added

- Snapshot command for saving point-in-time copies of decision records
- Timeline report for created, updated, deadline, and review events
- Operating packs now include `timeline.md`

## 2.0.0

### Added

- Portfolio action queue command that collects next actions, quality follow-ups, and due reviews
- Operating packs now include `next.md`

## 1.9.0

### Added

- Local `.decision-lab.json` defaults for owner, workspace directories, quality gates, and stale decision thresholds
- `config` command for writing the default settings file

## 1.8.0

### Added

- Premortem command that turns risks, fragile assumptions, counterarguments, and change-my-mind conditions into a pre-commit failure review

## 1.7.0

### Added

- Decision diff command for comparing two versions of a record across status, recommendation, confidence, score, and register counts

## 1.6.0

### Added

- Mermaid decision graph command for visualizing hypotheses, evidence, assumptions, options, risks, and recommendations

## 1.5.0

### Added

- Schema migration command for older or partial decision records
- Migration reports that compare pre-upgrade and post-upgrade validity
- Legacy decision type aliases for investment, business, and finance records

## 1.4.0

### Added

- Decision quality gate command for CI or personal operating review
- Stale decision report for neglected records

## 1.3.0

### Added

- Inbox batch creation from plain text decision questions
- Full operating pack generation with ledger, dashboard, exports, calibration, due reviews, risk register, assumption register, source index, monthly report, and doctor report

## 1.2.0

### Added

- Portfolio-level risk register
- Portfolio-level assumption register
- Evidence source index
- Monthly decision operating review pack

## 1.1.0

### Added

- Source note normalization and source-linked evidence
- Due review reports
- Decision ledger search
- Review worksheets
- Status promotion command
- Expanded doctor checks

## 1.0.0

Initial complete release of Decision Lab.

### Added

- Schema-first decision records for general, investment, business, and finance decisions
- Local bot workflow with `ask`, `run`, and `pipeline`
- Role prompt chain for analyst, skeptic, CFO, CEO, operator, risk, and recorder
- Validation, scoring, audit, health, option comparison, memo, brief, and review-plan commands
- Evidence attachment, JSON patch application, field updates, calibration reports, and doctor checks
- Standalone HTML dashboard and CSV/JSON export
- Example decision records and generated workflow structure
- CI, issue template, PR template, roadmap, contribution guide, CLI reference, schema guide, and playbooks

### Notes

- The JSON decision record is the source of truth.
- External LLMs or data providers should integrate by proposing JSON-compatible edits, not by replacing the record.
