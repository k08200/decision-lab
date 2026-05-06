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

export function scoreEvidenceQuality(decision) {
  const evidenceItems = Array.isArray(decision.evidence) ? decision.evidence : [];
  if (!evidenceItems.length) {
    return { score: 0, grade: "F", reasons: ["No evidence items are attached."] };
  }

  const strengthAverage = average(evidenceItems.map((item) => evidenceStrengthValue(item.strength)));
  const sourcedShare = evidenceItems.filter((item) => Boolean(item.source)).length / evidenceItems.length;
  const decisionSpecificShare = evidenceItems.filter(isDecisionSpecificEvidence).length / evidenceItems.length;
  const primaryShare = evidenceItems.filter(isPrimaryOrObservedEvidence).length / evidenceItems.length;
  const score = Math.round((strengthAverage * 45) + (sourcedShare * 20) + (decisionSpecificShare * 20) + (primaryShare * 15));
  const reasons = [
    `${evidenceItems.filter((item) => item.strength === "strong").length}/${evidenceItems.length} strong evidence`,
    `${Math.round(primaryShare * 100)}% primary or observed`
  ];
  if (decisionSpecificShare < 0.5) reasons.push("generic framework evidence still dominates");
  if (primaryShare < 0.34) reasons.push("needs more direct user or product evidence");
  return { score, grade: evidenceGrade(score), reasons };
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
  const evidenceQuality = scoreEvidenceQuality(decision);
  const audit = auditDecision(decision);
  const korean = isKoreanDecision(decision);
  const labels = memoLabels(korean);
  const sections = [
    `# ${decision.title}`,
    table([
      [labels.type, decision.decision_type],
      [labels.status, decision.status || "draft"],
      [labels.question, decision.question],
      [labels.owner, decision.owner || labels.unassigned],
      [labels.decision, decision.recommendation?.decision || labels.undecided],
      [labels.selectedOption, decision.recommendation?.selected_option || "N/A"],
      [labels.confidence, percent(decision.recommendation?.confidence)],
      [labels.completeness, `${Math.round(score.ratio * 100)}% ${score.grade} (${score.score}/${score.max_score} structure points)`],
      [labels.evidenceQuality, `${evidenceQuality.score}% ${evidenceQuality.grade}`],
      [labels.scoreMeaning, labels.scoreMeaningText],
      [labels.maturity, audit.maturity]
    ], labels.fieldValue),
    `## ${labels.atAGlance}`,
    renderMemoAtAGlance(decision, audit, evidenceQuality, labels),
    `## ${labels.recommendation}`,
    decision.recommendation?.summary || labels.noRecommendation,
    `## ${labels.decisionFrame}`,
    renderDecisionFrame(decision.decision_frame, labels),
    `## ${labels.context}`,
    decision.context || labels.noContext,
    renderTypeSpecific(decision, labels),
    `## ${labels.options}`,
    bulletList((decision.options || []).map((item) => renderOption(item, labels))),
    `## ${labels.optionScorecard}`,
    renderOptionScorecard(decision, labels),
    `## ${labels.hypotheses}`,
    (decision.hypotheses || []).map((item) => renderHypothesis(item, labels)).join("\n\n"),
    `## ${labels.evidence}`,
    bulletList((decision.evidence || []).map((item) => renderEvidence(item, labels))),
    `## ${labels.assumptionRegister}`,
    renderAssumptionRegister(decision.assumption_register, labels),
    `## ${labels.risks}`,
    bulletList((decision.risks || []).map((item) => renderRisk(item, labels))),
    `## ${labels.decisionCriteria}`,
    bulletList(normalizeCriteria(decision.decision_criteria).map(renderCriterion)),
    `## ${labels.changeMind}`,
    bulletList(decision.what_would_change_my_mind || []),
    `## ${labels.openQuestions}`,
    bulletList(decision.open_questions || []),
    `## ${labels.nextActions}`,
    bulletList(decision.next_actions || []),
    `## ${labels.postDecisionReview}`,
    renderReview(decision.post_decision_review, labels),
    `## ${labels.audit}`,
    renderAudit(audit, evidenceQuality, labels),
    `## ${labels.qualityChecks}`,
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

function evidenceStrengthValue(strength) {
  if (strength === "strong") return 1;
  if (strength === "medium") return 0.55;
  if (strength === "weak") return 0.2;
  return 0.35;
}

function isDecisionSpecificEvidence(item) {
  const source = String(item.source || "").toLowerCase();
  const sourceType = String(item.source_type || "").toLowerCase();
  const claim = String(item.claim || "").toLowerCase();
  if (source.includes("decision lab evidence quality rule")) return false;
  if (source.includes("decision lab operating framework")) return false;
  if (sourceType.includes("framework")) return false;
  if (claim.includes("decision has been identified")) return false;
  if (claim.includes("record still needs primary")) return false;
  return true;
}

function isPrimaryOrObservedEvidence(item) {
  const haystack = [item.source, item.source_type, item.notes].join(" ").toLowerCase();
  return [
    "manual test",
    "install test",
    "operator observation",
    "user test",
    "customer",
    "usage",
    "bug report",
    "release check",
    "smoke test",
    "registry",
    "observed"
  ].some((needle) => haystack.includes(needle));
}

function evidenceGrade(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  if (score >= 30) return "D";
  return "F";
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

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percent(value) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "N/A";
}

function isKoreanDecision(decision) {
  return /[가-힣]/.test([decision.title, decision.question, decision.context].join(" "));
}

function memoLabels(korean) {
  if (!korean) {
    return {
      fieldValue: ["Field", "Value"],
      type: "Type",
      status: "Status",
      question: "Question",
      owner: "Owner",
      decision: "Decision",
      selectedOption: "Selected Option",
      confidence: "Confidence",
      completeness: "Completeness",
      evidenceQuality: "Evidence Quality",
      scoreMeaning: "Score Meaning",
      scoreMeaningText: "Completeness measures record structure, not whether the decision is correct.",
      maturity: "Maturity",
      recommendation: "Recommendation",
      decisionFrame: "Decision Frame",
      context: "Context",
      options: "Options",
      optionScorecard: "Option Scorecard",
      hypotheses: "Hypotheses",
      evidence: "Evidence",
      assumptionRegister: "Assumption Register",
      risks: "Risks",
      decisionCriteria: "Decision Criteria",
      changeMind: "What Would Change My Mind",
      openQuestions: "Open Questions",
      nextActions: "Next Actions",
      postDecisionReview: "Post-Decision Review",
      audit: "Audit",
      qualityChecks: "Quality Checks",
      atAGlance: "At A Glance",
      currentCall: "Current call",
      whyConfidenceIsLow: "Why confidence is low",
      nextMove: "Next move",
      readNext: "Read next",
      addConcreteEvidence: "Add one concrete evidence item, then regenerate the memo.",
      reviewEvidenceFirst: "Review Evidence, Open Questions, and Next Actions before treating this as decided.",
      noRecommendation: "No recommendation summary provided.",
      noContext: "No context provided.",
      unassigned: "Unassigned",
      undecided: "undecided",
      class: "Class",
      reversibility: "Reversibility",
      urgency: "Urgency",
      defaultAction: "Default Action",
      desiredOutcome: "Desired Outcome",
      constraints: "Constraints",
      nonGoals: "Non-Goals",
      upside: "Upside",
      downside: "Downside",
      whyItMatters: "Why it matters",
      assumptions: "Assumptions",
      counterarguments: "Counterarguments",
      disconfirmingSignals: "Disconfirming signals",
      source: "Source",
      strength: "Strength",
      sourceType: "Type",
      recency: "Recency",
      notes: "Notes",
      probability: "Probability",
      impact: "Impact",
      trigger: "Trigger",
      mitigation: "Mitigation",
      successMetrics: "Success metrics",
      expectedSignals: "Expected signals",
      failureSignals: "Failure signals",
      reviewQuestions: "Review questions",
      actualOutcome: "Actual outcome",
      lessons: "Lessons",
      notReviewed: "Not reviewed yet.",
      validation: "Validation",
      evidenceNotes: "Evidence Notes",
      warnings: "Warnings"
    };
  }
  return {
    fieldValue: ["항목", "값"],
    type: "유형",
    status: "상태",
    question: "질문",
    owner: "담당자",
    decision: "판단",
    selectedOption: "선택지",
    confidence: "확신도",
    completeness: "완성도",
    evidenceQuality: "근거 품질",
    scoreMeaning: "점수 의미",
    scoreMeaningText: "완성도는 기록 구조 점수이며, 결정이 맞다는 뜻이 아닙니다.",
    maturity: "성숙도",
    recommendation: "추천",
    decisionFrame: "결정 프레임",
    context: "맥락",
    options: "선택지",
    optionScorecard: "선택지 점수표",
    hypotheses: "가설",
    evidence: "근거",
    assumptionRegister: "가정 목록",
    risks: "리스크",
    decisionCriteria: "판단 기준",
    changeMind: "생각을 바꿀 조건",
    openQuestions: "열린 질문",
    nextActions: "다음 행동",
    postDecisionReview: "사후 리뷰",
    audit: "감사",
    qualityChecks: "품질 체크",
    atAGlance: "한눈에 보기",
    currentCall: "현재 판단",
    whyConfidenceIsLow: "확신도가 낮은 이유",
    nextMove: "다음 행동",
    readNext: "다음에 볼 것",
    addConcreteEvidence: "구체적인 근거 하나를 추가한 뒤 memo를 다시 생성하세요.",
    reviewEvidenceFirst: "결정했다고 보기 전에 근거, 열린 질문, 다음 행동을 먼저 확인하세요.",
    noRecommendation: "추천 요약이 아직 없습니다.",
    noContext: "맥락이 아직 없습니다.",
    unassigned: "미지정",
    undecided: "미정",
    class: "분류",
    reversibility: "되돌릴 수 있음",
    urgency: "긴급도",
    defaultAction: "기본 행동",
    desiredOutcome: "원하는 결과",
    constraints: "제약",
    nonGoals: "하지 않을 것",
    upside: "기대효과",
    downside: "하방",
    whyItMatters: "중요한 이유",
    assumptions: "가정",
    counterarguments: "반론",
    disconfirmingSignals: "반증 신호",
    source: "출처",
    strength: "강도",
    sourceType: "출처 유형",
    recency: "시점",
    notes: "메모",
    probability: "확률",
    impact: "영향",
    trigger: "트리거",
    mitigation: "완화책",
    successMetrics: "성공 지표",
    expectedSignals: "기대 신호",
    failureSignals: "실패 신호",
    reviewQuestions: "리뷰 질문",
    actualOutcome: "실제 결과",
    lessons: "교훈",
    notReviewed: "아직 리뷰하지 않음",
    validation: "검증",
    evidenceNotes: "근거 메모",
    warnings: "경고"
  };
}

function table(rows, headers = ["Field", "Value"]) {
  return [
    `| ${escapeCell(headers[0])} | ${escapeCell(headers[1])} |`,
    "| --- | --- |",
    ...rows.map(([key, value]) => `| ${escapeCell(key)} | ${escapeCell(value)} |`)
  ].join("\n");
}

function renderMemoAtAGlance(decision, audit, evidenceQuality, labels = memoLabels(false)) {
  const bestOption = audit.strongest_option?.name || decision.recommendation?.selected_option || "N/A";
  const nextAction = evidenceQuality.score < 60
    ? labels.addConcreteEvidence
    : (decision.next_actions || [])[0] || audit.next_actions[0] || labels.addConcreteEvidence;
  const evidenceReason = localizeEvidenceReason(evidenceQuality.reasons[0], labels) || labels.reviewEvidenceFirst;
  return table([
    [labels.currentCall, `${decision.recommendation?.decision || labels.undecided} (${labels.selectedOption}: ${bestOption})`],
    [labels.whyConfidenceIsLow, evidenceReason],
    [labels.nextMove, nextAction],
    [labels.readNext, labels.reviewEvidenceFirst]
  ], labels.fieldValue);
}

function localizeEvidenceReason(reason, labels = memoLabels(false)) {
  if (!reason || labels.fieldValue[0] !== "항목") return reason;
  const strongMatch = reason.match(/^(\d+)\/(\d+) strong evidence$/);
  if (strongMatch) return `강한 근거 ${strongMatch[1]}/${strongMatch[2]}개`;
  const primaryMatch = reason.match(/^(\d+)% primary or observed$/);
  if (primaryMatch) return `1차 출처 또는 직접 관찰 근거 ${primaryMatch[1]}%`;
  if (reason === "generic framework evidence still dominates") return "일반적인 프레임워크 근거가 아직 많습니다";
  if (reason === "needs more direct user or product evidence") return "직접 사용자 또는 제품 사용 근거가 더 필요합니다";
  if (reason === "No evidence items are attached.") return "아직 근거가 없습니다";
  return reason;
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function bulletList(items) {
  if (!items || items.length === 0) return "- None";
  return items.map((item) => `- ${item}`).join("\n");
}

function renderDecisionFrame(frame = {}, labels = memoLabels(false)) {
  return table([
    [labels.class, frame.decision_class || ""],
    [labels.reversibility, frame.reversibility || ""],
    [labels.urgency, frame.urgency || ""],
    [labels.defaultAction, frame.default_action || ""],
    [labels.desiredOutcome, frame.desired_outcome || ""],
    [labels.constraints, (frame.constraints || []).join("; ")],
    [labels.nonGoals, (frame.non_goals || []).join("; ")]
  ], labels.fieldValue);
}

function renderOption(option, labels = memoLabels(false)) {
  return `${option.id}: ${option.name} - ${option.description} ${labels.upside}: ${option.upside || "N/A"} ${labels.downside}: ${option.downside || "N/A"} ${labels.reversibility}: ${option.reversibility || "N/A"}`;
}

function renderOptionScorecard(decision, labels = memoLabels(false)) {
  const scored = scoreOptions(decision);
  if (!scored.length) return "- None";
  const korean = labels.fieldValue[0] === "항목";
  return [
    korean ? "| 선택지 | 점수 | 메모 |" : "| Option | Score | Notes |",
    "| --- | ---: | --- |",
    ...scored.map((item) => {
      const notes = item.breakdown
        .map((part) => `${part.criterion}: ${part.score ?? "N/A"}/5`)
        .join("; ");
      return `| ${escapeCell(item.name)} | ${Math.round(item.weighted_score * 100)}% | ${escapeCell(notes)} |`;
    })
  ].join("\n");
}

function renderHypothesis(hypothesis, labels = memoLabels(false)) {
  return [
    `### ${hypothesis.id}: ${hypothesis.statement}`,
    hypothesis.why_it_matters ? `${labels.whyItMatters}: ${hypothesis.why_it_matters}` : "",
    `${labels.confidence}: ${percent(hypothesis.confidence)}`,
    `${labels.evidence}:\n${bulletList(hypothesis.evidence || [])}`,
    `${labels.assumptions}:\n${bulletList(hypothesis.assumptions || [])}`,
    `${labels.counterarguments}:\n${bulletList(hypothesis.counterarguments || [])}`,
    `${labels.disconfirmingSignals}:\n${bulletList(hypothesis.disconfirming_signals || [])}`
  ].filter(Boolean).join("\n\n");
}

function renderEvidence(evidence, labels = memoLabels(false)) {
  return `${evidence.claim} ${labels.source}: ${evidence.source}. ${labels.strength}: ${evidence.strength}. ${labels.sourceType}: ${evidence.source_type || "N/A"}. ${labels.recency}: ${evidence.recency || "N/A"}. ${labels.notes}: ${evidence.notes || "N/A"}`;
}

function renderAssumptionRegister(assumptions = [], labels = memoLabels(false)) {
  if (!assumptions.length) return "- None";
  return [
    labels.fieldValue[0] === "항목" ? "| 가정 | 중요도 | 테스트 | 담당자 |" : "| Assumption | Importance | Test | Owner |",
    "| --- | --- | --- | --- |",
    ...assumptions.map((item) => (
      `| ${escapeCell(item.assumption)} | ${escapeCell(item.importance)} | ${escapeCell(item.test)} | ${escapeCell(item.owner || "")} |`
    ))
  ].join("\n");
}

function renderRisk(risk, labels = memoLabels(false)) {
  return `${risk.risk} ${labels.probability}: ${risk.probability || "N/A"}. ${labels.impact}: ${risk.impact || "N/A"}. ${labels.trigger}: ${risk.trigger || "N/A"}. ${labels.mitigation}: ${risk.mitigation}`;
}

function renderCriterion(criterion) {
  return `${criterion.id}: ${criterion.name} (weight ${criterion.weight ?? 1})${criterion.description ? ` - ${criterion.description}` : ""}`;
}

function renderReview(review = {}, labels = memoLabels(false)) {
  return [
    `${labels.successMetrics}:\n${bulletList(review.success_metrics || [])}`,
    `${labels.expectedSignals}:\n${bulletList(review.expected_signals || [])}`,
    `${labels.failureSignals}:\n${bulletList(review.failure_signals || [])}`,
    `${labels.reviewQuestions}:\n${bulletList(review.review_questions || [])}`,
    `${labels.actualOutcome}: ${review.actual_outcome || labels.notReviewed}`,
    `${labels.lessons}:\n${bulletList(review.lessons || [])}`
  ].join("\n\n");
}

function renderAudit(audit, evidenceQuality, labels = memoLabels(false)) {
  const evidenceNotes = evidenceQuality.reasons
    .map((reason) => localizeEvidenceReason(reason, labels))
    .join("; ");
  return [
    `${labels.maturity}: ${audit.maturity}`,
    `${labels.validation}: ${audit.validation.valid ? "valid" : "invalid"}`,
    `${labels.completeness}: ${Math.round(audit.score.ratio * 100)}% ${audit.score.grade} (${audit.score.score}/${audit.score.max_score} structure points)`,
    `${labels.evidenceQuality}: ${evidenceQuality.score}% ${evidenceQuality.grade}`,
    `${labels.evidenceNotes}: ${evidenceNotes}`,
    `${labels.warnings}:\n${bulletList(audit.warnings)}`,
    `${labels.nextActions}:\n${bulletList(audit.next_actions)}`
  ].join("\n\n");
}

function renderTypeSpecific(decision, labels = memoLabels(false)) {
  const korean = labels.fieldValue[0] === "항목";
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
      `## ${korean ? "사업 스냅샷" : "Business Snapshot"}`,
      table([
        [korean ? "전략 목표" : "Strategic Goal", decision.strategic_goal || ""],
        [korean ? "이해관계자" : "Stakeholders", (decision.stakeholders || []).join(", ")],
        [korean ? "매출 영향" : "Revenue Impact", decision.financial_impact?.revenue || ""],
        [korean ? "비용 영향" : "Cost Impact", decision.financial_impact?.cost || ""],
        [korean ? "현금흐름 영향" : "Cash Flow Impact", decision.financial_impact?.cash_flow || ""],
        [korean ? "회수 기간" : "Payback", decision.financial_impact?.payback_period || ""],
        [korean ? "실행 담당자" : "Execution Owner", decision.execution_plan?.owner || ""],
        [korean ? "운영 리듬" : "Cadence", decision.operating_cadence?.cadence || ""]
      ], labels.fieldValue),
      `## ${korean ? "제약" : "Constraints"}`,
      bulletList(decision.constraints || []),
      `## ${korean ? "마일스톤" : "Milestones"}`,
      bulletList(decision.execution_plan?.milestones || []),
      `## ${korean ? "의존성" : "Dependencies"}`,
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
