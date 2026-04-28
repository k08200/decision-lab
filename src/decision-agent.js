import fs from "node:fs";
import path from "node:path";
import {
  VALID_ROLES,
  auditDecision,
  buildPromptChain,
  renderDecisionBrief,
  renderDecisionMemo,
  renderReviewPlan,
  scoreOptions,
  validateDecision
} from "./decision-core.js";
import { createTemplate } from "./templates.js";

export function inferDecisionType(question) {
  const text = question.toLowerCase();
  if (matches(text, ["stock", "ticker", "shares", "buy", "sell", "hold", "portfolio", "valuation", "asset", "주식", "매수", "매도", "투자", "포트폴리오"])) {
    return "investment";
  }
  if (matches(text, ["runway", "burn", "cash", "margin", "budget", "hire", "hiring", "fundraise", "재무", "런웨이", "현금", "채용", "예산"])) {
    return "finance";
  }
  if (matches(text, ["pricing", "product", "launch", "strategy", "sales", "customer", "enterprise", "roadmap", "경영", "전략", "가격", "고객", "제품", "사업"])) {
    return "business";
  }
  return "general";
}

export function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "decision";
}

export function createDecisionFromQuestion(question, options = {}) {
  if (!question || !question.trim()) throw new Error("Question is required");

  const type = options.type || inferDecisionType(question);
  const decision = createTemplate(type);
  const now = options.now || new Date().toISOString().slice(0, 10);
  const owner = options.owner || "decision owner";

  decision.status = "researching";
  decision.title = titleFromQuestion(question);
  decision.question = normalizeQuestion(question);
  decision.created_at = now;
  decision.updated_at = now;
  decision.owner = owner;
  decision.context = `Raw decision request: ${question}`;
  decision.decision_frame = frameFor(type);
  decision.recommendation = {
    decision: "research before deciding",
    selected_option: "B",
    summary: "The bot has created a structured decision record and recommends improving evidence before committing.",
    confidence: 0.35,
    decision_deadline: "",
    review_date: ""
  };
  decision.hypotheses = hypothesesFor(type);
  decision.options = optionsFor(type);
  decision.evidence = evidenceFor(question);
  decision.assumption_register = assumptionsFor(type);
  decision.risks = risksFor(type);
  decision.decision_criteria = criteriaFor(type);
  decision.option_scores = optionScoresFor(decision.options, decision.decision_criteria);
  decision.what_would_change_my_mind = changeMindFor(type);
  decision.open_questions = openQuestionsFor(type);
  decision.next_actions = nextActionsFor(type);
  decision.post_decision_review = reviewFor(type);

  if (type === "investment") fillInvestment(decision, question);
  if (type === "business") fillBusiness(decision);
  if (type === "finance") fillFinance(decision);

  return decision;
}

export function runDecisionWorkflow(decision) {
  const validation = validateDecision(decision);
  const audit = auditDecision(decision);
  const prompts = buildPromptChain(decision);

  return {
    validation,
    audit,
    artifacts: {
      "audit.json": `${JSON.stringify(audit, null, 2)}\n`,
      "compare.md": renderOptionComparison(decision),
      "memo.md": validation.valid ? renderDecisionMemo(decision) : renderInvalidMemo(decision, validation),
      "brief.md": renderDecisionBrief(decision),
      "review-plan.md": renderReviewPlan(decision),
      "agent-report.md": renderAgentReport(decision, audit, prompts),
      ...Object.fromEntries(prompts.map((item) => [`prompts/${item.role}.md`, item.prompt]))
    }
  };
}

