#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  VALID_ROLES,
  VALID_TYPES,
  auditDecision,
  buildPromptChain,
  buildRolePrompt,
  formatIssues,
  loadDecisionFile,
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
  migrateDecision,
  renderMigrationReport,
  renderLedger,
  renderOptionComparison,
  slugify,
  writeWorkflowArtifacts,
  runDecisionWorkflow
} from "../src/decision-agent.js";
import {
  buildPatchPrompt,
  createOpenAiPatchSuggestion,
  parsePatchResponse,
  renderPatchReview
} from "../src/decision-ai.js";
import {
  importEvidenceItems,
  parseEvidenceFile,
  renderEvidenceImportReport
} from "../src/decision-import.js";
import {
  renderDashboard,
  renderExport
} from "../src/decision-export.js";
import {
  startDecisionServer
} from "../src/decision-server.js";
import {
  applyJsonPatch,
  attachSourceEvidence,
  attachEvidence,
  createSourceNote,
  getDueReviewRecords,
  parseJsonish,
  renderArchivePlan,
  renderCalibration,
  renderCalendarReport,
  renderCommitmentReport,
  renderDoctor,
  renderDueReviews,
  renderActionQueue,
  renderDecisionAgenda,
  renderDecisionChecklist,
  renderDecisionDebt,
  renderDependencyReport,
  renderDecisionDiff,
  renderDecisionGraph,
  renderAssumptionReport,
  renderAssumptionTestQueue,
  evaluateGate,
  renderEvidenceScorecard,
  renderExecutiveSummary,
  renderGateReport,
  renderGuardrailReport,
  renderHypothesisRegister,
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
  renderReviewWorksheet,
  renderReviewPackIndex,
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
  promoteDecision,
  setJsonPath,
  summarizeDecisionHealth
} from "../src/decision-tools.js";
import { createTemplate } from "../src/templates.js";

const [, , command, ...args] = process.argv;

const DEFAULT_CONFIG = {
  schema_version: "0.1.0",
  default_owner: "decision owner",
  directories: {
    drafts: "decisions/drafts",
    active: "decisions/active",
    reviewed: "decisions/reviewed",
    snapshots: "decisions/snapshots",
    outputs: "outputs",
    sources: "research/sources"
  },
  quality_gate: {
    min_score: 0.75,
    require_operational: false
  },
  stale_after_days: 30
};

