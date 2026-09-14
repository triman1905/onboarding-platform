/**
 * LOCAL backend shim — the real logic lives in shared/email-core so that the
 * local (Nodemailer) and hosted (Resend) paths render emails identically.
 */
export {
  SUPPORTED_VARIABLES,
  candidateVariables,
  render,
  renderEmail,
  findUnsupportedVariables,
  validateTemplateVariables,
} from "../../shared/email-core/template-renderer.js";
