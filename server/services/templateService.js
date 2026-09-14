import { db, uid } from "../db/database.js";
import {
  renderEmail,
  SUPPORTED_VARIABLES,
  validateTemplateVariables,
} from "../utils/templateRenderer.js";
import { appendSignature } from "./communicationService.js";

export function listTemplates({ activeOnly = false } = {}) {
  const where = activeOnly ? "WHERE active = 1" : "";
  return db.prepare(`SELECT * FROM email_templates ${where} ORDER BY created_at ASC`).all();
}

export function getTemplate(id) {
  return db.prepare(`SELECT * FROM email_templates WHERE id = ?`).get(id);
}

function validateTemplateFields({ name, subject, body }) {
  if (!name || !String(name).trim()) throw new Error("Template name is required");
  if (!subject || !String(subject).trim()) throw new Error("Email subject is required");
  if (!body || !String(body).trim()) throw new Error("Email body is required");
  validateTemplateVariables(subject, body);
}

export function createTemplate({ name, category = "Welcome", subject, body, active = 1 }) {
  validateTemplateFields({ name, subject, body });
  const id = uid("tpl");
  db.prepare(
    `INSERT INTO email_templates (id, name, category, subject, body, active, is_system) VALUES (?,?,?,?,?,?,0)`,
  ).run(id, name, category, subject, body, active ? 1 : 0);
  return getTemplate(id);
}

export function updateTemplate(id, patch) {
  const current = getTemplate(id);
  if (!current) return null;
  const next = {
    name: patch.name ?? current.name,
    category: patch.category ?? current.category,
    subject: patch.subject ?? current.subject,
    body: patch.body ?? current.body,
    active: patch.active === undefined ? current.active : patch.active ? 1 : 0,
  };
  validateTemplateFields(next);
  db.prepare(
    `UPDATE email_templates SET name=?, category=?, subject=?, body=?, active=?, updated_at=datetime('now') WHERE id=?`,
  ).run(next.name, next.category, next.subject, next.body, next.active, id);
  return getTemplate(id);
}

export function duplicateTemplate(id) {
  const current = getTemplate(id);
  if (!current) return null;
  return createTemplate({
    name: `${current.name} (copy)`,
    category: current.category,
    subject: current.subject,
    body: current.body,
    active: 0,
  });
}

/** Soft delete — hides a custom template from normal use without losing history. */
export function archiveTemplate(id) {
  const current = getTemplate(id);
  if (!current) return null;
  if (current.is_system) throw new Error("System templates cannot be archived");
  db.prepare(`UPDATE email_templates SET active=0, updated_at=datetime('now') WHERE id=?`).run(id);
  return getTemplate(id);
}

export function deleteTemplate(id) {
  const current = getTemplate(id);
  if (current?.is_system) throw new Error("System templates cannot be deleted");
  db.prepare(`DELETE FROM email_templates WHERE id = ?`).run(id);
}

export function previewForCandidate(templateId, candidate) {
  const template = getTemplate(templateId);
  if (!template) throw new Error("Template not found");
  const rendered = renderEmail(template, candidate);
  return {
    candidateId: candidate.id,
    candidateName: `${candidate.first_name} ${candidate.last_name ?? ""}`.trim(),
    to: candidate.email,
    templateName: template.name,
    ...rendered,
    body: appendSignature(rendered.body, candidate),
  };
}

export { SUPPORTED_VARIABLES };
