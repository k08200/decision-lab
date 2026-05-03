# Runbook

This runbook is for operating Decision Lab as a local-first product and public framework repository.

## Local Health Check

Run this before publishing, releasing, or using the repo as a baseline for private work:

```bash
npm run verify
npm run security:audit
node bin/decision-lab.js readiness --out outputs/readiness.md
```

Expected result:

- tests pass
- doctor checks pass
- privacy check passes in the public framework repo
- package dry-run succeeds
- security audit reports no moderate-or-higher vulnerabilities

## Private Workspace Check

Real decision data should live outside the public framework repo:

```bash
node bin/decision-lab.js private-workspace ../my-private-decisions --owner "Your Name"
cd ../my-private-decisions
node ../decision-lab/bin/decision-lab.js decide "Should we change pricing?" --type business --slug pricing
```

Do not push the private workspace to a public remote.

## Backup Procedure

Create and verify a backup:

```bash
node bin/decision-lab.js backup decisions --out outputs/decision-lab-backup.json --report outputs/backup.md
node bin/decision-lab.js verify-backup outputs/decision-lab-backup.json --report outputs/backup-verify.md
```

Store the verified backup somewhere private. The backup contains decision contents.

## Restore Procedure

Restore into a new folder first:

```bash
node bin/decision-lab.js restore outputs/decision-lab-backup.json --out-dir restored-decisions
```

Then inspect the restored files before replacing any active workspace.

## Privacy Incident

If private records are accidentally committed or pushed:

1. Stop pushing.
2. Rotate any exposed API keys or tokens.
3. Move real `decisions/`, `research/`, `outputs/`, `.env`, and `.decision-lab.json` out of the public repo.
4. Run:

```bash
node bin/decision-lab.js privacy-check --out outputs/privacy.md
```

5. If sensitive data reached a public remote, rewrite repository history with an appropriate secret-removal process and treat the data as exposed.

## Release Procedure

1. Update `package.json`, `package-lock.json`, and `CHANGELOG.md`.
2. Run:

```bash
npm run release:check
```

3. Commit and push to `main`.
4. Confirm GitHub Actions passes.
5. Create a GitHub release with the matching tag.
6. If this is an npm release, publish with:

```bash
npm publish --access public --cache .npm-cache
```

7. Verify the public package:

```bash
npm view @k08200/decision-lab version
npx @k08200/decision-lab demo decision-lab-demo
```

## Local UI Procedure

Start the local product UI:

```bash
node bin/decision-lab.js serve decisions --as-of 2026-08-01 --token local-dev-token --actor "Your Name"
```

Use a token for API routes whenever the server is reachable outside a trusted local session.

## Triage Procedure

Use these reports to decide what needs attention:

```bash
node bin/decision-lab.js today decisions --out-dir outputs/today/$(date +%F)
node bin/decision-lab.js triage decisions --as-of $(date +%F) --out outputs/triage.md
node bin/decision-lab.js debt decisions --as-of $(date +%F) --out outputs/debt.md
node bin/decision-lab.js gate decisions --min-score 0.85 --operational --out outputs/gate.md
```

Treat failing gates and stale high-impact records as operating issues, not document cleanup.
