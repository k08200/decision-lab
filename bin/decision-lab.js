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
import { createTemplate } from "../src/templates.js";

const [, , command, ...args] = process.argv;

function printHelp() {
  console.log(`Decision Lab

Usage:
  decision-lab init [directory]
  decision-lab new <general|investment|business|finance> [--out file.json]
  decision-lab validate <file.json>
  decision-lab score <file.json>
  decision-lab audit <file.json>
  decision-lab compare <file.json>
  decision-lab render <file.json> [--out memo.md]
  decision-lab brief <file.json> [--out brief.md]
  decision-lab review-plan <file.json> [--out review.md]
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
  console.log(`Initialized Decision Lab workspace in ${root}`);
}

function renderCompare(decision) {
  const rows = scoreOptions(decision);
  if (!rows.length) return "No option scores found.\n";
  return [
    "| Rank | Option | Weighted Score | Points |",
    "| ---: | --- | ---: | ---: |",
    ...rows.map((item, index) => (
      `| ${index + 1} | ${escapeCell(item.name)} | ${Math.round(item.weighted_score * 100)}% | ${item.points}/${item.max_points} |`
    ))
  ].join("\n") + "\n";
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

  if (command === "new") {
    const type = args[0] ?? "general";
    writeOrPrint(`${JSON.stringify(createTemplate(type), null, 2)}\n`, readFlag(args, "--out"));
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

  if (command === "compare") {
    writeOrPrint(renderCompare(requireFile(args[0])), readFlag(args, "--out"));
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
