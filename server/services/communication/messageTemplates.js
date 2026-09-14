/**
 * Provider-neutral WhatsApp / SMS templates.
 *
 * These are deliberately NOT Twilio-specific: `render()` produces a plain
 * text body from `{{variable}}` tokens using the same renderer as the email
 * templates (shared/email-core/template-renderer.js). TwilioWhatsAppProvider
 * either sends that text directly (Sandbox / free-form) or, when a Twilio
 * Content API template is configured via env var, sends the resolved
 * variables as ContentVariables against a ContentSid instead. A future
 * MetaWhatsAppProvider would map the same {type, variables} pair onto a
 * Meta-approved template — no changes needed here or in reminderService.
 */
import { render, candidateVariables } from "../../utils/templateRenderer.js";
import { getWhatsAppTemplate, getSmsTemplate } from "./channelTemplates.js";

const WHATSAPP_TEMPLATES = {
  WELCOME: `Hi {{first_name}},

Welcome to the ABC onboarding process.

Your joining date is {{joining_date}}.
Your location is {{location}}.

Please complete your verification here:
{{verification_link}}

Candidate ID:
{{candidate_id}}

Regards,
Recruitment Team`,
  REMINDER: `Hi {{first_name}},

This is a reminder that your ABC onboarding verification is still pending.

Please complete it here:
{{verification_link}}

Joining Date: {{joining_date}}
Candidate ID: {{candidate_id}}

Regards,
Recruitment Team`,
};

const SMS_TEMPLATES = {
  WELCOME:
    "Hi {{first_name}}, welcome to the ABC onboarding process. Please complete your verification using {{verification_link}}. Candidate ID: {{candidate_id}}.",
  REMINDER:
    "Hi {{first_name}}, reminder: your ABC onboarding verification is still pending. Complete it here: {{verification_link}}. Candidate ID: {{candidate_id}}.",
};

/**
 * Content SID resolution moved to twilioWhatsAppProvider.js (resolved fresh
 * from `messageType` on every send, including retries) so there is a single
 * source of truth for the Twilio-specific env var name — see that file.
 * This renderer stays provider-neutral: it only produces text + the raw
 * candidate variables a provider may need.
 */
export function renderWhatsAppMessage(type, candidate) {
  const vars = candidateVariables(candidate);
  const template = WHATSAPP_TEMPLATES[type] || WHATSAPP_TEMPLATES.WELCOME;
  const { text } = render(template, vars);
  return {
    text,
    variables: vars,
    templateName: getWhatsAppTemplate(type).label,
  };
}

export function renderSmsMessage(type, candidate) {
  const vars = candidateVariables(candidate);
  const template = SMS_TEMPLATES[type] || SMS_TEMPLATES.WELCOME;
  const { text } = render(template, vars);
  return { text, templateName: getSmsTemplate(type).label };
}
