export const SAMPLE_QUESTIONS = [
  {
    label: "Productize",
    question: "Should we keep productizing this local decision tool?",
    type: "business"
  },
  {
    label: "Pricing",
    question: "Should we pilot enterprise pricing this quarter?",
    type: "business"
  },
  {
    label: "Runway",
    question: "Should we hire now or preserve runway?",
    type: "finance"
  },
  {
    label: "Investment",
    question: "Should I add to this position after the pullback?",
    type: "investment"
  }
];

export const FIRST_USER_TEST_STEPS = [
  "Start from a blank folder and create one decision without help.",
  "Open the memo and explain the current call in one sentence.",
  "Add one evidence item from the UI, then regenerate the memo.",
  "Edit the recommendation or selected option without opening Raw JSON.",
  "Say where the flow felt confusing, slow, or too command-line heavy."
];

export const CAPTURE_PRESETS = {
  evidence: {
    customer: {
      label: "Customer note",
      claim: "A customer or user directly mentioned this problem.",
      source: "Customer note",
      strength: "strong"
    },
    metric: {
      label: "Metric signal",
      claim: "A product or business metric moved in a way that affects this decision.",
      source: "Metric review",
      strength: "medium"
    },
    release: {
      label: "Release check",
      claim: "A local release or workflow check shows this path works end to end.",
      source: "Release check",
      strength: "strong"
    }
  },
  questions: {
    change: {
      label: "Change-mind question",
      text: "What evidence would make us change the recommendation?"
    },
    risk: {
      label: "Risk question",
      text: "What is the strongest reason this decision could fail?"
    },
    pilot: {
      label: "Pilot question",
      text: "What is the smallest useful pilot that would produce a real signal?"
    }
  },
  actions: {
    interview: {
      label: "Interview user",
      text: "Ask one external user to run the current path without help and record where they hesitate."
    },
    metric: {
      label: "Check metric",
      text: "Check one usage or quality metric that would confirm this decision is working."
    },
    memo: {
      label: "Update memo",
      text: "Regenerate the memo after the next useful signal is captured."
    }
  },
  risks: {
    adoption: {
      label: "Adoption risk",
      risk: "Users do not repeat the workflow after the first run.",
      trigger: "A tester needs repeated help or does not return after one session.",
      impact: "high"
    },
    execution: {
      label: "Execution risk",
      risk: "The operating loop becomes too much manual maintenance.",
      trigger: "Updating decisions requires command-line steps users avoid.",
      impact: "medium"
    },
    quality: {
      label: "Quality risk",
      risk: "The UI makes the decision look more certain than the evidence supports.",
      trigger: "Confidence rises before evidence quality improves.",
      impact: "high"
    }
  }
};
