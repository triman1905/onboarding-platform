import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { workspaceApi } from "@/lib/vanguard/workspaceApi";

export function AutoDistributeDialog({
  unassignedCount,
  memberCount,
  onDone,
}: {
  unassignedCount: number;
  memberCount: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!unassignedCount || !memberCount}>
          Auto-distribute
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Auto-distribute candidates</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {unassignedCount} unassigned candidate{unassignedCount === 1 ? "" : "s"} will be
          distributed evenly among {memberCount} active team member{memberCount === 1 ? "" : "s"}.
          Already-assigned candidates are left untouched.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await workspaceApi.autoDistribute();
                toast.success(`Distributed ${res.distributed} candidate(s)`);
                setOpen(false);
                onDone();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Auto-distribution failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Distributing…" : "Confirm Assignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
