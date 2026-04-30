import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
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
  createDecisionsFromInbox,
  createDecisionFromQuestion,
  inferDecisionType,
  migrateDecision,
  parseInboxQuestions,
  renderLedger,
  renderMigrationReport,
  runDecisionWorkflow
} from "../src/decision-agent.js";
import {
  buildPatchPrompt,
  createOpenAiPatchSuggestion,
  parsePatchResponse,
  renderPatchReview
} from "../src/decision-ai.js";
import {
  buildDecisionRows,
  renderDashboard,
  renderExport
} from "../src/decision-export.js";
import {
  importEvidenceItems,
  parseEvidenceHtml,
  parseEvidenceFile,
  parseEvidenceFileAsync,
  parseEvidenceNotes,
  renderEvidenceImportReport
} from "../src/decision-import.js";
import {
  createPrivateWorkspace,
  renderPrivacyReport,
  scanPrivacy
} from "../src/decision-privacy.js";
import {
  createDraftDecision,
  createDecisionServer,
  decisionPayload,
  readDecisionRecord,
  renderApp,
  reportCatalog,
  saveDecisionRecord
} from "../src/decision-server.js";
import {
  applyJsonPatch,
  attachEvidence,
  attachSourceEvidence,
  createSourceNote,
  evaluateGate,
  promoteDecision,
  renderArchivePlan,
  renderActionQueue,
  renderAssumptionReport,
  renderAssumptionTestQueue,
  renderCalibration,
  renderCalendarReport,
  renderCommitmentReport,
  renderDecisionAgenda,
  renderDecisionChecklist,
  renderDecisionDebt,
  renderDependencyReport,
  renderDecisionDiff,
  renderDecisionGraph,
  renderDoctor,
  renderDueReviews,
  renderEvidenceScorecard,
  renderExecutiveSummary,
  renderGateReport,
  renderGuardrailReport,
  renderHypothesisRegister,
  renderIcsCalendar,
  renderIntegrityManifest,
  renderLessonsReport,
  renderMonthlyReview,
  renderOperatingScorecard,
  renderOperatingPlaybook,
  renderOutcomeScorecard,
  renderOwnerReport,
  renderPremortem,
  renderPrinciplesReport,
  renderPortfolioBriefing,
  renderPriorityReview,
  renderQuestionRegister,
  renderRedTeamReport,
  renderResearchPlan,
  renderReportCatalog,
  renderRiskHeatmap,
  renderRiskRegister,
  renderReviewPackIndex,
  renderReviewWorksheet,
  renderSearchResults,
  renderScenarioReport,
  renderSensitivityReport,
  renderSignalWatchlist,
  renderSourceIndex,
  renderStaleReport,
  renderRepositoryStatus,
  renderTaxonomyReport,
  renderThemeReport,
  renderTimeline,
  renderTriageReport,
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

test("creates decision drafts from inbox text", () => {
  const questions = parseInboxQuestions(`
# ignored
- Should I buy AAPL now?
Should we change enterprise pricing?
`);
  assert.equal(questions.length, 2);
  const decisions = createDecisionsFromInbox(questions.join("\n"), { now: "2026-04-29" });
  assert.equal(decisions.length, 2);
  assert.equal(decisions[0].decision.decision_type, "investment");
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
  assert.ok(workflow.artifacts["checklist.md"]);
  assert.ok(workflow.artifacts["premortem.md"]);
  assert.ok(workflow.artifacts["research-plan.md"]);
  assert.ok(workflow.artifacts["graph.md"]);
  assert.ok(workflow.artifacts["health.json"]);
  assert.ok(workflow.artifacts["prompts/skeptic.md"]);
});

test("migrates legacy decision records into the current schema", () => {
  const legacy = {
    schema_version: "0.1.0",
    decision_type: "business_strategy",
    title: "Legacy pricing decision",
    question: "Should we change enterprise pricing?",
    context: "Legacy note from an older prompt-only workflow.",
    recommendation: {
      decision: "pilot",
      summary: "Try a controlled pricing change.",
      confidence: 0.6
    }
  };

  const migrated = migrateDecision(legacy, { now: "2026-04-29" });
  const validation = validateDecision(migrated);
  assert.equal(migrated.schema_version, "0.2.0");
  assert.equal(migrated.decision_type, "business");
  assert.equal(migrated.recommendation.decision, "pilot");
  assert.equal(validation.valid, true, JSON.stringify(validation.issues, null, 2));
  assert.match(renderMigrationReport(legacy, migrated), /After valid: yes/);
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

test("builds and parses AI patch suggestions", () => {
  const prompt = buildPatchPrompt("skeptic", business);
  assert.match(prompt, /RFC 6902 JSON Patch/);
  assert.match(prompt, /Current validation/);

  const patch = parsePatchResponse(`
\`\`\`json
[
  {
    "op": "add",
    "path": "/open_questions/-",
    "value": "What would invalidate the pilot?"
  }
]
\`\`\`
`);
  assert.equal(patch[0].op, "add");
  assert.match(renderPatchReview(patch), /Patch Review/);
});

test("rejects invalid AI patch suggestions", () => {
  assert.throws(() => parsePatchResponse('[{"op":"move","path":"/title","value":"x"}]'), /unsupported op/);
});

test("creates OpenAI patch suggestions through injected fetch", async () => {
  const result = await createOpenAiPatchSuggestion(business, {
    role: "skeptic",
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async (url, options) => {
      assert.match(url, /\/responses$/);
      assert.equal(JSON.parse(options.body).model, "test-model");
      return {
        ok: true,
        json: async () => ({
          output_text: JSON.stringify([
            { op: "add", path: "/open_questions/-", value: "What would invalidate the pilot?" }
          ])
        })
      };
    }
  });
  assert.equal(result.patch[0].op, "add");
});

test("renders calibration and doctor reports", () => {
  const closed = closeDecision(finance, { outcome: "Outcome logged." });
  const calibration = renderCalibration([{ filePath: "finance.json", decision: closed }]);
  assert.match(calibration, /Reviewed decisions: 1/);
  assert.match(renderOutcomeScorecard([{ filePath: "finance.json", decision: closed }]), /Outcome Scorecard/);
  assert.match(renderPrinciplesReport([{ filePath: "finance.json", decision: closed }]), /Decision Principles/);
  assert.match(renderThemeReport([{ filePath: "finance.json", decision: closed }]), /Theme Report/);
  assert.match(renderLessonsReport([{ filePath: "finance.json", decision: closed }]), /Lessons Report/);

  const doctor = renderDoctor({
    root: ".",
    examples: [{ filePath: "examples/finance/hiring_runway_tradeoff.json", decision: finance }]
  });
  assert.match(doctor, /All doctor checks passed/);
  assert.match(renderReportCatalog(), /Decision Lab Report Catalog/);
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

test("imports evidence from CSV files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-evidence-import-unit-"));
  const evidencePath = path.join(dir, "evidence.csv");
  writeFileSync(evidencePath, "claim,source,strength,source_type,recency,notes\nImported claim,Research note,strong,note,current,Imported by test\n");

  const items = parseEvidenceFile(evidencePath);
  assert.equal(items.length, 1);
  assert.equal(items[0].claim, "Imported claim");
  const next = importEvidenceItems(business, items, { now: "2026-04-30" });
  assert.equal(next.evidence.at(-1).source, "Research note");
  assert.match(renderEvidenceImportReport(items, { sourcePath: evidencePath }), /Evidence Import Report/);
});

test("imports evidence from TSV and HTML files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-evidence-adapters-test-"));
  const tsvPath = path.join(dir, "evidence.tsv");
  const htmlPath = path.join(dir, "page.html");
  writeFileSync(tsvPath, "claim\tsource\tstrength\tsource_type\trecency\nTSV claim\tSpreadsheet export\tmedium\tspreadsheet\tcurrent\n");
  writeFileSync(htmlPath, [
    "<html><body>",
    "<h1>Research Page</h1>",
    "<p>claim: Web trial signups increased after pricing copy changed.</p>",
    "<p>source: Saved product analytics page</p>",
    "<p>strength: medium</p>",
    "<p>source_type: saved_webpage</p>",
    "</body></html>"
  ].join(""));

  const tsvItems = parseEvidenceFile(tsvPath);
  assert.equal(tsvItems[0].claim, "TSV claim");
  assert.equal(tsvItems[0].source_type, "spreadsheet");

  const htmlItems = parseEvidenceFile(htmlPath);
  assert.equal(htmlItems[0].source, "Saved product analytics page");
  assert.equal(parseEvidenceHtml(readFileSync(htmlPath, "utf8"), { sourcePath: htmlPath })[0].source_type, "saved_webpage");
});

