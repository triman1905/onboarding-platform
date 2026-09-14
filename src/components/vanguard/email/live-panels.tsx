import { useState } from "react";
import { CheckCircle2, Copy, Mail, MailCheck, MailWarning, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { API_BASE, emailApi, useLocalApi } from "@/lib/email/api";
import { DataCard, EmptyState, KeyValue, KpiCard, SectionTitle } from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function when(value: string) {
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function OfflineNote({ compact }: { compact?: boolean }) {
  return (
    <p className={compact ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>
      Run <code className="rounded bg-muted px-1">npm run dev</code> to start the local Express backend at {API_BASE}.
    </p>
  );
}



/** Live email metrics + automation log for the dashboard. */
export function DashboardEmailStats() {
  const status = useLocalApi(() => emailApi.status(), [], 20000);
  const logs = useLocalApi(() => emailApi.logs(), [], 20000);
  const s = status.data?.stats;

  return (
    <section className="mb-8">
      <SectionTitle
        action={
          status.data?.configured ? (
            <Pill tone="success">{`${status.data.provider} · ${status.data.sender}`}</Pill>
          ) : null
        }
      >
        Email automation
      </SectionTitle>


      {status.data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <KpiCard label="Candidates" value={s?.candidates ?? 0} icon={Mail} />
            <KpiCard label="Welcome emails sent" value={s?.welcomeSent ?? 0} tone="success" icon={MailCheck} />
            <KpiCard label="Reminders scheduled" value={s?.remindersScheduled ?? 0} tone="info" />
            <KpiCard label="Reminder emails sent" value={s?.reminderSent ?? 0} tone="info" />
            <KpiCard label="Failed emails" value={s?.failed ?? 0} tone="danger" icon={MailWarning} />
            <KpiCard label="Emails today" value={s?.today ?? 0} tone="neutral" />
          </div>
          <DataCard className="mt-4 p-4">
            <SectionTitle>Recent email automation activity</SectionTitle>
            {logs.data?.length ? (
              <ul className="space-y-2">
                {logs.data.slice(0, 8).map((l) => (
                  <li key={l.id} className="flex items-start gap-3 text-xs">
                    <span className="tabular w-12 shrink-0 text-muted-foreground">{when(l.created_at)}</span>
                    <Pill tone={l.level === "ERROR" ? "danger" : l.level === "WARN" ? "warning" : "success"}>
                      {l.source}
                    </Pill>
                    <span className="text-foreground">{l.message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No automation activity yet" />
            )}
          </DataCard>
        </>
      ) : (
        <DataCard className="p-4">
          <OfflineNote />
        </DataCard>
      )}
    </section>
  );
}

/**
 * Settings → Email Configuration (local Gmail SMTP backend).
 */
export function EmailSettingsPanel() {
  const status = useLocalApi(() => emailApi.status(), [], 20000);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DataCard className="p-5">
        <SectionTitle>Email configuration</SectionTitle>
        <KeyValue label="Email provider" value="Gmail (SMTP · smtp.gmail.com:465)" />
        <KeyValue label="Backend" value={API_BASE} />
        <KeyValue
          label="Connection status"
          value={
            status.data?.configured ? <Pill tone="success">Configured</Pill> : <Pill tone="warning">Not configured</Pill>
          }
        />
        <KeyValue label="Sender email" value={status.data?.sender || "—"} />
        <KeyValue
          label="Mode"
          value={status.data?.testMode ? <Pill tone="warning">TEST MODE ACTIVE</Pill> : <Pill tone="info">Live</Pill>}
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={!status.data || testing}
            onClick={async () => {
              setTesting(true);
              try {
                const res = await emailApi.test();
                setResult(res);
                res.ok ? toast.success(res.message) : toast.error(res.message);
              } catch (e) {
                const message = e instanceof Error ? e.message : "Test failed";
                setResult({ ok: false, message });
                toast.error(message);
              }
              setTesting(false);
              void status.reload();
            }}
          >
            <Send className="size-4" /> {testing ? "Testing…" : "Test email connection"}
          </Button>

        </div>

        {result ? (
          <p className={`mt-3 flex items-center gap-2 text-sm ${result.ok ? "text-success" : "text-danger"}`}>
            {result.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {result.message}
          </p>
        ) : null}
        {!status.data ? <div className="mt-3"><OfflineNote compact /></div> : null}
      </DataCard>

      <DataCard className="p-5">
        <SectionTitle>Credentials &amp; limitations</SectionTitle>
        <p className="text-sm text-muted-foreground">
          Gmail credentials are read from the backend <code className="rounded bg-muted px-1">.env</code> file
          (<code className="rounded bg-muted px-1">GMAIL_USER</code>,{" "}
          <code className="rounded bg-muted px-1">GMAIL_APP_PASSWORD</code>). They are never entered, stored or
          displayed in the browser. Use a Google App Password, never your account password.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Scheduled automation runs while the local backend is running. For production use, deploy the backend to an
          always-on server.
        </p>
      </DataCard>

    </div>
  );
}

/** Templates page → email templates stored in the local SQLite database. */
export function LocalTemplatesPanel() {
  const templates = useLocalApi(() => emailApi.templates(), []);
  const rows = templates.data?.templates ?? [];

  if (!templates.data) {
    return (
      <DataCard className="p-4">
        <OfflineNote />
      </DataCard>
    );
  }

  return (
    <DataCard>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <SectionTitle>Local email templates ({rows.length})</SectionTitle>
        <span className="w-full min-w-0 truncate text-xs text-muted-foreground sm:w-auto">
          Variables: {(templates.data.variables ?? []).map((v) => `{{${v}}}`).join(" · ")}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Template name</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">{t.subject}</TableCell>
              <TableCell>
                <Pill tone={t.active ? "success" : "neutral"}>{t.active ? "Active" : "Inactive"}</Pill>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{t.updated_at}</TableCell>
              <TableCell className="space-x-2 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await emailApi.duplicateTemplate(t.id);
                      toast.success("Template duplicated");
                      void templates.reload();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Duplicate failed");
                    }
                  }}
                >
                  <Copy className="size-3.5" /> Duplicate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await emailApi.saveTemplate(t.id, { active: t.active ? 0 : 1 });
                      toast.success(t.active ? "Template deactivated" : "Template activated");
                      void templates.reload();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Update failed");
                    }
                  }}
                >
                  {t.active ? "Deactivate" : "Activate"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataCard>
  );
}