function printHelp() {
  console.log(`Decision Lab

Usage:
  decision-lab init [directory]
  decision-lab config [--out .decision-lab.json]
  decision-lab catalog [--out report.md]
  decision-lab ask [question...] [--type type] [--owner name] [--out file.json]
  decision-lab inbox <questions.txt> [--type type] [--owner name] [--out-dir decisions/drafts]
  decision-lab run <file.json> [--out-dir directory]
  decision-lab pipeline [question...] [--type type] [--owner name] [--slug name] [--out-dir directory]
  decision-lab new <general|investment|business|finance> [--out file.json]
  decision-lab validate <file.json>
  decision-lab score <file.json>
  decision-lab audit <file.json>
  decision-lab health <file.json>
  decision-lab checklist <file.json> [--out checklist.md]
  decision-lab compare <file.json>
  decision-lab diff <before.json> <after.json> [--out diff.md]
  decision-lab graph <file.json> [--out graph.md]
  decision-lab premortem <file.json> [--out premortem.md]
  decision-lab research-plan <file.json> [--out research-plan.md]
  decision-lab evidence <file.json> --claim text --source text [--strength weak|medium|strong] [--out file.json]
  decision-lab extract-evidence <evidence.csv|evidence.json|notes.md|notes.txt> [--out evidence.json] [--report report.md]
  decision-lab import-evidence <file.json> <evidence.csv|evidence.json|notes.md|notes.txt> [--out file.json] [--report report.md]
  decision-lab source <source-file> [--title text] [--kind text] [--out source.md]
  decision-lab source-evidence <file.json> <source-file> --claim text [--strength weak|medium|strong] [--out file.json]
  decision-lab patch <file.json> <patch.json> [--out file.json]
  decision-lab set <file.json> <path> <json-value> [--out file.json]
  decision-lab suggest <role> <file.json> [--prompt-out prompt.md] [--response llm-output.txt] [--out patch.json] [--review review.md]
  decision-lab ai-suggest <role> <file.json> [--model gpt-5.2] [--base-url url] [--out patch.json] [--review review.md] [--raw raw.json]
  decision-lab migrate <file.json> [--out file.json] [--report report.md]
  decision-lab snapshot <file.json> [--out-dir decisions/snapshots] [--label text]
  decision-lab render <file.json> [--out memo.md]
  decision-lab brief <file.json> [--out brief.md]
  decision-lab review-plan <file.json> [--out review.md]
  decision-lab ledger [directory] [--out ledger.md]
  decision-lab status [directory] [--as-of YYYY-MM-DD] [--out status.md]
  decision-lab dashboard [directory] [--out dashboard.html]
  decision-lab serve [directory] [--host 127.0.0.1] [--port 8787] [--as-of YYYY-MM-DD]
  decision-lab export [directory] [--format json|csv] [--out file]
  decision-lab manifest [directory] [--out manifest.md]
  decision-lab calibration [directory] [--out report.md]
  decision-lab taxonomy [directory] [--out report.md]
  decision-lab outcomes [directory] [--out report.md]
  decision-lab principles [directory] [--out report.md]
  decision-lab themes [directory] [--out report.md]
  decision-lab commitments [directory] [--as-of YYYY-MM-DD] [--horizon 14] [--out report.md]
  decision-lab dependencies [directory] [--out report.md]
  decision-lab lessons [directory] [--out report.md]
  decision-lab risks [directory] [--out report.md]
  decision-lab risk-heatmap [directory] [--out report.md]
  decision-lab assumptions [directory] [--out report.md]
  decision-lab assumption-tests [directory] [--out report.md]
  decision-lab sources [directory] [--out report.md]
  decision-lab evidence-scorecard [directory] [--out report.md]
  decision-lab signals [directory] [--as-of YYYY-MM-DD] [--out report.md]
  decision-lab questions [directory] [--out report.md]
  decision-lab hypotheses [directory] [--out report.md]
  decision-lab red-team [directory] [--out report.md]
  decision-lab scenarios [directory] [--out report.md]
  decision-lab sensitivities [directory] [--out report.md]
  decision-lab guardrails [directory] [--out report.md]
  decision-lab owners [directory] [--as-of YYYY-MM-DD] [--out report.md]
  decision-lab briefing [directory] [--as-of YYYY-MM-DD] [--out report.md]
  decision-lab executive [directory] [--as-of YYYY-MM-DD] [--days 30] [--out report.md]
  decision-lab playbook [directory] [--as-of YYYY-MM-DD] [--days 30] [--out report.md]
  decision-lab scorecard [directory] [--as-of YYYY-MM-DD] [--days 30] [--out report.md]
  decision-lab triage [directory] [--as-of YYYY-MM-DD] [--days 30] [--out report.md]
  decision-lab monthly [directory] [--as-of YYYY-MM-DD] [--out report.md]
  decision-lab next [directory] [--as-of YYYY-MM-DD] [--out report.md]
  decision-lab prioritize [directory] [--as-of YYYY-MM-DD] [--out report.md]
  decision-lab calendar [directory] [--as-of YYYY-MM-DD] [--horizon 30] [--out report.md]
  decision-lab agenda [directory] [--as-of YYYY-MM-DD] [--horizon 7] [--days 30] [--out report.md]
  decision-lab timeline [directory] [--out report.md]
  decision-lab pack [directory] [--as-of YYYY-MM-DD] [--out-dir outputs/packs/YYYY-MM-DD]
  decision-lab weekly [directory] [--as-of YYYY-MM-DD] [--out-dir outputs/weekly/YYYY-MM-DD]
  decision-lab due [directory] [--as-of YYYY-MM-DD] [--out report.md]
  decision-lab review-pack [directory] [--as-of YYYY-MM-DD] [--out-dir outputs/reviews/YYYY-MM-DD]
  decision-lab search [directory] --query text [--out report.md]
  decision-lab doctor [directory] [--out report.md]
  decision-lab gate [directory] [--min-score 0.75] [--operational] [--out report.md]
  decision-lab stale [directory] [--days 30] [--as-of YYYY-MM-DD] [--out report.md]
  decision-lab debt [directory] [--days 30] [--as-of YYYY-MM-DD] [--out report.md]
  decision-lab archive-plan [directory] [--destination decisions/archive] [--out report.md]
  decision-lab promote <file.json> <draft|researching|decided|reviewed> [--out file.json]
  decision-lab review <file.json> [--out worksheet.md]
  decision-lab close <file.json> --outcome text [--lesson text] [--out file.json]
  decision-lab prompt <analyst|skeptic|cfo|ceo|operator|risk|recorder|all> <file.json> [--out file.md|--out-dir prompts]
  decision-lab list-types
  decision-lab list-prompts
`);
}

function readFlag(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  if (!argv[index + 1]) throw new Error(`${flag} requires a value`);
  return argv[index + 1];
}

function readRestQuestion(argv) {
  const chunks = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) {
      index += 1;
      continue;
    }
    chunks.push(argv[index]);
  }
  return chunks.join(" ").trim();
}

function writeOrPrint(text, outPath) {
  if (!outPath) {
    console.log(text);
    return;
  }
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, text);
  console.log(`Wrote ${outPath}`);
}

function writePromptSet(items, outDir) {
  fs.mkdirSync(path.resolve(outDir), { recursive: true });
  for (const item of items) {
    const filePath = path.join(outDir, `${item.role}.md`);
    fs.writeFileSync(filePath, item.prompt);
    console.log(`Wrote ${filePath}`);
  }
}

function requireFile(filePath) {
  if (!filePath) throw new Error("Missing file path");
  return loadDecisionFile(filePath);
}

function writeDecisionUpdate(filePath, decision, outPath) {
  writeOrPrint(`${JSON.stringify(decision, null, 2)}\n`, outPath || filePath);
}

function positional(argv) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) {
      index += 1;
      continue;
    }
    values.push(argv[index]);
  }
  return values;
}

function readDecisionFiles(root) {
  const files = walk(root).filter((filePath) => filePath.endsWith(".json"));
  const records = [];
  for (const filePath of files) {
    try {
      const decision = loadDecisionFile(filePath);
      if (decision && typeof decision === "object" && decision.decision_type) {
        records.push({ filePath, decision });
      }
    } catch {
      // Ignore non-decision JSON files in the ledger scan.
    }
  }
  return records;
}

