/**
 * Reminder eligibility + duplicate-protection rules.
 * Shared by the LOCAL Express backend and the LOVABLE HOSTED server functions
 * so both environments behave identically.
 */
export const COMPLETED_STATUSES = ["SUBMITTED", "VERIFICATION_COMPLETE", "COMPLETE"];

export function isComplete(candidate) {
  return COMPLETED_STATUSES.includes(candidate?.verification_status);
}

/** Splits a candidate list into the ones a reminder should target and the ones already done. */
export function splitEligible(candidates, targetCondition = "NOT_STARTED") {
  if (targetCondition === "ALL") return { eligible: [...candidates], complete: [] };
  return {
    eligible: candidates.filter((c) => c.verification_status === targetCondition),
    complete: candidates.filter(isComplete),
  };
}

/** Reason a reminder send should be skipped, or null when the candidate should receive it. */
export function reminderSkipReason(candidate) {
  return isComplete(candidate) ? "Candidate already completed verification" : null;
}
