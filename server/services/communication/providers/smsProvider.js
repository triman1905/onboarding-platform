import { twilioSmsProvider, isSmsEnabled } from "./twilioSmsProvider.js";

/**
 * SMSProvider interface:
 *
 *   sendMessage({ to, text, candidateId, reminderId, messageType })
 *     -> Promise<{ ok, providerMessageId?, status?, errorCode?, errorMessage? }>
 *
 * Same seam as whatsappProvider.js — swap the provider here without touching
 * business logic if SMS ever moves off Twilio.
 */
export function getSmsProvider() {
  return twilioSmsProvider;
}

export function isSmsConfigured() {
  return isSmsEnabled();
}
