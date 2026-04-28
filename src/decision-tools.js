import fs from "node:fs";
import {
  auditDecision,
  formatIssues,
  validateDecision
} from "./decision-core.js";

export function attachEvidence(decision, evidence, options = {}) {
  const next = structuredClone(decision);
  next.evidence = Array.isArray(next.evidence) ? next.evidence : [];
  next.evidence.push(normalizeEvidence(evidence));
  next.updated_at = options.now || new Date().toISOString().slice(0, 10);

  if (options.hypothesisId) {
    const hypothesis = (next.hypotheses || []).find((item) => item.id === options.hypothesisId);
    if (hypothesis) {
      hypothesis.evidence = Array.isArray(hypothesis.evidence) ? hypothesis.evidence : [];
      hypothesis.evidence.push(evidence.claim);
    }
  }

  return next;
}

export function applyJsonPatch(document, operations) {
  if (!Array.isArray(operations)) {
    throw new Error("Patch file must contain a JSON array of operations");
  }

  const next = structuredClone(document);
  for (const operation of operations) {
    applyOperation(next, operation);
  }
  return next;
}

export function setJsonPath(document, dottedPath, value) {
  if (!dottedPath) throw new Error("Path is required");
  const next = structuredClone(document);
  setAtPath(next, dottedPath.split("."), value);
  return next;
}

