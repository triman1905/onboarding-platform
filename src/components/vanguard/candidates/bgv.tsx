import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pill } from "@/components/vanguard/status";
import type { BgvStatus, OverallBgvStatus } from "@/lib/vanguard/workspaceApi";

// Color coding is deliberately just 3 colors, matching the Candidates table:
// green = Clear/Induction Ready, yellow (warning) = In Progress/Not Ready/Pending, red = Discrepant.
const BGV_LABEL: Record<BgvStatus, { label: string; tone: "warning" | "success" | "danger" }> = {
  PENDING: { label: "Pending", tone: "warning" },
  IN_PROGRESS: { label: "In Progress", tone: "warning" },
  CLEAR: { label: "Clear", tone: "success" },
  DISCREPANT: { label: "Discrepant", tone: "danger" },
};

const OVERALL_LABEL: Record<
  OverallBgvStatus,
  { label: string; tone: "danger" | "warning" | "success" }
> = {
  DISCREPANT: { label: "Discrepant", tone: "danger" },
  NOT_READY: { label: "Not Ready", tone: "warning" },
  IN_PROGRESS: { label: "In Progress", tone: "warning" },
  INDUCTION_READY: { label: "Induction Ready", tone: "success" },
};

export function BgvStatusSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: BgvStatus;
  onChange: (value: BgvStatus) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as BgvStatus)} disabled={disabled}>
      <SelectTrigger className="h-8 w-[130px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(BGV_LABEL) as BgvStatus[]).map((status) => (
          <SelectItem key={status} value={status}>
            {BGV_LABEL[status].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function BgvStatusPill({ status }: { status: BgvStatus }) {
  const v = BGV_LABEL[status];
  return <Pill tone={v.tone}>{v.label}</Pill>;
}

/** Overall BGV is always read-only — this pill is the only way it's ever rendered. */
export function OverallBgvPill({ status }: { status: OverallBgvStatus }) {
  const v = OVERALL_LABEL[status];
  return <Pill tone={v.tone}>{v.label}</Pill>;
}
