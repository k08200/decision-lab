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
    fileCheck("src/decision-export.js", fs.existsSync(`${root}/src/decision-export.js`)),
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

export function createSourceNote({ title, kind = "note", sourcePath = "", content = "", tags = "", notes = "", date = null }) {
  const recordedAt = date || new Date().toISOString().slice(0, 10);
  return [
    "---",
    `title: ${yamlScalar(title || sourcePath || "Untitled source")}`,
    `kind: ${yamlScalar(kind)}`,
    `source_path: ${yamlScalar(sourcePath)}`,
    `recorded_at: ${yamlScalar(recordedAt)}`,
    `tags: ${yamlScalar(tags)}`,
    "---",
    "",
    "# Source Notes",
    "",
    notes || "No notes recorded.",
    "",
    "# Source Content",
    "",
    content || "No source content recorded."
  ].join("\n") + "\n";
}

export function attachSourceEvidence(decision, sourcePath, evidence, options = {}) {
  return attachEvidence(decision, {
    ...evidence,
    source: sourcePath,
    source_type: evidence.source_type || "source note",
    notes: evidence.notes || `Linked source file: ${sourcePath}`
  }, options);
}

export function promoteDecision(decision, status, options = {}) {
  if (!["draft", "researching", "decided", "reviewed"].includes(status)) {
    throw new Error("Status must be draft, researching, decided, or reviewed");
  }
  const next = structuredClone(decision);
  next.status = status;
  next.updated_at = options.now || new Date().toISOString().slice(0, 10);
  return next;
}

export function renderDueReviews(records, asOf = new Date().toISOString().slice(0, 10)) {
  const asOfDate = parseDate(asOf);
  const due = records
    .map(({ filePath, decision }) => ({
      filePath,
      decision,
      reviewDate: decision.recommendation?.review_date || decision.post_decision_review?.review_date || ""
    }))
    .filter((item) => item.reviewDate && parseDate(item.reviewDate) <= asOfDate)
    .sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));

  return [
    "# Due Reviews",
    "",
    `As of: ${asOf}`,
    "",
    due.length
      ? table(["File", "Type", "Title", "Decision", "Review Date"], due.map((item) => [
        item.filePath,
        item.decision.decision_type,
        item.decision.title,
        item.decision.recommendation?.decision || "",
        item.reviewDate
      ]))
      : "No reviews are due."
  ].join("\n") + "\n";
}

export function renderSearchResults(records, query) {
  if (!query || !query.trim()) throw new Error("Search query is required");
  const needle = query.toLowerCase();
  const matches = records
    .map(({ filePath, decision }) => ({ filePath, decision, haystack: searchableText(decision) }))
    .filter((item) => item.haystack.includes(needle))
    .map((item) => ({
      filePath: item.filePath,
      decision: item.decision,
      score: countOccurrences(item.haystack, needle)
    }))
    .sort((a, b) => b.score - a.score);

  return [
    "# Search Results",
    "",
    `Query: ${query}`,
    "",
    matches.length
      ? table(["File", "Type", "Title", "Status", "Matches"], matches.map((item) => [
        item.filePath,
        item.decision.decision_type,
        item.decision.title,
        item.decision.status || "draft",
        String(item.score)
      ]))
      : "No matching decisions found."
  ].join("\n") + "\n";
}

export function renderReviewWorksheet(decision) {
  const review = decision.post_decision_review || {};
  return [
    `# Review Worksheet: ${decision.title}`,
    "",
    "## Original Decision",
    table(["Field", "Value"], [
      ["Question", decision.question || ""],
      ["Decision", decision.recommendation?.decision || ""],
      ["Confidence", percent(decision.recommendation?.confidence)],
      ["Review Date", decision.recommendation?.review_date || ""]
    ]),
    "",
    "## Success Metrics",
    list(review.success_metrics || []),
    "",
    "## Expected Signals",
    list(review.expected_signals || []),
    "",
    "## Failure Signals",
    list(review.failure_signals || []),
    "",
    "## Review Questions",
    list(review.review_questions || []),
    "",
    "## Actual Outcome",
    "",
    "- ",
    "",
    "## Lessons",
    "",
    "- ",
    "",
    "## Calibration Notes",
    "",
    "- Was the confidence level appropriate?",
    "- Which assumption had the most leverage?",
    "- What should change in the next similar decision?"
  ].join("\n") + "\n";
}

