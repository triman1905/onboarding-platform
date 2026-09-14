import { useState } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function NextActionEditor({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (value: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  const preview = (value ?? "").trim();

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(value ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="max-w-[190px] truncate text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {preview || <span className="italic text-muted-foreground/60">Add next action…</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2" align="start">
        <div className="text-xs font-semibold text-foreground">Next Action</div>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder="e.g. Follow up with candidate for updated passport copy."
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(draft.trim());
                toast.success("Next action saved");
                setOpen(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not save next action");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
