import { Router } from "express";
import {
  cancelReminder,
  createReminder,
  eligibleCandidates,
  getReminder,
  listReminders,
  readyReminders,
  reviewReminder,
  runReminderNow,
  sendReviewedReminder,
  updateReminder,
} from "../services/reminderService.js";
import { db } from "../db/database.js";
import { filterCandidatesForUser, requireAuth, requireRole } from "../middleware/auth.js";
import { getCandidate } from "../services/batchService.js";

export const reminderRoutes = Router();
reminderRoutes.use(requireAuth);

reminderRoutes.get("/", (_req, res) => {
  const reminders = listReminders().map((r) => ({
    ...r,
    eligibleCount: eligibleCandidates(r.batch_id, r.target_condition).eligible.length,
  }));
  res.json(reminders);
});

/** Reminders awaiting recruiter approval — polled by the notification bell. */
reminderRoutes.get("/ready", (_req, res) => {
  res.json(readyReminders());
});

reminderRoutes.get("/preview", (req, res) => {
  const { batchId, targetCondition = "NOT_STARTED" } = req.query;
  const { eligible, complete } = eligibleCandidates(batchId, targetCondition);
  res.json({ eligibleCount: eligible.length, completeCount: complete.length });
});

reminderRoutes.get("/:id", (req, res) => {
  const reminder = getReminder(req.params.id);
  if (!reminder) return res.status(404).json({ message: "Reminder not found" });
  res.json(reminder);
});

/**
 * Candidate-level detail for the Review & Send screen — a TEAM_MEMBER only
 * ever sees their own assigned candidates in this list, backend-enforced.
 */
reminderRoutes.get("/:id/review", (req, res) => {
  const review = reviewReminder(req.params.id);
  if (!review) return res.status(404).json({ message: "Reminder not found" });
  res.json({ ...review, candidates: filterCandidatesForUser(review.candidates, req.user) });
});

// Batch-wide reminder scheduling/administration is a manager-level action —
// it isn't scoped to one candidate, so it must not be usable to reach
// candidates outside a team member's assignment.
reminderRoutes.post("/", requireRole("MANAGER"), (req, res) => {
  try {
    res.json(createReminder(req.body ?? {}));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

reminderRoutes.put("/:id", requireRole("MANAGER"), (req, res) => {
  try {
    const reminder = updateReminder(req.params.id, req.body ?? {});
    if (!reminder) return res.status(404).json({ message: "Reminder not found" });
    res.json(reminder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

reminderRoutes.post("/:id/cancel", requireRole("MANAGER"), (req, res) => {
  const reminder = cancelReminder(req.params.id);
  if (!reminder) return res.status(404).json({ message: "Reminder not found" });
  res.json(reminder);
});

/**
 * Recruiter-approved send from the Review & Send screen. `candidateIds` is
 * filtered to the caller's accessible candidates first — a TEAM_MEMBER can
 * never smuggle another team member's candidate id through this list.
 */
reminderRoutes.post("/:id/send", async (req, res) => {
  try {
    const requested = Array.isArray(req.body?.candidateIds) ? req.body.candidateIds : [];
    const allowed = filterCandidatesForUser(
      requested.map((id) => getCandidate(id)).filter(Boolean),
      req.user,
    ).map((c) => c.id);
    const summary = await sendReviewedReminder(req.params.id, {
      candidateIds: allowed,
      channels: req.body?.channels,
    });
    res.json(summary);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * "Run Reminder Now — Test" — executes the SAME business logic as the
 * scheduler tick, immediately. Not a simulation: Auto Send mode sends real
 * emails, Notify Recruiter mode creates the same READY_TO_SEND notification.
 * Manager-only: it acts on every eligible candidate in the batch, not a
 * scoped subset.
 */
reminderRoutes.post("/:id/run", requireRole("MANAGER"), async (req, res) => {
  const row = db.prepare(`SELECT * FROM reminder_schedules WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ message: "Reminder not found" });
  if (!["SCHEDULED", "READY_TO_SEND"].includes(row.status)) {
    return res.status(400).json({ message: `Reminder is ${row.status} and cannot run` });
  }
  try {
    const summary = await runReminderNow(row);
    res.json(summary);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
