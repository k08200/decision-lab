import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

test("rejects weak decision records", () => {
  const weak = { decision_type: "investment" };
  const result = validateDecision(weak);
  assert.equal(result.valid, false);
  assert.ok(result.issues.length > 3);
});
