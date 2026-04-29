import fs from "node:fs";
import crypto from "node:crypto";
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

export function renderLessonsReport(records) {
  const reviewed = records
    .map(({ filePath, decision }) => ({ filePath, decision, review: decision.post_decision_review || {} }))
    .filter((item) => item.decision.status === "reviewed" || item.review.actual_outcome || (item.review.lessons || []).length);
  const lessons = reviewed.flatMap((item) => (item.review.lessons || []).map((lesson) => ({
    filePath: item.filePath,
    type: item.decision.decision_type,
    title: item.decision.title,
    confidence: item.decision.recommendation?.confidence,
    outcome: item.review.actual_outcome || "",
    lesson
  })));

  return [
    "# Lessons Report",
    "",
    `Reviewed records: ${reviewed.length}`,
    `Lessons: ${lessons.length}`,
    "",
    "## Outcomes",
    reviewed.length
      ? table(["File", "Type", "Decision", "Confidence", "Outcome"], reviewed.map((item) => [
        item.filePath,
        item.decision.decision_type,
        item.decision.title,
        percent(item.decision.recommendation?.confidence),
        item.review.actual_outcome || ""
      ]))
      : "No reviewed outcomes found.",
    "",
    "## Lessons",
    lessons.length
      ? table(["File", "Type", "Decision", "Lesson"], lessons.map((item) => [
        item.filePath,
        item.type,
        item.title,
        item.lesson
      ]))
      : "No lessons recorded yet.",
    "",
    "## Lesson Themes",
    summarizeThemes(lessons.map((item) => item.lesson))
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

export function renderIntegrityManifest(records) {
  return [
    "# Integrity Manifest",
    "",
    `Records: ${records.length}`,
    "",
    records.length
      ? table(["File", "Valid", "Type", "Status", "Title", "Score", "SHA256"], records.map(({ filePath, decision }) => {
        const validation = validateDecision(decision);
        const audit = auditDecision(decision);
        return [
          filePath,
          validation.valid ? "yes" : "no",
          decision.decision_type || "",
          decision.status || "draft",
          decision.title || "",
          `${audit.score.score}/${audit.score.max_score}`,
          fileHash(filePath)
        ];
      }))
      : "No decision records found."
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

function fileHash(filePath) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  } catch {
    return "unreadable";
  }
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

export function renderPortfolioBriefing(records, asOf = new Date().toISOString().slice(0, 10)) {
  const audits = records.map(({ filePath, decision }) => ({ filePath, decision, audit: auditDecision(decision) }));
  const active = audits.filter((item) => ["draft", "researching", "decided"].includes(item.decision.status || "draft"));
  const reviewed = audits.filter((item) => item.decision.status === "reviewed");
  const weak = audits.filter((item) => item.audit.score.ratio < 0.75);
  const highRisks = records.flatMap(({ filePath, decision }) => (
    (decision.risks || [])
      .filter((risk) => risk.impact === "high")
      .map((risk) => ({ filePath, decision, risk }))
  ));
  const priorities = audits
    .map((item) => ({ ...item, priority: priorityScore(item.decision, item.audit, asOf) }))
    .sort((a, b) => b.priority.score - a.priority.score)
    .slice(0, 5);

  return [
    "# Portfolio Briefing",
    "",
    `As of: ${asOf}`,
    "",
    "## Snapshot",
    table(["Metric", "Value"], [
      ["Total decisions", String(records.length)],
      ["Active decisions", String(active.length)],
      ["Reviewed decisions", String(reviewed.length)],
      ["Below quality target", String(weak.length)],
      ["High-impact risks", String(highRisks.length)]
    ]),
    "",
    "## Top Priorities",
    priorities.length
      ? table(["Priority", "File", "Status", "Title", "Reasons"], priorities.map((item) => [
        String(item.priority.score),
        item.filePath,
        item.decision.status || "draft",
        item.decision.title,
        item.priority.reasons.join("; ")
      ]))
      : "No priorities found.",
    "",
    "## High-Impact Risks",
    highRisks.length
      ? table(["File", "Decision", "Risk", "Trigger", "Mitigation"], highRisks.slice(0, 10).map((item) => [
        item.filePath,
        item.decision.title,
        item.risk.risk || "",
        item.risk.trigger || "",
        item.risk.mitigation || ""
      ]))
      : "No high-impact risks found.",
    "",
    "## Due Reviews",
    renderDueReviews(records, asOf).replace(/^# Due Reviews\n\n/, "")
  ].join("\n") + "\n";
}

export function renderActionQueue(records, asOf = new Date().toISOString().slice(0, 10)) {
  const actionRows = records.flatMap(({ filePath, decision }) => {
    const audit = auditDecision(decision);
    const explicit = (decision.next_actions || []).map((action) => ({
      filePath,
      decision,
      kind: "next action",
      action,
      owner: decision.owner || "",
      due: decision.recommendation?.decision_deadline || ""
    }));
    const quality = audit.next_actions.map((action) => ({
      filePath,
      decision,
      kind: "quality",
      action,
      owner: decision.owner || "",
      due: ""
    }));
    const reviewDate = decision.recommendation?.review_date || decision.post_decision_review?.review_date || "";
    const review = reviewDate && parseDate(reviewDate) <= parseDate(asOf)
      ? [{
          filePath,
          decision,
          kind: "review",
          action: `Review outcome for ${decision.title}`,
          owner: decision.post_decision_review?.review_owner || decision.owner || "",
          due: reviewDate
        }]
      : [];
    return [...review, ...explicit, ...quality];
  });

  return [
    "# Action Queue",
    "",
    `As of: ${asOf}`,
    `Actions: ${actionRows.length}`,
    "",
    actionRows.length
      ? table(["Kind", "File", "Status", "Type", "Decision", "Owner", "Due", "Action"], actionRows.map((item) => [
        item.kind,
        item.filePath,
        item.decision.status || "draft",
        item.decision.decision_type,
        item.decision.title,
        item.owner,
        item.due,
        item.action
      ]))
      : "No actions found."
  ].join("\n") + "\n";
}

export function renderPriorityReview(records, asOf = new Date().toISOString().slice(0, 10)) {
  const ranked = records
    .map(({ filePath, decision }) => {
      const audit = auditDecision(decision);
      const priority = priorityScore(decision, audit, asOf);
      return { filePath, decision, audit, priority };
    })
    .sort((a, b) => b.priority.score - a.priority.score || a.filePath.localeCompare(b.filePath));

  return [
    "# Decision Priority Review",
    "",
    `As of: ${asOf}`,
    "",
    ranked.length
      ? table(["Rank", "Priority", "File", "Status", "Type", "Decision", "Score", "Reasons"], ranked.map((item, index) => [
        String(index + 1),
        String(item.priority.score),
        item.filePath,
        item.decision.status || "draft",
        item.decision.decision_type,
        item.decision.title,
        `${item.audit.score.score}/${item.audit.score.max_score}`,
        item.priority.reasons.join("; ")
      ]))
      : "No decision records found."
  ].join("\n") + "\n";
}

export function renderTimeline(records) {
  const events = records.flatMap(({ filePath, decision }) => [
    timelineEvent(filePath, decision, "created", decision.created_at),
    timelineEvent(filePath, decision, "updated", decision.updated_at),
    timelineEvent(filePath, decision, "deadline", decision.recommendation?.decision_deadline),
    timelineEvent(filePath, decision, "review", decision.recommendation?.review_date || decision.post_decision_review?.review_date)
  ].filter(Boolean)).sort((a, b) => a.date.localeCompare(b.date) || a.filePath.localeCompare(b.filePath));

  return [
    "# Decision Timeline",
    "",
    `Events: ${events.length}`,
    "",
    events.length
      ? table(["Date", "Event", "File", "Status", "Type", "Decision", "Recommendation"], events.map((event) => [
        event.date,
        event.kind,
        event.filePath,
        event.decision.status || "draft",
        event.decision.decision_type,
        event.decision.title,
        event.decision.recommendation?.decision || ""
      ]))
      : "No timeline events found."
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

export function renderDecisionDiff(before, after) {
  const rows = [
    fieldChange("Schema", before.schema_version, after.schema_version),
    fieldChange("Type", before.decision_type, after.decision_type),
    fieldChange("Status", before.status, after.status),
    fieldChange("Recommendation", before.recommendation?.decision, after.recommendation?.decision),
    fieldChange("Confidence", percent(before.recommendation?.confidence), percent(after.recommendation?.confidence)),
    fieldChange("Quality Score", qualityScore(before), qualityScore(after)),
    fieldChange("Evidence Count", countItems(before.evidence), countItems(after.evidence)),
    fieldChange("Hypothesis Count", countItems(before.hypotheses), countItems(after.hypotheses)),
    fieldChange("Risk Count", countItems(before.risks), countItems(after.risks)),
    fieldChange("Assumption Count", countItems(before.assumption_register), countItems(after.assumption_register)),
    fieldChange("Open Question Count", countItems(before.open_questions), countItems(after.open_questions))
  ];
  const changed = rows.filter((row) => row.changed);

  return [
    `# Decision Diff: ${after.title || before.title || "Untitled decision"}`,
    "",
    "## Summary",
    table(["Metric", "Before", "After", "Changed"], rows.map((row) => [
      row.name,
      row.before,
      row.after,
      row.changed ? "yes" : "no"
    ])),
    "",
    "## Changed Fields",
    changed.length
      ? table(["Metric", "Before", "After"], changed.map((row) => [row.name, row.before, row.after]))
      : "No tracked field changes."
  ].join("\n") + "\n";
}

export function renderPremortem(decision) {
  const risks = decision.risks || [];
  const assumptions = decision.assumption_register || [];
  const counterarguments = (decision.hypotheses || [])
    .flatMap((hypothesis) => hypothesis.counterarguments || [])
    .filter(Boolean);

  return [
    `# Premortem: ${decision.title || "Untitled decision"}`,
    "",
    "## Failure Narrative",
    `Assume the decision "${decision.recommendation?.decision || "undecided"}" was wrong. The most likely explanation is that a high-leverage assumption failed, weak evidence was overweighted, or an early warning signal was ignored.`,
    "",
    "## Likely Failure Modes",
    risks.length
      ? table(["Risk", "Probability", "Impact", "Trigger", "Mitigation"], risks.map((risk) => [
        risk.risk || "",
        risk.probability || "",
        risk.impact || "",
        risk.trigger || "",
        risk.mitigation || ""
      ]))
      : "No risks recorded.",
    "",
    "## Fragile Assumptions",
    assumptions.length
      ? table(["Assumption", "Importance", "Test", "Owner"], assumptions.map((assumption) => [
        assumption.assumption || "",
        assumption.importance || "",
        assumption.test || "",
        assumption.owner || ""
      ]))
      : "No assumptions recorded.",
    "",
    "## Strongest Counterarguments",
    list(counterarguments),
    "",
    "## What Would Change The Decision",
    list(decision.what_would_change_my_mind || []),
    "",
    "## Pre-Commit Checklist",
    "- Name the single assumption most likely to invalidate the decision.",
    "- Confirm the trigger that will force a pause, rollback, or position reduction.",
    "- Assign an owner for the first review date.",
    "- Record the evidence that would make the opposite decision more attractive."
  ].join("\n") + "\n";
}

export function renderResearchPlan(decision) {
  const weakEvidence = (decision.evidence || []).filter((item) => item.strength !== "strong");
  const assumptions = decision.assumption_register || [];
  const openQuestions = decision.open_questions || [];
  const disconfirmingSignals = (decision.hypotheses || [])
    .flatMap((hypothesis) => hypothesis.disconfirming_signals || [])
    .filter(Boolean);

  return [
    `# Research Plan: ${decision.title || "Untitled decision"}`,
    "",
    "## Objective",
    `Improve the decision record enough to make or revise the recommendation for: ${decision.question || decision.title || "untitled decision"}.`,
    "",
    "## Priority Questions",
    list(openQuestions),
    "",
    "## Evidence To Upgrade",
    weakEvidence.length
      ? table(["Claim", "Current Strength", "Source", "Upgrade Needed"], weakEvidence.map((item) => [
        item.claim || "",
        item.strength || "",
        item.source || "",
        evidenceUpgrade(item)
      ]))
      : "No weak or medium evidence items found.",
    "",
    "## Assumption Tests",
    assumptions.length
      ? table(["Assumption", "Importance", "Test", "Owner"], assumptions.map((item) => [
        item.assumption || "",
        item.importance || "",
        item.test || "",
        item.owner || ""
      ]))
      : "No assumptions recorded.",
    "",
    "## Disconfirming Signals",
    list(disconfirmingSignals),
    "",
    "## Research Tasks",
    researchTasks(decision, weakEvidence, assumptions, openQuestions)
  ].join("\n") + "\n";
}

export function renderDecisionChecklist(decision) {
  const common = [
    ["Question is specific", Boolean(decision.question)],
    ["Options are explicit", (decision.options || []).length >= 2],
    ["Decision criteria are weighted", (decision.decision_criteria || []).some((item) => Number(item.weight) > 0)],
    ["Evidence includes sources", (decision.evidence || []).some((item) => item.source)],
    ["Counterarguments are recorded", (decision.hypotheses || []).some((item) => (item.counterarguments || []).length)],
    ["Risks have mitigations", (decision.risks || []).some((item) => item.mitigation)],
    ["Change-my-mind conditions exist", (decision.what_would_change_my_mind || []).length > 0],
    ["Review loop is scheduled", Boolean(decision.recommendation?.review_date || decision.post_decision_review?.review_date)]
  ];
  const specific = checklistForType(decision);
  return [
    `# Decision Checklist: ${decision.title || "Untitled decision"}`,
    "",
    `Type: ${decision.decision_type || "unknown"}`,
    "",
    "## Common Checks",
    checklistTable(common),
    "",
    "## Type-Specific Checks",
    checklistTable(specific),
    "",
    "## Remaining Work",
    list([...common, ...specific].filter(([, passed]) => !passed).map(([name]) => name))
  ].join("\n") + "\n";
}

function priorityScore(decision, audit, asOf) {
  const reasons = [];
  let score = 0;
  const status = decision.status || "draft";
  if (status === "draft") {
    score += 20;
    reasons.push("draft");
  }
  if (status === "researching") {
    score += 15;
    reasons.push("researching");
  }
  if (audit.score.ratio < 0.75) {
    score += Math.round((0.75 - audit.score.ratio) * 100);
    reasons.push("quality below target");
  }
  const highRisks = (decision.risks || []).filter((risk) => risk.impact === "high").length;
  if (highRisks) {
    score += highRisks * 10;
    reasons.push(`${highRisks} high-impact risk(s)`);
  }
  const deadlineDays = daysUntil(asOf, decision.recommendation?.decision_deadline);
  if (deadlineDays !== null && deadlineDays <= 14) {
    score += Math.max(0, 30 - deadlineDays);
    reasons.push(`deadline in ${deadlineDays} day(s)`);
  }
  const reviewDays = daysUntil(asOf, decision.recommendation?.review_date || decision.post_decision_review?.review_date);
  if (reviewDays !== null && reviewDays <= 0) {
    score += 20;
    reasons.push("review due");
  }
  return { score, reasons: reasons.length ? reasons : ["no urgent signal"] };
}

function checklistForType(decision) {
  if (decision.decision_type === "investment") {
    return [
      ["Asset and thesis are named", Boolean(decision.asset && decision.investment_thesis)],
      ["Valuation view is recorded", Boolean(decision.valuation_view)],
      ["Portfolio role is explicit", Boolean(decision.portfolio_context)],
      ["Position sizing is constrained", Boolean(decision.risk_controls)]
    ];
  }
  if (decision.decision_type === "business") {
    return [
      ["Strategic goal is explicit", Boolean(decision.strategic_goal)],
      ["Stakeholders are named", (decision.stakeholders || []).length > 0],
      ["Financial impact is stated", Boolean(decision.financial_impact)],
      ["Execution plan exists", Boolean(decision.execution_plan)]
    ];
  }
  if (decision.decision_type === "finance") {
    return [
      ["Financial hypothesis is stated", Boolean(decision.financial_hypothesis)],
      ["Model driver is stated", Boolean(decision.model_driver)],
      ["Sensitivity checks exist", (decision.sensitivity_checks || []).length > 0],
      ["Guardrails exist", (decision.financial_guardrails || []).length > 0]
    ];
  }
  return [
    ["Owner is assigned", Boolean(decision.owner)],
    ["Next actions exist", (decision.next_actions || []).length > 0]
  ];
}

function checklistTable(items) {
  return table(["Check", "Status"], items.map(([name, passed]) => [
    name,
    passed ? "PASS" : "TODO"
  ]));
}

function daysUntil(asOf, date) {
  if (!isIsoDate(asOf) || !isIsoDate(date)) return null;
  return Math.floor((parseDate(date) - parseDate(asOf)) / 86_400_000);
}

function timelineEvent(filePath, decision, kind, date) {
  if (!date || !isIsoDate(date)) return null;
  return { filePath, decision, kind, date };
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
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

function evidenceUpgrade(item) {
  if (item.source_type === "user input") return "Find an external or measured source.";
  if (item.strength === "weak") return "Replace or corroborate with primary evidence.";
  if (item.strength === "medium") return "Confirm recency, sample size, and counterexample coverage.";
  return "Document why this should be considered strong.";
}

function researchTasks(decision, weakEvidence, assumptions, openQuestions) {
  const tasks = [
    ...openQuestions.slice(0, 5).map((item) => `- Answer: ${item}`),
    ...weakEvidence.slice(0, 5).map((item) => `- Upgrade evidence for claim: ${item.claim || "unnamed claim"}`),
    ...assumptions.slice(0, 5).map((item) => `- Test assumption: ${item.assumption || "unnamed assumption"}`)
  ];
  if (decision.recommendation?.decision_deadline) {
    tasks.push(`- Finish critical research before decision deadline: ${decision.recommendation.decision_deadline}`);
  }
  return tasks.length ? tasks.join("\n") : "- No research tasks found.";
}

function fieldChange(name, before, after) {
  const normalizedBefore = String(before ?? "");
  const normalizedAfter = String(after ?? "");
  return {
    name,
    before: normalizedBefore,
    after: normalizedAfter,
    changed: normalizedBefore !== normalizedAfter
  };
}

function countItems(value) {
  return Array.isArray(value) ? String(value.length) : "0";
}

function qualityScore(decision) {
  const audit = auditDecision(decision);
  return `${audit.score.score}/${audit.score.max_score}`;
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
