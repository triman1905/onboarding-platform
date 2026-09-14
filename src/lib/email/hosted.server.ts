/**
 * HOSTED email automation engine (runs only on the Lovable server runtime).
 *
 * It reuses the SAME business logic as the local Express backend:
 *   - template rendering / personalization  → shared/email-core/template-renderer.js
 *   - CSV validation                        → shared/email-core/csv.js
 *   - reminder eligibility                  → shared/email-core/eligibility.js
 *
 * Only the transport differs: Resend here, Nodemailer/Gmail locally.
 */
import { renderEmail } from "../../../shared/email-core/template-renderer.js";
import { splitEligible, reminderSkipReason } from "../../../shared/email-core/eligibility.js";
import { sendEmail as providerSend, verifyConnection } from "./resend.server";

export const ENVIRONMENT = "LOVABLE_HOSTED";
export const PROVIDER = "Resend";

type Row = Record<string, unknown>;

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function logEvent(message: string, level = "INFO", source = "EMAIL") {
  const supabase = await db();
  await supabase.from("hosted_logs").insert({ id: uid("log"), message, level, source });
}

export async function getSettings() {
  const supabase = await db();
  const { data } = await supabase.from("hosted_settings").select("*").eq("id", 1).maybeSingle();
  return (
    data ?? {
      id: 1,
      live_mode: false,
      sender_email: "onboarding@resend.dev",
      sender_name: "ABC Recruitment",
      test_recipient: "tkkaur1905@gmail.com",
    }
  );
}

export async function saveSettings(patch: Row) {
  const supabase = await db();
  const { data, error } = await supabase
    .from("hosted_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Provider + sender verification state, never exposing credentials. */
export async function connectionStatus() {
  const settings = await getSettings();
  try {
    const verify = await verifyConnection(settings.sender_email);
    return {
      ok: verify.ok,
      message: verify.message,
      senderVerified: verify.senderVerified,
      verifiedDomains: verify.verifiedDomains,
      sender: settings.sender_email,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Provider not configured",
      senderVerified: false,
      verifiedDomains: [] as string[],
      sender: settings.sender_email,
    };
  }
}

async function count(table: string, match: Record<string, string> = {}, sentSince?: string) {
  const supabase = await db();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (supabase as any).from(table).select("*", { count: "exact", head: true });
  for (const [column, value] of Object.entries(match)) query = query.eq(column, value);
  if (sentSince) query = query.gte("sent_at", sentSince);
  const { count: n } = await query;
  return (n as number | null) ?? 0;
}

export async function stats() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    candidates: await count("hosted_candidates"),
    welcomeSent: await count("hosted_communications", { type: "WELCOME", status: "SENT" }),
    reminderSent: await count("hosted_communications", { type: "REMINDER", status: "SENT" }),
    remindersScheduled: await count("hosted_reminders", { status: "SCHEDULED" }),
    failed: await count("hosted_communications", { status: "FAILED" }),
    today: await count("hosted_communications", { status: "SENT" }, `${today}T00:00:00Z`),
  };
}


export async function listTemplates() {
  const supabase = await db();
  const { data } = await supabase.from("hosted_templates").select("*").order("name");
  return data ?? [];
}