test("imports evidence from XLSX and PDF files", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-binary-evidence-test-"));
  const xlsxPath = path.join(dir, "evidence.xlsx");
  const pdfPath = path.join(dir, "evidence.pdf");
  writeFileSync(xlsxPath, createMinimalXlsx([
    ["claim", "source", "strength", "source_type"],
    ["XLSX claim", "Workbook export", "strong", "spreadsheet"]
  ]));
  writeFileSync(pdfPath, createMinimalPdf([
    "claim: PDF evidence supports staged rollout.",
    "source: Research PDF",
    "strength: medium",
    "source_type: pdf"
  ]));

  const xlsxItems = await parseEvidenceFileAsync(xlsxPath);
  assert.equal(xlsxItems[0].claim, "XLSX claim");
  assert.equal(xlsxItems[0].source_type, "spreadsheet");

  const pdfItems = await parseEvidenceFileAsync(pdfPath);
  assert.equal(pdfItems[0].source, "Research PDF");
  assert.equal(pdfItems[0].source_type, "pdf");
});

test("creates private workspaces and scans privacy risks", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-private-workspace-test-"));
  const result = createPrivateWorkspace(dir, { owner: "Private Owner" });
  assert.equal(result.files.includes(".decision-lab.json"), true);
  assert.match(readFileSync(path.join(dir, "README.md"), "utf8"), /Private Decision Lab Workspace/);
  assert.match(readFileSync(path.join(dir, ".decision-lab.json"), "utf8"), /Private Owner/);

  const scan = scanPrivacy({ root: dir });
  assert.equal(scan.ok, false);
  assert.match(renderPrivacyReport(scan), /FAIL/);

  const publicDir = mkdtempSync(path.join(tmpdir(), "decision-lab-public-scan-test-"));
  writeFileSync(path.join(publicDir, "README.md"), "# Public\n");
  assert.equal(scanPrivacy({ root: publicDir }).ok, true);
});

test("extracts evidence from markdown and text notes", () => {
  const items = parseEvidenceNotes([
    "# Customer Notes",
    "- claim: Three enterprise prospects asked for budget guardrails.",
    "  source: QBR notes",
    "  strength: strong",
    "  source_type: customer_note",
    "  recency: current",
    "",
    "- Pricing pilot reduced approval time | Sales ops transcript | medium | transcript | current | Needs CFO validation"
  ].join("\n"), { sourcePath: "research/raw/qbr.md" });

  assert.equal(items.length, 2);
  assert.equal(items[0].source, "QBR notes");
  assert.equal(items[1].source_type, "transcript");
});

