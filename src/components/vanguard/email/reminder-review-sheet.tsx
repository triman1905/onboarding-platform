import { useEffect, useState } from "react";
import { toast } from "sonner";
import { emailApi, type ChannelName, type ReminderReview } from "@/lib/email/api";
import { DataCard, KeyValue } from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChannelSelector } from "@/components/vanguard/email/channel-selector";
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

const REMINDER_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> =
  {
    READY: "success",
    ALREADY_SENT: "info",
    SKIPPED: "neutral",
    NO_PHONE: "danger",
    NOT_SELECTED: "neutral",
  };

const ALL_CHANNELS: ChannelName[] = ["EMAIL", "WHATSAPP", "SMS"];

function when(value: string | null | undefined) {
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

/**
 * Review & Send screen for a Notify Recruiter reminder that has become due.
 * The recruiter picks exactly who gets the email; selecting an
 * ALREADY_SENT row here IS the "send again" confirmation.
 */
export function ReminderReviewSheet({
  reminderId,
  onClose,
  onSent,
}: {
  reminderId: string | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [review, setReview] = useState<ReminderReview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendChannels, setSendChannels] = useState<Set<ChannelName>>(new Set(["EMAIL"]));
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!reminderId) {
      setReview(null);
      setSelected(new Set());
      return;
    }
    let active = true;
    setLoading(true);
    emailApi
      .reminderReview(reminderId)
      .then((data) => {
        if (!active) return;
        setReview(data);
        setSendChannels(new Set(data.reminder.channels ?? ["EMAIL"]));
        setSelected(
          new Set(
            data.candidates
              .filter((c) => Object.values(c.channels).some((s) => s === "READY"))
              .map((c) => c.id),
          ),
        );
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Could not load reminder details");
        onClose();
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminderId]);

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const send = async () => {
    if (!review) return;
    setSending(true);
    try {
      const res = await emailApi.sendReviewedReminder(
        review.reminder.id,
        [...selected],
        [...sendChannels],
      );
      toast.success(`${res.sent} sent · ${res.skipped} skipped · ${res.failed} failed`);
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    }
    setSending(false);
  };

  return (
    <Sheet open={reminderId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{review?.reminder.name ?? "Review reminder"}</SheetTitle>
          <SheetDescription>
            {review
              ? `${when(review.reminder.scheduled_at)} · ${review.reminder.timezone}`
              : "Loading…"}
          </SheetDescription>
        </SheetHeader>

        {loading || !review ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Loading eligible candidates…
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto px-4 pb-6">
            <DataCard className="p-4">
              <KeyValue
                label="Batch"
                value={review.reminder.batch_name ?? review.reminder.batch_id}
              />
              <KeyValue label="Scheduled" value={when(review.reminder.scheduled_at)} />
              <KeyValue
                label="Eligible candidates"
                value={String(review.reminder.eligibleCount ?? "—")}
              />
            </DataCard>

            <DataCard className="p-4">
              <ChannelSelector
                selected={sendChannels}
                onChange={setSendChannels}
                disabledChannels={Object.fromEntries(
                  (["EMAIL", "WHATSAPP", "SMS"] as const)
                    .filter((c) => !review.reminder.channels?.includes(c))
                    .map((c) => [c, "not configured for this reminder"]),
                )}
              />
            </DataCard>

            <DataCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Candidate</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Verification Status</TableHead>
                    {ALL_CHANNELS.map((channel) => (
                      <TableHead key={channel}>{channel}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {review.candidates.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(c.id)}
                          onCheckedChange={(v) => toggle(c.id, v === true)}
                          aria-label={`Select ${c.firstName} ${c.lastName}`}
                        />
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {c.firstName} {c.lastName}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.email}</TableCell>
                      <TableCell className="text-xs">{c.verificationStatus}</TableCell>
                      {ALL_CHANNELS.map((channel) => {
                        const value = c.channels[channel] ?? "NOT_SELECTED";
                        return (
                          <TableCell key={channel}>
                            <Pill tone={REMINDER_STATUS_TONE[value] ?? "neutral"}>
                              {value.replaceAll("_", " ")}
                            </Pill>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataCard>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={sending}>
                Cancel
              </Button>
              <ConfirmDialog
                trigger={
                  <Button disabled={selected.size === 0 || sendChannels.size === 0 || sending}>
                    Send Selected Reminders ({selected.size})
                  </Button>
                }
                title="Send reminder messages"
                description={
                  <p>
                    You are about to send a reminder via{" "}
                    {[...sendChannels].join(", ") || "no channels"} to {selected.size} candidate(s).
                  </p>
                }
                confirmLabel="Confirm &amp; Send"
                onConfirm={() => void send()}
              />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