export function renderRiskRegister(records) {
  const risks = records.flatMap(({ filePath, decision }) => (
    (decision.risks || []).map((risk) => ({
      filePath,
      type: decision.decision_type,
      title: decision.title,
      risk: risk.risk || "",
      probability: risk.probability || "",
      impact: risk.impact || "",
      trigger: risk.trigger || "",
      mitigation: risk.mitigation || ""
    }))
  ));

  const highImpact = risks.filter((risk) => risk.impact === "high").length;
  return [
    "# Risk Register",
    "",
    `Risks: ${risks.length}`,
    `High-impact risks: ${highImpact}`,
    "",
    risks.length
      ? table(["File", "Type", "Decision", "Risk", "Probability", "Impact", "Trigger", "Mitigation"], risks.map((risk) => [
        risk.filePath,
        risk.type,
        risk.title,
        risk.risk,
        risk.probability,
        risk.impact,
        risk.trigger,
        risk.mitigation
      ]))
      : "No risks found."
  ].join("\n") + "\n";
}

export function renderAssumptionReport(records) {
  const assumptions = records.flatMap(({ filePath, decision }) => (
    (decision.assumption_register || []).map((assumption) => ({
      filePath,
      type: decision.decision_type,
      title: decision.title,
      assumption: assumption.assumption || "",
      importance: assumption.importance || "",
      test: assumption.test || "",
      owner: assumption.owner || ""
    }))
  ));

  const highImportance = assumptions.filter((assumption) => assumption.importance === "high").length;
  return [
    "# Assumption Register",
    "",
    `Assumptions: ${assumptions.length}`,
    `High-importance assumptions: ${highImportance}`,
    "",
    assumptions.length
      ? table(["File", "Type", "Decision", "Assumption", "Importance", "Test", "Owner"], assumptions.map((assumption) => [
        assumption.filePath,
        assumption.type,
        assumption.title,
        assumption.assumption,
        assumption.importance,
        assumption.test,
        assumption.owner
      ]))
      : "No assumptions found."
  ].join("\n") + "\n";
}

export function renderSourceIndex(records) {
  const sources = records.flatMap(({ filePath, decision }) => (
    (decision.evidence || []).map((evidence) => ({
      filePath,
      type: decision.decision_type,
      title: decision.title,
      claim: evidence.claim || "",
      source: evidence.source || "",
      strength: evidence.strength || "",
      source_type: evidence.source_type || "",
      recency: evidence.recency || ""
    }))
  ));

  return [
    "# Source Index",
    "",
    `Evidence items: ${sources.length}`,
    "",
    sources.length
      ? table(["File", "Type", "Decision", "Claim", "Source", "Strength", "Source Type", "Recency"], sources.map((source) => [
        source.filePath,
        source.type,
        source.title,
        source.claim,
        source.source,
        source.strength,
        source.source_type,
        source.recency
      ]))
      : "No evidence sources found."
  ].join("\n") + "\n";
}

