#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  buildRolePrompt,
  formatIssues,
  loadDecisionFile,
  renderDecisionMemo,
  scoreDecision,
  validateDecision
} from "../src/decision-core.js";
import { createTemplate } from "../src/templates.js";

const [, , command, ...args] = process.argv;

function printHelp() {
  console.log(`Decision Lab

Usage:
  decision-lab new <general|investment|business|finance>
  decision-lab validate <file.json>
  decision-lab score <file.json>
  decision-lab render <file.json> [--out memo.md]
  decision-lab prompt <analyst|skeptic|cfo|ceo|recorder> <file.json>
  decision-lab list-prompts
`);
}

function readOutPath(argv) {
  const index = argv.indexOf("--out");
  if (index === -1) return null;
  if (!argv[index + 1]) throw new Error("--out requires a file path");
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

function requireFile(filePath) {
  if (!filePath) throw new Error("Missing file path");
  return loadDecisionFile(filePath);
}

try {
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "new") {
    const type = args[0] ?? "general";
    console.log(JSON.stringify(createTemplate(type), null, 2));
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

  if (command === "render") {
    const decision = requireFile(args[0]);
    const validation = validateDecision(decision);
    if (!validation.valid) {
      console.error(formatIssues(validation.issues));
      process.exit(1);
    }
    writeOrPrint(renderDecisionMemo(decision), readOutPath(args));
    process.exit(0);
  }

  if (command === "prompt") {
    const role = args[0];
    const filePath = args[1];
    if (!role || !filePath) throw new Error("Usage: decision-lab prompt <role> <file.json>");
    writeOrPrint(buildRolePrompt(role, requireFile(filePath)), readOutPath(args));
    process.exit(0);
  }

  if (command === "list-prompts") {
    console.log(["analyst", "skeptic", "cfo", "ceo", "recorder"].join("\n"));
    process.exit(0);
  }

  throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
