import { db, log, uid } from "../db/database.js";
import { listCandidates } from "./batchService.js";
import {
  alreadySentForReminderChannel,
  duplicateProtectionActive,
  mergeChannelSummaries,
  sendChannelsToCandidates,
} from "./communicationService.js";
import { zonedTimeToUtcIso } from "../utils/datetime.js";

const COMPLETED_STATUSES = ["SUBMITTED", "VERIFICATION_COMPLETE", "COMPLETE"];
const EXECUTION_MODES = ["AUTO_SEND", "NOTIFY_RECRUITER"];
const ACTIONABLE_STATUSES = ["SCHEDULED", "READY_TO_SEND"];
const ALL_CHANNELS = ["EMAIL", "WHATSAPP", "SMS"];

/** Validates + de-duplicates a requested channel list, falling back to EMAIL-only. */
function normalizeChannels(channels) {
  const list = Array.isArray(channels) ? channels.filter((c) => ALL_CHANNELS.includes(c)) : [];
  return list.length ? [...new Set(list)] : ["EMAIL"];
}

function parseChannels(value) {
  return value ? value.split(",").filter(Boolean) : ["EMAIL"];
}

function withChannels(row) {
  return row ? { ...row, channels: parseChannels(row.channels) } : row;
}

export function eligibleCandidates(batchId, targetCondition = "NOT_STARTED") {
  const all = listCandidates({ batchId });
  if (targetCondition === "ALL") return { eligible: all, complete: [] };
  const eligible = all.filter((c) => c.verification_status === targetCondition);
  const complete = all.filter((c) => COMPLETED_STATUSES.includes(c.verification_status));
  return { eligible, complete };
}

export function listReminders({ status } = {}) {
  const where = status ? `WHERE r.status = ?` : "";
  const stmt = db.prepare(
    `SELECT r.*, b.name AS batch_name, t.name AS template_name
     FROM reminder_schedules r
     LEFT JOIN batches b ON b.id = r.batch_id
     LEFT JOIN email_templates t ON t.id = r.template_id
     ${where}
     ORDER BY r.scheduled_at ASC`,
  );
  return (status ? stmt.all(status) : stmt.all()).map(withChannels);
}

/** Reminders currently awaiting recruiter approval — backs the notification bell. */
export function readyReminders() {
  return listReminders({ status: "READY_TO_SEND" }).map((r) => ({
    ...r,
    eligibleCount: eligibleCandidates(r.batch_id, r.target_condition).eligible.length,
  }));
}

export function getReminder(id) {
  const reminder = withChannels(
    db
      .prepare(
        `SELECT r.*, b.name AS batch_name, t.name AS template_name
       FROM reminder_schedules r
       LEFT JOIN batches b ON b.id = r.batch_id
       LEFT JOIN email_templates t ON t.id = r.template_id
       WHERE r.id = ?`,
      )
      .get(id),
  );
  if (!reminder) return null;
  const { eligible, complete } = eligibleCandidates(reminder.batch_id, reminder.target_condition);
  const communications = db
    .prepare(
      `SELECT e.*, c.first_name, c.last_name FROM email_communications e
       LEFT JOIN candidates c ON c.id = e.candidate_id
       WHERE e.reminder_id = ? ORDER BY e.created_at ASC`,
    )
    .all(id);
  return {
    ...reminder,
    eligibleCount: eligible.length,
    completeCount: complete.length,
    communications,
  };
}

/**
 * Candidate-level detail for the Review & Send screen — per-channel
 * readiness. Every channel (EMAIL/WHATSAPP/SMS) always gets an entry, even
 * when the reminder doesn't use it, so the UI can show a "NOT_SELECTED"
 * column instead of just omitting it.
 */
export function reviewReminder(id) {
  const reminder = getReminder(id);
  if (!reminder) return null;
  const target = reminder.target_condition || "NOT_STARTED";
  const reminderChannels = reminder.channels;
  const candidates = listCandidates({ batchId: reminder.batch_id }).map((c) => {
    const eligible = target === "ALL" || c.verification_status === target;
    const channelStatus = {};
    for (const channel of ALL_CHANNELS) {
      if (!reminderChannels.includes(channel)) {
        channelStatus[channel] = "NOT_SELECTED";
      } else if (!eligible) {
        channelStatus[channel] = "SKIPPED";
      } else if (channel !== "EMAIL" && !c.phone_e164) {
        channelStatus[channel] = "NO_PHONE";
      } else if (
        duplicateProtectionActive(channel) &&
        alreadySentForReminderChannel(c.id, id, channel)
      ) {
        // TEST MODE: when duplicate protection is bypassed for this channel,
        // the review screen shows READY (matching what a send will actually
        // do) rather than a stale ALREADY_SENT that would no longer skip.
        channelStatus[channel] = "ALREADY_SENT";
      } else {
        channelStatus[channel] = "READY";
      }
    }
    // Legacy single-column status (kept for older callers) mirrors EMAIL when configured.
    const reminderStatus =
      channelStatus.EMAIL !== "NOT_SELECTED"
        ? channelStatus.EMAIL
        : (Object.values(channelStatus).find((s) => s !== "NOT_SELECTED") ?? "SKIPPED");
    return {
      id: c.id,
      candidateId: c.candidate_id,
      firstName: c.first_name,
      lastName: c.last_name,
      email: c.email,
      phone: c.phone_e164 || null,
      verificationStatus: c.verification_status,
      channels: channelStatus,
      reminderStatus,
      // Kept for backend RBAC filtering (filterCandidatesForUser reads this field).
      assigned_to_user_id: c.assigned_to_user_id ?? null,
    };
  });
  return { reminder, candidates };
}

