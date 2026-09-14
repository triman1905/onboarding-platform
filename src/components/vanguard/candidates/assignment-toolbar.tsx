import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AutoDistributeDialog } from "./auto-distribute-dialog";
import { CsvAssignDialog } from "./csv-assign-dialog";
import { workspaceApi, type Team } from "@/lib/vanguard/workspaceApi";

export function AssignmentToolbar({
  team,
  selectedIds,
  unassignedCount,
  onAssigned,
  onClearSelection,
}: {
  team: Team | null;
  selectedIds: string[];
  unassignedCount: number;
  onAssigned: () => void;
  onClearSelection: () => void;
}) {
  const [teamMemberId, setTeamMemberId] = useState("");
  const [busy, setBusy] = useState(false);
  const activeMembers = team?.members.filter((m) => m.isActive) ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent/30 p-3">
      {selectedIds.length > 0 ? (
        <>
          <span className="text-xs font-medium text-foreground">{selectedIds.length} selected</span>
          <Select value={teamMemberId} onValueChange={setTeamMemberId}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder="Assign to…" />
            </SelectTrigger>
            <SelectContent>
              {activeMembers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!teamMemberId || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await workspaceApi.assignBulk(selectedIds, teamMemberId);
                toast.success(`Assigned ${res.assigned} candidate(s)`);
                setTeamMemberId("");
                onClearSelection();
                onAssigned();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Assignment failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Assigning…" : "Assign Candidates"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearSelection} disabled={busy}>
            Clear selection
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
        </>
      ) : null}
      <AutoDistributeDialog
        unassignedCount={unassignedCount}
        memberCount={activeMembers.length}
        onDone={onAssigned}
      />
      <CsvAssignDialog onDone={onAssigned} />
    </div>
  );
}
