import { cn } from "@/lib/utils";
import type {
  BgvStatus,
  CommunicationStatus,
  DocumentStatus,
  IssueStatus,
  Priority,
  VerificationStatus,
} from "@/lib/vanguard/types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClass: Record<Tone, string> = {
  neutral: "bg-neutral-soft text-muted-foreground ring-border",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/20",
  danger: "bg-danger-soft text-danger ring-danger/20",
  info: "bg-info-soft text-info ring-info/20",
};

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ring-inset",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const VERIFICATION_LABEL: Record<VerificationStatus, { label: string; tone: Tone }> = {
  IMPORTED: { label: "Imported", tone: "neutral" },
  INVITATION_PENDING: { label: "Invitation Pending", tone: "neutral" },
  INVITATION_SENT: { label: "Invitation Sent", tone: "info" },
  NOT_STARTED: { label: "Not Started", tone: "warning" },
  IN_PROGRESS: { label: "In Progress", tone: "info" },
  SUBMITTED: { label: "Submitted", tone: "info" },
  DOCUMENTS_PENDING: { label: "Documents Pending", tone: "warning" },
  VERIFICATION_COMPLETE: { label: "Verification Complete", tone: "success" },
  DFMS_SUBMITTED: { label: "DFMS Submitted", tone: "success" },
  BGV_IN_PROGRESS: { label: "BGV In Progress", tone: "success" },
  BGV_COMPLETE: { label: "BGV Complete", tone: "success" },
  NEEDS_ATTENTION: { label: "Needs Attention", tone: "danger" },
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const v = VERIFICATION_LABEL[status];
  return <Pill tone={v.tone}>{v.label}</Pill>;
}

export function verificationLabel(status: VerificationStatus) {
  return VERIFICATION_LABEL[status].label;
}

export function DocumentBadge({ status }: { status: DocumentStatus }) {
  const map: Record<DocumentStatus, [string, Tone]> = {
    NOT_STARTED: ["Not started", "neutral"],
    PARTIAL: ["Partial", "warning"],
    PENDING: ["Pending", "warning"],
    COMPLETE: ["Complete", "success"],
  };
  const [label, tone] = map[status];
  return <Pill tone={tone}>{label}</Pill>;
}

export function CommunicationBadge({ status }: { status: CommunicationStatus }) {
  const map: Record<CommunicationStatus, [string, Tone]> = {
    QUEUED: ["Queued", "neutral"],
    SENT: ["Sent", "info"],
    DELIVERED: ["Delivered", "success"],
    FAILED: ["Failed", "danger"],
    BOUNCED: ["Bounced", "danger"],
  };
  const [label, tone] = map[status];
  return <Pill tone={tone}>{label}</Pill>;
}

export function BgvBadge({ status }: { status: BgvStatus }) {
  const map: Record<BgvStatus, [string, Tone]> = {
    NOT_STARTED: ["Not started", "neutral"],
    DFMS_SUBMITTED: ["DFMS submitted", "info"],
    IN_PROGRESS: ["In progress", "info"],
    COMPLETE: ["Complete", "success"],
    ERROR: ["Error", "danger"],
  };
  const [label, tone] = map[status];
  return <Pill tone={tone}>{label}</Pill>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const map: Record<Priority, Tone> = { CRITICAL: "danger", HIGH: "danger", MEDIUM: "warning", LOW: "neutral" };
  const label = priority.charAt(0) + priority.slice(1).toLowerCase();
  return <Pill tone={map[priority]}>{label}</Pill>;
}

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  const map: Record<IssueStatus, [string, Tone]> = {
    OPEN: ["Open", "warning"],
    IN_PROGRESS: ["In progress", "info"],
    WAITING_FOR_CANDIDATE: ["Waiting · candidate", "neutral"],
    WAITING_FOR_RECRUITER: ["Waiting · recruiter", "neutral"],
    RESOLVED: ["Resolved", "success"],
    ESCALATED: ["Escalated", "danger"],
  };
  const [label, tone] = map[status];
  return <Pill tone={tone}>{label}</Pill>;
}

export function DaysBadge({ days }: { days: number }) {
  return (
    <span
      className={cn(
        "tabular text-xs font-semibold",
        days >= 10 ? "text-danger" : days >= 6 ? "text-warning" : "text-muted-foreground",
      )}
    >
      {days} {days === 1 ? "day" : "days"}
    </span>
  );
}
