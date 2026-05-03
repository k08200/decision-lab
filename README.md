# Decision Lab

Decision Lab is a schema-first decision operating system for investment, finance, and management judgment.

It is built for decisions that should not live as vague notes, scattered prompts, or confident one-shot answers. A rough question becomes a structured record with hypotheses, evidence, counterarguments, assumptions, option scoring, a decision memo, review dates, and follow-up reports.

## What You Use It For

Use Decision Lab when you need to decide, defend, review, or learn from a serious call:

- Investment: buy, hold, sell, add, trim, avoid, rebalance, or wait.
- Business strategy: pricing, product scope, market entry, hiring, budget, positioning, partnerships, or operating priorities.
- Finance: runway, margin, forecast, headcount, CAC, payback, cash allocation, and sensitivity decisions.
- Management: owner assignment, commitments, risk reviews, decision debt, review packs, and postmortems.

The goal is not to make the model sound smarter. The goal is to force a better judgment loop:

1. Frame the real decision.
2. State the thesis.
3. Capture evidence.
4. Generate the opposing case.
5. Register fragile assumptions.
6. Compare options against explicit criteria.
7. Write the memo.
8. Schedule review.
9. Learn from the result.

## Public Code, Private Decisions

This repository is safe to make public as a framework. Your real decision data should usually stay private.

Safe to publish:

- code
- schemas
- prompts
- docs
- tests
- workflows
- sanitized examples

Keep private:

- real `decisions/`
- raw `research/`
- generated `outputs/`
- `.env`
- `.decision-lab.json`
- investment theses
- management assumptions
- forecasts
- customer notes
- model responses that contain private context

Before using real data, read [docs/public-private-usage.md](docs/public-private-usage.md) and [SECURITY.md](SECURITY.md).

## Install And Run

Decision Lab is a Node.js CLI. Use Node 22 or newer.

Try the demo without cloning:

```bash
npx github:k08200/decision-lab demo decision-lab-demo
cd decision-lab-demo
less outputs/run/memo.md
```

After the npm package is published, the same flow becomes:

```bash
npx @k08200/decision-lab demo decision-lab-demo
cd decision-lab-demo
less outputs/run/memo.md
```

Or work from a cloned checkout:

```bash
git clone https://github.com/k08200/decision-lab.git
cd decision-lab
npm install
npm run verify
```

From a cloned checkout, run commands with:

```bash
export DL="bin/decision-lab.js"
node "$DL" help
```

If you create a separate private workspace next to the repo, a convenient pattern is:

```bash
cd decision-lab
node bin/decision-lab.js private-workspace ../my-private-decisions --owner "Your Name"
cd ../my-private-decisions
export DL="../decision-lab/bin/decision-lab.js"
node "$DL" list-types
```

After that, run `node "$DL" ...` from your private workspace. If you stay inside the cloned repo instead, keep `DL="bin/decision-lab.js"`.

## First 10 Minutes

Use this path when you want one real decision to become a working folder.

Create a decision from a rough question:

```bash
node "$DL" decide "Should we change enterprise pricing this quarter?" --type business --slug pricing
```

This creates:

```text
decisions/active/pricing/decision.json
decisions/active/pricing/README.md
decisions/active/pricing/run/memo.md
decisions/active/pricing/run/brief.md
decisions/active/pricing/run/audit.json
decisions/active/pricing/run/prompts/*.md
outputs/decision-lab-backup.json
```

Read the memo:

```bash
less decisions/active/pricing/run/memo.md
```

Capture a missing question without editing JSON by hand:

```bash
node "$DL" capture decisions/active/pricing/decision.json --kind question --text "What evidence would prove this pricing change is too risky?"
```

Capture evidence:

```bash
node "$DL" capture decisions/active/pricing/decision.json --kind evidence --text "Three enterprise QBRs mentioned packaging confusion." --source "Customer QBR notes" --strength medium
```

Regenerate the operating artifacts:

```bash
node "$DL" run decisions/active/pricing/decision.json --out-dir decisions/active/pricing/run
```

Create a daily operating brief:

```bash
node "$DL" today decisions --out-dir outputs/today/$(date +%F)
```

Start the local product UI:

```bash
node "$DL" serve decisions --as-of $(date +%F) --token local-dev-token --actor "Your Name"
```

Open the printed local URL. The UI lets you browse decisions, create records, edit JSON, validate saves, preview memos, and review portfolio reports. API mutations are logged to `.decision-lab/audit.jsonl`.

## Daily Operating Loop

For actual use, do not treat this as a one-time prompt generator. Treat it like a workbench.

1. Capture the decision.

```bash
node "$DL" decide "Should we hire two engineers despite runway pressure?" --type finance --slug hiring-runway
```

2. Attach source material.