test("renders due reviews, search results, promotion, and review worksheets", () => {
  assert.match(renderDueReviews([{ filePath: "pricing.json", decision: business }], "2026-08-01"), /pricing.json/);
  assert.match(renderReviewPackIndex([{ filePath: "pricing.json", decision: business }], "2026-08-01"), /Review Pack/);
  assert.match(renderSearchResults([{ filePath: "pricing.json", decision: business }], "platform"), /pricing.json/);
  assert.equal(promoteDecision(business, "reviewed", { now: "2026-04-29" }).status, "reviewed");
  assert.match(renderReviewWorksheet(business), /Review Worksheet/);
});

test("renders portfolio-level operating reports", () => {
  const records = [
    { filePath: "business.json", decision: business },
    { filePath: "finance.json", decision: finance },
    { filePath: "investment.json", decision: investment }
  ];
  assert.match(renderRiskRegister(records), /Risk Register/);
  assert.match(renderRiskHeatmap(records), /Risk Heatmap/);
  assert.match(renderAssumptionReport(records), /Assumption Register/);
  assert.match(renderAssumptionTestQueue(records), /Assumption Test Queue/);
  assert.match(renderSourceIndex(records), /Source Index/);
  assert.match(renderEvidenceScorecard(records), /Evidence Scorecard/);
  assert.match(renderSignalWatchlist(records, { asOf: "2026-08-01" }), /Signal Watchlist/);
  assert.match(renderQuestionRegister(records), /Question Register/);
  assert.match(renderHypothesisRegister(records), /Hypothesis Register/);
  assert.match(renderRedTeamReport(records), /Red Team Report/);
  assert.match(renderCommitmentReport(records, { asOf: "2026-08-01" }), /Commitment Report/);
  assert.match(renderDependencyReport(records), /Dependency Report/);
  assert.match(renderScenarioReport(records), /Scenario Report/);
  assert.match(renderSensitivityReport(records), /Sensitivity Report/);
  assert.match(renderGuardrailReport(records), /Guardrail Report/);
  assert.match(renderExecutiveSummary(records, { asOf: "2026-08-01", staleDays: 30 }), /Executive Decision Summary/);
  assert.match(renderOperatingPlaybook(records, { asOf: "2026-08-01", staleDays: 30, root: "examples" }), /Operating Playbook/);
  assert.match(renderOutcomeScorecard([{ filePath: "business.json", decision: closeDecision(business, { outcome: "Pilot worked.", lessons: ["Keep pilot scope explicit."] }) }]), /Complete reviews/);
  assert.match(renderOperatingScorecard(records, { asOf: "2026-08-01", staleDays: 30 }), /Operating Scorecard/);
  assert.match(renderTriageReport(records, { asOf: "2026-08-01", staleDays: 30 }), /Decision Triage/);
  assert.match(renderOwnerReport(records, "2026-08-01"), /Owner Report/);
  assert.match(renderIntegrityManifest([{ filePath: "examples/business/enterprise_pricing_change.json", decision: business }]), /SHA256/);
  assert.match(renderPortfolioBriefing(records, "2026-08-01"), /Portfolio Briefing/);
  assert.match(renderMonthlyReview(records, "2026-08-01"), /Monthly Decision Review/);
  assert.match(renderActionQueue(records, "2026-08-01"), /Action Queue/);
  assert.match(renderPriorityReview(records, "2026-08-01"), /Decision Priority Review/);
  assert.match(renderTaxonomyReport(records), /Taxonomy Report/);
  assert.match(renderCalendarReport(records, { asOf: "2026-08-01" }), /Decision Calendar/);
  assert.match(renderIcsCalendar(records, { asOf: "2026-08-01", now: new Date("2026-04-30T00:00:00Z") }), /BEGIN:VCALENDAR/);
  assert.match(renderDecisionAgenda(records, { asOf: "2026-08-01", horizonDays: 14 }), /Decision Agenda/);
  assert.match(renderRepositoryStatus(records, { asOf: "2026-08-01" }), /Repository Status/);
  assert.match(renderDecisionDebt(records, { asOf: "2026-08-01", staleDays: 30 }), /Decision Debt/);
  assert.match(renderTimeline(records), /Decision Timeline/);
});

