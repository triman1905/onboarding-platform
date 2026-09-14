import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Mail, Send, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  emailApi,
  useLocalApi,
  type ChannelName,
  type EmailPreview,
  type ValidationResult,
} from "@/lib/email/api";
import { EmailHistoryTable } from "@/components/vanguard/email/email-history";
import { ScheduledReminders } from "@/components/vanguard/email/scheduled-reminders";
import { ReminderReviewSheet } from "@/components/vanguard/email/reminder-review-sheet";
import { ManualCandidateForm } from "@/components/vanguard/email/manual-candidate-form";
import { TemplateManagerSheet } from "@/components/vanguard/email/template-manager-sheet";
import { ChannelSelector } from "@/components/vanguard/email/channel-selector";
import {
  DataCard,
  EmptyState,
  KpiCard,
  PageHeader,
  SectionTitle,
} from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/vanguard/confirm-dialog";
import { useAuth } from "@/lib/auth/store";

export const Route = createFileRoute("/email-automation")({
  validateSearch: (search: Record<string, unknown>): { tab?: string; reminder?: string } => {
    const out: { tab?: string; reminder?: string } = {};
    if (typeof search["tab"] === "string") out.tab = search["tab"];
    if (typeof search["reminder"] === "string") out.reminder = search["reminder"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "Email Automation · ABC Automation" },
      {
        name: "description",
        content:
          "Import candidates, preview personalized welcome emails, send through local Gmail SMTP and schedule automatic reminders.",
      },
      { property: "og:title", content: "Email Automation · ABC Automation" },
      {
        property: "og:description",
        content: "Local email automation: import, preview, send, schedule, track.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EmailAutomation,
});

type ChannelPreviewMap = Partial<
  Record<"WHATSAPP" | "SMS", { body: string; to: string | null; missingDestination: boolean }>
>;
type ChannelPreviewEntry = readonly [candidateId: string, name: string, preview: ChannelPreviewMap];

function EmailAutomation() {
  const { currentUser } = useAuth();
  const isManager = currentUser?.role === "MANAGER";
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const status = useLocalApi(() => emailApi.status(), [], 15000);
  const batches = useLocalApi(() => emailApi.batches(), []);
  const templates = useLocalApi(() => emailApi.templates(), []);
  const history = useLocalApi(() => emailApi.history(), [], 15000);
  const reminders = useLocalApi(() => emailApi.reminders(), [], 15000);
  const channelTemplates = useLocalApi(() => emailApi.channelTemplates(), []);

  const [file, setFile] = useState<File | null>(null);
  const [batchName, setBatchName] = useState("October 2026");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [batchId, setBatchId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [previews, setPreviews] = useState<EmailPreview[]>([]);
  const [channelPreviews, setChannelPreviews] = useState<ChannelPreviewEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [importMode, setImportMode] = useState<"upload" | "manual">("upload");
  const [sendChannels, setSendChannels] = useState<Set<ChannelName>>(new Set(["EMAIL"]));

  const [reminderName, setReminderName] = useState("Verification Reminder");
  const [reminderTemplate, setReminderTemplate] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [executionMode, setExecutionMode] = useState<"AUTO_SEND" | "NOTIFY_RECRUITER">(
    "NOTIFY_RECRUITER",
  );
  const [reminderChannels, setReminderChannels] = useState<Set<ChannelName>>(new Set(["EMAIL"]));
  const [reviewReminderId, setReviewReminderId] = useState<string | null>(search.reminder ?? null);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);

  const isLocalEnv = status.data?.environment === "LOCAL";
  const disabledChannels: Partial<Record<ChannelName, string>> = isLocalEnv
    ? {
        ...(status.data?.channels?.whatsapp.configured ? {} : { WHATSAPP: "not configured" }),
        ...(status.data?.channels?.sms.configured ? {} : { SMS: "not configured" }),
      }
    : { WHATSAPP: "local backend required", SMS: "local backend required" };

  const allTemplates = templates.data?.templates ?? [];
  // Archived templates stay visible in the manager sheet, but drop out of both send/reminder pickers.
  const templateList = allTemplates.filter((t) => t.active);
  const activeBatchId = batchId || batches.data?.[0]?.id || "";
  const activeTemplateId = templateId || templateList[0]?.id || "";
  const activeReminderTemplate =
    reminderTemplate || templateList.find((t) => t.category === "Reminder")?.id || activeTemplateId;
  // WhatsApp/SMS reminder templates are code-level (channelTemplates.js on the
  // backend) — a reminder always uses the REMINDER-typed entry for whichever
  // channels are selected, so these dropdowns are read-only single choices
  // today but keep the same picker shape a future multi-template setup would use.
  const whatsappReminderTemplate = (channelTemplates.data?.WHATSAPP ?? []).find(
    (t) => t.type === "REMINDER",
  );
  const smsReminderTemplate = (channelTemplates.data?.SMS ?? []).find((t) => t.type === "REMINDER");

  const batchCandidates = useLocalApi(
    () => (activeBatchId ? emailApi.candidates(activeBatchId) : Promise.resolve([])),
    [activeBatchId],
  );

  const stats = status.data?.stats;
  const reloadAll = () => {
    void history.reload();
    void status.reload();
    void reminders.reload();
    void batches.reload();
    void batchCandidates.reload();
    void templates.reload();
  };

  const candidateCount = useMemo(
    () => batches.data?.find((b) => b.id === activeBatchId)?.candidate_count ?? 0,
    [batches.data, activeBatchId],
  );

  const activeTab = search.tab ?? "import";
  const setActiveTab = (tab: string) => {
    void navigate({ search: (prev) => ({ ...prev, tab }), replace: true });
  };

  useEffect(() => {
    if (search.reminder) setReviewReminderId(search.reminder);
  }, [search.reminder]);

  return (
    <>
      <PageHeader
        title="Email Automation"
        description="Upload → validate → preview → send → schedule reminders → track. Runs on your machine (Express + SQLite + Nodemailer + node-cron + Twilio)."
      />

      {status.data?.testMode ? (
        <div className="mb-4 flex items-center gap-2">
          <Pill tone="warning">TEST MODE</Pill>
          <span className="text-xs text-muted-foreground">
            Only send to test recipients. Set TEST_MODE=false in server/.env once you go beyond test
            candidates.
          </span>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Candidates" value={stats?.candidates ?? "—"} icon={Mail} />
        <KpiCard label="Welcome emails sent" value={stats?.welcomeSent ?? "—"} tone="success" />
        <KpiCard label="Reminder emails sent" value={stats?.reminderSent ?? "—"} tone="info" />
        <KpiCard label="Failed emails" value={stats?.failed ?? "—"} tone="danger" />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="WhatsApp sent"
          value={stats?.channels?.whatsapp.sent ?? "—"}
          tone="success"
        />
        <KpiCard label="SMS sent" value={stats?.channels?.sms.sent ?? "—"} tone="success" />
        <KpiCard label="Pending sends" value={stats?.pending ?? "—"} tone="info" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="send">Preview &amp; send</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
          <TabsTrigger value="history">Communication history</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="mt-4 space-y-4">
          {!isManager ? (
            <EmptyState
              title="Manager access required"
              description="Uploading candidate CSVs and adding candidates is restricted to managers."
            />
          ) : (
            <>
              <DataCard className="max-w-2xl space-y-4 p-5">
                <SectionTitle>Candidate import</SectionTitle>
                <div className="flex gap-2">
                  <Button
                    variant={importMode === "upload" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setImportMode("upload")}
                  >
                    <Upload className="size-4" /> Upload CSV / XLSX
                  </Button>
                  <Button
                    variant={importMode === "manual" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setImportMode("manual")}
                  >
                    Add Candidate Manually
                  </Button>
                </div>
              </DataCard>

              {importMode === "upload" ? (
                <DataCard className="max-w-2xl space-y-4 p-5">
                  <SectionTitle>Upload candidate CSV / XLSX</SectionTitle>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Batch name</Label>
                      <Input
                        value={batchName}
                        onChange={(e) => setBatchName(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>File</Label>
                      <Input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        className="mt-1"
                        onChange={(e) => {
                          setFile(e.target.files?.[0] ?? null);
                          setValidation(null);
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={!file || busy}
                      onClick={async () => {
                        if (!file) return;
                        setBusy(true);
                        try {
                          setValidation(await emailApi.validateFile(file));
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Validation failed");
                        }
                        setBusy(false);
                      }}
                    >
                      <Upload className="size-4" /> Validate
                    </Button>
                    <Button
                      disabled={!file || !validation?.validCount || busy}
                      onClick={async () => {
                        if (!file) return;
                        setBusy(true);
                        try {
                          const res = await emailApi.importFile(file, { name: batchName });
                          toast.success(`Imported ${res.validation.validCount} candidates`);
                          setBatchId(res.batch.id);
                          reloadAll();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Import failed");
                        }
                        setBusy(false);
                      }}
                    >
                      Import valid candidates
                    </Button>
                  </div>
                  {validation ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Pill>Total {validation.total}</Pill>
                        <Pill tone="success">Valid {validation.validCount}</Pill>
                        <Pill tone="danger">Invalid {validation.invalidCount}</Pill>
                        <Pill tone="warning">Duplicates {validation.duplicateCount}</Pill>
                      </div>
                      {validation.issues.length ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Candidate</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Issue</TableHead>
                              <TableHead>Severity</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {validation.issues.map((i, idx) => (
                              <TableRow key={`${i.row}-${idx}`}>
                                <TableCell className="text-xs">{i.candidate || "—"}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {i.email || "—"}
                                </TableCell>
                                <TableCell className="text-xs">{i.issue}</TableCell>
                                <TableCell>
                                  <Pill tone={i.severity === "ERROR" ? "danger" : "warning"}>
                                    {i.severity}
                                  </Pill>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : null}
                    </div>
                  ) : null}
                </DataCard>
              ) : (
                <ManualCandidateForm
                  batches={batches.data ?? []}
                  batchId={activeBatchId}
                  onBatchChange={setBatchId}
                  onBatchCreated={() => void batches.reload()}
                  onCandidateAdded={reloadAll}
                />
              )}

              {activeBatchId ? (
                <DataCard className="max-w-2xl space-y-3 p-5">
                  <SectionTitle>
                    Candidates in{" "}
                    {batches.data?.find((b) => b.id === activeBatchId)?.name ?? "this batch"}
                  </SectionTitle>
                  {batchCandidates.data?.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Candidate</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batchCandidates.data.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="text-xs font-medium">
                              {c.first_name} {c.last_name}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {c.email}
                            </TableCell>
                            <TableCell className="text-xs">{c.verification_status}</TableCell>
                            <TableCell>
                              <Pill tone={c.source === "MANUAL" ? "info" : "neutral"}>
                                {c.source}
                              </Pill>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No candidates in this batch yet.
                    </p>
                  )}
                </DataCard>
              ) : null}
            </>
          )}
        </TabsContent>

        <TabsContent value="send" className="mt-4 space-y-4">
          <DataCard className="max-w-2xl space-y-4 p-5">
            <SectionTitle>Send Welcome</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Batch</Label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                  value={activeBatchId}
                  onChange={(e) => setBatchId(e.target.value)}
                >
                  {(batches.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.candidate_count ?? 0})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Email template</Label>
                <div className="mt-1 flex gap-2">
                  <select
                    className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                    value={activeTemplateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    disabled={!sendChannels.has("EMAIL")}
                  >
                    {templateList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setTemplateManagerOpen(true)}
                  >
                    + Manage Templates
                  </Button>
                </div>
              </div>
            </div>

            <ChannelSelector
              selected={sendChannels}
              onChange={setSendChannels}
              disabledChannels={disabledChannels}
            />
            {sendChannels.has("WHATSAPP") && isLocalEnv ? (
              <p className="text-xs text-muted-foreground">
                WhatsApp uses the Twilio Sandbox in this prototype — each recipient must first join
                the Sandbox (send the join code to the Sandbox number in WhatsApp).
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!activeBatchId || sendChannels.size === 0}
                onClick={async () => {
                  try {
                    if (sendChannels.has("EMAIL") && activeTemplateId) {
                      setPreviews(
                        await emailApi.preview(activeTemplateId, { batchId: activeBatchId }),
                      );
                    } else {
                      setPreviews([]);
                    }
                    const wantsChannelPreview =
                      isLocalEnv && (sendChannels.has("WHATSAPP") || sendChannels.has("SMS"));
                    if (wantsChannelPreview) {
                      const candidates = batchCandidates.data ?? [];
                      const entries = await Promise.all(
                        candidates.map(async (c) => {
                          const result: ChannelPreviewMap = {};
                          for (const channel of ["WHATSAPP", "SMS"] as const) {
                            if (!sendChannels.has(channel)) continue;
                            const p = await emailApi.previewChannel(c.id, channel, "WELCOME");
                            result[channel] = {
                              body: p.body,
                              to: p.to,
                              missingDestination: p.missingDestination,
                            };
                          }
                          return [c.id, `${c.first_name} ${c.last_name}`.trim(), result] as const;
                        }),
                      );
                      setChannelPreviews(entries);
                    } else {
                      setChannelPreviews([]);
                    }
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Preview failed");
                  }
                }}
              >
                Preview personalized messages
              </Button>
              <ConfirmDialog
                trigger={
                  <Button disabled={!activeBatchId || sendChannels.size === 0}>
                    <Send className="size-4" /> Send Selected
                  </Button>
                }
                title="Send real messages"
                description={
                  <>
                    <p>You are about to send:</p>
                    <ul className="list-disc pl-5">
                      {[...sendChannels].map((ch) => (
                        <li key={ch}>
                          {previews.length || channelPreviews.length || candidateCount}{" "}
                          {ch === "EMAIL" ? "email" : ch === "WHATSAPP" ? "WhatsApp" : "SMS"}{" "}
                          message(s)
                        </li>
                      ))}
                    </ul>
                    <p>
                      Candidates who already received this message, or lack a valid destination for
                      a channel, are skipped automatically.
                    </p>
                  </>
                }
                confirmLabel="Confirm &amp; send"
                onConfirm={async () => {
                  try {
                    const channelsArr = [...sendChannels];
                    if (channelsArr.length === 1 && channelsArr[0] === "EMAIL") {
                      const res = await emailApi.sendBatch({
                        batchId: activeBatchId,
                        templateId: activeTemplateId,
                      });
                      toast.success(
                        `Email: ${res.sent} sent · ${res.skipped} skipped · ${res.failed} failed`,
                      );
                    } else {
                      const res = await emailApi.bulkSend({
                        batchId: activeBatchId,
                        channels: channelsArr,
                        templateId: sendChannels.has("EMAIL") ? activeTemplateId : undefined,
                        type: "WELCOME",
                      });
                      const parts = Object.entries(res.byChannel).map(
                        ([ch, s]) =>
                          `${ch}: ${s.sent} sent · ${s.skipped} skipped · ${s.failed} failed`,
                      );
                      toast.success(parts.join("  |  "));
                    }
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Send failed");
                  }
                  reloadAll();
                }}
              />
            </div>
          </DataCard>

          {previews.map((p) => (
            <DataCard key={p.candidateId} className="max-w-2xl space-y-2 p-5">
              <p className="text-sm font-medium">
                {p.candidateName} · <span className="text-muted-foreground">{p.to}</span>
                <Pill tone="info" className="ml-2">
                  Email
                </Pill>
              </p>
              <p className="text-sm">{p.subject}</p>
              <pre className="rounded-lg border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                {p.body}
              </pre>
              {p.missingVariables.length ? (
                <Pill tone="warning">Missing: {p.missingVariables.join(", ")}</Pill>
              ) : null}
            </DataCard>
          ))}

          {channelPreviews.map(([candidateId, name, result]) => (
            <DataCard key={candidateId} className="max-w-2xl space-y-2 p-5">
              <p className="text-sm font-medium">{name}</p>
              {(["WHATSAPP", "SMS"] as const).map((channel) =>
                result[channel] ? (
                  <div key={channel} className="space-y-1">
                    <p className="text-xs">
                      <Pill tone={channel === "WHATSAPP" ? "success" : "info"}>
                        {channel === "WHATSAPP" ? "WhatsApp" : "SMS"}
                      </Pill>{" "}
                      <span className="text-muted-foreground">
                        {result[channel]!.to ?? "no valid phone"}
                      </span>
                    </p>
                    <pre className="rounded-lg border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                      {result[channel]!.body}
                    </pre>
                    {result[channel]!.missingDestination ? (
                      <Pill tone="danger">No valid phone number — will be skipped</Pill>
                    ) : null}
                  </div>
                ) : null,
              )}
            </DataCard>
          ))}
        </TabsContent>

        <TabsContent value="reminders" className="mt-4 space-y-4">
          <DataCard className="max-w-2xl space-y-4 p-5">
            <SectionTitle>Schedule a reminder</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Reminder name</Label>
                <Input
                  value={reminderName}
                  onChange={(e) => setReminderName(e.target.value)}
                  className="mt-1"
                />
              </div>
              {reminderChannels.has("EMAIL") ? (
                <div>
                  <Label>Email template</Label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                    value={activeReminderTemplate}
                    onChange={(e) => setReminderTemplate(e.target.value)}
                  >
                    {templateList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {reminderChannels.has("WHATSAPP") ? (
                <div>
                  <Label>WhatsApp template</Label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                    value={whatsappReminderTemplate?.id ?? ""}
                    disabled
                  >
                    <option value={whatsappReminderTemplate?.id ?? ""}>
                      {whatsappReminderTemplate?.label ?? "WhatsApp Verification Reminder"}
                    </option>
                  </select>
                </div>
              ) : null}
              {reminderChannels.has("SMS") ? (
                <div>
                  <Label>SMS template</Label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                    value={smsReminderTemplate?.id ?? ""}
                    disabled
                  >
                    <option value={smsReminderTemplate?.id ?? ""}>
                      {smsReminderTemplate?.label ?? "SMS Verification Reminder"}
                    </option>
                  </select>
                </div>
              ) : null}
              <div>
                <Label>Send date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Send time (Asia/Kolkata)</Label>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label>Execution Mode</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setExecutionMode("NOTIFY_RECRUITER")}
                  className={`rounded-md border p-3 text-left text-xs transition-colors ${
                    executionMode === "NOTIFY_RECRUITER"
                      ? "border-primary bg-accent/50"
                      : "border-input hover:bg-accent/30"
                  }`}
                >
                  <p className="font-medium text-foreground">Notify Recruiter for Approval</p>
                  <p className="mt-1 text-muted-foreground">
                    Notify the recruiter when the reminder is due. The recruiter can review eligible
                    candidates and send the reminder.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setExecutionMode("AUTO_SEND")}
                  className={`rounded-md border p-3 text-left text-xs transition-colors ${
                    executionMode === "AUTO_SEND"
                      ? "border-primary bg-accent/50"
                      : "border-input hover:bg-accent/30"
                  }`}
                >
                  <p className="font-medium text-foreground">Automatically Send</p>
                  <p className="mt-1 text-muted-foreground">
                    Automatically send the reminder to eligible candidates at the scheduled time.
                  </p>
                </button>
              </div>
            </div>
            <ChannelSelector
              selected={reminderChannels}
              onChange={setReminderChannels}
              disabledChannels={disabledChannels}
            />
            <p className="text-xs text-muted-foreground">
              Target: candidates whose verification status is NOT_STARTED. Candidates who already
              completed verification are skipped by the scheduler.
            </p>
            <Button
              disabled={
                !date || !activeBatchId || !activeReminderTemplate || reminderChannels.size === 0
              }
              onClick={async () => {
                try {
                  await emailApi.createReminder({
                    name: reminderName,
                    batchId: activeBatchId,
                    templateId: activeReminderTemplate,
                    date,
                    time,
                    timezone: "Asia/Kolkata",
                    targetCondition: "NOT_STARTED",
                    executionMode,
                    channels: [...reminderChannels],
                  });
                  toast.success("Reminder scheduled");
                  reloadAll();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not schedule reminder");
                }
              }}
            >
              Schedule reminder
            </Button>
          </DataCard>

          {(reminders.data ?? []).some((r) => r.status === "READY_TO_SEND") ? (
            <DataCard className="max-w-2xl space-y-2 border-warning/40 bg-warning/10 p-4">
              {(reminders.data ?? [])
                .filter((r) => r.status === "READY_TO_SEND")
                .map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0">
                      🔔 <strong>{r.name}</strong> is ready — {r.eligibleCount ?? 0} candidate(s)
                      eligible.
                    </span>
                    <Button size="sm" onClick={() => setReviewReminderId(r.id)}>
                      Review &amp; Send
                    </Button>
                  </div>
                ))}
            </DataCard>
          ) : null}

          <ScheduledReminders
            rows={reminders.data ?? []}
            onChanged={reloadAll}
            onReview={(id) => setReviewReminderId(id)}
          />

          <ReminderReviewSheet
            reminderId={reviewReminderId}
            onClose={() => {
              setReviewReminderId(null);
              if (search.reminder) {
                void navigate({
                  search: (prev) => {
                    const { reminder: _reminder, ...rest } = prev;
                    return rest;
                  },
                  replace: true,
                });
              }
            }}
            onSent={() => {
              setReviewReminderId(null);
              if (search.reminder) {
                void navigate({
                  search: (prev) => {
                    const { reminder: _reminder, ...rest } = prev;
                    return rest;
                  },
                  replace: true,
                });
              }
              reloadAll();
            }}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <EmailHistoryTable rows={history.data ?? []} onChanged={reloadAll} />
        </TabsContent>
      </Tabs>

      <TemplateManagerSheet
        open={templateManagerOpen}
        onClose={() => setTemplateManagerOpen(false)}
        onChanged={() => void templates.reload()}
        batches={batches.data ?? []}
      />
    </>
  );
}