export function parseJsonish(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function renderCalibration(records) {
  const reviewed = records
    .map(({ filePath, decision }) => ({ filePath, decision, confidence: decision.recommendation?.confidence }))
    .filter((item) => item.decision.status === "reviewed");

  const byType = groupBy(reviewed, (item) => item.decision.decision_type || "unknown");
  const byConfidence = groupBy(reviewed, (item) => confidenceBucket(item.confidence));

  return [
    "# Calibration Report",
    "",
    `Reviewed decisions: ${reviewed.length}`,
    "",
    "## By Type",
    table(["Type", "Count", "Average Confidence"], Object.entries(byType).map(([type, items]) => [
      type,
      String(items.length),
      percent(avg(items.map((item) => item.confidence).filter(isNumber)))
    ])),
    "",
    "## By Confidence",
    table(["Bucket", "Count", "Files"], Object.entries(byConfidence).map(([bucket, items]) => [
      bucket,
      String(items.length),
      items.map((item) => item.filePath).join(", ")
    ])),
    "",
    "## Reviewed Records",
    reviewed.length
      ? table(["File", "Type", "Decision", "Confidence", "Outcome"], reviewed.map((item) => [
        item.filePath,
        item.decision.decision_type,
        item.decision.recommendation?.decision || "",
        percent(item.confidence),
        item.decision.post_decision_review?.actual_outcome || ""
      ]))
      : "No reviewed decisions yet."
  ].join("\n") + "\n";
}

export function renderDoctor({ root = ".", examples = [] } = {}) {
  const checks = [
    fileCheck("package.json", fs.existsSync(`${root}/package.json`)),
    fileCheck("bin/decision-lab.js", fs.existsSync(`${root}/bin/decision-lab.js`)),
    fileCheck("src/decision-core.js", fs.existsSync(`${root}/src/decision-core.js`)),
    fileCheck("src/decision-agent.js", fs.existsSync(`${root}/src/decision-agent.js`)),
    fileCheck("src/decision-tools.js", fs.existsSync(`${root}/src/decision-tools.js`)),
    fileCheck("schemas/general_decision.schema.json", fs.existsSync(`${root}/schemas/general_decision.schema.json`)),
    fileCheck(".github/workflows/ci.yml", fs.existsSync(`${root}/.github/workflows/ci.yml`))
  ];

  const exampleChecks = examples.map(({ filePath, decision }) => {
    const validation = validateDecision(decision);
    return {
      name: filePath,
      passed: validation.valid,
      detail: validation.valid ? "valid" : formatIssues(validation.issues)
    };
  });

  return [
    "# Decision Lab Doctor",
    "",
    "## Repository Checks",
    checklist(checks),
    "",
    "## Example Decision Checks",
    checklist(exampleChecks),
    "",
    "## Summary",
    allPassed([...checks, ...exampleChecks])
      ? "All doctor checks passed."
      : "Some checks failed. Fix the failed items before publishing a new version."
  ].join("\n") + "\n";
}

export function summarizeDecisionHealth(decision) {
  const audit = auditDecision(decision);
  return {
    valid: audit.validation.valid,
    maturity: audit.maturity,
    score: audit.score,
    strongest_option: audit.strongest_option,
    warnings: audit.warnings,
    next_actions: audit.next_actions
  };
}

function normalizeEvidence(evidence) {
  const normalized = {
    claim: requireText(evidence.claim, "claim"),
    source: requireText(evidence.source, "source"),
    strength: evidence.strength || "medium",
    source_type: evidence.source_type || evidence.sourceType || "",
    recency: evidence.recency || "",
    notes: evidence.notes || ""
  };

  if (!["weak", "medium", "strong"].includes(normalized.strength)) {
    throw new Error("Evidence strength must be weak, medium, or strong");
  }

  return normalized;
}

function applyOperation(document, operation) {
  if (!operation || typeof operation !== "object") throw new Error("Patch operation must be an object");
  if (!["add", "replace", "remove"].includes(operation.op)) {
    throw new Error(`Unsupported patch operation: ${operation.op}`);
  }
  const tokens = parsePointer(operation.path);
  if (operation.op === "remove") {
    removeAtPath(document, tokens);
    return;
  }
  setAtPath(document, tokens, operation.value, { append: operation.op === "add" });
}

function parsePointer(pointer) {
  if (typeof pointer !== "string" || !pointer.startsWith("/")) {
    throw new Error("Patch path must be a JSON pointer starting with /");
  }
  return pointer
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function setAtPath(target, tokens, value, options = {}) {
  if (!tokens.length) throw new Error("Cannot replace the document root");
  const parent = resolveParent(target, tokens);
  const key = tokens.at(-1);

  if (Array.isArray(parent)) {
    if (key === "-") {
      parent.push(value);
      return;
    }
    const index = Number(key);
    if (!Number.isInteger(index)) throw new Error(`Invalid array index: ${key}`);
    if (options.append && index === parent.length) {
      parent.push(value);
      return;
    }
    parent[index] = value;
    return;
  }

  parent[key] = value;
}

function removeAtPath(target, tokens) {
  if (!tokens.length) throw new Error("Cannot remove the document root");
  const parent = resolveParent(target, tokens);
  const key = tokens.at(-1);
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (!Number.isInteger(index)) throw new Error(`Invalid array index: ${key}`);
    parent.splice(index, 1);
    return;
  }
  delete parent[key];
}

function resolveParent(target, tokens) {
  return tokens.slice(0, -1).reduce((current, token) => {
    if (current === undefined || current === null) {
      throw new Error(`Cannot resolve path segment: ${token}`);
    }
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index)) throw new Error(`Invalid array index: ${token}`);
      return current[index];
    }
    return current[token];
  }, target);
}

function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Evidence ${field} is required`);
  return value;
}

function groupBy(items, keyFn) {
  return items.reduce((groups, item) => {
    const key = keyFn(item);
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
}

function confidenceBucket(confidence) {
  if (!isNumber(confidence)) return "unknown";
  if (confidence < 0.4) return "0-39%";
  if (confidence < 0.6) return "40-59%";
  if (confidence < 0.8) return "60-79%";
  return "80-100%";
}

function avg(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function percent(value) {
  return isNumber(value) ? `${Math.round(value * 100)}%` : "N/A";
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`)
  ].join("\n");
}

function checklist(checks) {
  if (!checks.length) return "- None";
  return checks.map((check) => `- ${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`).join("\n");
}

function fileCheck(name, passed) {
  return { name, passed, detail: passed ? "found" : "missing" };
}

function allPassed(checks) {
  return checks.every((check) => check.passed);
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}
