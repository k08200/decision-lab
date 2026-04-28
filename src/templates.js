export function createTemplate(type = "general") {
  const now = new Date().toISOString().slice(0, 10);
  const base = {
    schema_version: "0.1.0",
    decision_type: type,
    title: "Untitled decision",
    question: "What decision are we making?",
    created_at: now,
    owner: "",
    context: "",
    recommendation: {
      decision: "undecided",
      summary: "",
      confidence: 0.5,
      decision_deadline: "",
      review_date: ""
    },
    hypotheses: [
      {
        id: "H1",
        statement: "",
        why_it_matters: "",
        confidence: 0.5,
        evidence: [],
        assumptions: [],
        counterarguments: [],
        disconfirming_signals: []
      }
    ],
    options: [
      {
        id: "A",
        name: "",
        description: "",
        expected_value: "",
        upside: "",
        downside: "",
        cost: "",
        reversibility: "medium"
      }
    ],
    evidence: [],
    risks: [],
    decision_criteria: [],
    what_would_change_my_mind: [],
    open_questions: [],
    next_actions: [],
    post_decision_review: {
      success_metrics: [],
      review_questions: [],
      actual_outcome: ""
    }
  };

  if (type === "investment") {
    return {
      ...base,
      asset: {
        name: "",
        ticker: "",
        asset_class: "equity",
        market: "",
        time_horizon: "12-36 months",
        proposed_action: "watch"
      },
      valuation: {
        current_price: null,
        base_case: "",
        bull_case: "",
        bear_case: "",
        margin_of_safety: ""
      },
      catalysts: [],
      risk_controls: []
    };
  }

  if (type === "business") {
    return {
      ...base,
      strategic_goal: "",
      stakeholders: [],
      constraints: [],
      financial_impact: {
        revenue: "",
        cost: "",
        cash_flow: "",
        payback_period: ""
      },
      execution_plan: {
        owner: "",
        milestones: [],
        dependencies: []
      }
    };
  }

  if (type === "finance") {
    return {
      ...base,
      financial_hypothesis: "",
      model_driver: "",
      planning_horizon: "",
      base_case: "",
      upside_case: "",
      downside_case: "",
      sensitivity_checks: [],
      financial_guardrails: []
    };
  }

  if (type !== "general") {
    throw new Error(`Unknown template type: ${type}`);
  }

  return base;
}
