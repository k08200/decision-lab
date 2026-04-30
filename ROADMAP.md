# Roadmap

Decision Lab is meant to grow from a local decision bot into a personal judgment system.

## Now

- Schema-valid records for investment, business, finance, and general decisions
- Local bot workflow from rough question to full artifact set
- Role prompt chain
- Audits, option comparison, memo rendering, review plans, and ledger
- Evidence attachment, JSON patch application, calibration reports, and repository doctor checks
- Source note import, source-linked evidence, due review reports, search, review worksheets, and status promotion
- CSV/JSON evidence import
- Markdown and text note evidence extraction
- Portfolio-level risk, assumption, and source registers plus monthly review packs
- Inbox batch drafting and full operating pack generation
- Quality gates and stale decision reports
- Decision debt report for weak evidence, overdue reviews, missing owners, and stale active records
- Near-term decision agenda for priorities, reviews, debt, and next actions
- Question register for open questions, change-my-mind conditions, and evidence upgrades
- Guardrail report for constraints, non-goals, kill criteria, success metrics, and failure signals
- Full single-record run packets with health, checklist, premortem, research plan, graph, and prompts
- Command catalog for report purpose and cadence
- Review pack generation for all due post-decision reviews
- Operating scorecard for quality, debt, evidence, reviews, and ownership
- Scheduled GitHub Actions operating pack generation
- Scheduled GitHub Actions weekly pack artifact generation
- Decision triage lanes for repair, review, debt, framing, research, monitoring, and archive work
- Taxonomy report for type, status, class, reversibility, urgency, and owner mix
- Calendar report for dated deadlines, reviews, actions, kill checks, and success metrics
- Hypothesis register for evidence, counterarguments, confidence, and disconfirming signals
- Red-team report for counterarguments, disconfirming signals, downside cases, and high-impact risks
- Risk heatmap for probability and impact concentration
- Evidence scorecard for strength, source coverage, and upgrade queues
- Assumption test queue for medium and high-importance assumptions
- Weekly operating pack for lightweight recurring review
- Signal watchlist for expected, failure, disconfirming, change-my-mind, and risk-trigger signals
- Operating playbook recommendations for the next command sequence
- Outcome scorecard for review completeness, lessons, and calibration cues
- Theme report for recurring hypotheses, assumptions, risks, evidence, questions, and lessons
- Commitment report for owners, deadlines, reviews, next actions, kill criteria, and success metrics
- Dependency report for execution dependencies, open questions, weak evidence, assumption tests, and risk blockers
- Scenario report for base, upside, and downside views across active decisions
- Sensitivity report for model drivers, valuation ranges, guardrails, and change-my-mind conditions
- Principles report for reusable judgment rules from lessons, guardrails, and anti-patterns
- Reviewed outcome example for the full learning loop
- Schema migration for older or partial records
- Mermaid decision graph rendering
- Decision record diff reports
- Premortem failure reviews
- Local configuration defaults
- Safe AI patch suggestion workflow
- OpenAI-backed AI patch suggestion command
- Package dry-run checks and manual release-pack workflow
- Portfolio action queue
- Point-in-time snapshots and timeline reports
- Research plans for missing evidence
- Priority review for decision portfolios
- Dashboard triage fields
- Type-specific decision checklists
- Operating loop guide
- Portfolio briefing report
- Executive summary report for health, priorities, risks, and next moves
- Pack index generation for operating and weekly report folders
- Agent guide for future coding agents and decision-bot work
- Example npm shortcuts for executive, playbook, and red-team reports
- Integrity manifest with file hashes
- Lessons report for reviewed decisions
- Repository status and archive planning
- Human note templates
- Owner workload reports
- Standalone dashboard, editable local product server, and CSV/JSON export
- CI for syntax and test coverage
- Full verify gate in CI and expanded repository doctor checks

## Next

- Evidence import adapters for PDFs and spreadsheets
- Optional LLM provider adapters that propose JSON patches instead of rewriting records
- Decision review reminders
- Web UI for browsing the decision ledger

## Principles

- The JSON decision record remains the source of truth.
- Confidence must not outrun evidence quality.
- Every recommendation needs an opposing case and a review loop.
- Automation should make the decision more inspectable, not more theatrical.
