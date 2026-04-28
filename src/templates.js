import { VALID_TYPES } from "./decision-core.js";

export function createTemplate(type = "general") {
  if (!VALID_TYPES.has(type)) {
    throw new Error(`Unknown template type: ${type}`);
  }

  const now = new Date().toISOString().slice(0, 10);
  const base = {
    schema_version: "0.2.0",
    decision_type: type,
    status: "draft",
    title: "Untitled decision",
    question: "What decision are we making?",
    created_at: now,
    updated_at: now,
    owner: "",
    context: "",
    decision_frame: {
      decision_class: "type-2",
      reversibility: "medium",
      urgency: "medium",
      default_action: "wait",
      desired_outcome: "",
      constraints: [],
      non_goals: []
    },
    recommendation: {
      decision: "undecided",
      selected_option: "",
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
      },
      {
        id: "H2",
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
        name: "Do it now",
        description: "",
        expected_value: "",
        upside: "",
        downside: "",
        cost: "",
        reversibility: "medium"
      },
      {
        id: "B",
        name: "Wait",
        description: "",
        expected_value: "",
        upside: "",
        downside: "",
        cost: "",
        reversibility: "high"
      }
    ],
    evidence: [],
    assumption_register: [
      {
        assumption: "",
        importance: "high",
        test: "",
        owner: ""
      }
    ],
    risks: [],
    decision_criteria: [
      {
        id: "C1",
        name: "Expected upside",
        weight: 2,
        description: ""
      },
      {
        id: "C2",
        name: "Downside protection",
        weight: 2,
        description: ""
      },
      {
        id: "C3",
        name: "Execution confidence",
        weight: 1,
        description: ""
      }
    ],
    option_scores: [
      {
        option_id: "A",
        criterion_id: "C1",
        score: 0,
        rationale: ""
      },
      {
        option_id: "A",
        criterion_id: "C2",
        score: 0,
        rationale: ""
      },
      {
        option_id: "A",
        criterion_id: "C3",
        score: 0,
        rationale: ""
      },
      {
        option_id: "B",
        criterion_id: "C1",
        score: 0,
        rationale: ""
      },
      {
        option_id: "B",
        criterion_id: "C2",
        score: 0,
        rationale: ""
      },
      {
        option_id: "B",
        criterion_id: "C3",
        score: 0,
        rationale: ""
      }
    ],
    what_would_change_my_mind: [],
    open_questions: [],
    next_actions: [],
    post_decision_review: {
      success_metrics: [],
      expected_signals: [],
      failure_signals: [],
      review_questions: [],
      actual_outcome: "",
      lessons: []
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
      portfolio_context: {
        role_in_portfolio: "",
        current_exposure: "",
        target_exposure: "",
        sizing_rule: "",
        liquidity_needs: ""
      },
      valuation: {
        current_price: null,
        base_case: "",
        bull_case: "",
        bear_case: "",
        margin_of_safety: "",
        valuation_method: ""
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
        dependencies: [],
        smallest_useful_pilot: "",
        kill_criteria: []
      },
      operating_cadence: {
        cadence: "",
        review_owner: "",
        decision_log_channel: ""
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

  return base;
}
