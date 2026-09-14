/**
 * Server functions exposing the HOSTED email automation engine to the
 * Lovable-hosted UI. Thin wrappers only — logic lives in hosted.server.ts.
 */
import { createServerFn } from "@tanstack/react-start";

export const hostedStatus = createServerFn({ method: "GET" }).handler(async () => {
  const engine = await import("./hosted.server");
  const [settings, connection, stats] = await Promise.all([
    engine.getSettings(),
    engine.connectionStatus(),
    engine.stats(),
  ]);
  return {
    environment: engine.ENVIRONMENT,
    provider: engine.PROVIDER,
    configured: connection.ok,
    connectionMessage: connection.message,
    senderVerified: connection.senderVerified,
    verifiedDomains: connection.verifiedDomains,
    sender: settings.sender_email,
    senderName: settings.sender_name,
    testRecipient: settings.test_recipient,
    liveMode: Boolean(settings.live_mode),
    stats,
  };
});

export const hostedUpdateSettings = createServerFn({ method: "POST" })
  .inputValidator((input: { liveMode?: boolean; senderEmail?: string; testRecipient?: string }) => input)
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    const patch: Record<string, unknown> = {};
    if (typeof data.liveMode === "boolean") patch["live_mode"] = data.liveMode;
    if (data.senderEmail) patch["sender_email"] = data.senderEmail;
    if (data.testRecipient) patch["test_recipient"] = data.testRecipient;
    const saved = await engine.saveSettings(patch);
    await engine.logEvent(
      `Email mode set to ${saved.live_mode ? "LIVE" : "DEMO"}`,
      saved.live_mode ? "WARN" : "INFO",
      "SETTINGS",
    );
    return { liveMode: Boolean(saved.live_mode), sender: saved.sender_email, testRecipient: saved.test_recipient };
  });

export const hostedTestConnection = createServerFn({ method: "POST" }).handler(async () => {
  const engine = await import("./hosted.server");
  const result = await engine.connectionStatus();
  return { ok: result.ok && result.senderVerified, message: result.message, sender: result.sender };
});

export const hostedSendTestEmail = createServerFn({ method: "POST" })
  .inputValidator((input: { to?: string }) => input)
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    return engine.sendTestEmail(data.to ?? "");
  });

export const hostedTemplates = createServerFn({ method: "GET" }).handler(async () => {
  const engine = await import("./hosted.server");
  const { SUPPORTED_VARIABLES } = await import("../../../shared/email-core/template-renderer.js");
  return { templates: await engine.listTemplates(), variables: SUPPORTED_VARIABLES };
});

export const hostedSaveTemplate = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string | null; payload: Record<string, unknown> }) => input)
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    return engine.saveTemplate(data.id, data.payload);
  });

export const hostedDuplicateTemplate = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    return engine.duplicateTemplate(data.id);
  });

export const hostedBatches = createServerFn({ method: "GET" }).handler(async () => {
  const engine = await import("./hosted.server");
  return engine.listBatches();
});

export const hostedBatch = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    return engine.getBatch(data.id);
  });

export const hostedExistingEmails = createServerFn({ method: "GET" }).handler(async () => {
  const engine = await import("./hosted.server");
  return engine.existingEmails();
});

export const hostedImportBatch = createServerFn({ method: "POST" })
  .inputValidator((input: { meta: Record<string, unknown>; rows: Record<string, unknown>[] }) => input)
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    return engine.importBatch(data.meta, data.rows);
  });

export const hostedPreview = createServerFn({ method: "GET" })
  .inputValidator((input: { templateId: string; batchId?: string; candidateId?: string }) => input)
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    return engine.previewEmails(data.templateId, { batchId: data.batchId, candidateId: data.candidateId });
  });

export const hostedCheckDuplicates = createServerFn({ method: "POST" })
  .inputValidator((input: { candidateIds: string[]; templateId: string; type?: string }) => input)
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    return { duplicates: await engine.checkDuplicates(data.candidateIds, data.templateId, data.type ?? "WELCOME") };
  });

export const hostedSendBatch = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      batchId?: string;
      candidateIds?: string[];
      templateId: string;
      type?: string;
      force?: boolean;
      confirm: boolean;
    }) => {
      if (!input.confirm) throw new Error("Explicit confirmation is required before sending emails");
      if (!input.templateId) throw new Error("templateId is required");
      return input;
    },
  )
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    return engine.sendToCandidates({
      batchId: data.batchId,
      candidateIds: data.candidateIds,
      templateId: data.templateId,
      type: data.type ?? "WELCOME",
      force: data.force ?? false,
    });
  });

export const hostedHistory = createServerFn({ method: "GET" })
  .inputValidator((input: { status?: string; type?: string; batchId?: string }) => input)
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    return engine.history(data);
  });

export const hostedRetry = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    return engine.retry(data.id);
  });

export const hostedLogs = createServerFn({ method: "GET" }).handler(async () => {
  const engine = await import("./hosted.server");
  return engine.recentLogs(40);
});

export const hostedReminders = createServerFn({ method: "GET" }).handler(async () => {
  const engine = await import("./hosted.server");
  return engine.listReminders();
});

export const hostedReminder = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    return engine.getReminder(data.id);
  });

export const hostedReminderPreview = createServerFn({ method: "GET" })
  .inputValidator((input: { batchId: string; targetCondition: string }) => input)
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    return engine.reminderCounts(data.batchId, data.targetCondition);
  });

export const hostedCreateReminder = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown>) => input)
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    return engine.createReminder(data);
  });

export const hostedCancelReminder = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    return engine.cancelReminder(data.id);
  });

export const hostedRunReminder = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const engine = await import("./hosted.server");
    return engine.runReminder(data.id);
  });
