# Quickstart

This guide gets you from zero to a working private decision workspace in a few minutes.

## Requirements

- Node.js 22 or newer
- A terminal
- No database, cloud account, or hosted service required

## 1. Try The Demo

Run the public package without cloning the repo:

```bash
npx @k08200/decision-lab demo decision-lab-demo
cd decision-lab-demo
less outputs/run/memo.md
```

The demo creates a complete workspace with example decisions, evidence, memos, review outputs, and local operating reports.

## 2. Create A Private Workspace

Use a separate folder for real decisions. Do not store private decisions in a public framework repo.

```bash
cd ..
npx @k08200/decision-lab private-workspace my-private-decisions --owner "Your Name"
cd my-private-decisions
```

The private workspace starts with ignore rules for real decision data, research, outputs, local config, and secrets.

## 3. Create Your First Decision

```bash
npx @k08200/decision-lab decide "Should we change enterprise pricing this quarter?" --type business --slug pricing
```

Read the generated memo:

```bash
less decisions/active/pricing/run/memo.md
```

## 4. Add Evidence And Open Questions

Capture evidence without editing JSON by hand:

```bash
npx @k08200/decision-lab capture decisions/active/pricing/decision.json --kind evidence --text "Three enterprise QBRs mentioned packaging confusion." --source "Customer QBR notes" --strength medium
```

Capture the most important missing question:

```bash
npx @k08200/decision-lab capture decisions/active/pricing/decision.json --kind question --text "What evidence would prove this pricing change is too risky?"
```

Regenerate the memo and review artifacts:

```bash
npx @k08200/decision-lab run decisions/active/pricing/decision.json --out-dir decisions/active/pricing/run
```

## 5. Review Your Operating Loop

Create a daily brief:

```bash
npx @k08200/decision-lab today decisions --out-dir outputs/today
```

Start the local UI:

```bash
npx @k08200/decision-lab serve decisions --as-of 2026-08-01 --token local-dev-token --actor "Your Name"
```

Open the printed local URL. The UI lets you browse decisions, create records, edit JSON, validate saves, preview memos, and review portfolio reports.

## Public And Private Rule

Keep this project public if you want to show the framework. Keep your real work private:

- `decisions/`
- `research/`
- `outputs/`
- `.env`
- `.decision-lab.json`

Before publishing anything, run:

```bash
npx @k08200/decision-lab privacy-check
```