function resolveScheduledAt({ date, time, scheduledAt, timezone }) {
  if (date && time) return zonedTimeToUtcIso(date, time, timezone || "Asia/Kolkata");
  if (scheduledAt) {
    const d = new Date(scheduledAt);
    if (Number.isNaN(d.getTime())) throw new Error("A scheduled date and time is required");
    return d.toISOString();
  }
  throw new Error("A scheduled date and time is required");
}

export function createReminder({
  name,
  batchId,
  templateId,
  date,
  time,
  scheduledAt,
  timezone = "Asia/Kolkata",
  targetCondition = "NOT_STARTED",
  executionMode = "NOTIFY_RECRUITER",
  channels,
}) {
  if (!batchId) throw new Error("A batch is required");
  if (!templateId) throw new Error("A template is required");
  const scheduledAtIso = resolveScheduledAt({ date, time, scheduledAt, timezone });
  const mode = EXECUTION_MODES.includes(executionMode) ? executionMode : "NOTIFY_RECRUITER";
  const channelList = normalizeChannels(channels);

  const id = uid("rem");
  db.prepare(
    `INSERT INTO reminder_schedules (id, name, batch_id, template_id, scheduled_at, timezone, target_condition, execution_mode, channels, status)
     VALUES (?,?,?,?,?,?,?,?,?, 'SCHEDULED')`,
  ).run(
    id,
    name || "Verification Reminder",
    batchId,
    templateId,
    scheduledAtIso,
    timezone,
    targetCondition,
    mode,
    channelList.join(","),
  );
  log(
    `Reminder scheduled: ${name || "Verification Reminder"} for ${scheduledAtIso} (${mode}, ${channelList.join("+")})`,
    { source: "SCHEDULER" },
  );
  return getReminder(id);
}

export function cancelReminder(id) {
  db.prepare(
    `UPDATE reminder_schedules SET status='CANCELLED' WHERE id=? AND status IN ('SCHEDULED','READY_TO_SEND')`,
  ).run(id);
  log(`Reminder cancelled (${id})`, { source: "SCHEDULER" });
  return getReminder(id);
}

export function updateReminder(id, patch) {
  const current = db.prepare(`SELECT * FROM reminder_schedules WHERE id=?`).get(id);
  if (!current) return null;

  let scheduledAtIso = current.scheduled_at;
  if ((patch.date && patch.time) || patch.scheduledAt) {
    scheduledAtIso = resolveScheduledAt({
      date: patch.date,
      time: patch.time,
      scheduledAt: patch.scheduledAt,
      timezone: patch.timezone ?? current.timezone,
    });
  }
  const mode =
    patch.executionMode && EXECUTION_MODES.includes(patch.executionMode)
      ? patch.executionMode
      : current.execution_mode;
  const channels = patch.channels ? normalizeChannels(patch.channels).join(",") : current.channels;

  db.prepare(
    `UPDATE reminder_schedules SET name=?, template_id=?, scheduled_at=?, timezone=?, target_condition=?, execution_mode=?, channels=? WHERE id=?`,
  ).run(
    patch.name ?? current.name,
    patch.templateId ?? current.template_id,
    scheduledAtIso,
    patch.timezone ?? current.timezone,
    patch.targetCondition ?? current.target_condition,
    mode,
    channels,
    id,
  );
  return getReminder(id);
}

export function dueReminders(now = new Date()) {
  return db
    .prepare(`SELECT * FROM reminder_schedules WHERE status='SCHEDULED' AND scheduled_at <= ?`)
    .all(now.toISOString());
}

/**
 * Executes one reminder's due-time logic. Shared by the cron tick AND the
 * manual "Run Reminder Now — Test" action, so both paths run identical logic.
 *
 * AUTO_SEND         -> re-checks eligibility, sends real emails, COMPLETED.
 * NOTIFY_RECRUITER  -> re-checks eligibility, flips to READY_TO_SEND, no send.
 */
