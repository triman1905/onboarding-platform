/**
 * Channel-template configuration layer.
 *
 * Single source of truth for "which template does WELCOME/REMINDER map to
 * on each channel" — what the UI shows in the template dropdowns, what
 * Communication History labels a message as, and (for WhatsApp) which env
 * var holds the Twilio Content SID and which candidate fields fill its
 * numbered {{1}}, {{2}}… placeholders.
 *
 * This is intentionally code-level for the prototype (per the project's
 * "smallest safe change" scope) rather than a database table. A future
 * database-backed template manager can replace the object literals below
 * without changing reminderService.js, communicationService.js, or the
 * provider layer — everything else only calls the functions exported here.
 *
 * EMAIL already has a full database-backed template system
 * (email_templates table, see templateService.js) — the labels below exist
 * only so this module can describe all three channels uniformly; email
 * template *selection* still goes through templateService.js as before.
 */

export const EMAIL_TEMPLATES = {
  WELCOME: { id: "email-welcome", label: "ABC Welcome Email" },
  REMINDER: { id: "email-reminder", label: "Verification Reminder Email" },
};

export const WHATSAPP_TEMPLATES = {
  WELCOME: {
    id: "whatsapp-welcome",
    label: "WhatsApp Welcome",
    contentSidEnv: "TWILIO_WHATSAPP_CONTENT_SID_WELCOME",
    // Ordered candidate variable keys -> Twilio's numbered {{1}}, {{2}}, …
    variableKeys: ["first_name"],
  },
  REMINDER: {
    id: "whatsapp-reminder",
    label: "WhatsApp Verification Reminder",
    contentSidEnv: "TWILIO_WHATSAPP_CONTENT_SID_REMINDER",
    variableKeys: ["first_name"],
  },
};

export const SMS_TEMPLATES = {
  WELCOME: { id: "sms-welcome", label: "SMS Welcome" },
  REMINDER: { id: "sms-reminder", label: "SMS Verification Reminder" },
};

const BY_CHANNEL = { EMAIL: EMAIL_TEMPLATES, WHATSAPP: WHATSAPP_TEMPLATES, SMS: SMS_TEMPLATES };

/** `[{ type: "WELCOME", id, label, ... }, { type: "REMINDER", ... }]` for a channel. */
export function listChannelTemplates(channel) {
  const map = BY_CHANNEL[channel];
  return map ? Object.entries(map).map(([type, tpl]) => ({ type, ...tpl })) : [];
}

export function getWhatsAppTemplate(type) {
  return WHATSAPP_TEMPLATES[type] || WHATSAPP_TEMPLATES.WELCOME;
}

export function getSmsTemplate(type) {
  return SMS_TEMPLATES[type] || SMS_TEMPLATES.WELCOME;
}

export function getEmailTemplateLabel(type) {
  return (EMAIL_TEMPLATES[type] || EMAIL_TEMPLATES.WELCOME).label;
}

/**
 * Maps a candidate variables object (named keys, e.g. `first_name`) onto
 * Twilio's numbered ContentVariables shape (`{"1": "...", "2": "..."}`)
 * using a template's `variableKeys` order. Returns null when the template
 * declares no variables, so callers can omit `contentVariables` entirely.
 */
export function toNumberedVariables(variableKeys, candidateVars) {
  if (!variableKeys?.length || !candidateVars) return null;
  const out = {};
  variableKeys.forEach((key, index) => {
    out[String(index + 1)] = candidateVars[key] ?? "";
  });
  return out;
}