function walk(root) {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function initWorkspace(directory = ".") {
  const root = path.resolve(directory);
  const folders = [
    "decisions/drafts",
    "decisions/active",
    "decisions/reviewed",
    "decisions/snapshots",
    "outputs/memos",
    "outputs/briefs",
    "outputs/prompts",
    "research/sources",
    "research/models"
  ];
  for (const folder of folders) {
    const fullPath = path.join(root, folder);
    fs.mkdirSync(fullPath, { recursive: true });
    fs.writeFileSync(path.join(fullPath, ".gitkeep"), "");
  }
  const configPath = path.join(root, ".decision-lab.json");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  }
  console.log(`Initialized Decision Lab workspace in ${root}`);
}

function loadWorkspaceConfig(root = ".") {
  const configPath = path.join(path.resolve(root), ".decision-lab.json");
  if (!fs.existsSync(configPath)) return structuredClone(DEFAULT_CONFIG);
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return {
    ...structuredClone(DEFAULT_CONFIG),
    ...raw,
    directories: {
      ...DEFAULT_CONFIG.directories,
      ...(raw.directories || {})
    },
    quality_gate: {
      ...DEFAULT_CONFIG.quality_gate,
      ...(raw.quality_gate || {})
    }
  };
}

function writeOperatingPack(records, { outDir, asOf, root = "." }) {
  fs.mkdirSync(outDir, { recursive: true });
  const artifacts = {
    "ledger.md": renderLedger(records),
    "status.md": renderRepositoryStatus(records, { asOf }),
    "debt.md": renderDecisionDebt(records, { asOf }),
    "dashboard.html": renderDashboard(records),
    "decisions.csv": renderExport(records, "csv"),
    "decisions.json": renderExport(records, "json"),
    "manifest.md": renderIntegrityManifest(records),
    "taxonomy.md": renderTaxonomyReport(records),
    "calibration.md": renderCalibration(records),
    "outcomes.md": renderOutcomeScorecard(records),
    "principles.md": renderPrinciplesReport(records),
    "lessons.md": renderLessonsReport(records),
    "due.md": renderDueReviews(records, asOf),
    "review-pack.md": renderReviewPackIndex(records, asOf),
    "risks.md": renderRiskRegister(records),
    "risk-heatmap.md": renderRiskHeatmap(records),
    "assumptions.md": renderAssumptionReport(records),
    "assumption-tests.md": renderAssumptionTestQueue(records),
    "sources.md": renderSourceIndex(records),
    "evidence-scorecard.md": renderEvidenceScorecard(records),
    "signals.md": renderSignalWatchlist(records, { asOf }),
    "questions.md": renderQuestionRegister(records),
    "hypotheses.md": renderHypothesisRegister(records),
    "themes.md": renderThemeReport(records),
    "commitments.md": renderCommitmentReport(records, { asOf }),
    "dependencies.md": renderDependencyReport(records),
    "red-team.md": renderRedTeamReport(records),
    "scenarios.md": renderScenarioReport(records),
    "sensitivities.md": renderSensitivityReport(records),
    "guardrails.md": renderGuardrailReport(records),
    "playbook.md": renderOperatingPlaybook(records, { asOf }),
    "scorecard.md": renderOperatingScorecard(records, { asOf }),
    "triage.md": renderTriageReport(records, { asOf }),
    "owners.md": renderOwnerReport(records, asOf),
    "briefing.md": renderPortfolioBriefing(records, asOf),
    "monthly.md": renderMonthlyReview(records, asOf),
    "next.md": renderActionQueue(records, asOf),
    "priorities.md": renderPriorityReview(records, asOf),
    "calendar.md": renderCalendarReport(records, { asOf }),
    "agenda.md": renderDecisionAgenda(records, { asOf }),
    "executive.md": renderExecutiveSummary(records, { asOf }),
    "timeline.md": renderTimeline(records),
    "doctor.md": renderDoctor({ root, examples: readDecisionFiles(path.join(root, "examples")) })
  };
  artifacts["index.md"] = renderPackIndex("Operating Pack", artifacts, { asOf });
  for (const [name, content] of Object.entries(artifacts)) {
    fs.writeFileSync(path.join(outDir, name), content);
  }
}

function writeWeeklyPack(records, { outDir, asOf }) {
  fs.mkdirSync(outDir, { recursive: true });
  const artifacts = {
    "agenda.md": renderDecisionAgenda(records, { asOf }),
    "executive.md": renderExecutiveSummary(records, { asOf }),
    "playbook.md": renderOperatingPlaybook(records, { asOf }),
    "scorecard.md": renderOperatingScorecard(records, { asOf }),
    "taxonomy.md": renderTaxonomyReport(records),
    "triage.md": renderTriageReport(records, { asOf }),
    "calendar.md": renderCalendarReport(records, { asOf }),
    "debt.md": renderDecisionDebt(records, { asOf }),
    "questions.md": renderQuestionRegister(records),
    "hypotheses.md": renderHypothesisRegister(records),
    "themes.md": renderThemeReport(records),
    "commitments.md": renderCommitmentReport(records, { asOf }),
    "dependencies.md": renderDependencyReport(records),
    "red-team.md": renderRedTeamReport(records),
    "scenarios.md": renderScenarioReport(records),
    "sensitivities.md": renderSensitivityReport(records),
    "signals.md": renderSignalWatchlist(records, { asOf }),
    "evidence-scorecard.md": renderEvidenceScorecard(records),
    "assumption-tests.md": renderAssumptionTestQueue(records),
    "risk-heatmap.md": renderRiskHeatmap(records),
    "review-pack.md": renderReviewPackIndex(records, asOf)
  };
  artifacts["index.md"] = renderPackIndex("Weekly Pack", artifacts, { asOf });
  for (const [name, content] of Object.entries(artifacts)) {
    fs.writeFileSync(path.join(outDir, name), content);
  }
}

