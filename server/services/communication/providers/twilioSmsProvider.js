import { getTwilioClient, isTwilioConfigured, friendlyTwilioError } from "../twilioClient.js";

export function isSmsEnabled() {
  return (
    isTwilioConfigured() &&
    process.env.SMS_ENABLED !== "false" &&
    Boolean(process.env.TWILIO_SMS_FROM)
  );
}

/**
 * TwilioSmsProvider — implements the SMSProvider interface
 * (see ../providers/smsProvider.js) against the Twilio Messaging API.
 */
async function sendMessage({ to, text }) {
  if (!isSmsEnabled()) {
    return {
      ok: false,
      errorCode: "NOT_CONFIGURED",
      errorMessage:
        "Twilio SMS is not configured on this server (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SMS_FROM / SMS_ENABLED).",
    };
  }
  if (!to)
    return {
      ok: false,
      errorCode: "INVALID_RECIPIENT",
      errorMessage: "Missing SMS recipient number.",
    };

  try {
    const client = getTwilioClient();
    const payload = { from: process.env.TWILIO_SMS_FROM, to, body: text };
    if (process.env.TWILIO_STATUS_CALLBACK_URL) {
      payload.statusCallback = process.env.TWILIO_STATUS_CALLBACK_URL;
    }
    const message = await client.messages.create(payload);
    return { ok: true, providerMessageId: message.sid, status: "SENT" };
  } catch (error) {
    const { code, message } = friendlyTwilioError(error);
    return { ok: false, errorCode: code, errorMessage: message };
  }
}

export const twilioSmsProvider = { name: "TWILIO_SMS", sendMessage };