```bash
node "$DL" import-evidence decisions/active/hiring-runway/decision.json research/runway-notes.md --report outputs/evidence-import.md
```

3. Add live updates during the day.

```bash
node "$DL" capture decisions/active/hiring-runway/decision.json --kind risk --text "Hiring now may force a rushed fundraise if revenue slips."
node "$DL" capture decisions/active/hiring-runway/decision.json --kind action --text "Ask finance to validate runway impact by Friday."
node "$DL" capture decisions/active/hiring-runway/decision.json --kind change-mind --text "If net burn exceeds plan by 15 percent for two months, pause hiring."
```

4. Run pressure tests before committing.

```bash
node "$DL" checklist decisions/active/hiring-runway/decision.json --out outputs/checklists/hiring-runway.md
node "$DL" premortem decisions/active/hiring-runway/decision.json --out outputs/premortems/hiring-runway.md
node "$DL" research-plan decisions/active/hiring-runway/decision.json --out outputs/research/hiring-runway.md
node "$DL" gate decisions/active --min-score 0.85 --operational --out outputs/gate.md
```

5. Review the portfolio.

```bash
node "$DL" today decisions --out-dir outputs/today/$(date +%F)
node "$DL" weekly decisions --out-dir outputs/weekly/$(date +%F)
node "$DL" executive decisions --as-of $(date +%F) --out outputs/executive.md
```

6. Close the loop after the outcome is known.

```bash
node "$DL" review decisions/active/hiring-runway/decision.json --out outputs/reviews/hiring-runway.md
node "$DL" close decisions/active/hiring-runway/decision.json --outcome "Hired one engineer, delayed the second." --lesson "Runway guardrails needed owner sign-off before recruiting opened."
node "$DL" calibration decisions --out outputs/calibration.md
node "$DL" outcomes decisions --out outputs/outcomes.md
```

## Common Workflows

### Create Decisions

Use `decide` when you want the shortest real-use path from question to working folder:

```bash
node "$DL" decide "Should I add to NVDA after earnings?" --type investment --slug nvda-add
node "$DL" decide "Should we launch annual prepaid discounts?" --type business --slug annual-discount
node "$DL" decide "Should we preserve cash or accelerate hiring?" --type finance --slug cash-vs-hiring
```

Use `ask` when you only want a draft JSON file:

```bash
node "$DL" ask "Should I buy AAPL now?" --type investment --out decisions/drafts/aapl.json
```

Use `inbox` when you have many rough questions in a text file:

```bash
node "$DL" inbox inbox.txt --type business --owner "Your Name" --out-dir decisions/drafts
```

Use `new` when you want a blank template:

```bash
node "$DL" new investment --out decisions/drafts/blank-investment.json
node "$DL" new business --out decisions/drafts/blank-business.json
node "$DL" new finance --out decisions/drafts/blank-finance.json
```

### Add Evidence

Add one claim quickly:

```bash
node "$DL" evidence decisions/drafts/aapl.json --claim "Services margin remained resilient." --source "Company filing" --strength strong --out decisions/drafts/aapl.json
```

Import a source into an existing record:

```bash
node "$DL" import-evidence decisions/drafts/aapl.json research/evidence.csv --report outputs/evidence-import.md
node "$DL" import-evidence decisions/drafts/aapl.json research/customer-notes.md --report outputs/customer-notes-import.md
node "$DL" import-evidence decisions/drafts/aapl.json research/model.xlsx --report outputs/model-import.md
```

Extract normalized evidence without attaching it yet:

```bash
node "$DL" extract-evidence research/customer-notes.md --out research/evidence/customer-notes.json --report outputs/evidence-extract.md
node "$DL" extract-evidence research/model.xlsx --out research/evidence/model.json --report outputs/model-extract.md
node "$DL" extract-evidence https://example.com/research --out research/evidence/web-research.json --report outputs/web-evidence.md
```

Supported evidence inputs:

- CSV
- TSV
- JSON
- Markdown
- plain text
- saved HTML
- PDF
- XLSX
- live HTTP(S) URL

### Use AI Safely

Decision Lab can work with external LLMs, but the safe default is patch-first. A role proposes changes. You inspect the patch. Then you apply it.

Create a role prompt:

```bash
node "$DL" prompt skeptic decisions/active/pricing/decision.json --out outputs/prompts/pricing-skeptic.md
node "$DL" prompt all decisions/active/pricing/decision.json --out-dir outputs/prompts/pricing
```

Ask a model manually, save the response, then parse it into a patch:

```bash
node "$DL" suggest skeptic decisions/active/pricing/decision.json --response outputs/llm/pricing-skeptic.md --out outputs/patches/pricing.patch.json --review outputs/patches/pricing-review.md
node "$DL" patch decisions/active/pricing/decision.json outputs/patches/pricing.patch.json --out decisions/active/pricing/decision.json
```