function renderPackIndex(title, artifacts, { asOf }) {
  const names = Object.keys(artifacts).sort((a, b) => artifactRank(a) - artifactRank(b) || a.localeCompare(b));
  return [
    `# ${title} Index`,
    "",
    `As of: ${asOf}`,
    `Artifacts: ${names.length}`,
    "",
    "## Start Here",
    "- Read `executive.md` for the one-page operating summary.",
    "- Read `playbook.md` for the next command sequence.",
    "- Read `triage.md` and `agenda.md` to decide what moves this week.",
    "",
    "## Artifacts",
    table(["File", "Purpose"], names.map((name) => [name, artifactPurpose(name)]))
  ].join("\n") + "\n";
}

function artifactRank(name) {
  const order = [
    "executive.md",
    "playbook.md",
    "scorecard.md",
    "taxonomy.md",
    "triage.md",
    "agenda.md",
    "calendar.md",
    "commitments.md",
    "dependencies.md",
    "debt.md"
  ];
  const index = order.indexOf(name);
  return index === -1 ? 100 : index;
}

function artifactPurpose(name) {
  return {
    "executive.md": "One-page health, priorities, risks, and next moves.",
    "playbook.md": "Recommended command sequence from current portfolio state.",
    "scorecard.md": "Portfolio quality, debt, evidence, review, and ownership metrics.",
    "triage.md": "Operating lane for each decision.",
    "agenda.md": "Near-term priorities, reviews, debt, and actions.",
    "debt.md": "Invalid, weak, overdue, stale, ownerless, or under-evidenced records.",
    "review-pack.md": "Due-review index or worksheet plan.",
    "red-team.md": "Counterarguments, disconfirming signals, downside cases, and high-impact risks.",
    "outcomes.md": "Reviewed outcomes, completeness, lessons, and calibration cues.",
    "principles.md": "Reusable judgment principles and anti-patterns.",
    "themes.md": "Recurring themes across hypotheses, assumptions, risks, evidence, questions, and lessons.",
    "commitments.md": "Owners, due dates, reviews, next actions, kill criteria, and success metrics.",
    "dependencies.md": "Execution dependencies, open questions, weak evidence, assumption tests, and risk blockers.",
    "calendar.md": "Dated deadlines, reviews, actions, kill checks, and success metric checks.",
    "dashboard.html": "Local HTML dashboard.",
    "decisions.csv": "CSV export of decision rows.",
    "decisions.json": "JSON export of decision rows.",
    "taxonomy.md": "Portfolio classification by type, status, class, reversibility, urgency, and owner.",
    "assumption-tests.md": "Assumptions converted into owner/test queues.",
    "assumptions.md": "Assumption register across decisions.",
    "briefing.md": "Portfolio snapshot, top priorities, risks, and due reviews.",
    "calibration.md": "Reviewed decisions by type and confidence bucket.",
    "doctor.md": "Repository wiring and example-validity checks.",
    "due.md": "Reviews currently due.",
    "evidence-scorecard.md": "Evidence strength, source coverage, and upgrade queue.",
    "guardrails.md": "Constraints, non-goals, kill criteria, success metrics, and failure signals.",
    "hypotheses.md": "Hypotheses, evidence, counterarguments, confidence, and disconfirming signals.",
    "ledger.md": "Portfolio ledger of decision records.",
    "lessons.md": "Captured outcomes, lessons, and recurring themes.",
    "manifest.md": "Validity and SHA256 hashes for records.",
    "monthly.md": "Monthly review snapshot with weak records and themes.",
    "next.md": "Action queue from explicit actions, quality follow-ups, and reviews.",
    "owners.md": "Active records, due reviews, and actions by owner.",
    "priorities.md": "Ranked priority review for the portfolio.",
    "questions.md": "Open questions, change-my-mind conditions, and evidence upgrades.",
    "risk-heatmap.md": "Probability/impact concentration for risks.",
    "risks.md": "Risk register with triggers and mitigations.",
    "scenarios.md": "Base, upside, and downside scenario matrix.",
    "sensitivities.md": "Drivers, sensitivity checks, valuation ranges, and guardrails.",
    "signals.md": "Expected, failure, disconfirming, and trigger signals.",
    "sources.md": "Evidence source index.",
    "status.md": "Repository health, weak records, due reviews, and status/type counts.",
    "timeline.md": "Created, updated, deadline, and review events."
  }[name] || "Generated operating artifact.";
}