export function writeWorkflowArtifacts(outDir, workflow) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [relativePath, content] of Object.entries(workflow.artifacts)) {
    const fullPath = path.join(outDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
}

export function renderLedger(records) {
  const rows = records.map(({ filePath, decision }) => {
    const audit = auditDecision(decision);
    return [
      filePath,
      decision.status || "draft",
      decision.decision_type,
      decision.title,
      decision.recommendation?.decision || "undecided",
      audit.maturity,
      `${audit.score.score}/${audit.score.max_score}`,
      decision.recommendation?.review_date || ""
    ];
  });

  return [
    "# Decision Ledger",
    "",
    "| File | Status | Type | Title | Decision | Maturity | Score | Review |",
    "| --- | --- | --- | --- | --- | --- | ---: | --- |",
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`)
  ].join("\n") + "\n";
}

export function closeDecision(decision, { outcome = "", lessons = [] } = {}) {
  const next = structuredClone(decision);
  next.status = "reviewed";
  next.updated_at = new Date().toISOString().slice(0, 10);
  next.post_decision_review = {
    ...next.post_decision_review,
    actual_outcome: outcome || next.post_decision_review?.actual_outcome || "",
    lessons: lessons.length ? lessons : (next.post_decision_review?.lessons || [])
  };
  return next;
}

export function renderOptionComparison(decision) {
  const rows = scoreOptions(decision);
  if (!rows.length) return "No option scores found.\n";
  return [
    "# Option Comparison",
    "",
    "| Rank | Option | Weighted Score | Points |",
    "| ---: | --- | ---: | ---: |",
    ...rows.map((item, index) => (
      `| ${index + 1} | ${escapeCell(item.name)} | ${Math.round(item.weighted_score * 100)}% | ${item.points}/${item.max_points} |`
    ))
  ].join("\n") + "\n";
}

function renderAgentReport(decision, audit, prompts) {
  const roles = prompts.map((item) => item.role).join(", ");
  return [
    `# Agent Run: ${decision.title}`,
    "",
    `Question: ${decision.question}`,
    `Decision type: ${decision.decision_type}`,
    `Maturity: ${audit.maturity}`,
    `Validation: ${audit.validation.valid ? "valid" : "invalid"}`,
    `Score: ${audit.score.score}/${audit.score.max_score}`,
    "",
    "## Generated Artifacts",
    "- audit.json",
    "- compare.md",
    "- memo.md",
    "- brief.md",
    "- review-plan.md",
    "- prompts/*.md",
    "",
    "## Role Chain",
    roles,
    "",
    "## Next Actions",
    audit.next_actions.length ? audit.next_actions.map((item) => `- ${item}`).join("\n") : "- Use the prompt chain to improve evidence and update the source JSON record."
  ].join("\n") + "\n";
}

function renderInvalidMemo(decision, validation) {
  return [
    `# ${decision.title}`,
    "",
    "This decision record is not valid yet.",
    "",
    "## Validation Issues",
    validation.issues.map((item) => `- ${item.path}: ${item.message}`).join("\n")
  ].join("\n") + "\n";
}

function matches(text, words) {
  return words.some((word) => text.includes(word));
}

function titleFromQuestion(question) {
  const clean = question.trim().replace(/[?？]+$/g, "");
  return clean.length > 80 ? `${clean.slice(0, 77)}...` : clean;
}

function normalizeQuestion(question) {
  const clean = question.trim();
  return /[?？]$/.test(clean) ? clean : `${clean}?`;
}

function frameFor(type) {
  const map = {
    investment: {
      decision_class: "capital allocation",
      desired_outcome: "Improve expected portfolio return while protecting against permanent capital loss.",
      default_action: "wait"
    },
    business: {
      decision_class: "operating strategy",
      desired_outcome: "Make a strategy choice that can be executed, measured, and reversed or expanded based on signal.",
      default_action: "pilot"
    },
    finance: {
      decision_class: "financial allocation",
      desired_outcome: "Improve growth or execution capacity without creating unacceptable cash or runway risk.",
      default_action: "stage commitment"
    },
    general: {
      decision_class: "general decision",
      desired_outcome: "Choose the option with the best risk-adjusted expected outcome.",
      default_action: "wait"
    }
  };
  const item = map[type] || map.general;
  return {
    decision_class: item.decision_class,
    reversibility: "medium",
    urgency: "medium",
    default_action: item.default_action,
    desired_outcome: item.desired_outcome,
    constraints: ["Do not make the final decision before critical assumptions are tested."],
    non_goals: ["Do not optimize for a confident-sounding answer over an auditable process."]
  };
}

function hypothesesFor(type) {
  return [
    {
      id: "H1",
      statement: hypothesisStatement(type, true),
      why_it_matters: "This is the core reason the decision might be worth taking.",
      confidence: 0.45,
      evidence: ["Initial decision prompt indicates this may be a meaningful opportunity."],
      assumptions: ["The desired outcome is correctly defined.", "The most important constraint has been identified."],
      counterarguments: ["The opportunity may be less attractive once primary evidence is collected."],
      disconfirming_signals: ["Primary evidence fails to support the main thesis."]
    },
    {
      id: "H2",
      statement: hypothesisStatement(type, false),
      why_it_matters: "This is the core reason the decision may be too risky or premature.",
      confidence: 0.55,
      evidence: ["The record currently needs stronger evidence before commitment."],
      assumptions: ["Waiting or staging the decision preserves useful optionality."],
      counterarguments: ["Waiting can create opportunity cost or execution delay."],
      disconfirming_signals: ["Delay becomes more costly than the downside of acting."]
    }
  ];
}

function hypothesisStatement(type, positive) {
  if (type === "investment") {
    return positive
      ? "The asset offers attractive risk-adjusted return under conservative assumptions."
      : "Valuation, sizing, or thesis fragility may make immediate action premature.";
  }
  if (type === "business") {
    return positive
      ? "The decision can improve a strategic or operating bottleneck."
      : "Execution cost, customer impact, or organizational distraction may outweigh the upside.";
  }
  if (type === "finance") {
    return positive
      ? "The financial allocation improves execution capacity enough to justify the cost."
      : "The allocation may reduce runway or flexibility before revenue evidence is strong enough.";
  }
  return positive
    ? "Acting may create a better outcome than the default path."
    : "The default path may be safer until better evidence is available.";
}

function optionsFor(type) {
  if (type === "investment") {
    return [
      option("A", "Act now", "Take the proposed investment action now.", "Captures upside if the thesis is right.", "Acts before evidence is fully upgraded.", "Capital and concentration risk.", "medium"),
      option("B", "Stage the decision", "Use a smaller tranche or wait for one more evidence checkpoint.", "Balances upside with evidence discipline.", "May miss some upside.", "Opportunity cost.", "high"),
      option("C", "Do not act", "Avoid the proposed action for now.", "Preserves cash and flexibility.", "May miss a good opportunity.", "Opportunity cost.", "high")
    ];
  }
  if (type === "business") {
    return [
      option("A", "Full rollout", "Commit to the decision across the relevant business area.", "Fastest strategic impact.", "Highest execution and trust risk.", "Team focus and operating complexity.", "low"),
      option("B", "Pilot", "Run the smallest useful test with clear success and kill criteria.", "Creates signal while limiting blast radius.", "Slower than full rollout.", "Pilot setup and coordination.", "medium"),
      option("C", "Wait", "Defer the decision and keep the current operating model.", "Avoids disruption.", "Can leave the bottleneck unresolved.", "Opportunity cost.", "high")
    ];
  }
  if (type === "finance") {
    return [
      option("A", "Commit fully", "Approve the full spend or allocation now.", "Maximum speed if the thesis is right.", "Largest cash and flexibility risk.", "Burn, budget, or runway.", "low"),
      option("B", "Stage commitment", "Approve a smaller first step tied to measurable evidence.", "Balances speed and survivability.", "May under-resource the opportunity.", "Some spend plus management attention.", "medium"),
      option("C", "Preserve cash", "Delay the spend until stronger evidence exists.", "Maximum flexibility.", "May slow growth or execution.", "Opportunity cost.", "high")
    ];
  }
  return [
    option("A", "Act now", "Take the action now.", "Fastest path to upside.", "Acts before evidence is complete.", "Time, money, or attention.", "medium"),
    option("B", "Stage", "Take a smaller reversible step.", "Creates signal with less downside.", "Can be slower.", "Some setup cost.", "high"),
    option("C", "Wait", "Do nothing for now.", "Preserves optionality.", "May miss timing.", "Opportunity cost.", "high")
  ];
}

function option(id, name, description, upside, downside, cost, reversibility) {
  return {
    id,
    name,
    description,
    expected_value: "To be estimated after evidence collection.",
    upside,
    downside,
    cost,
    reversibility
  };
}

function evidenceFor(question) {
  return [
    {
      claim: "A decision has been identified and needs structured evaluation.",
      source: `User request: ${question}`,
      strength: "weak",
      source_type: "user input",
      recency: "current",
      notes: "This establishes the decision, not the conclusion."
    },
    {
      claim: "The record still needs primary or directly measured evidence before high confidence is justified.",
      source: "Decision Lab evidence quality rule.",
      strength: "medium",
      source_type: "framework rule",
      recency: "current",
      notes: "The bot intentionally avoids fabricating external facts."
    },
    {
      claim: "A staged option is useful when uncertainty is material and reversibility is available.",
      source: "Decision Lab operating framework.",
      strength: "medium",
      source_type: "framework rule",
      recency: "current",
      notes: "Use this as a process claim, not a domain claim."
    }
  ];
}

function assumptionsFor(type) {
  return [
    {
      assumption: "The question is framed around the right decision, not a symptom of another decision.",
      importance: "high",
      test: "Write the default action and compare it against at least two alternatives.",
      owner: "decision owner"
    },
    {
      assumption: "The decision can be improved by collecting targeted evidence before commitment.",
      importance: "high",
      test: `Collect the highest-leverage ${type} evidence listed in next_actions.`,
      owner: "decision owner"
    }
  ];
}

function risksFor(type) {
  return [
    {
      risk: "False confidence",
      probability: "medium",
      impact: "high",
      trigger: "Recommendation confidence rises before source quality improves.",
      mitigation: "Keep confidence low until evidence, assumptions, and counterarguments are upgraded."
    },
    {
      risk: "Opportunity cost",
      probability: "medium",
      impact: "medium",
      trigger: "The staged or wait option delays a time-sensitive upside.",
      mitigation: "Set a decision deadline and define the minimum evidence needed."
    },
    {
      risk: type === "investment" ? "Position sizing error" : type === "finance" ? "Cash flexibility loss" : "Execution distraction",
      probability: "medium",
      impact: "high",
      trigger: "The action consumes more capital, time, or focus than the record assumed.",
      mitigation: "Use a staged option with explicit stop or review criteria."
    }
  ];
}

function criteriaFor(type) {
  const first = type === "investment" ? "Risk-adjusted expected return" : type === "finance" ? "Runway and cash protection" : "Strategic upside";
  const second = type === "business" ? "Execution feasibility" : "Downside protection";
  return [
    { id: "C1", name: first, weight: 2, description: "Primary upside or survivability criterion." },
    { id: "C2", name: second, weight: 2, description: "Whether the decision avoids unacceptable downside." },
    { id: "C3", name: "Evidence quality", weight: 1, description: "Whether the conclusion is supported by strong enough evidence." }
  ];
}

function optionScoresFor(options, criteria) {
  const staged = { A: [3, 2, 2], B: [4, 4, 3], C: [2, 5, 3] };
  return options.flatMap((optionItem) => criteria.map((criterion, index) => ({
    option_id: optionItem.id,
    criterion_id: criterion.id,
    score: staged[optionItem.id]?.[index] ?? 3,
    rationale: "Initial bot score; revise after role review and evidence collection."
  })));
}

function changeMindFor(type) {
  return [
    "Primary evidence contradicts the main hypothesis.",
    "The downside case becomes larger or less reversible than assumed.",
    type === "investment"
      ? "Position sizing would create unacceptable portfolio concentration."
      : type === "finance"
        ? "Updated model shows runway or cash risk exceeds the guardrail."
        : "Execution capacity is insufficient for the recommended path."
  ];
}

function openQuestionsFor(type) {
  return [
    "What is the strongest evidence for the opposite decision?",
    "Which assumption would break the recommendation if false?",
    type === "investment"
      ? "What valuation, sizing, and time-horizon assumptions are being used?"
      : type === "finance"
        ? "What model driver matters most under the downside case?"
        : "What is the smallest useful pilot and who owns it?"
  ];
}

function nextActionsFor(type) {
  return [
    "Run analyst and skeptic prompts against this record.",
    "Upgrade evidence with primary or directly measured sources.",
    "Revise option scores after evidence collection.",
    type === "investment"
      ? "Define exact position sizing and valuation guardrails."
      : type === "finance"
        ? "Refresh the financial model and downside sensitivity checks."
        : "Define pilot owner, milestones, dependencies, and kill criteria."
  ];
}

function reviewFor(type) {
  return {
    success_metrics: [
      "Selected option performs better than the default action.",
      "Main assumptions are confirmed or falsified by the review date.",
      "Downside remains within the stated guardrails."
    ],
    expected_signals: [
      "Evidence quality improves before final commitment.",
      "Option scores remain consistent after role review."
    ],
    failure_signals: [
      "Confidence rises while evidence quality stays weak.",
      type === "investment" ? "Risk limit is breached." : "Execution or cash cost exceeds the plan."
    ],
    review_questions: [
      "Was the original decision process sound?",
      "Which assumption mattered most?",
      "What should change in the next decision record?"
    ],
    actual_outcome: "",
    lessons: []
  };
}

function fillInvestment(decision, question) {
  const ticker = extractTicker(question);
  decision.asset = {
    name: ticker || "Target asset",
    ticker: ticker || "TBD",
    asset_class: "equity",
    market: "TBD",
    time_horizon: "12-36 months",
    proposed_action: "research before acting"
  };
  decision.portfolio_context = {
    role_in_portfolio: "To be defined before commitment.",
    current_exposure: "TBD",
    target_exposure: "TBD",
    sizing_rule: "No action until maximum position size and downside tolerance are defined.",
    liquidity_needs: "Preserve cash until portfolio-level constraints are checked."
  };
  decision.valuation = {
    current_price: null,
    base_case: "Base case must be built from current fundamentals and conservative assumptions.",
    bull_case: "Bull case requires identifiable upside catalysts.",
    bear_case: "Bear case must include valuation compression and thesis failure.",
    margin_of_safety: "Require margin of safety before increasing exposure.",
    valuation_method: "TBD"
  };
  decision.catalysts = ["Next primary-source evidence checkpoint.", "Valuation model update.", "Position sizing review."];
  decision.risk_controls = ["Predefine max exposure.", "Use staged action.", "Review thesis after major new information."];
}

function fillBusiness(decision) {
  decision.strategic_goal = "Clarify and improve the highest-leverage business outcome tied to this decision.";
  decision.stakeholders = ["Decision owner", "Customers or users", "Finance", "Execution team"];
  decision.constraints = ["Do not roll out broadly until pilot success criteria are explicit."];
  decision.financial_impact = {
    revenue: "TBD",
    cost: "TBD",
    cash_flow: "TBD",
    payback_period: "TBD"
  };
  decision.execution_plan = {
    owner: "decision owner",
    milestones: ["Define pilot", "Collect evidence", "Review signal", "Decide rollout or stop"],
    dependencies: ["Evidence source", "Owner availability", "Measurement plan"],
    smallest_useful_pilot: "Run a narrow pilot with clear success and kill criteria.",
    kill_criteria: ["Pilot misses success metric.", "Execution cost exceeds plan.", "Customer or stakeholder risk becomes unacceptable."]
  };
  decision.operating_cadence = {
    cadence: "Weekly until decision deadline, then review on scheduled date.",
    review_owner: "decision owner",
    decision_log_channel: "decision-lab"
  };
}

function fillFinance(decision) {
  decision.financial_hypothesis = "A staged commitment can improve execution while preserving financial flexibility.";
  decision.model_driver = "TBD: revenue conversion, burn, margin, runway, or payback.";
  decision.planning_horizon = "6-12 months";
  decision.base_case = "Base case keeps the financial guardrail intact.";
  decision.upside_case = "Upside case shows the allocation pays back through measurable operating improvement.";
  decision.downside_case = "Downside case shows cost increases without enough revenue or efficiency improvement.";
  decision.sensitivity_checks = [
    "Downside if revenue or benefit is delayed by three months.",
    "Downside if cost is 20% above plan.",
    "Break-even threshold for the commitment."
  ];
  decision.financial_guardrails = [
    "Do not breach minimum runway or cash threshold.",
    "Stage commitment until leading indicators improve.",
    "Review before expanding spend."
  ];
}

function extractTicker(question) {
  const candidates = question.match(/\b[A-Z]{2,5}\b/g) || [];
  return candidates.find((item) => !["CEO", "CFO", "ARR", "B2B", "SaaS".toUpperCase()].includes(item)) || "";
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}