Call OpenAI directly if `OPENAI_API_KEY` is set:

```bash
OPENAI_API_KEY=... node "$DL" ai-suggest skeptic decisions/active/pricing/decision.json --model gpt-5.2 --out outputs/patches/pricing.openai.patch.json --review outputs/patches/pricing.openai-review.md --raw outputs/patches/pricing.openai.raw.json
```

`ai-suggest` still saves a patch. It does not silently rewrite your decision record.

### Inspect One Decision

```bash
node "$DL" validate decisions/active/pricing/decision.json
node "$DL" score decisions/active/pricing/decision.json
node "$DL" audit decisions/active/pricing/decision.json
node "$DL" health decisions/active/pricing/decision.json
node "$DL" compare decisions/active/pricing/decision.json
node "$DL" graph decisions/active/pricing/decision.json --out outputs/graphs/pricing.md
node "$DL" render decisions/active/pricing/decision.json --out outputs/memos/pricing.md
node "$DL" brief decisions/active/pricing/decision.json --out outputs/briefs/pricing.md
node "$DL" review-plan decisions/active/pricing/decision.json --out outputs/reviews/pricing-plan.md
```

### Operate Many Decisions

Use these when the tool becomes a personal or company decision ledger.

```bash
node "$DL" ledger decisions --out outputs/ledger.md
node "$DL" status decisions --as-of $(date +%F) --out outputs/status.md
node "$DL" triage decisions --as-of $(date +%F) --out outputs/triage.md
node "$DL" next decisions --as-of $(date +%F) --out outputs/next.md
node "$DL" prioritize decisions --as-of $(date +%F) --out outputs/priorities.md
node "$DL" commitments decisions --as-of $(date +%F) --out outputs/commitments.md
node "$DL" dependencies decisions --out outputs/dependencies.md
node "$DL" owners decisions --as-of $(date +%F) --out outputs/owners.md
```

Review decision quality and recurring patterns:

```bash
node "$DL" risks decisions --out outputs/risks.md
node "$DL" risk-heatmap decisions --out outputs/risk-heatmap.md
node "$DL" assumptions decisions --out outputs/assumptions.md
node "$DL" assumption-tests decisions --out outputs/assumption-tests.md
node "$DL" evidence-scorecard decisions --out outputs/evidence-scorecard.md
node "$DL" questions decisions --out outputs/questions.md
node "$DL" hypotheses decisions --out outputs/hypotheses.md
node "$DL" red-team decisions --out outputs/red-team.md
node "$DL" scenarios decisions --out outputs/scenarios.md
node "$DL" sensitivities decisions --out outputs/sensitivities.md
node "$DL" guardrails decisions --out outputs/guardrails.md
```

Generate working packs:

```bash
node "$DL" today decisions --out-dir outputs/today/$(date +%F)
node "$DL" weekly decisions --out-dir outputs/weekly/$(date +%F)
node "$DL" pack decisions --out-dir outputs/packs/$(date +%F)
node "$DL" executive decisions --as-of $(date +%F) --out outputs/executive.md
node "$DL" playbook decisions --as-of $(date +%F) --out outputs/playbook.md
node "$DL" scorecard decisions --as-of $(date +%F) --out outputs/scorecard.md
node "$DL" monthly decisions --as-of $(date +%F) --out outputs/monthly.md
```

### Back Up And Restore

Create a verifiable backup:

```bash
node "$DL" backup decisions --out outputs/decision-lab-backup.json --report outputs/backup.md
```

Verify before storing or restoring:

```bash
node "$DL" verify-backup outputs/decision-lab-backup.json --report outputs/backup-verify.md
```

Restore to a separate directory:

```bash
node "$DL" restore outputs/decision-lab-backup.json --out-dir restored-decisions
```

Backups contain file contents, SHA256 hashes, validation status, and a summary. Restore rejects unsafe paths and requires a verified bundle.

### Local UI And API

Run the local UI:

```bash
node "$DL" serve decisions --host 127.0.0.1 --port 8787 --as-of $(date +%F) --token local-dev-token --actor "Your Name"
```

Generate the OpenAPI contract:

```bash
node "$DL" openapi --server-url http://127.0.0.1:8787 --out outputs/openapi.json
```

Review create/save mutations:

```bash
node "$DL" audit-log decisions --out outputs/audit-log.md
```

The server is local-first. Use `--token` or `DECISION_LAB_TOKEN` to require `Authorization: Bearer <token>` or `x-api-key: <token>` for API requests.

### Publish Safely

Before pushing a public framework repo:

```bash
npm run privacy:check
node "$DL" privacy-check --out outputs/privacy.md
```

