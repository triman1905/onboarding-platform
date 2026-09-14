import { Router } from "express";
import {
  archiveTemplate,
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  listTemplates,
  previewForCandidate,
  updateTemplate,
  SUPPORTED_VARIABLES,
} from "../services/templateService.js";
import { getCandidate, listCandidates } from "../services/batchService.js";
import { requireAuth } from "../middleware/auth.js";

export const templateRoutes = Router();
templateRoutes.use(requireAuth);

templateRoutes.get("/", (req, res) => {
  const activeOnly = req.query.activeOnly === "1" || req.query.activeOnly === "true";
  res.json({ templates: listTemplates({ activeOnly }), variables: SUPPORTED_VARIABLES });
});

templateRoutes.get("/:id", (req, res) => {
  const template = getTemplate(req.params.id);
  if (!template) return res.status(404).json({ message: "Template not found" });
  res.json(template);
});

templateRoutes.post("/", (req, res) => {
  try {
    const { name, subject, body, category, active } = req.body ?? {};
    res.json(createTemplate({ name, subject, body, category, active }));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

templateRoutes.put("/:id", (req, res) => {
  try {
    const template = updateTemplate(req.params.id, req.body ?? {});
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

templateRoutes.post("/:id/duplicate", (req, res) => {
  const template = duplicateTemplate(req.params.id);
  if (!template) return res.status(404).json({ message: "Template not found" });
  res.json(template);
});

/** Soft delete — hides a custom template from the dropdowns without losing history. */
templateRoutes.post("/:id/archive", (req, res) => {
  try {
    const template = archiveTemplate(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

templateRoutes.delete("/:id", (req, res) => {
  try {
    deleteTemplate(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/** Personalised preview for one candidate, or for every candidate in a batch. */
templateRoutes.get("/:id/preview", (req, res) => {
  try {
    const { candidateId, batchId } = req.query;
    if (candidateId) {
      const candidate = getCandidate(candidateId);
      if (!candidate) return res.status(404).json({ message: "Candidate not found" });
      return res.json([previewForCandidate(req.params.id, candidate)]);
    }
    const candidates = listCandidates({ batchId });
    res.json(candidates.map((c) => previewForCandidate(req.params.id, c)));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
