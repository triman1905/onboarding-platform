import type { CoreValidation } from "./index";

export declare const EMAIL_RE: RegExp;

export declare function parseUpload(
  buffer: ArrayBuffer | Uint8Array | string,
  filename?: string,
): Record<string, string>[];

export declare function validateRows(
  rows: Record<string, string>[],
  existingEmails?: string[],
): CoreValidation;
