import { getTwilioClient, isTwilioConfigured, friendlyTwilioError } from "../twilioClient.js";
import { getWhatsAppTemplate, toNumberedVariables } from "../channelTemplates.js";

export function isWhatsAppEnabled() {
  return (
    isTwilioConfigured() &&
    process.env.WHATSAPP_ENABLED !== "false" &&
    Boolean(process.env.TWILIO_WHATSAPP_FROM)
  );
}

function withWhatsAppPrefix(value) {
  const v = String(value || "");
  return v.startsWith("whatsapp:") ? v : `whatsapp:${v}`;
}

/**
 * Resolves the Twilio Content API template SID for a message type straight
 * from the backend environment. Which env var name to read comes from the
 * channel-template config layer (channelTemplates.js) — WELCOME reads
 * TWILIO_WHATSAPP_CONTENT_SID_WELCOME, REMINDER reads
 * TWILIO_WHATSAPP_CONTENT_SID_REMINDER. Resolved fresh on every call, keyed
 * only by `messageType`, rather than trusted from whatever the caller
 * computed earlier — so a retry (which only knows `messageType`, see
 * communicationService.js `retryCommunication`) resolves the exact same
 * Content SID as a brand-new send, even if the env var was added or
 * rotated after the original attempt failed.
 */
function resolveContentSid(messageType) {
  const { contentSidEnv } = getWhatsAppTemplate(messageType);
  const value = process.env[contentSidEnv];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Diagnostic only — true/false, never the SID itself. Used by /api/communications/status. */
export function isWhatsAppContentConfigured(messageType = "WELCOME") {
  return Boolean(resolveContentSid(messageType));
}

/**
 * TwilioWhatsAppProvider — implements the WhatsAppProvider interface
 * (see ../providers/whatsappProvider.js) against the Twilio Messaging API.
 *
 * A Twilio Content API template (ContentSid + ContentVariables) is used
 * whenever one is configured for this message type — required outside
 * Twilio's WhatsApp Sandbox / a 24h session window, which is how this
 * deployment's WhatsApp sender is configured. `text` is only sent as a
 * free-form `body` when no Content SID is configured for the type, which
 * preserves Sandbox-style free-text testing for message types that don't
 * need an approved template.
 */
async function sendMessage({ to, text, variables, messageType }) {
  if (!isWhatsAppEnabled()) {
    return {
      ok: false,
      errorCode: "NOT_CONFIGURED",
      errorMessage:
        "Twilio WhatsApp is not configured on this server (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM / WHATSAPP_ENABLED).",
    };
  }
  if (!to) {
    return {
      ok: false,
      errorCode: "INVALID_RECIPIENT",
      errorMessage: "Missing WhatsApp recipient number.",
    };
  }

  const template = getWhatsAppTemplate(messageType);
  const contentSid = resolveContentSid(messageType);
  // Twilio Content Templates reference variables by number ({{1}}, {{2}}, …)
  // — map the template's declared candidate fields (e.g. "first_name") onto
  // "1", "2", … in order. Returns null when the template declares none.
  const contentVariables = toNumberedVariables(template.variableKeys, variables);

  try {
    const client = getTwilioClient();
    const payload = {
      from: withWhatsAppPrefix(process.env.TWILIO_WHATSAPP_FROM),
      to: withWhatsAppPrefix(to),
    };
    if (process.env.TWILIO_STATUS_CALLBACK_URL) {
      payload.statusCallback = process.env.TWILIO_STATUS_CALLBACK_URL;
    }
    // Never send an undefined/null/empty contentSid — only set the key when
    // resolveContentSid() found a real, non-empty value.
    if (contentSid) {
      payload.contentSid = contentSid;
      if (contentVariables) payload.contentVariables = JSON.stringify(contentVariables);
    } else {
      payload.body = text;
    }
    const message = await client.messages.create(payload);
    // The API only confirms Twilio *accepted* the request — real delivery is
    // confirmed later by the /api/communications/twilio/status webhook.
    return { ok: true, providerMessageId: message.sid, status: "SENT" };
  } catch (error) {
    const { code, message } = friendlyTwilioError(error);
    if (!contentSid && /content ?sid/i.test(message)) {
      // Twilio rejected the free-form body because this sender requires an
      // approved Content Template. Surface a clear configuration error that
      // names the exact env var instead of Twilio's bare "ContentSid
      // Required" string.
      return {
        ok: false,
        errorCode: "WHATSAPP_CONTENT_SID_MISSING",
        errorMessage: `WhatsApp requires an approved Content Template for this sender, but ${template.contentSidEnv} is not set in server/.env.`,
      };
    }
    return { ok: false, errorCode: code, errorMessage: message };
  }
}

export const twilioWhatsAppProvider = { name: "TWILIO_WHATSAPP", sendMessage };
