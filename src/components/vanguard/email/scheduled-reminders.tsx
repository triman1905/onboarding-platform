import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { emailApi, type ReminderSchedule } from "@/lib/email/api";
import { DataCard, EmptyState, KeyValue } from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";
import { Button } from "@/components/ui/button";
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
import { ConfirmDialog } from "@/components/vanguard/confirm-dialog";

const TONE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  SCHEDULED: "info",
  READY_TO_SEND: "warning",
  PROCESSING: "warning",
  COMPLETED: "success",
  CANCELLED: "neutral",
  FAILED: "danger",
};

const EXECUTION_LABEL: Record<string, string> = {
  AUTO_SEND: "Auto Send",
  NOTIFY_RECRUITER: "Notify Recruiter",
};

function when(value: string | null) {
  if (!value) return "—";
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** Scheduled reminder campaigns owned by the local node-cron scheduler. */
export function ScheduledReminders({
  rows,
  onChanged,
  onReview,
}: {
  rows: ReminderSchedule[];
  onChanged: () => void;
  /** Defaults to navigating to the Email Automation → Reminders review screen when omitted. */
  onReview?: (id: string) => void;
}) {
  const [detail, setDetail] = useState<ReminderSchedule | null>(null);
  const navigate = useNavigate();
  const review =
    onReview ??
    ((id: string) =>
      void navigate({ to: "/email-automation", search: { tab: "reminders", reminder: id } }));

  const open = async (id: string) => {
    try {
      setDetail(await emailApi.reminder(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load reminder");
    }
  };

  if (rows.length === 0) {
    return (
      <DataCard>
        <EmptyState title="No reminders scheduled yet" />
      </DataCard>
    );
  }

  return (
    <>
      <DataCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reminder</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Scheduled Date</TableHead>
              <TableHead>Channels</TableHead>
              <TableHead>Execution Mode</TableHead>
              <TableHead>Eligible Candidates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-xs">{r.batch_name ?? r.batch_id}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{when(r.scheduled_at)}</TableCell>
                <TableCell className="text-xs">
                  <div className="flex flex-wrap gap-1">
                    {(r.channels ?? ["EMAIL"]).map((c) => (
                      <Pill key={c}>{c}</Pill>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  {EXECUTION_LABEL[r.execution_mode] ?? r.execution_mode}
                </TableCell>
                <TableCell className="tabular text-xs">{r.eligibleCount ?? "—"}</TableCell>
                <TableCell>
                  <Pill tone={TONE[r.status] ?? "neutral"}>{r.status.replaceAll("_", " ")}</Pill>
                </TableCell>
                <TableCell className="space-x-2 text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => void open(r.id)}>
                    {r.status === "COMPLETED" ? "View Results" : "View"}
                  </Button>
                  {r.status === "READY_TO_SEND" ? (
                    <Button variant="default" size="sm" onClick={() => review(r.id)}>
                      Review &amp; Send
                    </Button>
                  ) : null}
                  {r.status === "SCHEDULED" ? (
                    <>
                      <ConfirmDialog
                        trigger={
                          <Button variant="outline" size="sm">
                            Run Now — Test
                          </Button>
                        }
                        title="Run this reminder now?"
                        description={
                          <p>
                            Depending on the execution mode (
                            {EXECUTION_LABEL[r.execution_mode] ?? r.execution_mode}), this may send
                            real emails.
                          </p>
                        }
                        confirmLabel="Run Test"
                        onConfirm={async () => {
                          try {
                            const res = await emailApi.runReminder(r.id);
                            if (res.status === "READY_TO_SEND") {
                              toast.success("Reminder test completed — ready for recruiter review");
                            } else {
                              toast.success(
                                `Reminder test completed. Sent ${res.sent} · Skipped ${res.skipped} · Failed ${res.failed}`,
                              );
                            }
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Run failed");
                          }
                          onChanged();
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            await emailApi.cancelReminder(r.id);
                            toast.success("Reminder cancelled");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Cancel failed");
                          }
                          onChanged();
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : null}
                  {r.status === "READY_TO_SEND" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await emailApi.cancelReminder(r.id);
                          toast.success("Reminder cancelled");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Cancel failed");
                        }
                        onChanged();
                      }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataCard>

      <Sheet open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          {detail ? (
            <>
              <SheetHeader>
                <SheetTitle>{detail.name}</SheetTitle>
                <SheetDescription>
                  {when(detail.scheduled_at)} · {detail.timezone}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <DataCard className="p-4">
                  <KeyValue label="Batch" value={detail.batch_name ?? detail.batch_id} />
                  <KeyValue label="Template" value={detail.template_name ?? detail.template_id} />
                  <KeyValue
                    label="Target"
                    value={`Verification status = ${detail.target_condition}`}
                  />
                  <KeyValue
                    label="Execution mode"
                    value={EXECUTION_LABEL[detail.execution_mode] ?? detail.execution_mode}
                  />
                  <KeyValue label="Channels" value={(detail.channels ?? ["EMAIL"]).join(", ")} />
                  <KeyValue
                    label="Eligible candidates"
                    value={String(detail.eligibleCount ?? "—")}
                  />
                  <KeyValue label="Already complete" value={String(detail.completeCount ?? "—")} />
                  <KeyValue
                    label="Status"
                    value={
                      <Pill tone={TONE[detail.status] ?? "neutral"}>
                        {detail.status.replaceAll("_", " ")}
                      </Pill>
                    }
                  />
                  <KeyValue
                    label="Execution"
                    value={`${detail.attempted} attempted · ${detail.sent} sent · ${detail.failed} failed · ${detail.skipped} skipped`}
                  />
                </DataCard>
                {detail.communications?.length ? (
                  <div className="space-y-1">
                    {detail.communications.map((c) => (
                      <p key={c.id} className="text-xs text-muted-foreground">
                        {when(c.sent_at ?? c.created_at)} · [{c.channel}] {c.recipient} → {c.status}
                        {c.failure_reason ? ` (${c.failure_reason})` : ""}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