export async function runReminderNow(reminder) {
  const mode = EXECUTION_MODES.includes(reminder.execution_mode)
    ? reminder.execution_mode
    : "NOTIFY_RECRUITER";
  const target = reminder.target_condition || "NOT_STARTED";
  const channels = parseChannels(reminder.channels);
  // Re-fetched fresh from the DB right before acting, so eligibility reflects
  // the CURRENT verification status — not a stale snapshot from creation time.
  const { eligible, complete } = eligibleCandidates(reminder.batch_id, target);

  if (mode !== "AUTO_SEND") {
    db.prepare(
      `UPDATE reminder_schedules SET status='READY_TO_SEND', executed_at=datetime('now') WHERE id=?`,
    ).run(reminder.id);
    log(`Reminder ready: ${reminder.name} — ${eligible.length} candidate(s) eligible`, {
      source: "SCHEDULER",
    });
    return {
      status: "READY_TO_SEND",
      eligible: eligible.length,
      complete: complete.length,
      attempted: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    };
  }

  db.prepare(`UPDATE reminder_schedules SET status='PROCESSING' WHERE id=?`).run(reminder.id);
  log(`Reminder started: ${reminder.name} (${channels.join("+")})`, { source: "SCHEDULER" });

  try {
    const byChannel = await sendChannelsToCandidates({
      candidates: eligible,
      channels,
      templateId: reminder.template_id,
      type: "REMINDER",
      batchId: reminder.batch_id,
      reminderId: reminder.id,
      force: true,
    });
    const summary = mergeChannelSummaries(byChannel);
    const skipped = summary.skipped + complete.length;

    db.prepare(
      `UPDATE reminder_schedules SET status='COMPLETED', executed_at=datetime('now'), attempted=?, sent=?, failed=?, skipped=? WHERE id=?`,
    ).run(summary.attempted, summary.sent, summary.failed, skipped, reminder.id);
    log(
      `Reminder completed: ${reminder.name} — ${summary.attempted} attempted, ${summary.sent} sent, ${summary.failed} failed, ${skipped} skipped`,
      { source: "SCHEDULER" },
    );
    return {
      status: "COMPLETED",
      eligible: eligible.length,
      complete: complete.length,
      ...summary,
      skipped,
      byChannel,
    };
  } catch (error) {
    db.prepare(
      `UPDATE reminder_schedules SET status='FAILED', executed_at=datetime('now') WHERE id=?`,
    ).run(reminder.id);
    log(`Reminder failed: ${reminder.name} — ${error.message}`, {
      level: "ERROR",
      source: "SCHEDULER",
    });
    throw error;
  }
}

/**
 * Sends to exactly the candidates the recruiter selected on the Review & Send
 * screen. Selecting an ALREADY_SENT candidate there IS the "send again"
 * confirmation, so no extra force flag is needed here. `channels` lets the
 * recruiter narrow which of the reminder's configured channels actually go
 * out this time (e.g. uncheck SMS); it defaults to the reminder's full set.
 */
export async function sendReviewedReminder(id, { candidateIds, channels }) {
  const reminder = db.prepare(`SELECT * FROM reminder_schedules WHERE id=?`).get(id);
  if (!reminder) throw new Error("Reminder not found");
  if (!ACTIONABLE_STATUSES.includes(reminder.status)) {
    throw new Error(`Reminder is ${reminder.status} and cannot be sent`);
  }
  if (!Array.isArray(candidateIds) || !candidateIds.length) {
    throw new Error("Select at least one candidate");
  }

  const reminderChannels = parseChannels(reminder.channels);
  const useChannels =
    Array.isArray(channels) && channels.length
      ? channels.filter((c) => reminderChannels.includes(c))
      : reminderChannels;
  if (!useChannels.length) throw new Error("Select at least one communication channel");

  const selected = new Set(candidateIds);
  const candidates = listCandidates({ batchId: reminder.batch_id }).filter((c) =>
    selected.has(c.id),
  );
  if (!candidates.length) throw new Error("No matching candidates found for this batch");

  db.prepare(`UPDATE reminder_schedules SET status='PROCESSING' WHERE id=?`).run(id);
  log(`Reminder send started (recruiter-approved): ${reminder.name} (${useChannels.join("+")})`, {
    source: "SCHEDULER",
  });

  try {
    const byChannel = await sendChannelsToCandidates({
      candidates,
      channels: useChannels,
      templateId: reminder.template_id,
      type: "REMINDER",
      batchId: reminder.batch_id,
      reminderId: id,
      force: true,
    });
    const summary = mergeChannelSummaries(byChannel);
    db.prepare(
      `UPDATE reminder_schedules SET status='COMPLETED', executed_at=datetime('now'), attempted=?, sent=?, failed=?, skipped=? WHERE id=?`,
    ).run(summary.attempted, summary.sent, summary.failed, summary.skipped, id);
    log(
      `Reminder completed (recruiter-approved): ${reminder.name} — ${summary.sent} sent, ${summary.failed} failed`,
      { source: "SCHEDULER" },
    );
    return { status: "COMPLETED", ...summary, byChannel };
  } catch (error) {
    db.prepare(
      `UPDATE reminder_schedules SET status='FAILED', executed_at=datetime('now') WHERE id=?`,
    ).run(id);
    log(`Reminder send failed: ${reminder.name} — ${error.message}`, {
      level: "ERROR",
      source: "SCHEDULER",
    });
    throw error;
  }
}
