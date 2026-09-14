import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pill } from "@/components/vanguard/status";
import type { DocumentsStatus } from "@/lib/vanguard/workspaceApi";

const DOCUMENTS_LABEL: Record<
  DocumentsStatus,
  { label: string; tone: "warning" | "info" | "success" }
> = {
  PENDING: { label: "Pending", tone: "warning" },
  SUBMITTED: { label: "Submitted", tone: "info" },
  VERIFIED: { label: "Verified", tone: "success" },
};

export function DocumentsStatusSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: DocumentsStatus;
  onChange: (value: DocumentsStatus) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DocumentsStatus)} disabled={disabled}>
      <SelectTrigger className="h-8 w-[130px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(DOCUMENTS_LABEL) as DocumentsStatus[]).map((status) => (
          <SelectItem key={status} value={status}>
            {DOCUMENTS_LABEL[status].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DocumentsStatusPill({ status }: { status: DocumentsStatus }) {
  const v = DOCUMENTS_LABEL[status];
  return <Pill tone={v.tone}>{v.label}</Pill>;
}
