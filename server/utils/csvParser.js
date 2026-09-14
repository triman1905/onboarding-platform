/**
 * LOCAL backend shim — parsing/validation rules are shared with the hosted
 * environment (see shared/email-core/csv.js).
 */
export { parseUpload, validateRows, EMAIL_RE } from "../../shared/email-core/csv.js";
