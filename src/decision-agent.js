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
import {
  renderDecisionChecklist,
  renderDecisionGraph,
  renderPremortem,
  renderResearchPlan,
  summarizeDecisionHealth
} from "./decision-tools.js";
import { createTemplate } from "./templates.js";

export const CURRENT_SCHEMA_VERSION = "0.2.0";

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
  if (hasKorean(question)) localizeKoreanDecision(decision, type, question);

  return decision;
}

export function migrateDecision(decision, options = {}) {
  const type = normalizeDecisionType(decision.decision_type);
  const question = decision.question || decision.title || "Migrated decision";
  const base = createDecisionFromQuestion(question, {
    type,
    owner: decision.owner || "decision owner",
    now: options.now || new Date().toISOString().slice(0, 10)
  });
  const migrated = mergeMeaningful(base, decision);
  migrated.decision_type = type;
  migrated.schema_version = CURRENT_SCHEMA_VERSION;
  migrated.updated_at = options.now || new Date().toISOString().slice(0, 10);
  migrated.status = migrated.status || "researching";
  return migrated;
}

export function renderMigrationReport(before, after) {
  const beforeValidation = validateDecision(before);
  const afterValidation = validateDecision(after);
  return [
    "# Migration Report",
    "",
    `Before schema: ${before.schema_version || "unknown"}`,
    `After schema: ${after.schema_version || "unknown"}`,
    `Before valid: ${beforeValidation.valid ? "yes" : "no"}`,
    `After valid: ${afterValidation.valid ? "yes" : "no"}`,
    "",
    "## Decision",
    `- Title: ${after.title}`,
    `- Type: ${after.decision_type}`,
    `- Status: ${after.status}`,
    "",
    "## Remaining Issues",
    afterValidation.valid
      ? "- None"
      : afterValidation.issues.map((item) => `- ${item.path}: ${item.message}`).join("\n")
  ].join("\n") + "\n";
}

export function parseInboxQuestions(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}

