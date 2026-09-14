import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { emailApi, type EmailCommunication } from "@/lib/email/api";
import { DataCard, EmptyState } from "@/components/vanguard/primitives";
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

const TONE: Record<
  EmailCommunication["status"],
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  SENT: "success",
  DELIVERED: "success",
  READ: "success",
  QUEUED: "info",
  SENDING: "warning",
  FAILED: "danger",
  SKIPPED: "neutral",
};

const CHANNEL_TONE: Record<EmailCommunication["channel"], "info" | "success" | "warning"> = {
  EMAIL: "info",
  WHATSAPP: "success",
  SMS: "warning",
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

/** Delivery log for real emails sent by the local backend through Gmail SMTP. */
export function EmailHistoryTable({
  rows,
  onChanged,
}: {
  rows: EmailCommunication[];
  onChanged: () => void;
}) {
  const [retryingAll, setRetryingAll] = useState(false);
  const failedRows = rows.filter((r) => r.status === "FAILED");

  if (rows.length === 0) {
    return (
      <DataCard>
        <EmptyState title="No communications sent yet from the local backend" />
      </DataCard>
    );
  }
  return (
    <DataCard>
      {failedRows.length ? (
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">{failedRows.length} failed</span>
          <Button
            variant="outline"
            size="sm"
            disabled={retryingAll}
            onClick={async () => {
              setRetryingAll(true);
              let ok = 0;
              for (const row of failedRows) {
                try {
                  const res = await emailApi.retry(row.id);
                  if (res.ok) ok += 1;
                } catch {
                  // individual failures don't stop the batch retry
                }
              }
              toast.success(`Retried ${failedRows.length} — ${ok} succeeded`);
              setRetryingAll(false);
              onChanged();
            }}
          >
            <RefreshCw className="size-3.5" /> Retry Failed ({failedRows.length})
          </Button>
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Candidate</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Recipient</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Execution Mode</TableHead>
            <TableHead>Sent at</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">
                {row.first_name} {row.last_name}
              </TableCell>
              <TableCell>
                <Pill tone={CHANNEL_TONE[row.channel] ?? "info"}>{row.channel}</Pill>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {row.recipient || "—"}
              </TableCell>
              <TableCell className="text-xs">{row.template_name ?? "—"}</TableCell>
              <TableCell className="text-xs">
                <Pill>{row.type}</Pill>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{row.provider ?? "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {row.execution_mode ? row.execution_mode.replaceAll("_", " ") : "—"}
              </TableCell>
              <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                {when(row.sent_at ?? row.created_at)}
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <Pill tone={TONE[row.status]}>{row.status}</Pill>
                  {row.status === "FAILED" ? (
                    <p className="max-w-[240px] text-[11px] text-danger">
                      {row.error_message ?? row.failure_reason} · attempt {row.attempts}
                    </p>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-right">
                {row.status === "FAILED" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await emailApi.retry(row.id);
                        toast.success("Retry attempted");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Retry failed");
                      }
                      onChanged();
                    }}
                  >
                    <RefreshCw className="size-3.5" /> Retry
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataCard>
  );
}