For a private real-decision workspace, `privacy-check` may intentionally warn or fail because that folder contains the sensitive records you should not publish.

Use this split:

```text
decision-lab/           public framework repo
my-private-decisions/   private working data, never public
```

## Decision Record Model

Every mature decision record is a JSON file. It should answer:

- What decision is actually being made?
- What is the default action if nobody decides?
- What thesis supports action?
- What evidence supports it?
- What is the strongest opposing case?
- Which assumptions are fragile?
- Which options are being compared?
- Which criteria decide the winner?
- What would change the recommendation?
- Who owns the next action?
- When will the result be reviewed?

Core sections include:

- `decision_frame`: reversibility, urgency, desired outcome, constraints, non-goals, and default action.
- `hypotheses`: thesis statements with assumptions, evidence, counterarguments, and disconfirming signals.
- `options`: possible actions with upside, downside, risks, and reversibility.
- `decision_criteria`: weighted criteria that define a good decision.
- `option_scores`: scored comparison across the criteria.
- `assumption_register`: fragile assumptions, tests, owners, and deadlines.
- `risk_register`: risks, triggers, mitigations, owners, and severity.
- `post_decision_review`: review date, success metrics, learning questions, and final outcome.

## Decision Types

`general` is the shared base for serious decisions.

`investment` adds asset, portfolio context, valuation, catalysts, position sizing, and risk controls.

`business` adds strategic goal, stakeholders, customer impact, financial impact, pilot design, execution plan, and operating cadence.

`finance` adds financial hypothesis, model driver, planning horizon, runway, scenarios, sensitivity checks, and guardrails.

## Role Chain

The same record can be reviewed by several roles:

- `analyst`: strengthens the thesis and identifies missing evidence.
- `skeptic`: breaks the thesis and finds hidden assumptions.
- `cfo`: translates the decision into financial impact and opportunity cost.
- `ceo`: judges strategy, timing, and long-term compounding value.
- `operator`: turns the decision into owners, milestones, kill criteria, and execution cadence.
- `risk`: maps fragile assumptions, downside correlation, and early warning indicators.
- `recorder`: writes the final auditable memo.

## Repository Shape

```text
.decision-lab.json    optional local defaults
bin/                  CLI entrypoint
src/                  validation, scoring, audits, workflow, rendering, server, backup, import
schemas/              JSON schemas for decision records
prompts/              reusable role prompts
examples/             sanitized investment, business, finance, and reviewed records
docs/                 operating system, CLI reference, playbooks, architecture, and commercialization notes
test/                 Node test runner coverage
decisions/            local private decision records created by init/private-workspace
research/             local private source material
outputs/              rendered memos, reports, exports, backups, and packs
```

The public repo tracks only placeholders for `decisions/`, `research/`, and `outputs/`.

## Commercial Readiness

Decision Lab is currently strongest as a local-first product, internal decision workbench, founder operating system, or portfolio-quality open-source CLI. It includes:

- one-step decision capture
- local UI
- API contract
- token auth
- audit logs
- verifiable backups
- restore workflow
- privacy checks
- evidence import
- decision reports
- operating packs
- commercial readiness assessment

Check readiness:

```bash
node "$DL" readiness --out outputs/readiness.md
```

For hosted SaaS, the missing pieces are mostly outside this local repo: accounts, teams, permissions, billing, hosted storage, deployment, observability, and compliance operations. See [docs/commercialization.md](docs/commercialization.md).

For a more direct product scorecard and recommended build order, see [docs/product-assessment.md](docs/product-assessment.md). For operating and release procedures, see [docs/runbook.md](docs/runbook.md).

For npm packaging and public distribution steps, see [docs/distribution.md](docs/distribution.md).

## Development

Install dependencies:

```bash
npm install
```

Run the full verification suite:

```bash
npm run verify
```

Run security and package checks:

```bash
npm run security:audit
npm run pack:check
npm run publish:dry-run
```

Useful development commands:

```bash
npm test
npm run check
npm run demo
npm run example:weekly
npm run example:executive
npm run example:playbook
```

## Full Command Reference

For the complete command catalog, run:

```bash
node bin/decision-lab.js help
```

Or read [docs/cli-reference.md](docs/cli-reference.md).

## Philosophy

Good judgment is not just a better answer. It is a better loop.

Decision Lab is built to fight:

- confident but unsupported recommendations
- decisions that never state assumptions
- hidden downside that appears only after commitment
- evidence that never gets linked to claims
- no postmortem loop, so judgment never compounds

The record should always make these questions visible:

- What must be true?
- What is the strongest opposing case?
- What evidence would change my mind?
- Which option wins under explicit criteria?
- How will I know later whether this was a good decision?
