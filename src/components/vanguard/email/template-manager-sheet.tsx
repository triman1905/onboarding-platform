import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  emailApi,
  type EmailTemplate,
  type LocalBatch,
  type LocalCandidate,
} from "@/lib/email/api";
import { DataCard, EmptyState, SectionTitle } from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const TEMPLATE_TYPES = ["Welcome", "Reminder", "Custom"];

interface Draft {
  name: string;
  subject: string;
  body: string;
  category: string;
}

const EMPTY_DRAFT: Draft = { name: "", subject: "", body: "", category: "Custom" };

/** Mirrors shared/email-core/template-renderer.js#render — client-side only, for previewing an unsaved draft. */
function renderDraftPreview(text: string, candidate: LocalCandidate): string {
  const vars: Record<string, string> = {
    first_name: candidate.first_name ?? "",
    last_name: candidate.last_name ?? "",
    candidate_id: candidate.candidate_id ?? "",
    email: candidate.email ?? "",
    phone: candidate.phone ?? "",
    department: candidate.department ?? "",
    role: candidate.role ?? "",
    location: candidate.location ?? "",
    verification_link: candidate.verification_link ?? "",
    joining_date: candidate.joining_date
      ? new Date(candidate.joining_date).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
      : "",
  };
  return text.replace(/{{\s*([\w.]+)\s*}}/g, (_m, key: string) => vars[key] ?? "");
}

export function TemplateManagerSheet({
  open,
  onClose,
  onChanged,
  batches,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  batches: LocalBatch[];
}) {
  const [view, setView] = useState<"list" | "editor">("list");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalName, setOriginalName] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [previewBatchId, setPreviewBatchId] = useState("");
  const [previewCandidates, setPreviewCandidates] = useState<LocalCandidate[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await emailApi.templates();
      setTemplates(res.templates);
      setVariables(res.variables);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load templates");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      setView("list");
      void reload();
    }
  }, [open]);

  useEffect(() => {
    if (!previewBatchId) {
      setPreviewCandidates([]);
      return;
    }
    let active = true;
    emailApi
      .candidates(previewBatchId)
      .then((rows) => {
        if (active) {
          setPreviewCandidates(rows);
          setPreviewIndex(0);
        }
      })
      .catch(() => active && setPreviewCandidates([]));
    return () => {
      active = false;
    };
  }, [previewBatchId]);

  const openCreate = () => {
    setEditingId(null);
    setOriginalName("");
    setDraft(EMPTY_DRAFT);
    setError(null);
    setView("editor");
  };

  const openEdit = (t: EmailTemplate) => {
    setEditingId(t.id);
    setOriginalName(t.name);
    setDraft({ name: t.name, subject: t.subject, body: t.body, category: t.category });
    setError(null);
    setView("editor");
  };

  const insertVariable = (variable: string) => {
    const token = `{{${variable}}}`;
    const el = bodyRef.current;
    if (!el) {
      setDraft((d) => ({ ...d, body: `${d.body}${token}` }));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = `${el.value.slice(0, start)}${token}${el.value.slice(end)}`;
    setDraft((d) => ({ ...d, body: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async (asNew: boolean) => {
    setError(null);
    setSaving(true);
    try {
      const unchanged = asNew && draft.name.trim() === originalName.trim();
      await emailApi.saveTemplate(asNew ? null : editingId, {
        name: unchanged ? `${draft.name} (copy)` : draft.name,
        subject: draft.subject,
        body: draft.body,
        category: draft.category,
        active: 1,
      });
      toast.success(asNew ? "Saved as a new template" : "Template saved");
      await reload();
      onChanged();
      setView("list");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save template");
    }
    setSaving(false);
  };

  const archive = async (t: EmailTemplate) => {
    try {
      await emailApi.archiveTemplate(t.id);
      toast.success(`"${t.name}" archived`);
      await reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not archive template");
    }
  };

  const previewCandidate = previewCandidates[previewIndex] ?? null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>
            {view === "list"
              ? "Manage Email Templates"
              : editingId
                ? "Edit Template"
                : "Create Template"}
          </SheetTitle>
          <SheetDescription>
            {view === "list"
              ? "Create, edit, preview and archive reusable email templates."
              : "Variables resolve against the candidate at send time."}
          </SheetDescription>
        </SheetHeader>

        {view === "list" ? (
          <div className="space-y-4 px-4 pb-6">
            <div className="flex justify-end">
              <Button onClick={openCreate}>+ Create Template</Button>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : templates.length === 0 ? (
              <EmptyState title="No templates yet" />
            ) : (
              <DataCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">
                          {t.name}
                          {t.is_system ? (
                            <span className="ml-2 text-[10px] text-muted-foreground">(system)</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">{t.category}</TableCell>
                        <TableCell>
                          <Pill tone={t.active ? "success" : "neutral"}>
                            {t.active ? "Active" : "Archived"}
                          </Pill>
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                            Edit
                          </Button>
                          {!t.is_system && t.active ? (
                            <Button variant="ghost" size="sm" onClick={() => void archive(t)}>
                              Archive
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DataCard>
            )}
          </div>
        ) : (
          <div className="space-y-4 px-4 pb-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Template Name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="mt-1"
                  placeholder="Document Submission Reminder"
                />
              </div>
              <div>
                <Label>Template Type</Label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                >
                  {TEMPLATE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>Email Subject</Label>
              <Input
                value={draft.subject}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                className="mt-1"
                placeholder="Action Required: Submit Your Documents"
              />
            </div>
            <div>
              <Label>Email Body</Label>
              <Textarea
                ref={bodyRef}
                rows={12}
                value={draft.body}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                className="mt-1 font-mono text-xs"
              />
            </div>
            <div>
              <SectionTitle>Available candidate fields</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-[11px] hover:bg-accent"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>

            {error ? <p className="text-xs text-danger">{error}</p> : null}

            <DataCard className="space-y-3 p-4">
              <SectionTitle>Preview</SectionTitle>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Batch</Label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                    value={previewBatchId}
                    onChange={(e) => setPreviewBatchId(e.target.value)}
                  >
                    <option value="">Select a batch…</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={previewCandidates.length < 2}
                    onClick={() =>
                      setPreviewIndex(
                        (i) => (i - 1 + previewCandidates.length) % previewCandidates.length,
                      )
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={previewCandidates.length < 2}
                    onClick={() => setPreviewIndex((i) => (i + 1) % previewCandidates.length)}
                  >
                    Next
                  </Button>
                </div>
              </div>
              {previewCandidate ? (
                <div className="space-y-1 rounded-md border border-border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">
                    Preview candidate: {previewCandidate.first_name} {previewCandidate.last_name}
                  </p>
                  <p className="text-sm font-medium">
                    {renderDraftPreview(draft.subject, previewCandidate)}
                  </p>
                  <pre className="text-xs whitespace-pre-wrap">
                    {renderDraftPreview(draft.body, previewCandidate)}
                  </pre>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Select a batch to preview against a real candidate.
                </p>
              )}
            </DataCard>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setView("list")} disabled={saving}>
                Cancel
              </Button>
              {editingId ? (
                <Button variant="outline" onClick={() => void save(true)} disabled={saving}>
                  Save as New
                </Button>
              ) : null}
              <Button onClick={() => void save(false)} disabled={saving}>
                Save Template
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
