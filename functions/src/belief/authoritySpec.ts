/**
 * Stage E UI authority boundary — specification only (not wired).
 *
 * Sam / free-text LLM remain read-only. Accept and Wait are not hooked to the desk yet.
 */

export const PLANNER_ACT_AUTHORITY_SPEC = {
  acceptRecommendation: {
    recordsConsentOrExecutes:
      'Executes the recorded PlannerAction through the same authenticated command path as Confirm — not consent-only logging.',
    authorisedOperators:
      'Only ROUTING_ADMIN_UID (Ygor desk operator) until a role matrix is added. Mahommed projections never invoke Accept.',
    expectedVersionFields: [
      'decisionId',
      'decisionStateHash',
      'policyId',
      'policyVersion',
      'expectedWindowDay (optional but checked when provided)',
    ],
    idempotency: 'Client supplies idempotencyKey; duplicate key → rejected_duplicate without re-executing.',
    staleRejection: 'submittedDecisionStateHash must equal DecisionRecord.decisionStateHash or status=rejected_stale.',
    persistedAuthorityRecord: 'PlannerAct document (actId, actKind, operatorUid, decisionId, hashes, status, createdAt).',
  },
  wait: {
    meanings: {
      wait_as_recommended: 'Operator accepts a planner-selected wait DecisionRecord.',
      wait_override: 'Operator forces wait when the planner proposed execute/reduce/reroute/bounded_exploration.',
    },
    plannerSelected: 'Planner may emit action.kind=wait; no payment is created.',
    operatorSelected: 'wait_as_recommended when decision already waits.',
    operatorOverride: 'wait_override records override; does not invent evidence or clear reviewState.',
  },
  notWired: true,
} as const
