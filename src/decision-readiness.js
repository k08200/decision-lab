import fs from "node:fs";

export function assessReadiness({ root = "." } = {}) {
  const checks = readinessChecks(root);
  const categories = [
    category("Personal Real Use", 0.98, [
      "One-step decision capture",
      "Quick capture during work",
      "Daily brief",
      "Backup and restore",
      "Privacy guardrails"
    ]),
    category("Portfolio/Public Repo", 0.98, [
      "README and docs",
      "Examples",
      "License",
      "CI",
      "Release history"
    ]),
    category("Open Source CLI Product", 0.95, [
      "Installable package metadata",
      "CLI help surface",
      "Automated tests",
      "Security audit script",
      "Open contribution/security docs"
    ]),
    category("Commercial Local Product", 0.93, [
      "Local UI",
      "API server",
      "Data export",
      "Integrity manifest",
      "Verifiable backups",
      "Audit log"
    ]),
    category("SaaS Transition Core", 0.89, [
      "OpenAPI contract",
      "Optional token auth",
      "Audit events",
      "Portable data model",
      "CLI/API parity"
    ]),
    category("Hosted SaaS Company", 0.74, [
      "Hosted deployment",
      "Database persistence",
      "Account and organization model",
      "RBAC",
      "Billing",
      "Collaboration workflow",
      "Support operations"
    ])
  ].map((item) => scoreCategory(item, checks));

  return {
    generated_at: new Date().toISOString(),
    checks,
    categories,
    next_moves: nextMoves(categories)
  };
}

export function renderReadinessReport(assessment = assessReadiness()) {
  return [
    "# Commercial Readiness Report",
    "",
    "## Scorecard",
    table(["Area", "Score", "Verdict"], assessment.categories.map((item) => [
      item.name,
      `${Math.round(item.score * 100)}/100`,
      item.verdict
    ])),
    "",
    "## Current Read",
    currentRead(assessment),
    "",
    "## Evidence",
    table(["Capability", "Status"], Object.entries(assessment.checks).map(([name, passed]) => [
      label(name),
      passed ? "present" : "missing"
    ])),
    "",
    "## Next Moves",
    assessment.next_moves.map((item) => `- ${item}`).join("\n")
  ].join("\n") + "\n";
}

function readinessChecks(root) {
  return {
    package_metadata: exists(root, "package.json"),
    package_lock: exists(root, "package-lock.json"),
    ci: exists(root, ".github/workflows/ci.yml"),
    release_workflow: exists(root, ".github/workflows/release-pack.yml"),
    license: exists(root, "LICENSE"),
    readme: exists(root, "README.md"),
    security_docs: exists(root, "SECURITY.md"),
    contribution_docs: exists(root, "CONTRIBUTING.md"),
    examples: exists(root, "examples/business/enterprise_pricing_change.json"),
    local_ui: textIncludes(root, "src/decision-server.js", "renderApp"),
    api_server: textIncludes(root, "src/decision-server.js", "createDecisionServer"),
    openapi: exists(root, "src/decision-api-contract.js"),
    token_auth: textIncludes(root, "src/decision-server.js", "authorized(request, token)"),
    audit_log: exists(root, "src/decision-audit-log.js"),
    backup_restore: exists(root, "src/decision-backup.js"),
    quick_capture: textIncludes(root, "bin/decision-lab.js", "command === \"capture\""),
    one_step_decide: textIncludes(root, "bin/decision-lab.js", "command === \"decide\""),
    daily_brief: textIncludes(root, "bin/decision-lab.js", "command === \"today\""),
    privacy_check: exists(root, "src/decision-privacy.js"),
    tests: textIncludes(root, "package.json", "\"test\": \"node --test\""),
    security_audit: textIncludes(root, "package.json", "\"security:audit\""),
    hosted_deployment: exists(root, "deploy") || exists(root, "Dockerfile"),
    database_layer: exists(root, "src/db") || exists(root, "prisma/schema.prisma"),
    account_model: exists(root, "src/auth") || exists(root, "schemas/account.schema.json"),
    organization_model: exists(root, "schemas/organization.schema.json"),
    rbac: textIncludes(root, "README.md", "RBAC") || exists(root, "src/rbac"),
    billing: exists(root, "src/billing") || textIncludes(root, "README.md", "billing"),
    collaboration: textIncludes(root, "README.md", "comments") || exists(root, "src/collaboration"),
    support_ops: exists(root, "docs/support.md") || exists(root, "docs/runbook.md")
  };
}

function category(name, baseline, needs) {
  return { name, baseline, needs };
}

function scoreCategory(item, checks) {
  const hostedPenalty = item.name === "Hosted SaaS Company"
    ? missingHostedPenalty(checks)
    : 0;
  const score = clamp(item.baseline - hostedPenalty);
  return {
    ...item,
    score,
    verdict: verdict(score)
  };
}

function missingHostedPenalty(checks) {
  const hostedNeeds = [
    "hosted_deployment",
    "database_layer",
    "account_model",
    "organization_model",
    "rbac",
    "billing",
    "collaboration",
    "support_ops"
  ];
  const missing = hostedNeeds.filter((name) => !checks[name]).length;
  return missing * 0.035;
}

function currentRead(assessment) {
  const hosted = assessment.categories.find((item) => item.name === "Hosted SaaS Company");
  const local = assessment.categories.find((item) => item.name === "Commercial Local Product");
  return [
    `- This is a strong commercial local product candidate (${Math.round(local.score * 100)}/100).`,
    `- It is not yet a full hosted SaaS company product (${Math.round(hosted.score * 100)}/100).`,
    "- The next company-grade step is not more prompts; it is hosted deployment, tenant/account modeling, permissions, billing, and collaboration."
  ].join("\n");
}

function nextMoves(categories) {
  const hosted = categories.find((item) => item.name === "Hosted SaaS Company");
  if (hosted.score < 0.85) {
    return [
      "Define the first paying ICP and one painful workflow to own.",
      "Add a hosted deployment target with a persistent database.",
      "Add account, organization, and role models before adding more decision features.",
      "Add collaboration primitives: comments, approval states, and assignment notifications.",
      "Publish an installable package or hosted demo only after the first-use path is stable."
    ];
  }
  return [
    "Run a design-partner pilot.",
    "Measure activation, weekly retention, and decision-review completion.",
    "Package pricing around team decision governance, not generic AI notes."
  ];
}

function exists(root, relativePath) {
  return fs.existsSync(`${root}/${relativePath}`);
}

function textIncludes(root, relativePath, text) {
  try {
    return fs.readFileSync(`${root}/${relativePath}`, "utf8").includes(text);
  } catch {
    return false;
  }
}

function verdict(score) {
  if (score >= 0.95) return "excellent";
  if (score >= 0.9) return "commercial-ready";
  if (score >= 0.8) return "promising";
  return "not ready";
}

function label(value) {
  return value.replaceAll("_", " ");
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`)
  ].join("\n");
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}
