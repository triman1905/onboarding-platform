import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, MessageSquare, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useVanguard } from "@/lib/vanguard/store";
import { fmtDate, fmtTime } from "@/lib/vanguard/mock-data";
import { DataCard, EmptyState, KpiCard, PageHeader, Pager } from "@/components/vanguard/primitives";
import { CommunicationBadge, Pill } from "@/components/vanguard/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { emailApi, useLocalApi } from "@/lib/email/api";
import { EmailHistoryTable } from "@/components/vanguard/email/email-history";
import { ScheduledReminders } from "@/components/vanguard/email/scheduled-reminders";
import type { Communication } from "@/lib/vanguard/types";

export const Route = createFileRoute("/communications")({
  head: () => ({
    meta: [
      { title: "Communications · ABC Automation" },
      { name: "description", content: "Delivery log of every email and WhatsApp message queued by the onboarding automation." },
      { property: "og:title", content: "Communications · ABC Automation" },
      { property: "og:description", content: "Audit every candidate communication, its template and delivery status." },
    ],
  }),
  component: Communications,
});

const PAGE_SIZE = 15;

function Communications() {
  const { communications, sendCommunication } = useVanguard();
  const liveHistory = useLocalApi(() => emailApi.history(), [], 15000);
  const liveReminders = useLocalApi(() => emailApi.reminders(), [], 15000);
  const reloadLive = () => {
    void liveHistory.reload();
    void liveReminders.reload();
  };
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<"ALL" | "EMAIL" | "WHATSAPP">("ALL");
  const [status, setStatus] = useState<"ALL" | Communication["status"]>("ALL");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<Communication | null>(null);

  const filtered = useMemo(
    () =>
      communications.filter((m) => {
        if (channel !== "ALL" && m.channel !== channel) return false;
        if (status !== "ALL" && m.status !== status) return false;
        const q = search.trim().toLowerCase();
        if (q && !`${m.candidateName} ${m.templateName} ${m.subject}`.toLowerCase().includes(q)) return false;
        return true;
      }),
    [communications, channel, status, search],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const delivered = communications.filter((m) => m.status === "DELIVERED").length;
  const failed = communications.filter((m) => m.status === "FAILED" || m.status === "BOUNCED").length;
  const rate = communications.length ? Math.round((delivered / communications.length) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Communications"
        description="Every message queued by the automation engine. Deliveries are simulated — no provider is connected."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total messages" value={communications.length.toLocaleString()} icon={Mail} />
        <KpiCard label="Delivered" value={delivered.toLocaleString()} tone="success" />
        <KpiCard label="Failed / bounced" value={failed.toLocaleString()} tone="danger" />
        <KpiCard label="Delivery rate" value={`${rate}%`} tone="info" />
      </div>

      <Tabs defaultValue="live">
        <TabsList className="mb-4">
          <TabsTrigger value="live">Communication history (local backend)</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled reminders</TabsTrigger>
          <TabsTrigger value="simulated">Simulated log</TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          <EmailHistoryTable rows={liveHistory.data ?? []} onChanged={reloadLive} />
        </TabsContent>

        <TabsContent value="scheduled">
          <ScheduledReminders rows={liveReminders.data ?? []} onChanged={reloadLive} />
        </TabsContent>

        <TabsContent value="simulated">
      <DataCard className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search candidate, template or subject…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-9 max-w-xs"
          />
          <select
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            value={channel}
            onChange={(e) => setChannel(e.target.value as typeof channel)}
          >
            <option value="ALL">All channels</option>
            <option value="EMAIL">Email</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
          <select
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            {["ALL", "QUEUED", "SENT", "DELIVERED", "FAILED", "BOUNCED"].map((s) => (
              <option key={s} value={s}>{s === "ALL" ? "All statuses" : s.toLowerCase()}</option>
            ))}
          </select>
          <span className="tabular ml-auto text-xs text-muted-foreground">{filtered.length.toLocaleString()} messages</span>
        </div>
      </DataCard>

      <DataCard>
        {rows.length === 0 ? (
          <EmptyState title="No communications match these filters" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id} className="cursor-pointer" onClick={() => setPreview(m)}>
                    <TableCell className="font-medium">{m.candidateName}</TableCell>
                    <TableCell>
                      <Pill tone={m.channel === "EMAIL" ? "info" : "success"}>
                        {m.channel === "EMAIL" ? <Mail className="size-3" /> : <MessageSquare className="size-3" />}
                        {m.channel === "EMAIL" ? "Email" : "WhatsApp"}
                      </Pill>
                    </TableCell>
                    <TableCell className="text-xs">{m.templateName}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">{m.subject}</TableCell>
                    <TableCell><CommunicationBadge status={m.status} /></TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {fmtDate(m.sentAt)} · {fmtTime(m.sentAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.status === "FAILED" || m.status === "BOUNCED" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            sendCommunication([m.candidateId], m.channel, "tpl-reminder");
                            toast.success("Retry queued (simulated)");
                          }}
                        >
                          <RefreshCw className="size-3.5" /> Retry
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setPreview(m); }}>
                          View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={current} pageCount={pageCount} total={filtered.length} onPage={setPage} />
          </>
        )}
      </DataCard>

        </TabsContent>
      </Tabs>

      <Sheet open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          {preview ? (
            <>
              <SheetHeader>
                <SheetTitle>{preview.subject}</SheetTitle>
                <SheetDescription>
                  {preview.channel === "EMAIL" ? "Email" : "WhatsApp"} to {preview.candidateName} ·{" "}
                  {fmtDate(preview.sentAt)} {fmtTime(preview.sentAt)}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <div className="flex flex-wrap gap-2">
                  <CommunicationBadge status={preview.status} />
                  <Pill>{preview.templateName}</Pill>
                </div>
                {preview.failureReason ? (
                  <p className="rounded-lg bg-danger-soft p-3 text-xs text-danger">{preview.failureReason}</p>
                ) : null}
                <pre className="rounded-lg border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                  {preview.body}
                </pre>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
