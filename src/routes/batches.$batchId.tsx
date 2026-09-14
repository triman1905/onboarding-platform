import { useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Download, Pause, Play, Send } from "lucide-react";
import { toast } from "sonner";
import { useVanguard } from "@/lib/vanguard/store";
import { COMPLETE_STATES, IN_PROGRESS_STATES, fmtDate } from "@/lib/vanguard/mock-data";
import { DataCard, KeyValue, KpiCard, PageHeader, ProgressBar, SectionTitle } from "@/components/vanguard/primitives";
import { DaysBadge, Pill, VerificationBadge } from "@/components/vanguard/status";
import { ConfirmDialog } from "@/components/vanguard/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AutomationConfig } from "@/lib/vanguard/types";

export const Route = createFileRoute("/batches/$batchId")({
  head: () => ({
    meta: [
      { title: "Batch detail · ABC Automation" },
      { name: "description", content: "Track candidate progress, communications and automation settings for a batch." },
      { property: "og:title", content: "Batch detail · ABC Automation" },
      { property: "og:description", content: "Batch pipeline, candidate list and automation configuration." },
    ],
  }),
  component: BatchDetail,
});

function BatchDetail() {
  const { batchId } = useParams({ from: "/batches/$batchId" });
  const { getBatch, candidates, communications, setBatchStatus, updateBatchAutomation, sendCommunication, templates } =
    useVanguard();
  const batch = getBatch(batchId);
  const list = useMemo(() => candidates.filter((c) => c.batchId === batchId), [candidates, batchId]);
  const [draft, setDraft] = useState<AutomationConfig | null>(batch ? { ...batch.automation } : null);

  if (!batch || !draft) {
    return (
      <DataCard className="p-10 text-center">
        <p className="text-sm font-medium">Batch not found</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/batches">Back to batches</Link>
        </Button>
      </DataCard>
    );
  }

  const done = list.filter((c) => COMPLETE_STATES.includes(c.verificationStatus)).length;
  const inProgress = list.filter((c) => IN_PROGRESS_STATES.includes(c.verificationStatus)).length;
  const attention = list.filter((c) => c.verificationStatus === "NEEDS_ATTENTION").length;
  const notStarted = list.length - done - inProgress - attention;
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;
  const pendingIds = list.filter((c) => !COMPLETE_STATES.includes(c.verificationStatus)).map((c) => c.id);
  const batchComms = communications.filter((c) => c.batchId === batch.id).slice(0, 25);
  const paused = batch.status === "PAUSED";
  const docsPending = list.filter((c) => c.verificationStatus === "DOCUMENTS_PENDING").length;
  const count = (fn: (c: (typeof list)[number]) => boolean) => list.filter(fn).length;
  const workflow = [
    { label: "Batch uploaded", count: list.length, action: "File validated and candidates imported", tone: "success" as const },
    { label: "Invitation sent", count: count((c) => c.verificationStatus !== "IMPORTED"), action: "Initial email / WhatsApp dispatched", tone: "success" as const },
    { label: "Verification tracking", count: count((c) => ["INVITATION_SENT", "NOT_STARTED", "IN_PROGRESS"].includes(c.verificationStatus)), action: "Workflow engine polls verification state", tone: "info" as const },
    { label: "Document validation", count: count((c) => c.documentStatus === "PARTIAL" || c.documentStatus === "PENDING"), action: "Rule engine compares declarations to uploads", tone: "info" as const },
    { label: "Missing document follow-up", count: docsPending, action: "Automated missing-document email", tone: "warning" as const },
    { label: "Reminder cycle", count: count((c) => c.verificationStatus === "NOT_STARTED" || c.verificationStatus === "INVITATION_SENT"), action: `Reminders at day ${batch.automation.reminderDays.join(", ")}`, tone: "warning" as const },
    { label: "Verification complete", count: count((c) => c.verificationStatus === "VERIFICATION_COMPLETE"), action: "Ready for DFMS submission", tone: "success" as const },
    { label: "DFMS", count: count((c) => c.bgvStatus === "DFMS_SUBMITTED"), action: "Not connected — placeholder stage", tone: "neutral" as const },
    { label: "BGV", count: count((c) => c.bgvStatus === "IN_PROGRESS" || c.bgvStatus === "COMPLETE"), action: "Background verification progress", tone: "neutral" as const },
  ];

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
        <Link to="/batches">
          <ArrowLeft className="size-4" /> All batches
        </Link>
      </Button>

      <PageHeader
        title={batch.name}
        description={`${paused ? "Automation paused" : "Automation running"} · Joining ${fmtDate(batch.joiningDate)} · ${batch.project} · ${batch.location} · Owner ${batch.owner}`}
        actions={
          <>
            <Pill tone={paused ? "warning" : "success"}>
              ● {paused ? "Automation paused" : "Automation running"}
            </Pill>
            <Button variant="outline" asChild>
              <Link to="/needs-attention">View exceptions</Link>
            </Button>
            <Button variant="outline" onClick={() => toast.success("Batch export queued (mock)")}>
              <Download className="size-4" /> Export
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="outline">
                  <Send className="size-4" /> Send reminder to pending
                </Button>
              }
              title="Queue reminder emails?"
              description={
                <>
                  <p>
                    A reminder will be queued for <strong>{pendingIds.length.toLocaleString()} pending candidates</strong>.
                  </p>
                  <p>Delivery is simulated — no external provider is connected.</p>
                </>
              }
              confirmLabel="Queue reminders"
              onConfirm={() => {
                const n = sendCommunication(pendingIds, "EMAIL", "tpl-reminder");
                toast.success(`${n.toLocaleString()} reminders queued (simulated)`);
              }}
            />
            <Button
              variant={paused ? "default" : "outline"}
              onClick={() => {
                setBatchStatus(batch.id, paused ? "AUTOMATION_RUNNING" : "PAUSED");
                toast.success(paused ? "Automation resumed" : "Automation paused");
              }}
            >
              {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              {paused ? "Resume automation" : "Pause automation"}
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total candidates" value={list.length.toLocaleString()} />
        <KpiCard label="Verification complete" value={done.toLocaleString()} tone="success" hint={`${pct}% of batch`} />
        <KpiCard label="In progress" value={inProgress.toLocaleString()} tone="info" />
        <KpiCard label="Documents pending" value={docsPending.toLocaleString()} tone="warning" hint={`${Math.max(0, notStarted)} not started`} />
        <KpiCard label="Needs attention" value={attention.toLocaleString()} tone="danger" />
      </div>

      <DataCard className="mb-6 p-4">
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Batch completion</span>
          <span className="tabular">{pct}%</span>
        </div>
        <ProgressBar value={pct} />
      </DataCard>

      {paused ? (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning-soft p-4 text-xs text-warning">
          <span className="font-semibold">Automation paused · </span>
          No new automated actions will execute until the workflow is resumed.
        </div>
      ) : null}

      <div className="mb-6">
        <SectionTitle>Automation workflow</SectionTitle>
        <DataCard className="p-4">
          <ol className="grid gap-2 md:grid-cols-3 xl:grid-cols-9">
            {workflow.map((w, i) => (
              <li key={w.label} className="relative rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-[11px] font-medium text-muted-foreground">{w.label}</div>
                <div className="tabular mt-1 text-base font-semibold">{w.count.toLocaleString()}</div>
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{w.action}</p>
                <span className="mt-2 inline-block">
                  <Pill tone={w.tone}>{w.count > 0 ? "active" : "idle"}</Pill>
                </span>
                {i < workflow.length - 1 ? (
                  <span className="absolute top-1/2 -right-2 hidden size-3 -translate-y-1/2 items-center justify-center text-border xl:flex">
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </DataCard>
      </div>

      <Tabs defaultValue="candidates">
        <TabsList>
          <TabsTrigger value="candidates">Candidates</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
          <TabsTrigger value="automation">Automation settings</TabsTrigger>
          <TabsTrigger value="details">Batch details</TabsTrigger>
        </TabsList>

        <TabsContent value="candidates" className="mt-4">
          <DataCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Days pending</TableHead>
                  <TableHead>Last action</TableHead>
                  <TableHead>Next action</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.slice(0, 50).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.firstName} {c.lastName}</div>
                      <div className="text-xs text-muted-foreground">{c.candidateId}</div>
                    </TableCell>
                    <TableCell><VerificationBadge status={c.verificationStatus} /></TableCell>
                    <TableCell><DaysBadge days={c.daysPending} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.lastAction}</TableCell>
                    <TableCell className="text-xs font-medium">{c.nextAction}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/candidates/$candidateId" params={{ candidateId: c.id }}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {list.length > 50 ? (
              <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                Showing first 50 of {list.length.toLocaleString()} candidates — use the candidate directory for full search.
              </p>
            ) : null}
          </DataCard>
        </TabsContent>

        <TabsContent value="communications" className="mt-4">
          <DataCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchComms.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.candidateName}</TableCell>
                    <TableCell><Pill tone="info">{m.channel === "EMAIL" ? "Email" : "WhatsApp"}</Pill></TableCell>
                    <TableCell className="text-xs">{m.templateName}</TableCell>
                    <TableCell>
                      <Pill tone={m.status === "FAILED" || m.status === "BOUNCED" ? "danger" : m.status === "DELIVERED" ? "success" : "neutral"}>
                        {m.status.toLowerCase()}
                      </Pill>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(m.sentAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataCard>
        </TabsContent>

        <TabsContent value="automation" className="mt-4">
          <DataCard className="max-w-2xl p-6">
            <SectionTitle>Automation configuration</SectionTitle>
            <Toggle label="Send verification email" checked={draft.sendEmail} onChange={(v) => setDraft({ ...draft, sendEmail: v })} />
            <Toggle
              label="Send WhatsApp message"
              hint="Provider not connected — simulated"
              checked={draft.sendWhatsApp}
              onChange={(v) => setDraft({ ...draft, sendWhatsApp: v })}
            />
            <Toggle label="Automatic reminders" checked={draft.remindersEnabled} onChange={(v) => setDraft({ ...draft, remindersEnabled: v })} />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {draft.reminderDays.map((d, i) => (
                <div key={i} className="space-y-1.5">
                  <Label className="text-xs">Reminder {i + 1} (days)</Label>
                  <Input
                    type="number"
                    value={d}
                    disabled={!draft.remindersEnabled}
                    onChange={(e) => {
                      const next = [...draft.reminderDays];
                      next[i] = Number(e.target.value);
                      setDraft({ ...draft, reminderDays: next });
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1.5">
              <Label className="text-xs">Email template</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                value={draft.emailTemplateId}
                onChange={(e) => setDraft({ ...draft, emailTemplateId: e.target.value })}
              >
                {templates.filter((t) => t.channel === "EMAIL").map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <Toggle
              label="Missing document follow-up"
              checked={draft.missingDocFollowUp}
              onChange={(v) => setDraft({ ...draft, missingDocFollowUp: v })}
            />
            <Toggle label="Escalation" checked={draft.escalationEnabled} onChange={(v) => setDraft({ ...draft, escalationEnabled: v })} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Escalate after (days)</Label>
                <Input
                  type="number"
                  value={draft.escalateAfterDays}
                  disabled={!draft.escalationEnabled}
                  onChange={(e) => setDraft({ ...draft, escalateAfterDays: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Escalation recipient</Label>
                <Input
                  value={draft.escalationRecipient}
                  disabled={!draft.escalationEnabled}
                  onChange={(e) => setDraft({ ...draft, escalationRecipient: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDraft({ ...batch.automation })}>Reset</Button>
              <Button
                onClick={() => {
                  updateBatchAutomation(batch.id, draft);
                  toast.success("Automation settings saved");
                }}
              >
                Save settings
              </Button>
            </div>
          </DataCard>
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <DataCard className="max-w-xl p-5">
            <KeyValue label="Batch name" value={batch.name} />
            <KeyValue label="Joining date" value={fmtDate(batch.joiningDate)} />
            <KeyValue label="Created" value={fmtDate(batch.createdAt)} />
            <KeyValue label="Project" value={batch.project} />
            <KeyValue label="Location" value={batch.location} />
            <KeyValue label="Payroll entity" value={batch.payrollEntity} />
            <KeyValue label="Recruitment owner" value={batch.owner} />
            <KeyValue label="Status" value={<Pill tone={paused ? "warning" : "success"}>{batch.status.replaceAll("_", " ").toLowerCase()}</Pill>} />
          </DataCard>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border py-3 first:border-0">
      <div>
        <div className="text-sm">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
