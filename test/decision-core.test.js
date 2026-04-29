import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  auditDecision,
  buildPromptChain,
  buildRolePrompt,
  renderDecisionBrief,
  renderDecisionMemo,
  renderReviewPlan,
  scoreDecision,
  scoreOptions,
  validateDecision
} from "../src/decision-core.js";
import {
  closeDecision,
  createDecisionFromQuestion,
  inferDecisionType,
  renderLedger,
  runDecisionWorkflow
} from "../src/decision-agent.js";
import {
  buildDecisionRows,
  renderDashboard,
  renderExport
} from "../src/decision-export.js";
import {
  applyJsonPatch,
  attachEvidence,
  attachSourceEvidence,
  createSourceNote,
  promoteDecision,
  renderCalibration,
  renderDoctor,
  renderDueReviews,
  renderReviewWorksheet,
  renderSearchResults,
  setJsonPath,
  summarizeDecisionHealth
} from "../src/decision-tools.js";

const investment = JSON.parse(readFileSync("examples/investment/nvidia_add_position.json", "utf8"));
const business = JSON.parse(readFileSync("examples/business/enterprise_pricing_change.json", "utf8"));
const finance = JSON.parse(readFileSync("examples/finance/hiring_runway_tradeoff.json", "utf8"));

test("validates complete investment example", () => {
  const result = validateDecision(investment);
  assert.equal(result.valid, true, JSON.stringify(result.issues, null, 2));
});

test("validates complete business example", () => {
  const result = validateDecision(business);
  assert.equal(result.valid, true, JSON.stringify(result.issues, null, 2));
});

test("validates complete finance example", () => {
  const result = validateDecision(finance);
  assert.equal(result.valid, true, JSON.stringify(result.issues, null, 2));
});

test("scores mature decisions", () => {
  const result = scoreDecision(business);
  assert.equal(result.grade, "A");
  assert.equal(result.score, result.max_score);
});

test("audits mature decisions", () => {
  const result = auditDecision(business);
  assert.equal(result.maturity, "operational");
  assert.equal(result.validation.valid, true);
  assert.deepEqual(result.weakest_areas, []);
});

test("scores options against weighted criteria", () => {
  const result = scoreOptions(business);
  assert.equal(result[0].option_id, "B");
  assert.ok(result[0].weighted_score > result[1].weighted_score);
});

