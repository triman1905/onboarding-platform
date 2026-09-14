import type { CoreCandidate } from "./index";

export declare const COMPLETED_STATUSES: string[];
export declare function isComplete(candidate: CoreCandidate): boolean;
export declare function splitEligible<T extends CoreCandidate>(
  candidates: T[],
  targetCondition?: string,
): { eligible: T[]; complete: T[] };
export declare function reminderSkipReason(candidate: CoreCandidate): string | null;