export function createDecisionsFromInbox(text, options = {}) {
  return parseInboxQuestions(text).map((question) => ({
    slug: slugify(question),
    decision: createDecisionFromQuestion(question, options)
  }));
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
      "checklist.md": renderDecisionChecklist(decision),
      "premortem.md": renderPremortem(decision),
      "research-plan.md": renderResearchPlan(decision),
      "graph.md": renderDecisionGraph(decision),
      "health.json": `${JSON.stringify(summarizeDecisionHealth(decision), null, 2)}\n`,
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
    "| File | Status | Type | Title | Decision | Maturity | Completeness | Review |",
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
    `Completeness: ${audit.score.score}/${audit.score.max_score}`,
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

function hasKorean(text) {
  return /[가-힣]/.test(text);
}

function localizeKoreanDecision(decision, type, question) {
  decision.context = `원본 결정 요청: ${question}`;
  decision.decision_frame = koreanFrameFor(type);
  decision.recommendation = {
    ...decision.recommendation,
    decision: "결정 전 추가 조사",
    summary: "이 기록은 최종 결론이 아니라, 근거를 더 모아 작은 파일럿으로 검증하라는 초안입니다."
  };
  decision.hypotheses = koreanHypothesesFor(type);
  decision.options = koreanOptionsFor(type);
  decision.evidence = koreanEvidenceFor(question);
  decision.assumption_register = koreanAssumptionsFor(type);
  decision.risks = koreanRisksFor(type);
  decision.decision_criteria = koreanCriteriaFor(type);
  decision.option_scores = optionScoresFor(decision.options, decision.decision_criteria)
    .map((item) => ({ ...item, rationale: "초기 점수입니다. 실제 근거와 역할별 검토 후 수정하세요." }));
  decision.what_would_change_my_mind = koreanChangeMindFor(type);
  decision.open_questions = koreanOpenQuestionsFor(type);
  decision.next_actions = koreanNextActionsFor(type);
  decision.post_decision_review = koreanReviewFor(type);

  if (type === "business") {
    decision.strategic_goal = "이 결정과 연결된 가장 중요한 사업 성과를 명확히 하고 개선한다.";
    decision.stakeholders = ["결정권자", "고객 또는 사용자", "재무 담당자", "실행 팀"];
    decision.constraints = ["파일럿 성공 기준이 명확해지기 전에는 넓게 적용하지 않는다."];
    decision.financial_impact = {
      revenue: "미정",
      cost: "미정",
      cash_flow: "미정",
      payback_period: "미정"
    };
    decision.execution_plan = {
      owner: decision.owner || "decision owner",
      milestones: ["파일럿 정의", "근거 수집", "신호 검토", "확대 또는 중단 결정"],
      dependencies: ["근거 출처", "담당자 시간", "측정 계획"],
      smallest_useful_pilot: "성공 기준과 중단 기준이 있는 가장 작은 실험을 실행한다.",
      kill_criteria: ["파일럿이 성공 지표를 충족하지 못함", "실행 비용이 계획을 초과함", "고객 또는 이해관계자 리스크가 허용 범위를 넘음"]
    };
    decision.operating_cadence = {
      cadence: "결정 기한까지 매주 검토하고, 예정된 날짜에 사후 리뷰를 진행한다.",
      review_owner: decision.owner || "decision owner",
      decision_log_channel: "decision-lab"
    };
  }
}

function koreanFrameFor(type) {
  const map = {
    investment: {
      decision_class: "자본 배분",
      desired_outcome: "영구 손실 위험을 통제하면서 포트폴리오의 기대수익을 개선한다.",
      default_action: "기다리기"
    },
    business: {
      decision_class: "운영 전략",
      desired_outcome: "실행 가능하고 측정 가능하며, 신호에 따라 되돌리거나 확대할 수 있는 선택을 만든다.",
      default_action: "파일럿"
    },
    finance: {
      decision_class: "재무 배분",
      desired_outcome: "현금과 런웨이 위험을 과도하게 만들지 않으면서 성장 또는 실행력을 높인다.",
      default_action: "단계적 집행"
    },
    general: {
      decision_class: "일반 의사결정",
      desired_outcome: "위험 대비 기대 결과가 가장 좋은 선택지를 고른다.",
      default_action: "기다리기"
    }
  };
  const item = map[type] || map.general;
  return {
    decision_class: item.decision_class,
    reversibility: "medium",
    urgency: "medium",
    default_action: item.default_action,
    desired_outcome: item.desired_outcome,
    constraints: ["핵심 가정이 검증되기 전에는 최종 결정을 내리지 않는다."],
    non_goals: ["근거보다 그럴듯한 확신을 우선하지 않는다."]
  };
}

function koreanHypothesesFor(type) {
  return [
    {
      id: "H1",
      statement: koreanHypothesisStatement(type, true),
      why_it_matters: "이 결정이 의미 있는 이유를 설명하는 핵심 가설입니다.",
      confidence: 0.45,
      evidence: ["초기 질문은 이 결정이 검토할 가치가 있음을 보여줍니다."],
      assumptions: ["원하는 결과가 정확히 정의되어 있다.", "가장 중요한 제약 조건이 식별되어 있다."],
      counterarguments: ["직접 근거를 모으면 기회가 생각보다 작을 수 있다."],
      disconfirming_signals: ["주요 근거가 핵심 가설을 지지하지 않는다."]
    },
    {
      id: "H2",
      statement: koreanHypothesisStatement(type, false),
      why_it_matters: "이 결정을 미루거나 작게 실험해야 하는 이유를 설명하는 핵심 가설입니다.",
      confidence: 0.55,
      evidence: ["현재 기록은 높은 확신을 갖기 전에 더 강한 근거가 필요합니다."],
      assumptions: ["기다리거나 단계적으로 진행하면 유용한 선택권이 보존된다."],
      counterarguments: ["기다리는 동안 기회비용이나 실행 지연이 커질 수 있다."],
      disconfirming_signals: ["지연 비용이 실행 리스크보다 더 커진다."]
    }
  ];
}

function koreanHypothesisStatement(type, positive) {
  if (type === "investment") {
    return positive
      ? "보수적인 가정에서도 위험 대비 기대수익이 매력적일 수 있다."
      : "밸류에이션, 포지션 크기, 투자 논리가 아직 취약해 즉시 행동하기 이르다.";
  }
  if (type === "finance") {
    return positive
      ? "이 재무 배분은 비용을 정당화할 만큼 실행 역량을 높일 수 있다."
      : "매출 근거가 충분하지 않은 상태에서 런웨이나 유연성을 줄일 수 있다.";
  }
  if (type === "business") {
    return positive
      ? "이 결정은 중요한 사업 또는 운영 병목을 개선할 수 있다."
      : "실행 비용, 고객 영향, 조직 산만함이 기대효과보다 클 수 있다.";
  }
  return positive ? "행동하면 기본 경로보다 나은 결과를 만들 수 있다." : "근거가 더 쌓일 때까지 기본 경로가 더 안전할 수 있다.";
}

function koreanOptionsFor(type) {
  if (type === "business") {
    return [
      option("A", "전면 실행", "관련 영역 전체에 결정을 적용한다.", "가장 빠른 전략적 효과.", "실행 리스크와 신뢰 리스크가 가장 큼.", "팀 집중도와 운영 복잡도.", "low"),
      option("B", "파일럿", "성공 기준과 중단 기준이 있는 가장 작은 실험을 실행한다.", "작은 범위에서 신호를 얻을 수 있음.", "전면 실행보다 느림.", "파일럿 설계와 조율 비용.", "medium"),
      option("C", "보류", "현재 운영 방식을 유지하고 결정을 미룬다.", "불필요한 혼란을 피함.", "병목이 계속 남을 수 있음.", "기회비용.", "high")
    ];
  }
  return optionsFor(type);
}

function koreanEvidenceFor(question) {
  return [
    {
      claim: "검토해야 할 결정이 식별되었다.",
      source: `사용자 요청: ${question}`,
      strength: "weak",
      source_type: "user input",
      recency: "current",
      notes: "이 항목은 결정의 존재를 보여줄 뿐, 결론을 증명하지는 않는다."
    },
    {
      claim: "높은 확신을 갖기 전에 직접 측정되거나 1차 출처에 가까운 근거가 더 필요하다.",
      source: "Decision Lab evidence quality rule.",
      strength: "medium",
      source_type: "framework rule",
      recency: "current",
      notes: "도구는 외부 사실을 임의로 만들어내지 않도록 설계되어 있다."
    },
    {
      claim: "불확실성이 크고 되돌릴 수 있는 여지가 있을 때는 단계적 선택지가 유용하다.",
      source: "Decision Lab operating framework.",
      strength: "medium",
      source_type: "framework rule",
      recency: "current",
      notes: "도메인 사실이 아니라 의사결정 프로세스에 대한 근거다."
    }
  ];
}

function koreanAssumptionsFor(type) {
  return [
    {
      assumption: "이 질문은 증상이 아니라 올바른 결정 자체를 다루고 있다.",
      importance: "high",
      test: "기본 행동과 최소 두 개의 대안을 비교한다.",
      owner: "decision owner"
    },
    {
      assumption: "결정 전에 표적 근거를 모으면 판단의 질이 개선된다.",
      importance: "high",
      test: `${type} 결정에 가장 중요한 근거를 next_actions 기준으로 수집한다.`,
      owner: "decision owner"
    }
  ];
}

function koreanRisksFor(type) {
  return [
    {
      risk: "거짓 확신",
      probability: "medium",
      impact: "high",
      trigger: "근거 품질이 좋아지기 전에 추천 확신도가 올라간다.",
      mitigation: "근거, 가정, 반론이 보강되기 전까지 확신도를 낮게 유지한다."
    },
    {
      risk: "기회비용",
      probability: "medium",
      impact: "medium",
      trigger: "단계적 진행이나 보류가 시간 민감한 기회를 늦춘다.",
      mitigation: "결정 기한과 최소 근거 기준을 정한다."
    },
    {
      risk: type === "finance" ? "현금 유연성 감소" : "실행 산만함",
      probability: "medium",
      impact: "high",
      trigger: "예상보다 더 많은 시간, 비용, 집중력이 필요해진다.",
      mitigation: "명확한 중단 기준과 리뷰 기준이 있는 단계적 선택지를 사용한다."
    }
  ];
}

function koreanCriteriaFor(type) {
  const first = type === "finance" ? "현금과 런웨이 보호" : "전략적 기대효과";
  const second = type === "business" ? "실행 가능성" : "하방 보호";
  return [
    { id: "C1", name: first, weight: 2, description: "가장 중요한 기대효과 또는 생존 기준." },
    { id: "C2", name: second, weight: 2, description: "감당하기 어려운 하방을 피할 수 있는지." },
    { id: "C3", name: "근거 품질", weight: 1, description: "결론을 지지할 만큼 근거가 강한지." }
  ];
}

function koreanChangeMindFor(type) {
  return [
    "직접 근거가 핵심 가설과 반대로 나온다.",
    "하방 리스크가 예상보다 크거나 되돌리기 어렵다.",
    type === "finance" ? "업데이트된 모델에서 런웨이 또는 현금 리스크가 기준을 넘는다." : "추천 경로를 실행할 역량이 부족하다."
  ];
}

function koreanOpenQuestionsFor(type) {
  return [
    "반대 결정을 지지하는 가장 강한 근거는 무엇인가?",
    "어떤 가정이 틀리면 추천이 무너지는가?",
    type === "finance" ? "하방 시나리오에서 가장 중요한 모델 변수는 무엇인가?" : "가장 작은 유용한 파일럿은 무엇이고 누가 책임지는가?"
  ];
}

function koreanNextActionsFor(type) {
  return [
    "이 기록을 analyst와 skeptic 관점으로 검토한다.",
    "1차 출처 또는 직접 측정한 근거를 추가한다.",
    "근거 수집 후 선택지 점수를 다시 매긴다.",
    type === "finance" ? "재무 모델과 하방 민감도 체크를 업데이트한다." : "파일럿 담당자, 마일스톤, 의존성, 중단 기준을 정의한다."
  ];
}

function koreanReviewFor(type) {
  return {
    success_metrics: [
      "선택한 경로가 기본 행동보다 나은 결과를 낸다.",
      "핵심 가정이 리뷰 날짜까지 확인되거나 반증된다.",
      "하방 리스크가 정한 가드레일 안에 머문다."
    ],
    expected_signals: [
      "최종 결정 전에 근거 품질이 개선된다.",
      "역할별 검토 후에도 선택지 점수가 크게 흔들리지 않는다."
    ],
    failure_signals: [
      "근거 품질은 약한데 확신도만 올라간다.",
      type === "finance" ? "현금 또는 런웨이 가드레일을 침범한다." : "실행 비용이나 시간이 계획을 초과한다."
    ],
    review_questions: [
      "원래 의사결정 과정은 sound했는가?",
      "가장 중요했던 가정은 무엇인가?",
      "다음 결정 기록에서 무엇을 바꿔야 하는가?"
    ],
    actual_outcome: "",
    lessons: []
  };
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

function normalizeDecisionType(value) {
  if (["general", "investment", "business", "finance"].includes(value)) return value;
  if (value === "business_strategy" || value === "management") return "business";
  if (value === "financial_hypothesis" || value === "financial") return "finance";
  if (value === "investment_decision" || value === "portfolio") return "investment";
  return "general";
}

function mergeMeaningful(target, source) {
  if (!source || typeof source !== "object") return target;
  const output = structuredClone(target);
  for (const [key, value] of Object.entries(source)) {
    if (!isMeaningful(value)) continue;
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeMeaningful(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function isMeaningful(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
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
