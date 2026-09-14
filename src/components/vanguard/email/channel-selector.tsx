import { Mail, MessageSquare, Smartphone } from "lucide-react";
import type { ChannelName } from "@/lib/email/api";
import { Checkbox } from "@/components/ui/checkbox";
import { Pill } from "@/components/vanguard/status";

const CHANNELS: Array<{ key: ChannelName; label: string; icon: typeof Mail }> = [
  { key: "EMAIL", label: "Email", icon: Mail },
  { key: "WHATSAPP", label: "WhatsApp", icon: MessageSquare },
  { key: "SMS", label: "SMS", icon: Smartphone },
];

/**
 * Shared "Communication Channels" checkbox group (Welcome tab, reminder
 * scheduling, Review & Send). A channel can be individually disabled — e.g.
 * WhatsApp/SMS require the local backend, or Twilio isn't configured yet.
 */
export function ChannelSelector({
  selected,
  onChange,
  disabledChannels = {},
}: {
  selected: Set<ChannelName>;
  onChange: (next: Set<ChannelName>) => void;
  /** Channel -> reason it can't be selected right now (omit/undefined = enabled). */
  disabledChannels?: Partial<Record<ChannelName, string>>;
}) {
  const toggle = (channel: ChannelName, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(channel);
    else next.delete(channel);
    onChange(next);
  };

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">Communication Channels</p>
      <div className="flex flex-wrap gap-4">
        {CHANNELS.map(({ key, label, icon: Icon }) => {
          const disabledReason = disabledChannels[key];
          return (
            <label
              key={key}
              className={`flex items-center gap-2 text-sm ${disabledReason ? "opacity-50" : "cursor-pointer"}`}
              title={disabledReason}
            >
              <Checkbox
                checked={selected.has(key)}
                disabled={Boolean(disabledReason)}
                onCheckedChange={(v) => toggle(key, v === true)}
                aria-label={label}
              />
              <Icon className="size-3.5" />
              {label}
              {disabledReason ? (
                <Pill tone="neutral" className="text-[10px]">
                  {disabledReason}
                </Pill>
              ) : null}
            </label>
          );
        })}
      </div>
    </div>
  );
}
