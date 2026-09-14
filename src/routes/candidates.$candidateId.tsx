import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/store";
import { emailApi, useLocalApi } from "@/lib/email/api";
import { workspaceApi } from "@/lib/vanguard/workspaceApi";
import {
  DataCard,
  EmptyState,
  KeyValue,
  PageHeader,
  SectionTitle,
} from "@/components/vanguard/primitives";
import { BgvStatusSelect, OverallBgvPill } from "@/components/vanguard/candidates/bgv";
import { CommunicationMediumSelect } from "@/components/vanguard/candidates/communication-medium-select";
import { DocumentsStatusSelect } from "@/components/vanguard/candidates/documents-status";
import { EmailHistoryTable } from "@/components/vanguard/email/email-history";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/vanguard/confirm-dialog";

export const Route = createFileRoute("/candidates/$candidateId")({
  head: () => ({
    meta: [{ title: "Candidate Summary · ABC Automation" }],
  }),
  component: CandidateSummaryPage,
});

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fieldLabel(field: string) {
  return field.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

const FIELD_LABELS: Record<string, string> = {
  assigned_to_user_id: "Assigned To",
  bgv_client_status: "BGV by Client",
  bgv_ey_status: "BGV by EY",
  overall_bgv_status: "Overall BGV",
  remarks: "Remarks",
  next_action: "Next Action",
  documents_status: "Documents Status",
  communication_medium: "Communication Medium",
  verification_status: "Verification Status",
};

const ACTION_LABELS: Record<string, string> = {
  assigned_to_user_id: "Candidate Assigned",
  bgv_client_status: "BGV Status Updated",
  bgv_ey_status: "BGV Status Updated",
  overall_bgv_status: "BGV Status Updated",
  remarks: "Remark Updated",
  next_action: "Next Action Updated",
  documents_status: "Document Status Updated",
  communication_medium: "Communication Updated",
  verification_status: "Verification Updated",
};

function actionLabel(field: string) {
  return ACTION_LABELS[field] ?? `${fieldLabel(field)} Updated`;
}

function auditValueLabel(field: string, label: string | null) {
  if (field === "assigned_to_user_id") return label ?? "Unassigned";
  return label ?? "—";
}

function CandidateSummaryPage() {
  const { candidateId } = Route.useParams();
  const { currentUser } = useAuth();
  const isManager = currentUser?.role === "MANAGER";

  const summary = useLocalApi(() => workspaceApi.getCandidateSummary(candidateId), [candidateId]);
  const templates = useLocalApi(() => emailApi.templates(), []);
  const batches = useLocalApi(() => emailApi.batches(), []);
  const teams = useLocalApi(
    () => (isManager ? workspaceApi.getTeams() : Promise.resolve([])),
    [isManager],
  );
  const audit = useLocalApi(() => workspaceApi.getCandidateAudit(candidateId), [candidateId]);

  const [remarksDraft, setRemarksDraft] = useState<string | null>(null);
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [nextActionDraft, setNextActionDraft] = useState<string | null>(null);
  const [savingNextAction, setSavingNextAction] = useState(false);
  const [reassignTo, setReassignTo] = useState("");

  if (summary.error && /access|not found/i.test(summary.error)) {
    throw notFound();
  }
  if (!summary.data) {
    return <EmptyState title={summary.loading ? "Loading…" : "Candidate not found"} />;
  }

  const { candidate: c, assignedTo, communications } = summary.data;
  const team = teams.data?.[0] ?? null;
  const batchName = batches.data?.find((b) => b.id === c.batch_id)?.name ?? "—";
  const remarks = remarksDraft ?? c.remarks ?? "";
  const nextAction = nextActionDraft ?? c.next_action ?? "";

  const welcomeTemplate = templates.data?.templates.find(
    (t) => t.category === "Welcome" && t.active,
  );
  const reminderTemplate = templates.data?.templates.find(
    (t) => t.category === "Reminder" && t.active,
  );

  const send = async (templateId: string | undefined, label: string) => {
    if (!templateId) {
      toast.error(`No active ${label} template found`);
      return;
    }
    try {
      const res = await emailApi.sendBatch({ candidateIds: [c.id], templateId });
      toast.success(`${label}: ${res.sent} sent · ${res.skipped} skipped · ${res.failed} failed`);
      void summary.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Could not send ${label.toLowerCase()}`);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" asChild>
        <Link to="/candidates">
          <ArrowLeft className="size-4" /> Back to candidates
        </Link>
      </Button>

      <div className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Candidate Detail
      </div>
      <PageHeader
        title={`${c.first_name} ${c.last_name}`}
        description={`Candidate ID: ${c.candidate_id}`}
        actions={<OverallBgvPill status={c.overall_bgv_status} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <DataCard className="p-4">
          <SectionTitle>Candidate Summary</SectionTitle>
          <KeyValue label="Email" value={c.email} />
          <KeyValue label="Phone" value={c.phone ?? "—"} />
          <KeyValue label="Batch" value={batchName} />
          <KeyValue label="Joining date" value={fmtDate(c.joining_date)} />
          <KeyValue label="Location" value={c.location ?? "—"} />
          <KeyValue label="Assigned To" value={assignedTo?.name ?? "Unassigned"} />
          <KeyValue label="Verification" value={c.verification_status.replaceAll("_", " ")} />
          <KeyValue label="Education" value={c.education ?? "—"} />
          <KeyValue label="Highest Qualification" value={c.highest_qualification ?? "—"} />
          <KeyValue label="MCA" value={c.mca ?? "—"} />
          <KeyValue label="Graduation" value={c.graduation ?? "—"} />
          <KeyValue label="Previous Employer" value={c.previous_employer ?? "—"} />
          <KeyValue label="Experience" value={c.experience ?? "—"} />
          {c.verification_link ? (
            <KeyValue
              label="Verification Link"
              value={
                <a
                  href={c.verification_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Open link
                </a>
              }
            />
          ) : null}
        </DataCard>

        <DataCard className="p-4">
          <SectionTitle>BGV</SectionTitle>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">BGV by Client</span>
              <BgvStatusSelect
                value={c.bgv_client_status}
                onChange={async (value) => {
                  try {
                    await workspaceApi.updateBgv(c.id, "bgv_client_status", value);
                    void summary.reload();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not update BGV");
                  }
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">BGV by EY</span>
              <BgvStatusSelect
                value={c.bgv_ey_status}
                onChange={async (value) => {
                  try {
                    await workspaceApi.updateBgv(c.id, "bgv_ey_status", value);
                    void summary.reload();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not update BGV");
                  }
                }}
              />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs font-medium text-foreground">Overall BGV (read-only)</span>
              <OverallBgvPill status={c.overall_bgv_status} />
            </div>
          </div>
        </DataCard>

        <DataCard className="p-4">
          <SectionTitle>Assignment</SectionTitle>
          {!isManager ? (
            <KeyValue label="Assigned To" value={assignedTo?.name ?? "Unassigned"} />
          ) : null}
          {isManager ? (
            <div className="mt-3 flex items-center gap-2">
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue placeholder="Reassign to…" />
                </SelectTrigger>
                <SelectContent>
                  {(team?.members ?? [])
                    .filter((m) => m.isActive)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!reassignTo}
                onClick={async () => {
                  try {
                    await workspaceApi.assignBulk([c.id], reassignTo);
                    toast.success("Candidate reassigned");
                    setReassignTo("");
                    void summary.reload();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Reassignment failed");
                  }
                }}
              >
                Reassign
              </Button>
            </div>
          ) : null}
        </DataCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <DataCard className="p-4">
          <SectionTitle>Communication</SectionTitle>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Communication Medium</span>
            <CommunicationMediumSelect
              value={c.communication_medium}
              onChange={async (value) => {
                try {
                  await workspaceApi.updateCommunicationMedium(c.id, value);
                  void summary.reload();
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : "Could not update communication medium",
                  );
                }
              }}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ConfirmDialog
              trigger={
                <Button size="sm">
                  <Mail className="size-4" /> Send Welcome
                </Button>
              }
              title="Send welcome email?"
              description={`The welcome email will be sent to ${c.email}.`}
              confirmLabel="Send"
              onConfirm={() => send(welcomeTemplate?.id, "Welcome email")}
            />
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="outline">
                  <Mail className="size-4" /> Send Reminder
                </Button>
              }
              title="Send reminder email?"
              description={`The verification reminder will be sent to ${c.email}.`}
              confirmLabel="Send"
              onConfirm={() => send(reminderTemplate?.id, "Reminder email")}
            />
          </div>
        </DataCard>

        <DataCard className="p-4">
          <SectionTitle>Remarks</SectionTitle>
          <Textarea
            value={remarks}
            onChange={(e) => setRemarksDraft(e.target.value)}
            rows={4}
            placeholder="e.g. Candidate requested follow-up after 5 PM."
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              disabled={savingRemarks}
              onClick={async () => {
                setSavingRemarks(true);
                try {
                  await workspaceApi.updateRemarks(c.id, remarks.trim());
                  toast.success("Remarks saved");
                  void summary.reload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not save remarks");
                } finally {
                  setSavingRemarks(false);
                }
              }}
            >
              Save Changes
            </Button>
          </div>
        </DataCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <DataCard className="p-4">
          <SectionTitle>Documents</SectionTitle>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Documents Status</span>
            <DocumentsStatusSelect
              value={c.documents_status}
              onChange={async (status) => {
                try {
                  await workspaceApi.updateDocumentsStatus(c.id, status);
                  void summary.reload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not update documents status");
                }
              }}
            />
          </div>
        </DataCard>

        <DataCard className="p-4">
          <SectionTitle>Next Action</SectionTitle>
          <Textarea
            value={nextAction}
            onChange={(e) => setNextActionDraft(e.target.value)}
            rows={4}
            placeholder="e.g. Follow up with candidate for updated passport copy."
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              disabled={savingNextAction}
              onClick={async () => {
                setSavingNextAction(true);
                try {
                  await workspaceApi.updateNextAction(c.id, nextAction.trim());
                  toast.success("Next action saved");
                  void summary.reload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not save next action");
                } finally {
                  setSavingNextAction(false);
                }
              }}
            >
              Save Changes
            </Button>
          </div>
        </DataCard>
      </div>

      <div className="mt-4">
        <SectionTitle>Email History</SectionTitle>
        <EmailHistoryTable rows={communications} onChanged={() => void summary.reload()} />
      </div>

      <div className="mt-4">
        <SectionTitle>Audit History</SectionTitle>
        <DataCard>
          {audit.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date &amp; Time</TableHead>
                  <TableHead>Changed By</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Previous Value</TableHead>
                  <TableHead>New Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {fmtDateTime(row.changed_at)}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {row.changed_by_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">{actionLabel(row.field)}</TableCell>
                    <TableCell className="text-xs">
                      {FIELD_LABELS[row.field] ?? fieldLabel(row.field)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {auditValueLabel(row.field, row.old_value_label)}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {auditValueLabel(row.field, row.new_value_label)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="No activity recorded yet." />
          )}
        </DataCard>
      </div>
    </>
  );
}
