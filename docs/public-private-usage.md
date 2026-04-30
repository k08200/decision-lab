# Public Repo, Private Decisions

The intended setup is simple:

- Make the framework repository public.
- Keep real decision records, research, outputs, and API keys private.

Decision Lab is useful as an open source framework because the schemas, prompts, CLI, reports, and examples can be inspected. The actual records are different: they may contain investment theses, management assumptions, financial forecasts, customer notes, or private research.

## Public Repository

Safe to publish:

- `bin/`, `src/`, `schemas/`, `prompts/`, and `docs/`
- sanitized examples under `examples/`
- tests and GitHub Actions
- README, changelog, roadmap, contribution guide, and security policy

## Private Workspace

Keep private:

- `decisions/drafts/`
- `decisions/active/`
- `decisions/reviewed/`
- `decisions/snapshots/`
- `decisions/archive/`
- `research/raw/`
- `research/evidence/`
- `research/imports/`
- `research/models/`
- generated `outputs/`
- `.env`
- `.decision-lab.json` if it includes personal owner names or local paths

## First Real Use

Try the sanitized demo first:

```bash
npx github:k08200/decision-lab demo decision-lab-demo
```

```bash
git clone https://github.com/k08200/decision-lab.git
cd decision-lab
npm run verify
node bin/decision-lab.js init
node bin/decision-lab.js serve decisions
```

Or create a separate private workspace next to this repository:

```bash
node bin/decision-lab.js private-workspace ../my-private-decisions --owner "Your Name"
```

Create a decision:

```bash
node bin/decision-lab.js ask "Should I buy AAPL now?" --type investment --out decisions/drafts/aapl.json
node bin/decision-lab.js run decisions/drafts/aapl.json --out-dir outputs/runs/aapl
```

Run a weekly review:

```bash
node bin/decision-lab.js weekly decisions --as-of 2026-04-30 --out-dir outputs/weekly/2026-04-30
node bin/decision-lab.js ics decisions --as-of 2026-04-30 --out outputs/calendar.ics
```

Use OpenAI locally:

```bash
cp .env.example .env
OPENAI_API_KEY=... node bin/decision-lab.js ai-suggest skeptic decisions/drafts/aapl.json --out outputs/patches/aapl.patch.json --review outputs/patches/aapl-review.md
```

`ai-suggest` proposes JSON Patch operations. It does not apply them automatically.

## Before Publishing

Run:

```bash
npm run privacy:check
node bin/decision-lab.js privacy-check
```

The privacy check fails if tracked files include local decision records, raw research, generated outputs, local config, `.env` files, or obvious API keys.