test("renders a markdown memo", () => {
  const memo = renderDecisionMemo(investment);
  assert.match(memo, /# Add to NVIDIA Position/);
  assert.match(memo, /## What Would Change My Mind/);
  assert.match(memo, /## Option Scorecard/);
  assert.match(memo, /Quality Score/);
});

test("renders brief and review plan", () => {
  assert.match(renderDecisionBrief(finance), /Best scored option/);
  assert.match(renderReviewPlan(finance), /# Review Plan/);
});

test("builds role prompts", () => {
  const prompt = buildRolePrompt("skeptic", investment);
  assert.match(prompt, /You are the Skeptic/);
  assert.match(prompt, /Decision record/);
});

test("builds prompt chain", () => {
  const chain = buildPromptChain(investment);
  assert.equal(chain.length, 7);
  assert.equal(chain[0].role, "analyst");
});

test("infers decision type from rough questions", () => {
  assert.equal(inferDecisionType("Should I buy AAPL now?"), "investment");
  assert.equal(inferDecisionType("Should we change enterprise pricing?"), "business");
  assert.equal(inferDecisionType("Should we hire despite runway pressure?"), "finance");
});

test("creates valid decision records from a rough question", () => {
  const decision = createDecisionFromQuestion("Should I buy AAPL now?", {
    now: "2026-04-28",
    owner: "personal portfolio"
  });
  const result = validateDecision(decision);
  assert.equal(decision.decision_type, "investment");
  assert.equal(result.valid, true, JSON.stringify(result.issues, null, 2));
});

test("runs full decision workflow artifacts", () => {
  const decision = createDecisionFromQuestion("Should we change enterprise pricing?", {
    type: "business",
    now: "2026-04-28"
  });
  const workflow = runDecisionWorkflow(decision);
  assert.equal(workflow.validation.valid, true);
  assert.ok(workflow.artifacts["audit.json"]);
  assert.ok(workflow.artifacts["memo.md"]);
  assert.ok(workflow.artifacts["prompts/skeptic.md"]);
});

test("renders ledger and closes decisions", () => {
  const closed = closeDecision(business, {
    outcome: "Pilot completed.",
    lessons: ["Staged pricing changes need tighter finance reporting."]
  });
  assert.equal(closed.status, "reviewed");
  assert.match(renderLedger([{ filePath: "pricing.json", decision: closed }]), /Decision Ledger/);
});

test("attaches evidence to records and hypotheses", () => {
  const next = attachEvidence(investment, {
    claim: "Fresh primary-source evidence exists.",
    source: "Example source",
    strength: "strong",
    source_type: "primary",
    recency: "current"
  }, { hypothesisId: "H1", now: "2026-04-28" });
  assert.equal(next.evidence.at(-1).strength, "strong");
  assert.ok(next.hypotheses[0].evidence.includes("Fresh primary-source evidence exists."));
});

test("applies JSON patch and dot-path updates", () => {
  const patched = applyJsonPatch(business, [
    { op: "replace", path: "/recommendation/confidence", value: 0.66 },
    { op: "add", path: "/open_questions/-", value: "What would make the pilot fail fast?" }
  ]);
  assert.equal(patched.recommendation.confidence, 0.66);
  assert.equal(patched.open_questions.at(-1), "What would make the pilot fail fast?");

  const updated = setJsonPath(business, "recommendation.decision", "pause");
  assert.equal(updated.recommendation.decision, "pause");
});

test("renders calibration and doctor reports", () => {
  const closed = closeDecision(finance, { outcome: "Outcome logged." });
  const calibration = renderCalibration([{ filePath: "finance.json", decision: closed }]);
  assert.match(calibration, /Reviewed decisions: 1/);

  const doctor = renderDoctor({
    root: ".",
    examples: [{ filePath: "examples/finance/hiring_runway_tradeoff.json", decision: finance }]
  });
  assert.match(doctor, /All doctor checks passed/);
});

test("summarizes decision health", () => {
  const health = summarizeDecisionHealth(business);
  assert.equal(health.valid, true);
  assert.equal(health.maturity, "operational");
});

test("creates source notes and links source evidence", () => {
  const note = createSourceNote({
    title: "QBR Notes",
    sourcePath: "research/raw/qbr.md",
    content: "Enterprise buyers asked for workflow pricing.",
    tags: "pricing,enterprise",
    date: "2026-04-29"
  });
  assert.match(note, /QBR Notes/);
  assert.match(note, /Enterprise buyers/);

  const next = attachSourceEvidence(business, "research/sources/qbr-notes.md", {
    claim: "QBR notes support platform pricing test.",
    strength: "medium"
  });
  assert.equal(next.evidence.at(-1).source, "research/sources/qbr-notes.md");
});

test("renders due reviews, search results, promotion, and review worksheets", () => {
  assert.match(renderDueReviews([{ filePath: "pricing.json", decision: business }], "2026-08-01"), /pricing.json/);
  assert.match(renderSearchResults([{ filePath: "pricing.json", decision: business }], "platform"), /pricing.json/);
  assert.equal(promoteDecision(business, "reviewed", { now: "2026-04-29" }).status, "reviewed");
  assert.match(renderReviewWorksheet(business), /Review Worksheet/);
});

test("exports decision rows and dashboard", () => {
  const records = [{ filePath: "pricing.json", decision: business }];
  const rows = buildDecisionRows(records);
  assert.equal(rows[0].type, "business");
  assert.match(renderExport(records, "csv"), /pricing.json/);
  assert.match(renderExport(records, "json"), /Move Enterprise Plan/);
  assert.match(renderDashboard(records), /Decision Lab Dashboard/);
});

test("cli validates example", () => {
  const output = execFileSync("node", ["bin/decision-lab.js", "validate", "examples/business/enterprise_pricing_change.json"], {
    encoding: "utf8"
  });
  assert.match(output, /OK/);
});

test("cli compares options", () => {
  const output = execFileSync("node", ["bin/decision-lab.js", "compare", "examples/business/enterprise_pricing_change.json"], {
    encoding: "utf8"
  });
  assert.match(output, /Controlled pilot/);
});

test("cli creates decision from rough question", () => {
  const output = execFileSync("node", ["bin/decision-lab.js", "ask", "Should I buy AAPL now?"], {
    encoding: "utf8"
  });
  const decision = JSON.parse(output);
  assert.equal(decision.decision_type, "investment");
  assert.match(decision.question, /AAPL/);
});

test("cli applies evidence and patch commands", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-test-"));
  const decisionPath = path.join(dir, "decision.json");
  const patchPath = path.join(dir, "patch.json");
  writeFileSync(decisionPath, `${JSON.stringify(business, null, 2)}\n`);
  writeFileSync(patchPath, `${JSON.stringify([
    { op: "replace", path: "/recommendation/confidence", value: 0.62 }
  ], null, 2)}\n`);

  execFileSync("node", [
    "bin/decision-lab.js",
    "evidence",
    decisionPath,
    "--claim",
    "Pipeline data was refreshed.",
    "--source",
    "Internal CRM",
    "--strength",
    "strong"
  ]);
  const withEvidence = JSON.parse(readFileSync(decisionPath, "utf8"));
  assert.equal(withEvidence.evidence.at(-1).claim, "Pipeline data was refreshed.");

  execFileSync("node", ["bin/decision-lab.js", "patch", decisionPath, patchPath]);
  const patched = JSON.parse(readFileSync(decisionPath, "utf8"));
  assert.equal(patched.recommendation.confidence, 0.62);
});

test("cli imports source, links source evidence, and renders due/search/review", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-source-test-"));
  const decisionPath = path.join(dir, "decision.json");
  const rawSourcePath = path.join(dir, "source.md");
  const sourceNotePath = path.join(dir, "source-note.md");
  writeFileSync(decisionPath, `${JSON.stringify(business, null, 2)}\n`);
  writeFileSync(rawSourcePath, "Customer QBR mentioned platform pricing.");

  execFileSync("node", [
    "bin/decision-lab.js",
    "source",
    rawSourcePath,
    "--title",
    "Customer QBR",
    "--out",
    sourceNotePath
  ]);
  assert.match(readFileSync(sourceNotePath, "utf8"), /Customer QBR/);

  execFileSync("node", [
    "bin/decision-lab.js",
    "source-evidence",
    decisionPath,
    sourceNotePath,
    "--claim",
    "QBR supports platform pricing."
  ]);
  assert.equal(JSON.parse(readFileSync(decisionPath, "utf8")).evidence.at(-1).source, sourceNotePath);

  assert.match(execFileSync("node", ["bin/decision-lab.js", "due", "examples", "--as-of", "2026-08-01"], {
    encoding: "utf8"
  }), /enterprise_pricing_change/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "search", "examples", "--query", "platform"], {
    encoding: "utf8"
  }), /enterprise_pricing_change/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "review", "examples/business/enterprise_pricing_change.json"], {
    encoding: "utf8"
  }), /Review Worksheet/);
});

test("cli promotes decision status", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-promote-test-"));
  const decisionPath = path.join(dir, "decision.json");
  writeFileSync(decisionPath, `${JSON.stringify(business, null, 2)}\n`);
  execFileSync("node", ["bin/decision-lab.js", "promote", decisionPath, "reviewed"]);
  assert.equal(JSON.parse(readFileSync(decisionPath, "utf8")).status, "reviewed");
});

test("cli exports dashboard and csv", () => {
  const output = execFileSync("node", ["bin/decision-lab.js", "export", "examples", "--format", "csv"], {
    encoding: "utf8"
  });
  assert.match(output, /enterprise_pricing_change/);

  const dashboard = execFileSync("node", ["bin/decision-lab.js", "dashboard", "examples"], {
    encoding: "utf8"
  });
  assert.match(dashboard, /Wrote outputs\/dashboard.html/);
  assert.match(readFileSync("outputs/dashboard.html", "utf8"), /Decision Lab Dashboard/);
});

test("rejects weak decision records", () => {
  const weak = { decision_type: "investment" };
  const result = validateDecision(weak);
  assert.equal(result.valid, false);
  assert.ok(result.issues.length > 3);
});
