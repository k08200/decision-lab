import fs from "node:fs";
import path from "node:path";

export const VALID_TYPES = new Set(["general", "investment", "business", "finance"]);
export const VALID_ROLES = new Set([
  "analyst",
  "skeptic",
  "cfo",
  "ceo",
  "operator",
  "risk",
  "recorder"
]);

const ROLE_INSTRUCTIONS = {
  analyst: {
    title: "Analyst",
    instruction:
      "Strengthen the thesis, separate facts from assumptions, identify missing evidence, and propose the next research tasks."
  },
  skeptic: {
    title: "Skeptic",
    instruction:
      "Attack the conclusion, find base-rate mistakes, expose hidden assumptions, and list disconfirming evidence that would break the thesis."
  },
  cfo: {
    title: "CFO",
    instruction:
      "Translate the decision into financial impact, cash risk, opportunity cost, downside protection, and capital allocation tradeoffs."
  },
  ceo: {
    title: "CEO",
    instruction:
      "Judge strategic fit, timing, execution capacity, stakeholder impact, and whether this decision compounds long-term advantage."
  },
  operator: {
    title: "Operator",
    instruction:
      "Turn the decision into execution steps, owners, dependencies, kill criteria, and the smallest useful pilot."
  },
  risk: {
    title: "Risk Officer",
    instruction:
      "Map irreversible downside, correlated risks, fragile assumptions, risk controls, and early-warning indicators."
  },
  recorder: {
    title: "Decision Recorder",
    instruction:
      "Produce a concise decision memo, log assumptions, define review metrics, and make the final recommendation auditable."
  }
};