test("renders decision graphs", () => {
  const graph = renderDecisionGraph(business);
  assert.match(graph, /```mermaid/);
  assert.match(graph, /Decision Graph/);
  assert.match(graph, /Hypotheses/);
  assert.match(graph, /Risks/);
});

test("renders decision diffs", () => {
  const after = promoteDecision(business, "decided", { now: "2026-04-29" });
  after.recommendation.confidence = 0.72;
  const diff = renderDecisionDiff(business, after);
  assert.match(diff, /Decision Diff/);
  assert.match(diff, /Confidence/);
  assert.match(diff, /Changed Fields/);
});

test("renders type-specific decision checklists", () => {
  const checklist = renderDecisionChecklist(investment);
  assert.match(checklist, /Decision Checklist/);
  assert.match(checklist, /Asset and thesis are named/);
  assert.match(checklist, /Remaining Work/);
});

test("renders premortem reports", () => {
  const report = renderPremortem(investment);
  assert.match(report, /Premortem/);
  assert.match(report, /Likely Failure Modes/);
  assert.match(report, /Pre-Commit Checklist/);
});

test("renders research plans", () => {
  const report = renderResearchPlan(finance);
  assert.match(report, /Research Plan/);
  assert.match(report, /Evidence To Upgrade/);
  assert.match(report, /Research Tasks/);
});

test("evaluates quality gates and stale decisions", () => {
  const records = [{ filePath: "business.json", decision: business }];
  const gate = evaluateGate(records, { minScore: 0.9, requireOperational: true });
  assert.equal(gate.passed, true);
  assert.match(renderGateReport(records, { minScore: 0.9, requireOperational: true }), /PASS/);
  assert.match(renderStaleReport(records, { asOf: "2026-08-01", days: 30 }), /business.json/);
});

test("exports decision rows and dashboard", () => {
  const records = [{ filePath: "pricing.json", decision: business }];
  const rows = buildDecisionRows(records);
  assert.equal(rows[0].type, "business");
  assert.equal(typeof rows[0].priority, "number");
  assert.equal(typeof rows[0].high_risks, "number");
  assert.match(renderExport(records, "csv"), /pricing.json/);
  assert.match(renderExport(records, "json"), /Move Enterprise Plan/);
  assert.match(renderDashboard(records), /Decision Lab Dashboard/);
  assert.match(renderDashboard(records), /Needs Attention/);
});

test("serves the local product API", async () => {
  const payload = decisionPayload("examples");
  assert.equal(payload.count, 4);
  assert.ok(payload.stats.averageScore > 0);
  assert.ok(reportCatalog().some((report) => report.id === "executive"));

  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-server-test-"));
  const created = createDraftDecision(dir, {
    question: "Should we change enterprise pricing?",
    type: "business",
    owner: "product owner"
  });
  assert.equal(readDecisionRecord(dir, created.filePath).decision.owner, "product owner");
  const updated = structuredClone(created.decision);
  updated.owner = "updated owner";
  assert.equal(saveDecisionRecord(dir, created.filePath, updated).saved, true);
  assert.equal(readDecisionRecord(dir, created.filePath).decision.owner, "updated owner");

  const server = createDecisionServer({ root: "examples", asOf: "2026-08-01" });
  assert.equal(typeof server.listen, "function");
  assert.equal(typeof server.close, "function");
  const html = renderApp({ root: "examples", asOf: "2026-08-01" });
  assert.match(html, /Operating Loop/);
  assert.match(html, /Decision Ledger/);
});

test("cli validates example", () => {
  assert.match(execFileSync("node", ["bin/decision-lab.js", "catalog"], {
    encoding: "utf8"
  }), /Decision Lab Report Catalog/);
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

test("cli renders decision checklist", () => {
  const output = execFileSync("node", ["bin/decision-lab.js", "checklist", "examples/business/enterprise_pricing_change.json"], {
    encoding: "utf8"
  });
  assert.match(output, /Decision Checklist/);
  assert.match(output, /Strategic goal is explicit/);
});

test("cli renders decision graph", () => {
  const output = execFileSync("node", ["bin/decision-lab.js", "graph", "examples/business/enterprise_pricing_change.json"], {
    encoding: "utf8"
  });
  assert.match(output, /flowchart LR/);
  assert.match(output, /Recommendation/);
});

test("cli renders decision diff", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-diff-test-"));
  const beforePath = path.join(dir, "before.json");
  const afterPath = path.join(dir, "after.json");
  const after = promoteDecision(business, "decided", { now: "2026-04-29" });
  writeFileSync(beforePath, `${JSON.stringify(business, null, 2)}\n`);
  writeFileSync(afterPath, `${JSON.stringify(after, null, 2)}\n`);

  const output = execFileSync("node", ["bin/decision-lab.js", "diff", beforePath, afterPath], {
    encoding: "utf8"
  });
  assert.match(output, /Decision Diff/);
  assert.match(output, /Status/);
});

test("cli renders premortem report", () => {
  const output = execFileSync("node", ["bin/decision-lab.js", "premortem", "examples/investment/nvidia_add_position.json"], {
    encoding: "utf8"
  });
  assert.match(output, /Premortem/);
  assert.match(output, /Strongest Counterarguments/);
});

test("cli renders research plan", () => {
  const output = execFileSync("node", ["bin/decision-lab.js", "research-plan", "examples/finance/hiring_runway_tradeoff.json"], {
    encoding: "utf8"
  });
  assert.match(output, /Research Plan/);
  assert.match(output, /Assumption Tests/);
});

test("cli creates decision from rough question", () => {
  const output = execFileSync("node", ["bin/decision-lab.js", "ask", "Should I buy AAPL now?"], {
    encoding: "utf8"
  });
  const decision = JSON.parse(output);
  assert.equal(decision.decision_type, "investment");
  assert.match(decision.question, /AAPL/);
});

test("cli creates a demo workspace", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-demo-test-"));
  const demoPath = path.join(dir, "demo");

  assert.match(execFileSync("node", [
    "bin/decision-lab.js",
    "demo",
    demoPath
  ], { encoding: "utf8" }), /Created Decision Lab demo/);

  assert.match(readFileSync(path.join(demoPath, "README.md"), "utf8"), /Decision Lab Demo/);
  assert.match(readFileSync(path.join(demoPath, "outputs/run/memo.md"), "utf8"), /Enterprise Pricing Pilot Demo/);
  assert.match(readFileSync(path.join(demoPath, "outputs/weekly/2026-08-01/index.md"), "utf8"), /Weekly Pack Index/);
  assert.match(readFileSync(path.join(demoPath, "outputs/weekly/2026-08-01/calendar.ics"), "utf8"), /BEGIN:VCALENDAR/);
});

test("cli writes config and uses default owner", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-config-test-"));
  const cliPath = path.resolve("bin/decision-lab.js");
  const configPath = path.join(dir, ".decision-lab.json");

  execFileSync("node", [cliPath, "config", "--out", configPath]);
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.default_owner = "personal operator";
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const output = execFileSync("node", [cliPath, "ask", "Should I buy AAPL now?"], {
    cwd: dir,
    encoding: "utf8"
  });
  assert.equal(JSON.parse(output).owner, "personal operator");
});

test("cli snapshots decision records", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-snapshot-test-"));
  const decisionPath = path.join(dir, "decision.json");
  const outDir = path.join(dir, "snapshots");
  writeFileSync(decisionPath, `${JSON.stringify(business, null, 2)}\n`);

  const output = execFileSync("node", [
    "bin/decision-lab.js",
    "snapshot",
    decisionPath,
    "--out-dir",
    outDir,
    "--date",
    "2026-04-29",
    "--label",
    "before pilot"
  ], { encoding: "utf8" });

  assert.match(output, /Wrote/);
  assert.match(output, /before-pilot/);
  const snapshots = readdirSync(outDir);
  assert.equal(snapshots.length, 1);
  assert.match(snapshots[0], /before-pilot/);
  assert.match(readFileSync(path.join(outDir, snapshots[0]), "utf8"), /Move Enterprise Plan/);
});

test("cli creates inbox drafts and operating packs", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-inbox-test-"));
  const inboxPath = path.join(dir, "inbox.txt");
  const draftsDir = path.join(dir, "drafts");
  const packDir = path.join(dir, "pack");
  const weeklyDir = path.join(dir, "weekly");
  writeFileSync(inboxPath, "Should I buy AAPL now?\nShould we change enterprise pricing?\n");

  assert.match(execFileSync("node", [
    "bin/decision-lab.js",
    "inbox",
    inboxPath,
    "--out-dir",
    draftsDir
  ], { encoding: "utf8" }), /Wrote 2 decision draft/);

  assert.match(execFileSync("node", [
    "bin/decision-lab.js",
    "pack",
    draftsDir,
    "--out-dir",
    packDir,
    "--as-of",
    "2026-08-01"
  ], { encoding: "utf8" }), /Wrote operating pack/);

  assert.match(readFileSync(path.join(packDir, "monthly.md"), "utf8"), /Monthly Decision Review/);
  assert.match(readFileSync(path.join(packDir, "index.md"), "utf8"), /Operating Pack Index/);
  assert.match(readFileSync(path.join(packDir, "status.md"), "utf8"), /Repository Status/);
  assert.match(readFileSync(path.join(packDir, "debt.md"), "utf8"), /Decision Debt/);
  assert.match(readFileSync(path.join(packDir, "manifest.md"), "utf8"), /Integrity Manifest/);
  assert.match(readFileSync(path.join(packDir, "taxonomy.md"), "utf8"), /Taxonomy Report/);
  assert.match(readFileSync(path.join(packDir, "outcomes.md"), "utf8"), /Outcome Scorecard/);
  assert.match(readFileSync(path.join(packDir, "principles.md"), "utf8"), /Decision Principles/);
  assert.match(readFileSync(path.join(packDir, "themes.md"), "utf8"), /Theme Report/);
  assert.match(readFileSync(path.join(packDir, "commitments.md"), "utf8"), /Commitment Report/);
  assert.match(readFileSync(path.join(packDir, "dependencies.md"), "utf8"), /Dependency Report/);
  assert.match(readFileSync(path.join(packDir, "lessons.md"), "utf8"), /Lessons Report/);
  assert.match(readFileSync(path.join(packDir, "review-pack.md"), "utf8"), /Review Pack/);
  assert.match(readFileSync(path.join(packDir, "risk-heatmap.md"), "utf8"), /Risk Heatmap/);
  assert.match(readFileSync(path.join(packDir, "assumption-tests.md"), "utf8"), /Assumption Test Queue/);
  assert.match(readFileSync(path.join(packDir, "evidence-scorecard.md"), "utf8"), /Evidence Scorecard/);
  assert.match(readFileSync(path.join(packDir, "signals.md"), "utf8"), /Signal Watchlist/);
  assert.match(readFileSync(path.join(packDir, "questions.md"), "utf8"), /Question Register/);
  assert.match(readFileSync(path.join(packDir, "hypotheses.md"), "utf8"), /Hypothesis Register/);
  assert.match(readFileSync(path.join(packDir, "red-team.md"), "utf8"), /Red Team Report/);
  assert.match(readFileSync(path.join(packDir, "scenarios.md"), "utf8"), /Scenario Report/);
  assert.match(readFileSync(path.join(packDir, "sensitivities.md"), "utf8"), /Sensitivity Report/);
  assert.match(readFileSync(path.join(packDir, "guardrails.md"), "utf8"), /Guardrail Report/);
  assert.match(readFileSync(path.join(packDir, "playbook.md"), "utf8"), /Operating Playbook/);
  assert.match(readFileSync(path.join(packDir, "scorecard.md"), "utf8"), /Operating Scorecard/);
  assert.match(readFileSync(path.join(packDir, "triage.md"), "utf8"), /Decision Triage/);
  assert.match(readFileSync(path.join(packDir, "owners.md"), "utf8"), /Owner Report/);
  assert.match(readFileSync(path.join(packDir, "briefing.md"), "utf8"), /Portfolio Briefing/);
  assert.match(readFileSync(path.join(packDir, "executive.md"), "utf8"), /Executive Decision Summary/);
  assert.match(readFileSync(path.join(packDir, "next.md"), "utf8"), /Action Queue/);
  assert.match(readFileSync(path.join(packDir, "priorities.md"), "utf8"), /Decision Priority Review/);
  assert.match(readFileSync(path.join(packDir, "agenda.md"), "utf8"), /Decision Agenda/);
  assert.match(readFileSync(path.join(packDir, "calendar.md"), "utf8"), /Decision Calendar/);
  assert.match(readFileSync(path.join(packDir, "calendar.ics"), "utf8"), /BEGIN:VCALENDAR/);
  assert.match(readFileSync(path.join(packDir, "timeline.md"), "utf8"), /Decision Timeline/);
  assert.match(readFileSync(path.join(packDir, "dashboard.html"), "utf8"), /Decision Lab Dashboard/);

  assert.match(execFileSync("node", [
    "bin/decision-lab.js",
    "weekly",
    draftsDir,
    "--out-dir",
    weeklyDir,
    "--as-of",
    "2026-08-01"
  ], { encoding: "utf8" }), /Wrote weekly pack/);
  assert.match(readFileSync(path.join(weeklyDir, "agenda.md"), "utf8"), /Decision Agenda/);
  assert.match(readFileSync(path.join(weeklyDir, "index.md"), "utf8"), /Weekly Pack Index/);
  assert.match(readFileSync(path.join(weeklyDir, "executive.md"), "utf8"), /Executive Decision Summary/);
  assert.match(readFileSync(path.join(weeklyDir, "playbook.md"), "utf8"), /Operating Playbook/);
  assert.match(readFileSync(path.join(weeklyDir, "taxonomy.md"), "utf8"), /Taxonomy Report/);
  assert.match(readFileSync(path.join(weeklyDir, "triage.md"), "utf8"), /Decision Triage/);
  assert.match(readFileSync(path.join(weeklyDir, "calendar.md"), "utf8"), /Decision Calendar/);
  assert.match(readFileSync(path.join(weeklyDir, "calendar.ics"), "utf8"), /BEGIN:VCALENDAR/);
  assert.match(readFileSync(path.join(weeklyDir, "red-team.md"), "utf8"), /Red Team Report/);
  assert.match(readFileSync(path.join(weeklyDir, "themes.md"), "utf8"), /Theme Report/);
  assert.match(readFileSync(path.join(weeklyDir, "commitments.md"), "utf8"), /Commitment Report/);
  assert.match(readFileSync(path.join(weeklyDir, "dependencies.md"), "utf8"), /Dependency Report/);
  assert.match(readFileSync(path.join(weeklyDir, "scenarios.md"), "utf8"), /Scenario Report/);
  assert.match(readFileSync(path.join(weeklyDir, "sensitivities.md"), "utf8"), /Sensitivity Report/);
  assert.match(readFileSync(path.join(weeklyDir, "signals.md"), "utf8"), /Signal Watchlist/);
  assert.match(readFileSync(path.join(weeklyDir, "review-pack.md"), "utf8"), /Review Pack/);
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

test("cli imports evidence files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-import-evidence-test-"));
  const decisionPath = path.join(dir, "decision.json");
  const evidencePath = path.join(dir, "evidence.csv");
  const reportPath = path.join(dir, "import-report.md");
  writeFileSync(decisionPath, `${JSON.stringify(business, null, 2)}\n`);
  writeFileSync(evidencePath, "claim,source,strength\nImported pipeline claim,CRM export,strong\n");

  execFileSync("node", [
    "bin/decision-lab.js",
    "import-evidence",
    decisionPath,
    evidencePath,
    "--report",
    reportPath
  ]);

  const updated = JSON.parse(readFileSync(decisionPath, "utf8"));
  assert.equal(updated.evidence.at(-1).claim, "Imported pipeline claim");
  assert.match(readFileSync(reportPath, "utf8"), /Evidence Import Report/);
});

test("cli extracts evidence from saved web pages", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-html-evidence-test-"));
  const htmlPath = path.join(dir, "research.html");
  const outPath = path.join(dir, "evidence.json");
  writeFileSync(htmlPath, [
    "<article>",
    "<p>claim: Saved page shows expansion interest from enterprise buyers.</p>",
    "<p>source: Saved customer research page</p>",
    "<p>strength: strong</p>",
    "</article>"
  ].join(""));

  execFileSync("node", [
    "bin/decision-lab.js",
    "extract-evidence",
    htmlPath,
    "--out",
    outPath
  ]);

  const extracted = JSON.parse(readFileSync(outPath, "utf8"));
  assert.equal(extracted[0].strength, "strong");
});

test("cli extracts evidence from XLSX and PDF files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-binary-evidence-cli-test-"));
  const xlsxPath = path.join(dir, "evidence.xlsx");
  const pdfPath = path.join(dir, "evidence.pdf");
  const xlsxOutPath = path.join(dir, "xlsx-evidence.json");
  const pdfOutPath = path.join(dir, "pdf-evidence.json");
  writeFileSync(xlsxPath, createMinimalXlsx([
    ["claim", "source", "strength", "source_type"],
    ["CLI XLSX claim", "Workbook export", "strong", "spreadsheet"]
  ]));
  writeFileSync(pdfPath, createMinimalPdf([
    "claim: CLI PDF evidence supports staged rollout.",
    "source: Research PDF",
    "strength: medium",
    "source_type: pdf"
  ]));

  execFileSync("node", ["bin/decision-lab.js", "extract-evidence", xlsxPath, "--out", xlsxOutPath]);
  execFileSync("node", ["bin/decision-lab.js", "extract-evidence", pdfPath, "--out", pdfOutPath]);

  assert.equal(JSON.parse(readFileSync(xlsxOutPath, "utf8"))[0].claim, "CLI XLSX claim");
  assert.equal(JSON.parse(readFileSync(pdfOutPath, "utf8"))[0].source_type, "pdf");
});

test("cli creates private workspaces and runs privacy checks", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-private-cli-test-"));
  const workspacePath = path.join(dir, "private-decisions");
  const reportPath = path.join(dir, "privacy.md");

  assert.match(execFileSync("node", [
    "bin/decision-lab.js",
    "private-workspace",
    workspacePath,
    "--owner",
    "Private Owner"
  ], { encoding: "utf8" }), /Created private Decision Lab workspace/);
  assert.match(readFileSync(path.join(workspacePath, "README.md"), "utf8"), /Do not make this repository public/);

  assert.throws(() => execFileSync("node", [
    "bin/decision-lab.js",
    "privacy-check",
    workspacePath
  ], { encoding: "utf8" }));

  assert.match(execFileSync("node", [
    "bin/decision-lab.js",
    "privacy-check",
    workspacePath,
    "--out",
    reportPath,
    "--no-fail",
    "yes"
  ], { encoding: "utf8" }), /Wrote/);
  assert.match(readFileSync(reportPath, "utf8"), /FAIL/);
});

test("cli extracts evidence from notes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-extract-evidence-test-"));
  const notesPath = path.join(dir, "notes.md");
  const outPath = path.join(dir, "evidence.json");
  const reportPath = path.join(dir, "extract-report.md");
  writeFileSync(notesPath, [
    "# Research Notes",
    "- claim: Finance team expects payback inside two quarters.",
    "  source: CFO interview",
    "  strength: medium"
  ].join("\n"));

  execFileSync("node", [
    "bin/decision-lab.js",
    "extract-evidence",
    notesPath,
    "--out",
    outPath,
    "--report",
    reportPath
  ]);

  const extracted = JSON.parse(readFileSync(outPath, "utf8"));
  assert.equal(extracted[0].claim, "Finance team expects payback inside two quarters.");
  assert.match(readFileSync(reportPath, "utf8"), /Evidence Import Report/);
});

test("cli builds and parses patch suggestions", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-suggest-test-"));
  const responsePath = path.join(dir, "response.md");
  const patchPath = path.join(dir, "suggested.patch.json");
  const reviewPath = path.join(dir, "review.md");

  const prompt = execFileSync("node", [
    "bin/decision-lab.js",
    "suggest",
    "skeptic",
    "examples/business/enterprise_pricing_change.json"
  ], { encoding: "utf8" });
  assert.match(prompt, /Patch protocol/);

  writeFileSync(responsePath, `${JSON.stringify([
    { op: "add", path: "/open_questions/-", value: "What would invalidate the pilot?" }
  ], null, 2)}\n`);
  execFileSync("node", [
    "bin/decision-lab.js",
    "suggest",
    "skeptic",
    "examples/business/enterprise_pricing_change.json",
    "--response",
    responsePath,
    "--out",
    patchPath,
    "--review",
    reviewPath
  ]);
  assert.equal(JSON.parse(readFileSync(patchPath, "utf8"))[0].op, "add");
  assert.match(readFileSync(reviewPath, "utf8"), /Patch Review/);
});

test("cli migrates legacy records and writes a report", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-migrate-test-"));
  const decisionPath = path.join(dir, "legacy.json");
  const reportPath = path.join(dir, "migration.md");
  writeFileSync(decisionPath, `${JSON.stringify({
    schema_version: "0.1.0",
    decision_type: "investment_decision",
    question: "Should I buy AAPL now?",
    owner: "personal portfolio",
    recommendation: {
      decision: "stage entry",
      confidence: 0.52
    }
  }, null, 2)}\n`);

  execFileSync("node", [
    "bin/decision-lab.js",
    "migrate",
    decisionPath,
    "--date",
    "2026-04-29",
    "--report",
    reportPath
  ]);

  const migrated = JSON.parse(readFileSync(decisionPath, "utf8"));
  assert.equal(migrated.schema_version, "0.2.0");
  assert.equal(migrated.decision_type, "investment");
  assert.equal(validateDecision(migrated).valid, true);
  assert.match(readFileSync(reportPath, "utf8"), /Migration Report/);
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
  const reviewPackDir = path.join(mkdtempSync(path.join(tmpdir(), "decision-lab-review-pack-test-")), "reviews");
  assert.match(execFileSync("node", [
    "bin/decision-lab.js",
    "review-pack",
    "examples",
    "--as-of",
    "2026-08-01",
    "--out-dir",
    reviewPackDir
  ], { encoding: "utf8" }), /Wrote 2 review worksheet/);
  assert.match(readFileSync(path.join(reviewPackDir, "index.md"), "utf8"), /Review Pack/);
  assert.equal(readdirSync(reviewPackDir).filter((name) => name.endsWith(".md")).length, 3);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "search", "examples", "--query", "platform"], {
    encoding: "utf8"
  }), /enterprise_pricing_change/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "review", "examples/business/enterprise_pricing_change.json"], {
    encoding: "utf8"
  }), /Review Worksheet/);
});

test("cli renders portfolio-level reports", () => {
  assert.match(execFileSync("node", ["bin/decision-lab.js", "risks", "examples"], {
    encoding: "utf8"
  }), /Risk Register/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "risk-heatmap", "examples"], {
    encoding: "utf8"
  }), /Risk Heatmap/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "lessons", "examples"], {
    encoding: "utf8"
  }), /Lessons Report/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "outcomes", "examples"], {
    encoding: "utf8"
  }), /Outcome Scorecard/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "principles", "examples"], {
    encoding: "utf8"
  }), /Decision Principles/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "taxonomy", "examples"], {
    encoding: "utf8"
  }), /Taxonomy Report/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "themes", "examples"], {
    encoding: "utf8"
  }), /Theme Report/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "commitments", "examples", "--as-of", "2026-08-01"], {
    encoding: "utf8"
  }), /Commitment Report/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "dependencies", "examples"], {
    encoding: "utf8"
  }), /Dependency Report/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "assumptions", "examples"], {
    encoding: "utf8"
  }), /Assumption Register/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "assumption-tests", "examples"], {
    encoding: "utf8"
  }), /Assumption Test Queue/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "sources", "examples"], {
    encoding: "utf8"
  }), /Source Index/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "evidence-scorecard", "examples"], {
    encoding: "utf8"
  }), /Evidence Scorecard/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "signals", "examples", "--as-of", "2026-08-01"], {
    encoding: "utf8"
  }), /Signal Watchlist/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "questions", "examples"], {
    encoding: "utf8"
  }), /Question Register/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "hypotheses", "examples"], {
    encoding: "utf8"
  }), /Hypothesis Register/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "red-team", "examples"], {
    encoding: "utf8"
  }), /Red Team Report/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "scenarios", "examples"], {
    encoding: "utf8"
  }), /Scenario Report/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "sensitivities", "examples"], {
    encoding: "utf8"
  }), /Sensitivity Report/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "guardrails", "examples"], {
    encoding: "utf8"
  }), /Guardrail Report/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "owners", "examples", "--as-of", "2026-08-01"], {
    encoding: "utf8"
  }), /Owner Report/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "playbook", "examples", "--as-of", "2026-08-01"], {
    encoding: "utf8"
  }), /Operating Playbook/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "scorecard", "examples", "--as-of", "2026-08-01"], {
    encoding: "utf8"
  }), /Operating Scorecard/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "triage", "examples", "--as-of", "2026-08-01"], {
    encoding: "utf8"
  }), /Decision Triage/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "status", "examples", "--as-of", "2026-08-01"], {
    encoding: "utf8"
  }), /Repository Status/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "briefing", "examples", "--as-of", "2026-08-01"], {
    encoding: "utf8"
  }), /Portfolio Briefing/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "executive", "examples", "--as-of", "2026-08-01"], {
    encoding: "utf8"
  }), /Executive Decision Summary/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "monthly", "examples", "--as-of", "2026-08-01"], {
    encoding: "utf8"
  }), /Monthly Decision Review/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "next", "examples", "--as-of", "2026-08-01"], {
    encoding: "utf8"
  }), /Action Queue/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "prioritize", "examples", "--as-of", "2026-08-01"], {
    encoding: "utf8"
  }), /Decision Priority Review/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "calendar", "examples", "--as-of", "2026-08-01"], {
    encoding: "utf8"
  }), /Decision Calendar/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "ics", "examples", "--as-of", "2026-08-01"], {
    encoding: "utf8"
  }), /BEGIN:VCALENDAR/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "agenda", "examples", "--as-of", "2026-08-01", "--horizon", "14"], {
    encoding: "utf8"
  }), /Decision Agenda/);
  assert.match(execFileSync("node", ["bin/decision-lab.js", "timeline", "examples"], {
    encoding: "utf8"
  }), /Decision Timeline/);
});

test("cli evaluates gates and stale decisions", () => {
  assert.match(execFileSync("node", [
    "bin/decision-lab.js",
    "gate",
    "examples",
    "--min-score",
    "0.9",
    "--operational"
  ], { encoding: "utf8" }), /Result: PASS/);
  assert.match(execFileSync("node", [
    "bin/decision-lab.js",
    "stale",
    "examples",
    "--as-of",
    "2026-08-01",
    "--days",
    "30"
  ], { encoding: "utf8" }), /Stale Decisions/);
  assert.match(execFileSync("node", [
    "bin/decision-lab.js",
    "debt",
    "examples",
    "--as-of",
    "2026-08-01",
    "--days",
    "30"
  ], { encoding: "utf8" }), /Decision Debt/);
});

test("renders archive plans", () => {
  const reviewed = closeDecision(business, {
    outcome: "Pilot completed.",
    lessons: ["Document owner earlier."]
  });
  const plan = renderArchivePlan([{ filePath: "pricing.json", decision: reviewed }]);
  assert.match(plan, /Archive Plan/);
  assert.match(plan, /decisions\/archive\/business\/pricing.json/);
});

test("cli renders archive plans", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "decision-lab-archive-test-"));
  const decisionPath = path.join(dir, "reviewed.json");
  writeFileSync(decisionPath, `${JSON.stringify(closeDecision(business, {
    outcome: "Pilot completed.",
    lessons: ["Document owner earlier."]
  }), null, 2)}\n`);

  const output = execFileSync("node", [
    "bin/decision-lab.js",
    "archive-plan",
    dir,
    "--destination",
    "archive"
  ], { encoding: "utf8" });
  assert.match(output, /Archive Plan/);
  assert.match(output, /archive\/business\/reviewed.json/);
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

  assert.match(execFileSync("node", ["bin/decision-lab.js", "manifest", "examples"], {
    encoding: "utf8"
  }), /Integrity Manifest/);

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

function createMinimalXlsx(rows) {
  const sheetRows = rows.map((row, rowIndex) => (
    `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => {
      const cellRef = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
      return `<c r="${cellRef}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
    }).join("")}</row>`
  )).join("");
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/_rels/workbook.xml.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/workbook.xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Evidence" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`)
  }));
}

function createMinimalPdf(lines) {
  const textCommands = lines.map((line, index) => `${index === 0 ? "" : "0 -18 Td\n"}(${pdfEscape(line)}) Tj`).join("\n");
  const stream = `BT\n/F1 12 Tf\n72 720 Td\n${textCommands}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function pdfEscape(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}
