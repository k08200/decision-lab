import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PRIVATE_PATH_RULES = [
  /^\.env$/,
  /^\.env\.(?!example$).+/,
  /^\.decision-lab\.json$/,
  /^decisions\/(drafts|active|reviewed|snapshots|archive)\/(?!\.gitkeep$).+/,
  /^research\/(raw|evidence|imports|sources|models)\/(?!\.gitkeep$).+/,
  /^outputs\/(?!\.gitkeep$|memos\/\.gitkeep$|briefs\/\.gitkeep$|prompts\/\.gitkeep$).+/
];

const SECRET_PATTERNS = [
  { name: "OpenAI API key", pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: "Private key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: "Non-empty OPENAI_API_KEY assignment", pattern: /^OPENAI_API_KEY[ \t]*=[ \t]*(?!$|\.\.\.|your-|YOUR-|<)[^\s#]+/m },
  { name: "Generic secret assignment", pattern: /\b(?:api[_-]?key|secret|token)\b\s*[:=]\s*["']?[A-Za-z0-9_\-]{24,}/i }
];

export function scanPrivacy({ root = "." } = {}) {
  const base = path.resolve(root);
  const files = trackedFiles(base);
  const pathFindings = files
    .filter((filePath) => PRIVATE_PATH_RULES.some((rule) => rule.test(filePath)))
    .map((filePath) => ({
      severity: "high",
      filePath,
      issue: "Private workspace path is tracked"
    }));

  const contentFindings = [];
  for (const filePath of files) {
    const fullPath = path.join(base, filePath);
    if (!isTextFile(fullPath)) continue;
    const text = fs.readFileSync(fullPath, "utf8");
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(text)) {
        contentFindings.push({
          severity: "critical",
          filePath,
          issue: name
        });
      }
    }
  }

  const findings = [...pathFindings, ...contentFindings];
  return {
    ok: findings.length === 0,
    files_checked: files.length,
    findings
  };
}

export function renderPrivacyReport(result) {
  return [
    "# Privacy Check",
    "",
    `Status: ${result.ok ? "PASS" : "FAIL"}`,
    `Files checked: ${result.files_checked}`,
    `Findings: ${result.findings.length}`,
    "",
    result.findings.length
      ? table(["Severity", "File", "Issue"], result.findings.map((finding) => [
        finding.severity,
        finding.filePath,
        finding.issue
      ]))
      : "No tracked private workspace files or obvious secrets found.",
    "",
    "## Rule",
    "",
    "Keep framework code public and keep real decisions, raw research, generated outputs, local config, and API keys private."
  ].join("\n") + "\n";
}

export function createPrivateWorkspace(directory, {
  owner = "decision owner",
  overwrite = false
} = {}) {
  if (!directory) throw new Error("Private workspace directory is required");
  const root = path.resolve(directory);
  const files = privateWorkspaceFiles(owner);

  for (const folder of privateWorkspaceFolders()) {
    fs.mkdirSync(path.join(root, folder), { recursive: true });
  }
  for (const folder of privateWorkspaceKeepFolders()) {
    const keepPath = path.join(root, folder, ".gitkeep");
    if (!fs.existsSync(keepPath)) fs.writeFileSync(keepPath, "");
  }
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(root, relativePath);
    if (!overwrite && fs.existsSync(fullPath)) continue;
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    if (relativePath.startsWith("scripts/")) fs.chmodSync(fullPath, 0o755);
  }

  return {
    root,
    files: Object.keys(files),
    folders: privateWorkspaceFolders()
  };
}

function trackedFiles(root) {
  try {
    return execFileSync("git", ["-C", root, "ls-files"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return walk(root)
      .map((filePath) => path.relative(root, filePath).replaceAll(path.sep, "/"))
      .filter((filePath) => !filePath.startsWith(".git/") && !filePath.startsWith("node_modules/"));
  }
}

function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function isTextFile(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > 1_000_000) return false;
  const extension = path.extname(filePath).toLowerCase();
  return [
    "",
    ".js",
    ".json",
    ".md",
    ".txt",
    ".yml",
    ".yaml",
    ".gitignore",
    ".example"
  ].includes(extension) || path.basename(filePath).startsWith(".");
}

function privateWorkspaceFolders() {
  return [
    "decisions/drafts",
    "decisions/active",
    "decisions/reviewed",
    "decisions/snapshots",
    "decisions/archive",
    "research/raw",
    "research/evidence",
    "research/imports",
    "research/sources",
    "research/models",
    "outputs/memos",
    "outputs/briefs",
    "outputs/prompts",
    "outputs/packs",
    "outputs/weekly",
    "outputs/reviews",
    "scripts"
  ];
}

function privateWorkspaceKeepFolders() {
  return privateWorkspaceFolders().filter((folder) => !["scripts"].includes(folder));
}

function privateWorkspaceFiles(owner) {
  return {
    ".gitignore": [
      ".env",
      ".env.*",
      "!.env.example",
      "outputs/",
      "node_modules/",
      ".DS_Store",
      ""
    ].join("\n"),
    ".env.example": [
      "OPENAI_API_KEY=",
      "OPENAI_MODEL=gpt-5.2",
      "OPENAI_BASE_URL=https://api.openai.com/v1",
      ""
    ].join("\n"),
    ".decision-lab.json": `${JSON.stringify({
      schema_version: "0.1.0",
      default_owner: owner,
      directories: {
        drafts: "decisions/drafts",
        active: "decisions/active",
        reviewed: "decisions/reviewed",
        snapshots: "decisions/snapshots",
        outputs: "outputs",
        sources: "research/sources"
      },
      quality_gate: {
        min_score: 0.8,
        require_operational: true
      },
      stale_after_days: 21
    }, null, 2)}\n`,
    "README.md": [
      "# Private Decision Lab Workspace",
      "",
      "This workspace is for real investment, finance, and management decisions.",
      "",
      "Do not make this repository public.",
      "",
      "## Start",
      "",
      "```bash",
      "node ../decision-lab/bin/decision-lab.js ask \"Should I buy AAPL now?\" --type investment --out decisions/drafts/aapl.json",
      "node ../decision-lab/bin/decision-lab.js run decisions/drafts/aapl.json --out-dir outputs/runs/aapl",
      "node ../decision-lab/bin/decision-lab.js weekly decisions --as-of 2026-04-30 --out-dir outputs/weekly/2026-04-30",
      "node ../decision-lab/bin/decision-lab.js serve decisions",
      "```",
      "",
      "## Privacy",
      "",
      "- Keep `.env` local.",
      "- Keep generated `outputs/` local.",
      "- Sanitize examples before copying anything back to the public framework repository.",
      ""
    ].join("\n"),
    "inbox.md": [
      "# Decision Inbox",
      "",
      "- Should I add to this position now or wait?",
      "- Should we change pricing this quarter?",
      "- Should we hire despite runway pressure?",
      ""
    ].join("\n"),
    "scripts/weekly.sh": [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "AS_OF=${1:-$(date +%F)}",
      "node ../decision-lab/bin/decision-lab.js weekly decisions --as-of \"$AS_OF\" --out-dir \"outputs/weekly/$AS_OF\"",
      "node ../decision-lab/bin/decision-lab.js ics decisions --as-of \"$AS_OF\" --out \"outputs/calendar.ics\"",
      ""
    ].join("\n")
  };
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