export function renderMonthlyReview(records, asOf = new Date().toISOString().slice(0, 10)) {
  const active = records.filter(({ decision }) => ["draft", "researching", "decided"].includes(decision.status || "draft"));
  const reviewed = records.filter(({ decision }) => decision.status === "reviewed");
  const audits = records.map(({ filePath, decision }) => ({ filePath, decision, audit: auditDecision(decision) }));
  const weak = audits
    .filter((item) => item.audit.maturity !== "operational")
    .sort((a, b) => a.audit.score.score - b.audit.score.score);

  return [
    "# Monthly Decision Review",
    "",
    `As of: ${asOf}`,
    "",
    "## Snapshot",
    table(["Metric", "Value"], [
      ["Total decisions", String(records.length)],
      ["Active decisions", String(active.length)],
      ["Reviewed decisions", String(reviewed.length)],
      ["Needs attention", String(weak.length)]
    ]),
    "",
    "## Due Reviews",
    renderDueReviews(records, asOf).replace(/^# Due Reviews\n\n/, ""),
    "",
    "## Decisions Needing Attention",
    weak.length
      ? table(["File", "Type", "Title", "Maturity", "Score", "Next Actions"], weak.map((item) => [
        item.filePath,
        item.decision.decision_type,
        item.decision.title,
        item.audit.maturity,
        `${item.audit.score.score}/${item.audit.score.max_score}`,
        item.audit.next_actions.join("; ")
      ]))
      : "No weak records found.",
    "",
    "## Top Risk Themes",
    summarizeThemes(records.flatMap(({ decision }) => (decision.risks || []).map((risk) => risk.risk || ""))),
    "",
    "## Top Assumption Themes",
    summarizeThemes(records.flatMap(({ decision }) => (decision.assumption_register || []).map((assumption) => assumption.assumption || "")))
  ].join("\n") + "\n";
}

export function evaluateGate(records, options = {}) {
  const minScore = typeof options.minScore === "number" ? options.minScore : 0.75;
  const requireOperational = Boolean(options.requireOperational);
  const results = records.map(({ filePath, decision }) => {
    const audit = auditDecision(decision);
    const scorePassed = audit.score.ratio >= minScore;
    const maturityPassed = !requireOperational || audit.maturity === "operational";
    const validationPassed = audit.validation.valid;
    return {
      filePath,
      decision,
      audit,
      passed: validationPassed && scorePassed && maturityPassed,
      reasons: [
        validationPassed ? "" : "invalid record",
        scorePassed ? "" : `score below ${Math.round(minScore * 100)}%`,
        maturityPassed ? "" : "not operational"
      ].filter(Boolean)
    };
  });
  return {
    passed: results.every((result) => result.passed),
    minScore,
    requireOperational,
    results
  };
}

export function renderGateReport(records, options = {}) {
  const gate = evaluateGate(records, options);
  return [
    "# Decision Quality Gate",
    "",
    `Minimum score: ${Math.round(gate.minScore * 100)}%`,
    `Require operational: ${gate.requireOperational ? "yes" : "no"}`,
    `Result: ${gate.passed ? "PASS" : "FAIL"}`,
    "",
    gate.results.length
      ? table(["File", "Type", "Title", "Maturity", "Score", "Result", "Reasons"], gate.results.map((item) => [
        item.filePath,
        item.decision.decision_type,
        item.decision.title,
        item.audit.maturity,
        `${item.audit.score.score}/${item.audit.score.max_score}`,
        item.passed ? "PASS" : "FAIL",
        item.reasons.join("; ")
      ]))
      : "No decision records found."
  ].join("\n") + "\n";
}

export function renderStaleReport(records, { asOf = new Date().toISOString().slice(0, 10), days = 30 } = {}) {
  const asOfDate = parseDate(asOf);
  const stale = records
    .map(({ filePath, decision }) => {
      const date = decision.updated_at || decision.created_at || "";
      const age = date ? Math.floor((asOfDate - parseDate(date)) / 86_400_000) : null;
      return { filePath, decision, date, age };
    })
    .filter((item) => item.age === null || item.age >= days)
    .sort((a, b) => (b.age ?? Infinity) - (a.age ?? Infinity));

  return [
    "# Stale Decisions",
    "",
    `As of: ${asOf}`,
    `Stale after days: ${days}`,
    "",
    stale.length
      ? table(["File", "Type", "Title", "Status", "Updated", "Age Days"], stale.map((item) => [
        item.filePath,
        item.decision.decision_type,
        item.decision.title,
        item.decision.status || "draft",
        item.date || "unknown",
        item.age === null ? "unknown" : String(item.age)
      ]))
      : "No stale decisions found."
  ].join("\n") + "\n";
}

export function renderDecisionGraph(decision) {
  const lines = [
    `# Decision Graph: ${decision.title || "Untitled decision"}`,
    "",
    "```mermaid",
    "flowchart LR",
    `  D["${mermaidLabel("Decision", decision.title || decision.question || "Untitled")}"]`,
    `  Q["${mermaidLabel("Question", decision.question || "")}"]`,
    `  R["${mermaidLabel("Recommendation", decision.recommendation?.decision || "undecided")}"]`,
    "  D --> Q",
    "  Q --> R"
  ];

  appendNodeGroup(lines, "H", "Hypotheses", decision.hypotheses || [], (item, index) => (
    mermaidLabel(item.id || `H${index + 1}`, item.thesis || item.hypothesis || "")
  ), "D");
  appendNodeGroup(lines, "O", "Options", decision.options || [], (item, index) => (
    mermaidLabel(item.id || `O${index + 1}`, item.name || item.description || "")
  ), "Q");
  appendNodeGroup(lines, "E", "Evidence", decision.evidence || [], (item, index) => (
    mermaidLabel(item.strength || `E${index + 1}`, item.claim || "")
  ), "D");
  appendNodeGroup(lines, "A", "Assumptions", decision.assumption_register || [], (item, index) => (
    mermaidLabel(item.importance || `A${index + 1}`, item.assumption || "")
  ), "R");
  appendNodeGroup(lines, "K", "Risks", decision.risks || [], (item, index) => (
    mermaidLabel(item.impact || `K${index + 1}`, item.risk || "")
  ), "R");

  lines.push("```", "");
  return lines.join("\n");
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

function appendNodeGroup(lines, prefix, title, items, labelFn, parentId) {
  const visible = items.slice(0, 8);
  if (!visible.length) return;
  lines.push(`  subgraph ${prefix}G["${title}"]`);
  visible.forEach((item, index) => {
    lines.push(`    ${prefix}${index}["${labelFn(item, index)}"]`);
  });
  if (items.length > visible.length) {
    lines.push(`    ${prefix}More["${items.length - visible.length} more"]`);
  }
  lines.push("  end");
  visible.forEach((_, index) => {
    lines.push(`  ${parentId} --> ${prefix}${index}`);
  });
  if (items.length > visible.length) lines.push(`  ${parentId} --> ${prefix}More`);
}

function mermaidLabel(heading, detail) {
  const head = String(heading || "").trim();
  const body = String(detail || "").trim();
  const label = body ? `${head}: ${body}` : head;
  return label
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "'")
    .replaceAll("[", "(")
    .replaceAll("]", ")")
    .replaceAll("\n", "<br/>")
    .slice(0, 140);
}

function yamlScalar(value) {
  return JSON.stringify(String(value ?? ""));
}

function parseDate(value) {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(timestamp)) throw new Error(`Invalid date: ${value}`);
  return timestamp;
}

function searchableText(decision) {
  return JSON.stringify(decision).toLowerCase();
}

function countOccurrences(text, needle) {
  let count = 0;
  let index = text.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}

function list(items) {
  if (!items.length) return "- None";
  return items.map((item) => `- ${item}`).join("\n");
}

function summarizeThemes(items) {
  const words = items
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
  const counts = words.reduce((acc, word) => {
    acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {});
  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (!rows.length) return "- None";
  return rows.map(([word, count]) => `- ${word}: ${count}`).join("\n");
}

const STOP_WORDS = new Set([
  "with",
  "that",
  "this",
  "from",
  "into",
  "without",
  "risk",
  "decision",
  "assumption",
  "evidence",
  "because",
  "before",
  "after",
  "while",
  "could",
  "would",
  "should"
]);

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
