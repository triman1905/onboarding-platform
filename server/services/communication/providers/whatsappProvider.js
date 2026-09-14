import {
  twilioWhatsAppProvider,
  isWhatsAppEnabled,
  isWhatsAppContentConfigured,
} from "./twilioWhatsAppProvider.js";

/**
 * WhatsAppProvider interface (duck-typed — no framework needed for one method):
 *
 *   sendMessage({ to, text, variables, candidateId, reminderId, messageType })
 *     -> Promise<{ ok, providerMessageId?, status?, errorCode?, errorMessage? }>
 *
 * `text` is a rendered plain-text fallback; `variables` are the raw
 * candidate values (first_name, joining_date, …) a provider may map onto
 * its own template mechanism — for Twilio that's ContentSid +
 * ContentVariables, resolved internally from `messageType` (see
 * twilioWhatsAppProvider.js).
 *
 * `communicationService.js` and `reminderService.js` only ever talk to this
 * factory — never to the Twilio SDK directly. To migrate to the Meta
 * WhatsApp Business Platform later, add `metaWhatsAppProvider.js` next to
 * `twilioWhatsAppProvider.js` and change only the branch below.
 */
export function getWhatsAppProvider() {
  return twilioWhatsAppProvider;
}

export function isWhatsAppConfigured() {
  return isWhatsAppEnabled();
}

/** Diagnostic only (true/false) — never exposes the Content SID itself. */
export function isWhatsAppContentReady(messageType = "WELCOME") {
  return isWhatsAppContentConfigured(messageType);
}
