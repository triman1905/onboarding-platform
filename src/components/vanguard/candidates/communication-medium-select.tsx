import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CommunicationMedium } from "@/lib/vanguard/workspaceApi";

const OPTIONS: { value: CommunicationMedium; label: string }[] = [
  { value: "EMAIL", label: "Email" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "EMAIL_WHATSAPP", label: "Email + WhatsApp" },
  { value: "EMAIL_SMS", label: "Email + SMS" },
  { value: "WHATSAPP_SMS", label: "WhatsApp + SMS" },
  { value: "ALL", label: "All channels" },
  { value: "NONE", label: "None" },
];

export function CommunicationMediumSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: CommunicationMedium;
  onChange: (value: CommunicationMedium) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as CommunicationMedium)}
      disabled={disabled}
    >
      <SelectTrigger className="h-8 w-[160px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