function writeReviewPack(records, { outDir, asOf }) {
  fs.mkdirSync(outDir, { recursive: true });
  const due = getDueReviewRecords(records, asOf);
  fs.writeFileSync(path.join(outDir, "index.md"), renderReviewPackIndex(records, asOf));
  const usedNames = new Set(["index.md"]);
  for (const item of due) {
    const baseName = `${slugify(item.decision.title || path.basename(item.filePath, ".json"))}.md`;
    const fileName = uniqueFileName(baseName, usedNames);
    fs.writeFileSync(path.join(outDir, fileName), renderReviewWorksheet(item.decision));
  }
  return due.length;
}

function uniqueFileName(fileName, usedNames) {
  if (!usedNames.has(fileName)) {
    usedNames.add(fileName);
    return fileName;
  }
  const extension = path.extname(fileName);
  const base = path.basename(fileName, extension);
  let counter = 2;
  while (usedNames.has(`${base}-${counter}${extension}`)) counter += 1;
  const next = `${base}-${counter}${extension}`;
  usedNames.add(next);
  return next;
}

function renderCompare(decision) {
  return renderOptionComparison(decision);
}

function writeSnapshot(filePath, decision, { outDir, label, date }) {
  const suffix = label ? `-${slugify(label)}` : "";
  const name = `${date}-${slugify(decision.title || path.basename(filePath, ".json"))}${suffix}.json`;
  const snapshotPath = path.join(outDir, name);
  fs.mkdirSync(path.resolve(outDir), { recursive: true });
  fs.writeFileSync(snapshotPath, `${JSON.stringify(decision, null, 2)}\n`);
  return snapshotPath;
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

try {
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "init") {
    initWorkspace(args[0] || ".");
    process.exit(0);
  }

  if (command === "config") {
    writeOrPrint(`${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "catalog") {
    writeOrPrint(renderReportCatalog(), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "ask") {
    const config = loadWorkspaceConfig();
    const question = readFlag(args, "--question") || readRestQuestion(args);
    const decision = createDecisionFromQuestion(question, {
      type: readFlag(args, "--type") || null,
      owner: readFlag(args, "--owner") || config.default_owner
    });
    writeOrPrint(`${JSON.stringify(decision, null, 2)}\n`, readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "inbox") {
    const config = loadWorkspaceConfig();
    const inboxPath = args[0];
    if (!inboxPath) throw new Error("Usage: decision-lab inbox <questions.txt>");
    const outDir = readFlag(args, "--out-dir") || config.directories.drafts;
    const items = createDecisionsFromInbox(fs.readFileSync(path.resolve(inboxPath), "utf8"), {
      type: readFlag(args, "--type") || null,
      owner: readFlag(args, "--owner") || config.default_owner
    });
    for (const item of items) {
      const root = path.join(outDir, item.slug);
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, "decision.json"), `${JSON.stringify(item.decision, null, 2)}\n`);
    }
    console.log(`Wrote ${items.length} decision draft(s) to ${outDir}`);
    process.exit(0);
  }

  if (command === "run") {
    const filePath = args[0];
    const decision = requireFile(filePath);
    const slug = slugify(decision.title || path.basename(filePath, ".json"));
    const outDir = readFlag(args, "--out-dir") || path.join("outputs", "runs", slug);
    const workflow = runDecisionWorkflow(decision);
    writeWorkflowArtifacts(outDir, workflow);
    console.log(`Wrote workflow artifacts to ${outDir}`);
    process.exit(workflow.validation.valid ? 0 : 1);
  }

  if (command === "pipeline") {
    const config = loadWorkspaceConfig();
    const question = readFlag(args, "--question") || readRestQuestion(args);
    const decision = createDecisionFromQuestion(question, {
      type: readFlag(args, "--type") || null,
      owner: readFlag(args, "--owner") || config.default_owner
    });
    const slug = readFlag(args, "--slug") || slugify(decision.title);
    const root = readFlag(args, "--out-dir") || path.join(config.directories.drafts, slug);
    fs.mkdirSync(root, { recursive: true });
    const recordPath = path.join(root, "decision.json");
    fs.writeFileSync(recordPath, `${JSON.stringify(decision, null, 2)}\n`);
    writeWorkflowArtifacts(path.join(root, "run"), runDecisionWorkflow(decision));
    console.log(`Wrote decision pipeline to ${root}`);
    process.exit(0);
  }

  if (command === "new") {
    const type = args[0] ?? "general";
    writeOrPrint(`${JSON.stringify(createTemplate(type), null, 2)}\n`, readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "migrate") {
    const filePath = args[0];
    if (!filePath) throw new Error("Usage: decision-lab migrate <file.json>");
    const before = requireFile(filePath);
    const migrated = migrateDecision(before, {
      now: readFlag(args, "--date") || null
    });
    writeDecisionUpdate(filePath, migrated, readFlag(args, "--out"));
    const reportPath = readFlag(args, "--report");
    if (reportPath) writeOrPrint(renderMigrationReport(before, migrated), reportPath);
    process.exit(validateDecision(migrated).valid ? 0 : 1);
  }

  if (command === "snapshot") {
    const config = loadWorkspaceConfig();
    const filePath = args[0];
    if (!filePath) throw new Error("Usage: decision-lab snapshot <file.json>");
    const decision = requireFile(filePath);
    const snapshotPath = writeSnapshot(filePath, decision, {
      outDir: readFlag(args, "--out-dir") || config.directories.snapshots,
      label: readFlag(args, "--label") || "",
      date: readFlag(args, "--date") || new Date().toISOString().slice(0, 10)
    });
    console.log(`Wrote ${snapshotPath}`);
    process.exit(0);
  }

  if (command === "validate") {
    const decision = requireFile(args[0]);
    const result = validateDecision(decision);
    if (result.valid) {
      console.log("OK: decision file is valid.");
      process.exit(0);
    }
    console.error(formatIssues(result.issues));
    process.exit(1);
  }

  if (command === "score") {
    const decision = requireFile(args[0]);
    const validation = validateDecision(decision);
    const score = scoreDecision(decision);
    console.log(JSON.stringify({ validation, score }, null, 2));
    process.exit(validation.valid ? 0 : 1);
  }

  if (command === "audit") {
    const decision = requireFile(args[0]);
    const audit = auditDecision(decision);
    console.log(JSON.stringify(audit, null, 2));
    process.exit(audit.validation.valid ? 0 : 1);
  }

  if (command === "health") {
    console.log(JSON.stringify(summarizeDecisionHealth(requireFile(args[0])), null, 2));
    process.exit(0);
  }

  if (command === "checklist") {
    writeOrPrint(renderDecisionChecklist(requireFile(args[0])), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "compare") {
    writeOrPrint(renderCompare(requireFile(args[0])), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "diff") {
    const [beforePath, afterPath] = positional(args);
    if (!beforePath || !afterPath) throw new Error("Usage: decision-lab diff <before.json> <after.json>");
    writeOrPrint(renderDecisionDiff(requireFile(beforePath), requireFile(afterPath)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "graph") {
    writeOrPrint(renderDecisionGraph(requireFile(args[0])), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "premortem") {
    writeOrPrint(renderPremortem(requireFile(args[0])), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "research-plan") {
    writeOrPrint(renderResearchPlan(requireFile(args[0])), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "evidence") {
    const filePath = args[0];
    const decision = requireFile(filePath);
    const next = attachEvidence(decision, {
      claim: readFlag(args, "--claim"),
      source: readFlag(args, "--source"),
      strength: readFlag(args, "--strength") || "medium",
      source_type: readFlag(args, "--source-type") || "",
      recency: readFlag(args, "--recency") || "",
      notes: readFlag(args, "--notes") || ""
    }, {
      hypothesisId: readFlag(args, "--hypothesis"),
      now: readFlag(args, "--date") || null
    });
    writeDecisionUpdate(filePath, next, readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "import-evidence") {
    const [filePath, evidencePath] = positional(args);
    if (!filePath || !evidencePath) {
      throw new Error("Usage: decision-lab import-evidence <file.json> <evidence.csv|evidence.json|notes.md|notes.txt>");
    }
    const items = parseEvidenceFile(evidencePath);
    writeDecisionUpdate(filePath, importEvidenceItems(requireFile(filePath), items, {
      now: readFlag(args, "--date") || null
    }), readFlag(args, "--out"));
    const reportPath = readFlag(args, "--report");
    if (reportPath) writeOrPrint(renderEvidenceImportReport(items, { sourcePath: evidencePath }), reportPath);
    process.exit(0);
  }

  if (command === "extract-evidence") {
    const evidencePath = args[0];
    if (!evidencePath) {
      throw new Error("Usage: decision-lab extract-evidence <evidence.csv|evidence.json|notes.md|notes.txt>");
    }
    const items = parseEvidenceFile(evidencePath);
    writeOrPrint(`${JSON.stringify(items, null, 2)}\n`, readFlag(args, "--out"));
    const reportPath = readFlag(args, "--report");
    if (reportPath) writeOrPrint(renderEvidenceImportReport(items, { sourcePath: evidencePath }), reportPath);
    process.exit(0);
  }

  if (command === "source") {
    const sourcePath = args[0];
    if (!sourcePath) throw new Error("Usage: decision-lab source <source-file>");
    const content = fs.readFileSync(path.resolve(sourcePath), "utf8");
    const title = readFlag(args, "--title") || path.basename(sourcePath);
    const sourceNote = createSourceNote({
      title,
      kind: readFlag(args, "--kind") || "note",
      sourcePath,
      content,
      tags: readFlag(args, "--tags") || "",
      notes: readFlag(args, "--notes") || "",
      date: readFlag(args, "--date") || null
    });
    const outPath = readFlag(args, "--out") || path.join("research", "sources", `${slugify(title)}.md`);
    writeOrPrint(sourceNote, outPath);
    process.exit(0);
  }

  if (command === "source-evidence") {
    const [filePath, sourcePath] = positional(args);
    if (!filePath || !sourcePath) {
      throw new Error("Usage: decision-lab source-evidence <file.json> <source-file> --claim text");
    }
    const next = attachSourceEvidence(requireFile(filePath), sourcePath, {
      claim: readFlag(args, "--claim"),
      strength: readFlag(args, "--strength") || "medium",
      source_type: readFlag(args, "--source-type") || "source note",
      recency: readFlag(args, "--recency") || "",
      notes: readFlag(args, "--notes") || ""
    }, {
      hypothesisId: readFlag(args, "--hypothesis"),
      now: readFlag(args, "--date") || null
    });
    writeDecisionUpdate(filePath, next, readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "patch") {
    const filePath = args[0];
    const patchPath = args[1];
    if (!patchPath) throw new Error("Usage: decision-lab patch <file.json> <patch.json>");
    const decision = requireFile(filePath);
    const patch = JSON.parse(fs.readFileSync(path.resolve(patchPath), "utf8"));
    writeDecisionUpdate(filePath, applyJsonPatch(decision, patch), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "set") {
    const filePath = args[0];
    const dottedPath = args[1];
    const rawValue = args[2];
    if (!filePath || !dottedPath || rawValue === undefined) {
      throw new Error("Usage: decision-lab set <file.json> <path> <json-value>");
    }
    writeDecisionUpdate(filePath, setJsonPath(requireFile(filePath), dottedPath, parseJsonish(rawValue)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "suggest") {
    const role = args[0];
    const filePath = args[1];
    if (!role || !filePath) throw new Error("Usage: decision-lab suggest <role> <file.json>");
    const prompt = buildPatchPrompt(role, requireFile(filePath));
    const promptOut = readFlag(args, "--prompt-out");
    if (promptOut) writeOrPrint(prompt, promptOut);

    const responsePath = readFlag(args, "--response");
    if (!responsePath) {
      if (!promptOut) writeOrPrint(prompt, null);
      process.exit(0);
    }

    const patch = parsePatchResponse(fs.readFileSync(path.resolve(responsePath), "utf8"));
    writeOrPrint(`${JSON.stringify(patch, null, 2)}\n`, readFlag(args, "--out"));
    const reviewPath = readFlag(args, "--review");
    if (reviewPath) writeOrPrint(renderPatchReview(patch), reviewPath);
    process.exit(0);
  }

  if (command === "ai-suggest") {
    const role = args[0];
    const filePath = args[1];
    if (!role || !filePath) throw new Error("Usage: decision-lab ai-suggest <role> <file.json>");
    const result = await createOpenAiPatchSuggestion(requireFile(filePath), {
      role,
      model: readFlag(args, "--model") || undefined,
      baseUrl: readFlag(args, "--base-url") || undefined
    });
    writeOrPrint(`${JSON.stringify(result.patch, null, 2)}\n`, readFlag(args, "--out"));
    const reviewPath = readFlag(args, "--review");
    if (reviewPath) writeOrPrint(renderPatchReview(result.patch), reviewPath);
    const rawPath = readFlag(args, "--raw");
    if (rawPath) writeOrPrint(`${JSON.stringify(result.raw, null, 2)}\n`, rawPath);
    process.exit(0);
  }

  if (command === "render") {
    const decision = requireFile(args[0]);
    const validation = validateDecision(decision);
    if (!validation.valid) {
      console.error(formatIssues(validation.issues));
      process.exit(1);
    }
    writeOrPrint(renderDecisionMemo(decision), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "brief") {
    writeOrPrint(renderDecisionBrief(requireFile(args[0])), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "review-plan") {
    writeOrPrint(renderReviewPlan(requireFile(args[0])), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "ledger") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderLedger(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "status") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderRepositoryStatus(readDecisionFiles(root), {
      asOf: readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10)
    }), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "dashboard") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderDashboard(readDecisionFiles(root)), readFlag(args, "--out") || "outputs/dashboard.html");
    process.exit(0);
  }

  if (command === "serve") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    const { url } = startDecisionServer({
      root,
      host: readFlag(args, "--host") || "127.0.0.1",
      port: Number(readFlag(args, "--port") || 8787),
      asOf: readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10)
    });
    console.log(`Decision Lab running at ${url}`);
  }

  if (command === "export") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderExport(readDecisionFiles(root), readFlag(args, "--format") || "json"), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "manifest") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderIntegrityManifest(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "calibration") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderCalibration(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "taxonomy") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderTaxonomyReport(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "outcomes") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderOutcomeScorecard(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "principles") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderPrinciplesReport(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "themes") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderThemeReport(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "commitments") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderCommitmentReport(readDecisionFiles(root), {
      asOf: readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10),
      horizonDays: Number(readFlag(args, "--horizon") || 14)
    }), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "dependencies") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderDependencyReport(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "lessons") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderLessonsReport(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "risks") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderRiskRegister(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "risk-heatmap") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderRiskHeatmap(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "assumptions") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderAssumptionReport(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "assumption-tests") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderAssumptionTestQueue(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "sources") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderSourceIndex(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "evidence-scorecard") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderEvidenceScorecard(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "signals") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderSignalWatchlist(readDecisionFiles(root), {
      asOf: readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10)
    }), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "questions") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderQuestionRegister(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "hypotheses") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderHypothesisRegister(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "red-team") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderRedTeamReport(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "scenarios") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderScenarioReport(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "sensitivities") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderSensitivityReport(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "guardrails") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderGuardrailReport(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "owners") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderOwnerReport(readDecisionFiles(root), readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "briefing") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderPortfolioBriefing(readDecisionFiles(root), readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "executive") {
    const config = loadWorkspaceConfig();
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderExecutiveSummary(readDecisionFiles(root), {
      asOf: readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10),
      staleDays: Number(readFlag(args, "--days") || config.stale_after_days)
    }), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "playbook") {
    const config = loadWorkspaceConfig();
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderOperatingPlaybook(readDecisionFiles(root), {
      asOf: readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10),
      staleDays: Number(readFlag(args, "--days") || config.stale_after_days),
      root
    }), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "scorecard") {
    const config = loadWorkspaceConfig();
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderOperatingScorecard(readDecisionFiles(root), {
      asOf: readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10),
      staleDays: Number(readFlag(args, "--days") || config.stale_after_days)
    }), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "triage") {
    const config = loadWorkspaceConfig();
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderTriageReport(readDecisionFiles(root), {
      asOf: readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10),
      staleDays: Number(readFlag(args, "--days") || config.stale_after_days)
    }), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "monthly") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderMonthlyReview(readDecisionFiles(root), readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "next") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderActionQueue(readDecisionFiles(root), readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "prioritize") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderPriorityReview(readDecisionFiles(root), readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "calendar") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderCalendarReport(readDecisionFiles(root), {
      asOf: readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10),
      horizonDays: Number(readFlag(args, "--horizon") || 30)
    }), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "agenda") {
    const config = loadWorkspaceConfig();
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderDecisionAgenda(readDecisionFiles(root), {
      asOf: readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10),
      horizonDays: Number(readFlag(args, "--horizon") || 7),
      staleDays: Number(readFlag(args, "--days") || config.stale_after_days)
    }), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "timeline") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderTimeline(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "pack") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    const asOf = readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10);
    const outDir = readFlag(args, "--out-dir") || path.join("outputs", "packs", asOf);
    writeOperatingPack(readDecisionFiles(root), { outDir, asOf, root: "." });
    console.log(`Wrote operating pack to ${outDir}`);
    process.exit(0);
  }

  if (command === "weekly") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    const asOf = readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10);
    const outDir = readFlag(args, "--out-dir") || path.join("outputs", "weekly", asOf);
    writeWeeklyPack(readDecisionFiles(root), { outDir, asOf });
    console.log(`Wrote weekly pack to ${outDir}`);
    process.exit(0);
  }

  if (command === "due") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderDueReviews(readDecisionFiles(root), readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "review-pack") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    const asOf = readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10);
    const outDir = readFlag(args, "--out-dir") || path.join("outputs", "reviews", asOf);
    const count = writeReviewPack(readDecisionFiles(root), { outDir, asOf });
    console.log(`Wrote ${count} review worksheet(s) to ${outDir}`);
    process.exit(0);
  }

  if (command === "search") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderSearchResults(readDecisionFiles(root), readFlag(args, "--query") || ""), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "doctor") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : ".";
    const examples = readDecisionFiles(path.join(root, "examples"));
    writeOrPrint(renderDoctor({ root, examples }), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "gate") {
    const config = loadWorkspaceConfig();
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    const minScore = Number(readFlag(args, "--min-score") || config.quality_gate.min_score);
    const requireOperational = args.includes("--operational") || Boolean(config.quality_gate.require_operational);
    const records = readDecisionFiles(root);
    const report = renderGateReport(records, { minScore, requireOperational });
    writeOrPrint(report, readFlag(args, "--out"));
    process.exit(evaluateGate(records, { minScore, requireOperational }).passed ? 0 : 1);
  }

  if (command === "stale") {
    const config = loadWorkspaceConfig();
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderStaleReport(readDecisionFiles(root), {
      days: Number(readFlag(args, "--days") || config.stale_after_days),
      asOf: readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10)
    }), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "debt") {
    const config = loadWorkspaceConfig();
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderDecisionDebt(readDecisionFiles(root), {
      staleDays: Number(readFlag(args, "--days") || config.stale_after_days),
      asOf: readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10)
    }), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "archive-plan") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderArchivePlan(readDecisionFiles(root), {
      destination: readFlag(args, "--destination") || "decisions/archive"
    }), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "promote") {
    const filePath = args[0];
    const status = args[1];
    if (!filePath || !status) throw new Error("Usage: decision-lab promote <file.json> <status>");
    writeDecisionUpdate(filePath, promoteDecision(requireFile(filePath), status), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "review") {
    const filePath = args[0];
    writeOrPrint(renderReviewWorksheet(requireFile(filePath)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "close") {
    const filePath = args[0];
    const decision = requireFile(filePath);
    const outcome = readFlag(args, "--outcome") || "";
    const lesson = readFlag(args, "--lesson");
    const closed = closeDecision(decision, { outcome, lessons: lesson ? [lesson] : [] });
    writeOrPrint(`${JSON.stringify(closed, null, 2)}\n`, readFlag(args, "--out") || filePath);
    process.exit(0);
  }

  if (command === "prompt") {
    const role = args[0];
    const filePath = args[1];
    if (!role || !filePath) throw new Error("Usage: decision-lab prompt <role|all> <file.json>");
    const decision = requireFile(filePath);
    const outDir = readFlag(args, "--out-dir");
    const out = readFlag(args, "--out");
    if (role === "all") {
      const chain = buildPromptChain(decision);
      if (outDir) {
        writePromptSet(chain, outDir);
      } else {
        writeOrPrint(chain.map((item) => `# ${item.role}\n\n${item.prompt}`).join("\n\n---\n\n"), out);
      }
      process.exit(0);
    }
    writeOrPrint(buildRolePrompt(role, decision), out);
    process.exit(0);
  }

  if (command === "list-types") {
    console.log(Array.from(VALID_TYPES).join("\n"));
    process.exit(0);
  }

  if (command === "list-prompts") {
    console.log(Array.from(VALID_ROLES).join("\n"));
    process.exit(0);
  }

  throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