export function loadDecisionFile(filePath) {
  const fullPath = path.resolve(filePath);
  const raw = fs.readFileSync(fullPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

export function validateDecision(decision) {
  const issues = [];
  requiredString(decision, "schema_version", issues);
  requiredString(decision, "decision_type", issues);
  requiredString(decision, "title", issues);
  requiredString(decision, "question", issues);
  requiredString(decision, "context", issues);

  if (decision.decision_type && !VALID_TYPES.has(decision.decision_type)) {
    issues.push(issue("decision_type", `Must be one of: ${Array.from(VALID_TYPES).join(", ")}`));
  }

  if (decision.status && !["draft", "researching", "decided", "reviewed"].includes(decision.status)) {
    issues.push(issue("status", "Must be draft, researching, decided, or reviewed"));
  }

  validateDecisionFrame(decision, issues);
  validateRecommendation(decision, issues);
  validateHypotheses(decision, issues);
  validateOptions(decision, issues);
  validateEvidence(decision, issues);
  validateAssumptionRegister(decision, issues);
  validateRisks(decision, issues);
  validateCriteria(decision, issues);
  validateOptionScores(decision, issues);

  requiredArray(decision, "what_would_change_my_mind", issues, { min: 1 });
  requiredArray(decision, "open_questions", issues);
  requiredArray(decision, "next_actions", issues);
  validateReview(decision, issues);

  if (decision.decision_type === "investment") validateInvestment(decision, issues);
  if (decision.decision_type === "business") validateBusiness(decision, issues);
  if (decision.decision_type === "finance") validateFinance(decision, issues);

  return { valid: issues.length === 0, issues };
}

export function scoreDecision(decision) {
  const checks = [
    check("clear_question", hasText(decision.question), 8, "Decision question is explicit."),
    check("decision_frame", hasDecisionFrame(decision), 8, "Frame states reversibility, urgency, default action, and desired outcome."),
    check("context", hasText(decision.context), 8, "Context explains why this decision matters now."),
    check("hypothesis_depth", minLength(decision.hypotheses, 2), 9, "At least two hypotheses are stated."),
    check("evidence", minLength(decision.evidence, 3), 10, "At least three evidence items are attached."),
    check("source_quality", hasQualityEvidence(decision), 8, "Evidence includes source type and recency/source notes."),
    check("assumption_register", minLength(decision.assumption_register, 2), 8, "Critical assumptions are logged separately."),
    check("counterarguments", everyHypothesisHas(decision, "counterarguments"), 10, "Each hypothesis has counterarguments."),
    check("disconfirming_signals", everyHypothesisHas(decision, "disconfirming_signals"), 8, "Each hypothesis has falsification signals."),
    check("criteria", minLength(decision.decision_criteria, 3), 8, "Decision criteria are explicit."),
    check("option_scoring", hasOptionScoring(decision), 8, "Options are scored against criteria."),
    check("change_mind", minLength(decision.what_would_change_my_mind, 2), 7, "Change-my-mind conditions are stated."),
    check("review_loop", hasReviewLoop(decision), 8, "Review metrics and questions exist.")
  ];

  const total = checks.reduce((sum, item) => sum + item.points, 0);
  const earned = checks.reduce((sum, item) => sum + (item.passed ? item.points : 0), 0);

  return {
    score: earned,
    max_score: total,
    ratio: round(earned / total, 3),
    grade: grade(earned / total),
    checks
  };
}

export function auditDecision(decision) {
  const validation = validateDecision(decision);
  const score = scoreDecision(decision);
  const warnings = [];
  const next_actions = [];

  if (!validation.valid) {
    next_actions.push("Fix validation issues before using this record as the source of truth.");
  }
  if (!hasQualityEvidence(decision)) {
    warnings.push("Evidence exists, but source quality is not strong enough for a high-conviction decision.");
    next_actions.push("Upgrade at least one major claim to primary-source, audited, or directly measured evidence.");
  }
  if (!hasOptionScoring(decision)) {
    warnings.push("Options are described but not compared against weighted criteria.");
    next_actions.push("Fill option_scores so the recommendation can be inspected rather than guessed.");
  }
  if (highRiskWithoutControls(decision)) {
    warnings.push("At least one high-impact risk has weak or missing mitigation detail.");
    next_actions.push("Add owner, trigger, or concrete mitigation for every high-impact risk.");
  }
  if (decision.recommendation?.confidence >= 0.8 && score.ratio < 0.8) {
    warnings.push("Recommendation confidence is higher than decision-record quality supports.");
    next_actions.push("Lower confidence or fill missing evidence, assumptions, and counterarguments.");
  }

  return {
    maturity: maturity(score.ratio),
    validation,
    score,
    warnings,
    next_actions,
    strongest_option: strongestOption(decision),
    weakest_areas: score.checks.filter((item) => !item.passed).map((item) => item.name)
  };
}

export function scoreOptions(decision) {
  const criteria = normalizeCriteria(decision.decision_criteria);
  const options = Array.isArray(decision.options) ? decision.options : [];
  const rawScores = Array.isArray(decision.option_scores) ? decision.option_scores : [];

  return options.map((option) => {
    let weighted = 0;
    let possible = 0;
    const breakdown = criteria.map((criterion) => {
      const entry = rawScores.find((item) => item.option_id === option.id && item.criterion_id === criterion.id);
      const score = typeof entry?.score === "number" ? entry.score : null;
      const weight = criterion.weight ?? 1;
      possible += 5 * weight;
      if (score !== null) weighted += score * weight;
      return {
        criterion_id: criterion.id,
        criterion: criterion.name,
        weight,
        score,
        rationale: entry?.rationale || ""
      };
    });

    return {
      option_id: option.id,
      name: option.name,
      weighted_score: possible ? round(weighted / possible, 3) : 0,
      points: round(weighted, 2),
      max_points: round(possible, 2),
      breakdown
    };
  }).sort((a, b) => b.weighted_score - a.weighted_score);
}

export function renderDecisionMemo(decision) {
  const score = scoreDecision(decision);
  const audit = auditDecision(decision);
  const sections = [
    `# ${decision.title}`,
    table([
      ["Type", decision.decision_type],
      ["Status", decision.status || "draft"],
      ["Question", decision.question],
      ["Owner", decision.owner || "Unassigned"],
      ["Decision", decision.recommendation?.decision || "undecided"],
      ["Selected Option", decision.recommendation?.selected_option || "N/A"],
      ["Confidence", percent(decision.recommendation?.confidence)],
      ["Quality Score", `${score.score}/${score.max_score} (${score.grade})`],
      ["Maturity", audit.maturity]
    ]),
    "## Recommendation",
    decision.recommendation?.summary || "No recommendation summary provided.",
    "## Decision Frame",
    renderDecisionFrame(decision.decision_frame),
    "## Context",
    decision.context || "No context provided.",
    renderTypeSpecific(decision),
    "## Options",
    bulletList((decision.options || []).map(renderOption)),
    "## Option Scorecard",
    renderOptionScorecard(decision),
    "## Hypotheses",
    (decision.hypotheses || []).map(renderHypothesis).join("\n\n"),
    "## Evidence",
    bulletList((decision.evidence || []).map(renderEvidence)),
    "## Assumption Register",
    renderAssumptionRegister(decision.assumption_register),
    "## Risks",
    bulletList((decision.risks || []).map(renderRisk)),
    "## Decision Criteria",
    bulletList(normalizeCriteria(decision.decision_criteria).map(renderCriterion)),
    "## What Would Change My Mind",
    bulletList(decision.what_would_change_my_mind || []),
    "## Open Questions",
    bulletList(decision.open_questions || []),
    "## Next Actions",
    bulletList(decision.next_actions || []),
    "## Post-Decision Review",
    renderReview(decision.post_decision_review),
    "## Audit",
    renderAudit(audit),
    "## Quality Checks",
    bulletList(score.checks.map((item) => `${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.description}`))
  ].filter(Boolean);

  return sections.join("\n\n") + "\n";
}

export function renderDecisionBrief(decision) {
  const audit = auditDecision(decision);
  const best = audit.strongest_option;
  return [
    `# ${decision.title} - Brief`,
    `Question: ${decision.question}`,
    `Recommendation: ${decision.recommendation?.decision || "undecided"} (${percent(decision.recommendation?.confidence)} confidence)`,
    `Best scored option: ${best ? `${best.name} (${Math.round(best.weighted_score * 100)}%)` : "N/A"}`,
    `Maturity: ${audit.maturity}`,
    "",
    "## Why",
    decision.recommendation?.summary || "No summary provided.",
    "",
    "## Top Risks",
    bulletList((decision.risks || []).slice(0, 3).map(renderRisk)),
    "",
    "## Change-My-Mind Triggers",
    bulletList(decision.what_would_change_my_mind || []),
    "",
    "## Next Actions",
    bulletList((decision.next_actions || []).slice(0, 5))
  ].join("\n") + "\n";
}

export function renderReviewPlan(decision) {
  const review = decision.post_decision_review || {};
  return [
    `# Review Plan: ${decision.title}`,
    table([
      ["Decision", decision.recommendation?.decision || "undecided"],
      ["Review Date", decision.recommendation?.review_date || review.review_date || "Unset"],
      ["Owner", decision.owner || "Unassigned"],
      ["Confidence At Decision", percent(decision.recommendation?.confidence)]
    ]),
    "## Success Metrics",
    bulletList(review.success_metrics || []),
    "## Review Questions",
    bulletList(review.review_questions || []),
    "## Expected Signals",
    bulletList(review.expected_signals || []),
    "## Failure Signals",
    bulletList(review.failure_signals || []),
    "## Original Change-My-Mind Conditions",
    bulletList(decision.what_would_change_my_mind || []),
    "## Actual Outcome",
    review.actual_outcome || "Not reviewed yet.",
    "## Lessons",
    bulletList(review.lessons || [])
  ].join("\n\n") + "\n";
}

export function buildRolePrompt(role, decision) {
  if (!VALID_ROLES.has(role)) {
    throw new Error(`Unknown role: ${role}. Use one of: ${Array.from(VALID_ROLES).join(", ")}`);
  }

  const roleInfo = ROLE_INSTRUCTIONS[role];

  return `You are the ${roleInfo.title}.

Mission:
- ${roleInfo.instruction}

Rules:
- Do not give generic advice.
- Use the provided decision record as the source of truth.
- Mark important claims as fact, inference, assumption, or unknown.
- Add counterarguments before strengthening the recommendation.
- Return concrete JSON-compatible edits that can be merged back into the record.
- If evidence is missing, state exactly what evidence is needed and where it should be placed.
- Preserve the decision schema; do not invent a new structure unless you explicitly label it as a proposed schema change.

Output format:
1. Critical observations
2. Proposed record edits
3. Missing evidence
4. Recommendation delta
5. Follow-up questions

Decision record:

\`\`\`json
${JSON.stringify(decision, null, 2)}
\`\`\`
`;
}

export function buildPromptChain(decision, roles = Array.from(VALID_ROLES)) {
  return roles.map((role) => ({
    role,
    prompt: buildRolePrompt(role, decision)
  }));
}

export function formatIssues(issues) {
  if (!issues.length) return "No validation issues.";
  return issues.map((item) => `- ${item.path}: ${item.message}`).join("\n");
}

function validateDecisionFrame(decision, issues) {
  requiredObject(decision, "decision_frame", issues);
  if (!decision.decision_frame) return;
  requiredString(decision.decision_frame, "decision_class", issues, "decision_frame.decision_class");
  requiredString(decision.decision_frame, "reversibility", issues, "decision_frame.reversibility");
  requiredString(decision.decision_frame, "urgency", issues, "decision_frame.urgency");
  requiredString(decision.decision_frame, "default_action", issues, "decision_frame.default_action");
  requiredString(decision.decision_frame, "desired_outcome", issues, "decision_frame.desired_outcome");
  requiredArray(decision.decision_frame, "constraints", issues, { path: "decision_frame.constraints" });
  requiredArray(decision.decision_frame, "non_goals", issues, { path: "decision_frame.non_goals" });
}

function validateRecommendation(decision, issues) {
  requiredObject(decision, "recommendation", issues);
  if (!decision.recommendation) return;
  requiredString(decision.recommendation, "decision", issues, "recommendation.decision");
  requiredString(decision.recommendation, "summary", issues, "recommendation.summary");
  numberBetween(decision.recommendation, "confidence", 0, 1, issues, "recommendation.confidence");
}

function validateHypotheses(decision, issues) {
  requiredArray(decision, "hypotheses", issues, { min: 1 });
  for (const [index, hypothesis] of arrayEntries(decision.hypotheses)) {
    const prefix = `hypotheses.${index}`;
    requiredString(hypothesis, "id", issues, `${prefix}.id`);
    requiredString(hypothesis, "statement", issues, `${prefix}.statement`);
    numberBetween(hypothesis, "confidence", 0, 1, issues, `${prefix}.confidence`);
    requiredArray(hypothesis, "evidence", issues, { path: `${prefix}.evidence` });
    requiredArray(hypothesis, "assumptions", issues, { path: `${prefix}.assumptions` });
    requiredArray(hypothesis, "counterarguments", issues, { path: `${prefix}.counterarguments` });
    requiredArray(hypothesis, "disconfirming_signals", issues, { path: `${prefix}.disconfirming_signals` });
  }
}

function validateOptions(decision, issues) {
  requiredArray(decision, "options", issues, { min: 1 });
  for (const [index, option] of arrayEntries(decision.options)) {
    const prefix = `options.${index}`;
    requiredString(option, "id", issues, `${prefix}.id`);
    requiredString(option, "name", issues, `${prefix}.name`);
    requiredString(option, "description", issues, `${prefix}.description`);
  }
}

function validateEvidence(decision, issues) {
  requiredArray(decision, "evidence", issues);
  for (const [index, evidence] of arrayEntries(decision.evidence)) {
    const prefix = `evidence.${index}`;
    requiredString(evidence, "claim", issues, `${prefix}.claim`);
    requiredString(evidence, "source", issues, `${prefix}.source`);
    requiredString(evidence, "strength", issues, `${prefix}.strength`);
    if (evidence.strength && !["weak", "medium", "strong"].includes(evidence.strength)) {
      issues.push(issue(`${prefix}.strength`, "Must be weak, medium, or strong"));
    }
  }
}

function validateAssumptionRegister(decision, issues) {
  if (!("assumption_register" in decision)) return;
  requiredArray(decision, "assumption_register", issues);
  for (const [index, assumption] of arrayEntries(decision.assumption_register)) {
    const prefix = `assumption_register.${index}`;
    requiredString(assumption, "assumption", issues, `${prefix}.assumption`);
    requiredString(assumption, "importance", issues, `${prefix}.importance`);
    requiredString(assumption, "test", issues, `${prefix}.test`);
  }
}

function validateRisks(decision, issues) {
  requiredArray(decision, "risks", issues);
  for (const [index, risk] of arrayEntries(decision.risks)) {
    const prefix = `risks.${index}`;
    requiredString(risk, "risk", issues, `${prefix}.risk`);
    requiredString(risk, "mitigation", issues, `${prefix}.mitigation`);
  }
}

function validateCriteria(decision, issues) {
  requiredArray(decision, "decision_criteria", issues, { min: 1 });
  for (const [index, criterion] of arrayEntries(decision.decision_criteria)) {
    if (typeof criterion === "string" && criterion.trim()) continue;
    const prefix = `decision_criteria.${index}`;
    requiredString(criterion, "id", issues, `${prefix}.id`);
    requiredString(criterion, "name", issues, `${prefix}.name`);
    if ("weight" in (criterion || {})) numberBetween(criterion, "weight", 0, 10, issues, `${prefix}.weight`);
  }
}

function validateOptionScores(decision, issues) {
  if (!("option_scores" in decision)) return;
  requiredArray(decision, "option_scores", issues);
  for (const [index, score] of arrayEntries(decision.option_scores)) {
    const prefix = `option_scores.${index}`;
    requiredString(score, "option_id", issues, `${prefix}.option_id`);
    requiredString(score, "criterion_id", issues, `${prefix}.criterion_id`);
    numberBetween(score, "score", 0, 5, issues, `${prefix}.score`);
    requiredString(score, "rationale", issues, `${prefix}.rationale`);
  }
}

function validateReview(decision, issues) {
  requiredObject(decision, "post_decision_review", issues);
  if (!decision.post_decision_review) return;
  requiredArray(decision.post_decision_review, "success_metrics", issues, {
    path: "post_decision_review.success_metrics"
  });
  requiredArray(decision.post_decision_review, "review_questions", issues, {
    path: "post_decision_review.review_questions"
  });
}

function validateInvestment(decision, issues) {
  requiredObject(decision, "asset", issues);
  if (decision.asset) {
    requiredString(decision.asset, "name", issues, "asset.name");
    requiredString(decision.asset, "ticker", issues, "asset.ticker");
    requiredString(decision.asset, "asset_class", issues, "asset.asset_class");
    requiredString(decision.asset, "time_horizon", issues, "asset.time_horizon");
    requiredString(decision.asset, "proposed_action", issues, "asset.proposed_action");
  }
  requiredObject(decision, "portfolio_context", issues);
  if (decision.portfolio_context) {
    requiredString(decision.portfolio_context, "role_in_portfolio", issues, "portfolio_context.role_in_portfolio");
    requiredString(decision.portfolio_context, "sizing_rule", issues, "portfolio_context.sizing_rule");
  }
  requiredObject(decision, "valuation", issues);
  if (decision.valuation) {
    requiredString(decision.valuation, "base_case", issues, "valuation.base_case");
    requiredString(decision.valuation, "bull_case", issues, "valuation.bull_case");
    requiredString(decision.valuation, "bear_case", issues, "valuation.bear_case");
  }
  requiredArray(decision, "catalysts", issues, { min: 1 });
  requiredArray(decision, "risk_controls", issues, { min: 1 });
}

function validateBusiness(decision, issues) {
  requiredString(decision, "strategic_goal", issues);
  requiredArray(decision, "stakeholders", issues, { min: 1 });
  requiredArray(decision, "constraints", issues);
  requiredObject(decision, "financial_impact", issues);
  requiredObject(decision, "execution_plan", issues);
  if (decision.execution_plan) {
    requiredString(decision.execution_plan, "owner", issues, "execution_plan.owner");
    requiredArray(decision.execution_plan, "milestones", issues, { path: "execution_plan.milestones", min: 1 });
    requiredArray(decision.execution_plan, "dependencies", issues, { path: "execution_plan.dependencies" });
  }
  requiredObject(decision, "operating_cadence", issues);
}

function validateFinance(decision, issues) {
  requiredString(decision, "financial_hypothesis", issues);
  requiredString(decision, "model_driver", issues);
  requiredString(decision, "planning_horizon", issues);
  requiredString(decision, "base_case", issues);
  requiredString(decision, "upside_case", issues);
  requiredString(decision, "downside_case", issues);
  requiredArray(decision, "sensitivity_checks", issues, { min: 1 });
  requiredArray(decision, "financial_guardrails", issues, { min: 1 });
}

function requiredString(object, key, issues, explicitPath = key) {
  if (!hasText(object?.[key])) issues.push(issue(explicitPath, "Required non-empty string"));
}

function requiredObject(object, key, issues, explicitPath = key) {
  const value = object?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(issue(explicitPath, "Required object"));
  }
}

function requiredArray(object, key, issues, options = {}) {
  const value = object?.[key];
  const explicitPath = options.path ?? key;
  if (!Array.isArray(value)) {
    issues.push(issue(explicitPath, "Required array"));
    return;
  }
  if (options.min && value.length < options.min) {
    issues.push(issue(explicitPath, `Must contain at least ${options.min} item(s)`));
  }
}

function numberBetween(object, key, min, max, issues, explicitPath = key) {
  const value = object?.[key];
  if (typeof value !== "number" || value < min || value > max) {
    issues.push(issue(explicitPath, `Must be a number between ${min} and ${max}`));
  }
}

function issue(pathName, message) {
  return { path: pathName, message };
}

function arrayEntries(value) {
  return Array.isArray(value) ? value.entries() : [];
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function minLength(value, length) {
  return Array.isArray(value) && value.length >= length;
}

function hasDecisionFrame(decision) {
  const frame = decision.decision_frame;
  return hasText(frame?.decision_class)
    && hasText(frame?.reversibility)
    && hasText(frame?.urgency)
    && hasText(frame?.default_action)
    && hasText(frame?.desired_outcome);
}

function everyHypothesisHas(decision, key) {
  return Array.isArray(decision.hypotheses) && decision.hypotheses.length > 0
    && decision.hypotheses.every((item) => Array.isArray(item[key]) && item[key].length > 0);
}

function hasQualityEvidence(decision) {
  return Array.isArray(decision.evidence)
    && decision.evidence.some((item) => item.strength === "strong" || hasText(item.source_type) || hasText(item.recency));
}

function hasOptionScoring(decision) {
  const criteria = normalizeCriteria(decision.decision_criteria);
  const options = Array.isArray(decision.options) ? decision.options : [];
  const scores = Array.isArray(decision.option_scores) ? decision.option_scores : [];
  if (criteria.length === 0 || options.length === 0) return false;
  return options.every((option) => criteria.every((criterion) => (
    scores.some((score) => score.option_id === option.id && score.criterion_id === criterion.id)
  )));
}

function hasReviewLoop(decision) {
  const review = decision.post_decision_review;
  return Array.isArray(review?.success_metrics) && review.success_metrics.length > 0
    && Array.isArray(review?.review_questions) && review.review_questions.length > 0;
}

function highRiskWithoutControls(decision) {
  return (decision.risks || []).some((risk) => (
    risk.impact === "high" && (!hasText(risk.mitigation) || !hasText(risk.trigger))
  ));
}

function strongestOption(decision) {
  return scoreOptions(decision)[0] || null;
}

function normalizeCriteria(criteria) {
  if (!Array.isArray(criteria)) return [];
  return criteria.map((criterion, index) => {
    if (typeof criterion === "string") {
      return { id: `C${index + 1}`, name: criterion, weight: 1 };
    }
    return {
      id: criterion.id,
      name: criterion.name,
      weight: typeof criterion.weight === "number" ? criterion.weight : 1,
      description: criterion.description || ""
    };
  }).filter((criterion) => hasText(criterion.id) && hasText(criterion.name));
}

function check(name, passed, points, description) {
  return { name, passed: Boolean(passed), points, description };
}

function maturity(ratio) {
  if (ratio >= 0.9) return "operational";
  if (ratio >= 0.75) return "decision-ready";
  if (ratio >= 0.6) return "research-needed";
  return "draft";
}

function grade(ratio) {
  if (ratio >= 0.9) return "A";
  if (ratio >= 0.8) return "B";
  if (ratio >= 0.7) return "C";
  if (ratio >= 0.6) return "D";
  return "F";
}

function round(value, digits) {
  return Number(value.toFixed(digits));
}

function percent(value) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "N/A";
}

function table(rows) {
  return [
    "| Field | Value |",
    "| --- | --- |",
    ...rows.map(([key, value]) => `| ${escapeCell(key)} | ${escapeCell(value)} |`)
  ].join("\n");
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function bulletList(items) {
  if (!items || items.length === 0) return "- None";
  return items.map((item) => `- ${item}`).join("\n");
}

function renderDecisionFrame(frame = {}) {
  return table([
    ["Class", frame.decision_class || ""],
    ["Reversibility", frame.reversibility || ""],
    ["Urgency", frame.urgency || ""],
    ["Default Action", frame.default_action || ""],
    ["Desired Outcome", frame.desired_outcome || ""],
    ["Constraints", (frame.constraints || []).join("; ")],
    ["Non-Goals", (frame.non_goals || []).join("; ")]
  ]);
}

function renderOption(option) {
  return `${option.id}: ${option.name} - ${option.description} Upside: ${option.upside || "N/A"} Downside: ${option.downside || "N/A"} Reversibility: ${option.reversibility || "N/A"}`;
}

function renderOptionScorecard(decision) {
  const scored = scoreOptions(decision);
  if (!scored.length) return "- None";
  return [
    "| Option | Score | Notes |",
    "| --- | ---: | --- |",
    ...scored.map((item) => {
      const notes = item.breakdown
        .map((part) => `${part.criterion}: ${part.score ?? "N/A"}/5`)
        .join("; ");
      return `| ${escapeCell(item.name)} | ${Math.round(item.weighted_score * 100)}% | ${escapeCell(notes)} |`;
    })
  ].join("\n");
}

function renderHypothesis(hypothesis) {
  return [
    `### ${hypothesis.id}: ${hypothesis.statement}`,
    hypothesis.why_it_matters ? `Why it matters: ${hypothesis.why_it_matters}` : "",
    `Confidence: ${percent(hypothesis.confidence)}`,
    `Evidence:\n${bulletList(hypothesis.evidence || [])}`,
    `Assumptions:\n${bulletList(hypothesis.assumptions || [])}`,
    `Counterarguments:\n${bulletList(hypothesis.counterarguments || [])}`,
    `Disconfirming signals:\n${bulletList(hypothesis.disconfirming_signals || [])}`
  ].filter(Boolean).join("\n\n");
}

function renderEvidence(evidence) {
  return `${evidence.claim} Source: ${evidence.source}. Strength: ${evidence.strength}. Type: ${evidence.source_type || "N/A"}. Recency: ${evidence.recency || "N/A"}. Notes: ${evidence.notes || "N/A"}`;
}

function renderAssumptionRegister(assumptions = []) {
  if (!assumptions.length) return "- None";
  return [
    "| Assumption | Importance | Test | Owner |",
    "| --- | --- | --- | --- |",
    ...assumptions.map((item) => (
      `| ${escapeCell(item.assumption)} | ${escapeCell(item.importance)} | ${escapeCell(item.test)} | ${escapeCell(item.owner || "")} |`
    ))
  ].join("\n");
}

function renderRisk(risk) {
  return `${risk.risk} Probability: ${risk.probability || "N/A"}. Impact: ${risk.impact || "N/A"}. Trigger: ${risk.trigger || "N/A"}. Mitigation: ${risk.mitigation}`;
}

function renderCriterion(criterion) {
  return `${criterion.id}: ${criterion.name} (weight ${criterion.weight ?? 1})${criterion.description ? ` - ${criterion.description}` : ""}`;
}

function renderReview(review = {}) {
  return [
    `Success metrics:\n${bulletList(review.success_metrics || [])}`,
    `Expected signals:\n${bulletList(review.expected_signals || [])}`,
    `Failure signals:\n${bulletList(review.failure_signals || [])}`,
    `Review questions:\n${bulletList(review.review_questions || [])}`,
    `Actual outcome: ${review.actual_outcome || "Not reviewed yet."}`,
    `Lessons:\n${bulletList(review.lessons || [])}`
  ].join("\n\n");
}

function renderAudit(audit) {
  return [
    `Maturity: ${audit.maturity}`,
    `Validation: ${audit.validation.valid ? "valid" : "invalid"}`,
    `Score: ${audit.score.score}/${audit.score.max_score} (${audit.score.grade})`,
    `Warnings:\n${bulletList(audit.warnings)}`,
    `Next actions:\n${bulletList(audit.next_actions)}`
  ].join("\n\n");
}

function renderTypeSpecific(decision) {
  if (decision.decision_type === "investment") {
    return [
      "## Investment Snapshot",
      table([
        ["Asset", decision.asset?.name || ""],
        ["Ticker", decision.asset?.ticker || ""],
        ["Class", decision.asset?.asset_class || ""],
        ["Horizon", decision.asset?.time_horizon || ""],
        ["Action", decision.asset?.proposed_action || ""],
        ["Portfolio Role", decision.portfolio_context?.role_in_portfolio || ""],
        ["Sizing Rule", decision.portfolio_context?.sizing_rule || ""],
        ["Base Case", decision.valuation?.base_case || ""],
        ["Bull Case", decision.valuation?.bull_case || ""],
        ["Bear Case", decision.valuation?.bear_case || ""]
      ]),
      "## Catalysts",
      bulletList(decision.catalysts || []),
      "## Risk Controls",
      bulletList(decision.risk_controls || [])
    ].join("\n\n");
  }

  if (decision.decision_type === "business") {
    return [
      "## Business Snapshot",
      table([
        ["Strategic Goal", decision.strategic_goal || ""],
        ["Stakeholders", (decision.stakeholders || []).join(", ")],
        ["Revenue Impact", decision.financial_impact?.revenue || ""],
        ["Cost Impact", decision.financial_impact?.cost || ""],
        ["Cash Flow Impact", decision.financial_impact?.cash_flow || ""],
        ["Payback", decision.financial_impact?.payback_period || ""],
        ["Execution Owner", decision.execution_plan?.owner || ""],
        ["Cadence", decision.operating_cadence?.cadence || ""]
      ]),
      "## Constraints",
      bulletList(decision.constraints || []),
      "## Milestones",
      bulletList(decision.execution_plan?.milestones || []),
      "## Dependencies",
      bulletList(decision.execution_plan?.dependencies || [])
    ].join("\n\n");
  }

  if (decision.decision_type === "finance") {
    return [
      "## Finance Snapshot",
      table([
        ["Financial Hypothesis", decision.financial_hypothesis || ""],
        ["Model Driver", decision.model_driver || ""],
        ["Planning Horizon", decision.planning_horizon || ""],
        ["Base Case", decision.base_case || ""],
        ["Upside Case", decision.upside_case || ""],
        ["Downside Case", decision.downside_case || ""]
      ]),
      "## Sensitivity Checks",
      bulletList(decision.sensitivity_checks || []),
      "## Financial Guardrails",
      bulletList(decision.financial_guardrails || [])
    ].join("\n\n");
  }

  return "";
}
