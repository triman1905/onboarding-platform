import type { CoreCandidate, CoreTemplate, RenderedEmail } from "./index";

export declare const SUPPORTED_VARIABLES: string[];
export declare function candidateVariables(candidate: CoreCandidate): Record<string, string>;
export declare function render(text: string, vars: Record<string, string>): { text: string; missing: string[] };
export declare function findUnsupportedVariables(text: string): string[];
export declare function validateTemplateVariables(subject: string, body: string): void;
export declare function renderEmail(template: CoreTemplate, candidate: CoreCandidate): RenderedEmail;
