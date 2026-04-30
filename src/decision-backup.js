import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadDecisionFile, validateDecision } from "./decision-core.js";

const BACKUP_SCHEMA_VERSION = "0.1.0";

export function createBackupBundle(root = "decisions", {
  createdAt = new Date().toISOString(),
  includeResearch = false
} = {}) {
  const roots = [root, includeResearch ? "research" : null].filter(Boolean);
  const files = roots.flatMap((item) => {
    const basePath = path.dirname(path.resolve(item));
    return collectFiles(item).map((filePath) => ({ filePath, basePath }));
  })
    .filter((filePath) => shouldBackupFile(filePath))
    .map(({ filePath, basePath }) => backupEntry(filePath, basePath));
  const decisionEntries = files.filter((entry) => entry.kind === "decision");
  const invalidDecisions = decisionEntries.filter((entry) => !entry.validation?.valid);

  return {
    schema_version: BACKUP_SCHEMA_VERSION,
    created_at: createdAt,
    root,
    include_research: includeResearch,
    summary: {
      files: files.length,
      decisions: decisionEntries.length,
      invalid_decisions: invalidDecisions.length,
      bytes: files.reduce((total, entry) => total + entry.bytes, 0)
    },
    files
  };
}

export function verifyBackupBundle(bundle) {
  const issues = [];
  if (!bundle || typeof bundle !== "object") issues.push("Backup bundle must be a JSON object.");
  if (bundle?.schema_version !== BACKUP_SCHEMA_VERSION) issues.push(`Unsupported backup schema: ${bundle?.schema_version || "missing"}.`);
  if (!Array.isArray(bundle?.files)) issues.push("Backup bundle must contain a files array.");

  const seen = new Set();
  for (const entry of bundle?.files || []) {
    if (!entry.path || typeof entry.path !== "string") {
      issues.push("Every backup entry needs a path.");
      continue;
    }
    if (!isSafeRelativePath(entry.path)) issues.push(`Unsafe backup path: ${entry.path}`);
    if (seen.has(entry.path)) issues.push(`Duplicate backup path: ${entry.path}`);
    seen.add(entry.path);
    if (typeof entry.content !== "string") issues.push(`Missing content for ${entry.path}`);
    if (!entry.sha256) issues.push(`Missing SHA256 for ${entry.path}`);
    if (entry.sha256 && hash(entry.content || "") !== entry.sha256) issues.push(`SHA256 mismatch for ${entry.path}`);
    if (entry.kind === "decision" && entry.validation && !entry.validation.valid) {
      issues.push(`Invalid decision in backup: ${entry.path}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    summary: bundle?.summary || {
      files: Array.isArray(bundle?.files) ? bundle.files.length : 0
    }
  };
}

export function restoreBackupBundle(bundle, destination, { overwrite = false } = {}) {
  const verification = verifyBackupBundle(bundle);
  if (!verification.valid) {
    throw new Error(`Backup verification failed: ${verification.issues.join("; ")}`);
  }
  if (!destination) throw new Error("Restore destination is required");

  const destinationRoot = path.resolve(destination);
  const restored = [];
  for (const entry of bundle.files) {
    const target = path.resolve(destinationRoot, entry.path);
    if (target !== destinationRoot && !target.startsWith(`${destinationRoot}${path.sep}`)) {
      throw new Error(`Unsafe restore path: ${entry.path}`);
    }
    if (fs.existsSync(target) && !overwrite) {
      throw new Error(`Restore target already exists: ${entry.path}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.content);
    restored.push(entry.path);
  }

  return {
    restored: restored.length,
    destination: destinationRoot,
    files: restored
  };
}

export function renderBackupReport(bundle, verification = verifyBackupBundle(bundle)) {
  return [
    "# Backup Report",
    "",
    `Status: ${verification.valid ? "PASS" : "FAIL"}`,
    `Created at: ${bundle?.created_at || ""}`,
    `Root: ${bundle?.root || ""}`,
    `Files: ${bundle?.summary?.files ?? 0}`,
    `Decisions: ${bundle?.summary?.decisions ?? 0}`,
    `Invalid decisions: ${bundle?.summary?.invalid_decisions ?? 0}`,
    `Bytes: ${bundle?.summary?.bytes ?? 0}`,
    "",
    "## Issues",
    verification.issues.length ? verification.issues.map((issue) => `- ${issue}`).join("\n") : "No issues found.",
    "",
    "## Files",
    (bundle?.files || []).length
      ? table(["Path", "Kind", "Bytes", "SHA256"], bundle.files.map((entry) => [
        entry.path,
        entry.kind,
        String(entry.bytes),
        entry.sha256
      ]))
      : "No files found."
  ].join("\n") + "\n";
}

function backupEntry(filePath, basePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const entry = {
    path: normalizePath(path.relative(basePath, path.resolve(filePath))),
    kind: filePath.endsWith(".json") && isDecisionFile(filePath) ? "decision" : "artifact",
    bytes: Buffer.byteLength(content),
    sha256: hash(content),
    content
  };
  if (entry.kind === "decision") {
    entry.validation = validateDecision(JSON.parse(content));
  }
  return entry;
}

function collectFiles(root) {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    return [fullPath];
  });
}

function shouldBackupFile(filePath) {
  if (typeof filePath === "object") filePath = filePath.filePath;
  if (path.basename(filePath) === ".gitkeep") return false;
  return [".json", ".md", ".txt", ".csv", ".tsv", ".html"].includes(path.extname(filePath).toLowerCase());
}

function isDecisionFile(filePath) {
  try {
    return Boolean(loadDecisionFile(filePath)?.decision_type);
  } catch {
    return false;
  }
}

function isSafeRelativePath(filePath) {
  return normalizePath(filePath) === filePath && !filePath.startsWith("../") && filePath !== "..";
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function hash(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
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
