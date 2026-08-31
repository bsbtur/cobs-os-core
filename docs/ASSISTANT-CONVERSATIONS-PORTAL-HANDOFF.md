# Human handoff

The Router already returns `requires_human` and `recommended_action`. A dedicated operator handoff queue/UI is a separate increment. V1 must preserve the Router result and must not fabricate an assistant answer when the backend chooses handoff.
