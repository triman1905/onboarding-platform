import { Router } from "express";
import multer from "multer";
import { parseUpload, validateRows } from "../utils/csvParser.js";
import {
  createBatch,
  deleteBatch,
  existingEmails,
  getBatch,
  importBatch,
  listBatches,
} from "../services/batchService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
export const batchRoutes = Router();
batchRoutes.use(requireAuth);

batchRoutes.get("/", (_req, res) => {
  res.json(listBatches());
});

/** Creates an empty batch (no candidates) — used by the manual candidate entry flow. Manager-only: "Create batches" is a manager permission. */
batchRoutes.post("/", requireRole("MANAGER"), (req, res) => {
  try {
    res.json(createBatch(req.body ?? {}));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

batchRoutes.get("/:id", (req, res) => {
  const batch = getBatch(req.params.id);
  if (!batch) return res.status(404).json({ message: "Batch not found" });
  res.json(batch);
});

/**
 * Hard-deletes a batch and its candidates (see deleteBatch() for why this is
 * safe — everything cascades via FK). Manager-only, enforced server-side —
 * a TEAM_MEMBER calling this directly gets a 403, not just a hidden button.
 */
batchRoutes.delete("/:id", requireRole("MANAGER"), (req, res) => {
  const result = deleteBatch(req.params.id);
  if (!result) return res.status(404).json({ message: "Batch not found" });
  res.json({ message: "Batch deleted", ...result });
});

/** Parse + validate a CSV/XLSX without importing anything. Manager-only — CSV upload is a manager permission. */
batchRoutes.post("/validate", requireRole("MANAGER"), upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  const rows = parseUpload(req.file.buffer, req.file.originalname);
  res.json(validateRows(rows, existingEmails()));
});

/** Import the valid rows only — never sends any email. Manager-only — CSV upload is a manager permission. */
batchRoutes.post("/import", requireRole("MANAGER"), upload.single("file"), (req, res) => {
  const { name, joiningDate, project, location, owner } = req.body ?? {};
  let rows;
  if (req.file) {
    rows = parseUpload(req.file.buffer, req.file.originalname);
  } else if (Array.isArray(req.body?.rows)) {
    rows = req.body.rows;
  } else {
    return res.status(400).json({ message: "Provide a file upload or a rows array" });
  }
  const validation = validateRows(rows, existingEmails());
  if (!validation.valid.length) {
    return res.status(400).json({ message: "No valid candidates to import", validation });
  }
  const batch = importBatch({
    name,
    joiningDate,
    project,
    location,
    owner,
    rows: validation.valid,
  });
  res.json({ batch, validation });
});
