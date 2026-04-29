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
  renderDashboard,
  renderExport
} from "../src/decision-export.js";
import {
  applyJsonPatch,
  attachSourceEvidence,
  attachEvidence,
  createSourceNote,
  parseJsonish,
  renderCalibration,
  renderDoctor,
  renderDueReviews,
  renderDecisionDiff,
  renderDecisionGraph,
  renderAssumptionReport,
  evaluateGate,
  renderGateReport,
  renderMonthlyReview,
  renderPremortem,
  renderRiskRegister,
  renderReviewWorksheet,
  renderSearchResults,
  renderSourceIndex,
  renderStaleReport,
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
  decision-lab ask [question...] [--type type] [--owner name] [--out file.json]
  decision-lab inbox <questions.txt> [--type type] [--owner name] [--out-dir decisions/drafts]
  decision-lab run <file.json> [--out-dir directory]
  decision-lab pipeline [question...] [--type type] [--owner name] [--slug name] [--out-dir directory]
  decision-lab new <general|investment|business|finance> [--out file.json]
  decision-lab validate <file.json>
  decision-lab score <file.json>
  decision-lab audit <file.json>
  decision-lab health <file.json>
  decision-lab compare <file.json>
  decision-lab diff <before.json> <after.json> [--out diff.md]
  decision-lab graph <file.json> [--out graph.md]
  decision-lab premortem <file.json> [--out premortem.md]
  decision-lab evidence <file.json> --claim text --source text [--strength weak|medium|strong] [--out file.json]
  decision-lab source <source-file> [--title text] [--kind text] [--out source.md]
  decision-lab source-evidence <file.json> <source-file> --claim text [--strength weak|medium|strong] [--out file.json]
  decision-lab patch <file.json> <patch.json> [--out file.json]
  decision-lab set <file.json> <path> <json-value> [--out file.json]
  decision-lab migrate <file.json> [--out file.json] [--report report.md]
  decision-lab render <file.json> [--out memo.md]
  decision-lab brief <file.json> [--out brief.md]
  decision-lab review-plan <file.json> [--out review.md]
  decision-lab ledger [directory] [--out ledger.md]
  decision-lab dashboard [directory] [--out dashboard.html]
  decision-lab export [directory] [--format json|csv] [--out file]
  decision-lab calibration [directory] [--out report.md]
  decision-lab risks [directory] [--out report.md]
  decision-lab assumptions [directory] [--out report.md]
  decision-lab sources [directory] [--out report.md]
  decision-lab monthly [directory] [--as-of YYYY-MM-DD] [--out report.md]
  decision-lab pack [directory] [--as-of YYYY-MM-DD] [--out-dir outputs/packs/YYYY-MM-DD]
  decision-lab due [directory] [--as-of YYYY-MM-DD] [--out report.md]
  decision-lab search [directory] --query text [--out report.md]
  decision-lab doctor [directory] [--out report.md]
  decision-lab gate [directory] [--min-score 0.75] [--operational] [--out report.md]
  decision-lab stale [directory] [--days 30] [--as-of YYYY-MM-DD] [--out report.md]
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
    "dashboard.html": renderDashboard(records),
    "decisions.csv": renderExport(records, "csv"),
    "decisions.json": renderExport(records, "json"),
    "calibration.md": renderCalibration(records),
    "due.md": renderDueReviews(records, asOf),
    "risks.md": renderRiskRegister(records),
    "assumptions.md": renderAssumptionReport(records),
    "sources.md": renderSourceIndex(records),
    "monthly.md": renderMonthlyReview(records, asOf),
    "doctor.md": renderDoctor({ root, examples: readDecisionFiles(path.join(root, "examples")) })
  };
  for (const [name, content] of Object.entries(artifacts)) {
    fs.writeFileSync(path.join(outDir, name), content);
  }
}

function renderCompare(decision) {
  return renderOptionComparison(decision);
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

  if (command === "dashboard") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderDashboard(readDecisionFiles(root)), readFlag(args, "--out") || "outputs/dashboard.html");
    process.exit(0);
  }

  if (command === "export") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderExport(readDecisionFiles(root), readFlag(args, "--format") || "json"), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "calibration") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderCalibration(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "risks") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderRiskRegister(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "assumptions") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderAssumptionReport(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "sources") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderSourceIndex(readDecisionFiles(root)), readFlag(args, "--out"));
    process.exit(0);
  }

  if (command === "monthly") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderMonthlyReview(readDecisionFiles(root), readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10)), readFlag(args, "--out"));
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

  if (command === "due") {
    const root = args[0] && !args[0].startsWith("--") ? args[0] : "decisions";
    writeOrPrint(renderDueReviews(readDecisionFiles(root), readFlag(args, "--as-of") || new Date().toISOString().slice(0, 10)), readFlag(args, "--out"));
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