export async function getTemplate(id: string) {
  const supabase = await db();
  const { data } = await supabase.from("hosted_templates").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function saveTemplate(id: string | null, payload: Row) {
  const supabase = await db();
  if (id) {
    const { data, error } = await supabase
      .from("hosted_templates")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("hosted_templates")
    .insert({ id: uid("tpl"), name: "New template", subject: "", body: "", ...payload })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function duplicateTemplate(id: string) {
  const source = await getTemplate(id);
  if (!source) throw new Error("Template not found");
  return saveTemplate(null, {
    name: `${source.name} (copy)`,
    category: source.category,
    subject: source.subject,
    body: source.body,
    active: 0,
  });
}

export async function listBatches() {
  const supabase = await db();
  const { data: batches } = await supabase.from("hosted_batches").select("*").order("created_at", { ascending: false });
  const { data: candidates } = await supabase.from("hosted_candidates").select("id, batch_id");
  const { data: sent } = await supabase.from("hosted_communications").select("batch_id").eq("status", "SENT");
  return (batches ?? []).map((b) => ({
    ...b,
    candidate_count: (candidates ?? []).filter((c) => c.batch_id === b.id).length,
    emails_sent: (sent ?? []).filter((c) => c.batch_id === b.id).length,
  }));
}

export async function listCandidates(batchId?: string) {
  const supabase = await db();
  let query = supabase.from("hosted_candidates").select("*").order("created_at");
  if (batchId) query = query.eq("batch_id", batchId);
  const { data } = await query;
  return data ?? [];
}

export async function getBatch(id: string) {
  const supabase = await db();
  const { data } = await supabase.from("hosted_batches").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("Batch not found");
  const candidates = await listCandidates(id);
  return { ...data, candidates, candidate_count: candidates.length };
}

export async function existingEmails() {
  const supabase = await db();
  const { data } = await supabase.from("hosted_candidates").select("email");
  return (data ?? []).map((r) => r.email);
}

/** Imports already-validated rows produced by the shared validator. */
export async function importBatch(meta: Row, rows: Row[]) {
  const supabase = await db();
  const batchId = uid("batch");
  const { error } = await supabase.from("hosted_batches").insert({
    id: batchId,
    name: String(meta["name"] ?? "Imported batch"),
    joining_date: (meta["joiningDate"] as string) ?? null,
    project: (meta["project"] as string) ?? null,
    location: (meta["location"] as string) ?? null,
    status: "ACTIVE",
  });
  if (error) throw new Error(error.message);

  const candidates = rows.map((row) => ({
    id: uid("cand"),
    candidate_id: String(row["candidate_id"] ?? ""),
    batch_id: batchId,
    first_name: String(row["first_name"] ?? ""),
    last_name: String(row["last_name"] ?? ""),
    email: String(row["email"] ?? ""),
    joining_date: (row["joining_date"] as string) ?? (meta["joiningDate"] as string) ?? null,
    location: (row["location"] as string) ?? (meta["location"] as string) ?? null,
    verification_link: (row["verification_link"] as string) ?? null,
    verification_status: "NOT_STARTED",
  }));
  if (candidates.length) {
    const { error: insertError } = await supabase.from("hosted_candidates").insert(candidates);
    if (insertError) throw new Error(insertError.message);
  }
  await logEvent(`Batch imported: ${candidates.length} candidates`, "INFO", "IMPORT");
  return getBatch(batchId);
}

export async function previewEmails(
  templateId: string,
  params: { batchId?: string | undefined; candidateId?: string | undefined },
) {
  const template = await getTemplate(templateId);
  if (!template) throw new Error("Template not found");
  const supabase = await db();
  let candidates: Row[] = [];
  if (params.candidateId) {
    const { data } = await supabase.from("hosted_candidates").select("*").eq("id", params.candidateId).maybeSingle();
    candidates = data ? [data] : [];
  } else {
    candidates = await listCandidates(params.batchId);
  }
  return candidates.map((candidate) => {
    const rendered = renderEmail(template, candidate);
    return {
      candidateId: String(candidate["id"]),
      candidateName: `${candidate["first_name"] ?? ""} ${candidate["last_name"] ?? ""}`.trim(),
      to: String(candidate["email"]),
      templateName: String(template.name),
      subject: rendered.subject,
      body: rendered.body,
      missingVariables: rendered.missingVariables,
    };
  });
}

async function alreadySent(candidateId: string, templateId: string, type: string) {
  const supabase = await db();
  const { data } = await supabase
    .from("hosted_communications")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("template_id", templateId)
    .eq("type", type)
    .eq("status", "SENT")
    .maybeSingle();
  return Boolean(data);
}

export async function checkDuplicates(candidateIds: string[], templateId: string, type: string) {
  const duplicates: string[] = [];
  for (const id of candidateIds) {
    if (await alreadySent(id, templateId, type)) duplicates.push(id);
  }
  return duplicates;
}

interface SendOptions {
  candidateIds?: string[] | undefined;
  batchId?: string | undefined;
  templateId: string;
  type?: string | undefined;
  force?: boolean | undefined;
  reminderId?: string | undefined;
  skipCompleted?: boolean | undefined;
}


/**
 * Provider-independent send pipeline: duplicate protection → personalization →
 * transport → communication record → audit log. DEMO MODE records the email but
 * never calls the provider.
 */
export async function sendToCandidates(options: SendOptions) {
  const supabase = await db();
  const settings = await getSettings();
  const template = await getTemplate(options.templateId);
  if (!template) throw new Error("Template not found");

  let candidates: Row[] = [];
  if (options.candidateIds?.length) {
    const { data } = await supabase.from("hosted_candidates").select("*").in("id", options.candidateIds);
    candidates = data ?? [];
  } else if (options.batchId) {
    candidates = await listCandidates(options.batchId);
  }
  if (!candidates.length) throw new Error("No candidates selected");

  const type = options.type ?? "WELCOME";
  const summary = {
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    liveMode: Boolean(settings.live_mode),
    results: [] as { candidate: string; status: string; reason?: string }[],
  };

  for (const candidate of candidates) {
    const skip = options.skipCompleted ? reminderSkipReason(candidate) : null;
    if (skip) {
      summary.skipped += 1;
      summary.results.push({ candidate: String(candidate["email"]), status: "SKIPPED", reason: String(skip ?? "") });
      await logEvent(`Reminder skipped for ${candidate["email"]}: ${skip}`, "WARN", "SCHEDULER");
      continue;
    }
    if (!options.force && (await alreadySent(String(candidate["id"]), options.templateId, type))) {
      summary.skipped += 1;
      summary.results.push({ candidate: String(candidate["email"]), status: "SKIPPED", reason: "Already sent" });
      continue;
    }

    const rendered = renderEmail(template, candidate);
    const commId = uid("comm");
    await supabase.from("hosted_communications").insert({
      id: commId,
      candidate_id: String(candidate["id"]),
      batch_id: (candidate["batch_id"] as string) ?? options.batchId ?? null,
      template_id: options.templateId,
      template_name: template.name,
      type,
      recipient: String(candidate["email"]),
      subject: rendered.subject,
      body: rendered.body,
      status: "SENDING",
      attempts: 1,
      environment: ENVIRONMENT,
      provider: settings.live_mode ? PROVIDER : "Demo (no send)",
      first_name: (candidate["first_name"] as string) ?? null,
      last_name: (candidate["last_name"] as string) ?? null,
    });
    summary.attempted += 1;

    if (!settings.live_mode) {
      await supabase
        .from("hosted_communications")
        .update({ status: "SKIPPED", failure_reason: "Demo mode — no real email sent" })
        .eq("id", commId);
      summary.skipped += 1;
      summary.results.push({ candidate: String(candidate["email"]), status: "SKIPPED", reason: "Demo mode" });
      await logEvent(`Demo mode: email for ${candidate["email"]} was not sent`, "WARN", "EMAIL");
      continue;
    }

    const result = await providerSend({
      to: String(candidate["email"]),
      subject: rendered.subject,
      text: rendered.body,
      from: settings.sender_email,
      fromName: settings.sender_name,
    });
    if (result.ok) {
      await supabase
        .from("hosted_communications")
        .update({ status: "SENT", sent_at: new Date().toISOString(), failure_reason: null })
        .eq("id", commId);
      summary.sent += 1;
      summary.results.push({ candidate: String(candidate["email"]), status: "SENT" });
      await logEvent(
        `${type === "REMINDER" ? "Reminder" : "Welcome"} email sent to ${candidate["first_name"] ?? candidate["email"]}`,
      );
    } else {
      await supabase
        .from("hosted_communications")
        .update({ status: "FAILED", failed_at: new Date().toISOString(), failure_reason: result.error ?? "Send failed" })
        .eq("id", commId);
      summary.failed += 1;
      summary.results.push({ candidate: String(candidate["email"]), status: "FAILED", reason: String(result.error ?? "") });
      await logEvent(`Email failed for ${candidate["email"]}: ${result.error}`, "ERROR", "EMAIL");
    }
  }

  if (options.reminderId) {
    await supabase
      .from("hosted_reminders")
      .update({
        status: "COMPLETED",
        attempted: summary.attempted,
        sent: summary.sent,
        failed: summary.failed,
        skipped: summary.skipped,
        executed_at: new Date().toISOString(),
      })
      .eq("id", options.reminderId);
  }
  return summary;
}

export async function sendTestEmail(to: string) {
  const settings = await getSettings();
  const recipient = to || settings.test_recipient;
  const subject = "ABC Email Automation Test";
  const text = `Hi Triman,

This is a real test email from the ABC Email Automation Platform.

If you received this email, the email automation integration is working correctly.

Regards,
ABC Recruitment Team`;

  if (!settings.live_mode) {
    await logEvent(`Demo mode: test email for ${recipient} was not sent`, "WARN", "EMAIL");
    return { ok: false, message: "Demo mode is active — enable Live email mode to send a real test email." };
  }
  const result = await providerSend({
    to: recipient,
    subject,
    text,
    from: settings.sender_email,
    fromName: settings.sender_name,
  });
  const supabase = await db();
  await supabase.from("hosted_communications").insert({
    id: uid("comm"),
    recipient,
    subject,
    body: text,
    type: "TEST",
    template_name: "Connection test",
    status: result.ok ? "SENT" : "FAILED",
    attempts: 1,
    environment: ENVIRONMENT,
    provider: PROVIDER,
    sent_at: result.ok ? new Date().toISOString() : null,
    failed_at: result.ok ? null : new Date().toISOString(),
    failure_reason: result.ok ? null : (result.error ?? null),
    first_name: "Test",
    last_name: "recipient",
  });
  await logEvent(
    result.ok ? `Test email sent to ${recipient}` : `Test email failed: ${result.error}`,
    result.ok ? "INFO" : "ERROR",
  );
  return {
    ok: result.ok,
    message: result.ok ? "Test email sent successfully" : (result.error ?? "Test email failed"),
  };
}

export async function history(filters: { status?: string; type?: string; batchId?: string } = {}) {
  const supabase = await db();
  let query = supabase.from("hosted_communications").select("*").order("created_at", { ascending: false }).limit(300);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.batchId) query = query.eq("batch_id", filters.batchId);
  const { data } = await query;
  return data ?? [];
}

export async function retry(id: string) {
  const supabase = await db();
  const settings = await getSettings();
  const { data: comm } = await supabase.from("hosted_communications").select("*").eq("id", id).maybeSingle();
  if (!comm) throw new Error("Communication not found");
  if (!settings.live_mode) return { ok: false, message: "Demo mode is active — no real email was sent." };
  const result = await providerSend({
    to: comm.recipient,
    subject: comm.subject,
    text: comm.body ?? "",
    from: settings.sender_email,
    fromName: settings.sender_name,
  });
  await supabase
    .from("hosted_communications")
    .update({
      status: result.ok ? "SENT" : "FAILED",
      attempts: (comm.attempts ?? 0) + 1,
      sent_at: result.ok ? new Date().toISOString() : null,
      failed_at: result.ok ? null : new Date().toISOString(),
      failure_reason: result.ok ? null : (result.error ?? null),
    })
    .eq("id", id);
  return { ok: result.ok, message: result.ok ? "Retry succeeded" : (result.error ?? "Retry failed") };
}

export async function recentLogs(limit = 40) {
  const supabase = await db();
  const { data } = await supabase
    .from("hosted_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function reminderCounts(batchId: string, targetCondition: string) {
  const candidates = await listCandidates(batchId);
  const { eligible, complete } = splitEligible(candidates, targetCondition);
  return { eligibleCount: eligible.length, completeCount: complete.length };
}

export async function listReminders() {
  const supabase = await db();
  const { data } = await supabase.from("hosted_reminders").select("*").order("scheduled_at");
  return data ?? [];
}

export async function getReminder(id: string) {
  const supabase = await db();
  const { data } = await supabase.from("hosted_reminders").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("Reminder not found");
  const counts = await reminderCounts(data.batch_id ?? "", data.target_condition);
  const { data: communications } = await supabase
    .from("hosted_communications")
    .select("*")
    .eq("batch_id", data.batch_id ?? "")
    .eq("type", "REMINDER")
    .order("created_at");
  return { ...data, ...counts, communications: communications ?? [] };
}

export async function createReminder(payload: Row) {
  const supabase = await db();
  const batchId = String(payload["batchId"] ?? "");
  const templateId = String(payload["templateId"] ?? "");
  if (!batchId) throw new Error("A batch is required");
  if (!templateId) throw new Error("A template is required");
  if (!payload["scheduledAt"]) throw new Error("A scheduled date and time is required");
  const batch = await getBatch(batchId);
  const template = await getTemplate(templateId);
  const id = uid("rem");
  const { error } = await supabase.from("hosted_reminders").insert({
    id,
    name: String(payload["name"] ?? "Verification Reminder"),
    batch_id: batchId,
    batch_name: batch.name,
    template_id: templateId,
    template_name: template?.name ?? null,
    scheduled_at: new Date(String(payload["scheduledAt"])).toISOString(),
    timezone: String(payload["timezone"] ?? "Asia/Kolkata"),
    target_condition: String(payload["targetCondition"] ?? "NOT_STARTED"),
    status: "SCHEDULED",
  });
  if (error) throw new Error(error.message);
  await logEvent(`Reminder scheduled: ${payload["name"]}`, "INFO", "SCHEDULER");
  return getReminder(id);
}

export async function cancelReminder(id: string) {
  const supabase = await db();
  await supabase.from("hosted_reminders").update({ status: "CANCELLED" }).eq("id", id).eq("status", "SCHEDULED");
  return getReminder(id);
}

/** Same execution path the scheduler would use — available as "Run now (test)". */
export async function runReminder(id: string) {
  const reminder = await getReminder(id);
  if (!reminder.template_id) throw new Error("Reminder has no template");
  const candidates = await listCandidates(reminder.batch_id ?? "");
  const { eligible } = splitEligible(candidates, reminder.target_condition);
  await logEvent(`Reminder started: ${reminder.name}`, "INFO", "SCHEDULER");
  const summary = await sendToCandidates({
    candidateIds: eligible.map((c) => String(c["id"])),
    batchId: reminder.batch_id ?? undefined,
    templateId: reminder.template_id,
    type: "REMINDER",
    reminderId: id,
    force: true,
    skipCompleted: true,
  });
  await logEvent(
    `Reminder completed: ${summary.attempted} attempted, ${summary.sent} sent, ${summary.failed} failed`,
    "INFO",
    "SCHEDULER",
  );
  return summary;
}
