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
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/vanguard/status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { workspaceApi, type CsvAssignValidation } from "@/lib/vanguard/workspaceApi";

export function CsvAssignDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<CsvAssignValidation | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setValidation(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Assign via CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign candidates via CSV</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Columns: <code>candidate_id</code>, <code>assigned_to</code> (team member name or
          username).
        </p>
        <Input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setValidation(null);
          }}
        />

        {validation ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Pill>Total {validation.total}</Pill>
              <Pill tone="success">Valid {validation.validCount}</Pill>
              <Pill tone="danger">Invalid {validation.invalidCount}</Pill>
            </div>
            {validation.invalid.length ? (
              <div className="max-h-56 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Assigned to</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validation.invalid.map((row) => (
                      <TableRow key={row.row}>
                        <TableCell className="text-xs">{row.row}</TableCell>
                        <TableCell className="text-xs">{row.candidate_id || "—"}</TableCell>
                        <TableCell className="text-xs">{row.assigned_to || "—"}</TableCell>
                        <TableCell className="text-xs text-danger">
                          {row.reasons.join("; ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          {!validation ? (
            <Button
              disabled={!file || busy}
              onClick={async () => {
                if (!file) return;
                setBusy(true);
                try {
                  const { parseUpload } = await import("../../../../shared/email-core/csv.js");
                  const buffer = await file.arrayBuffer();
                  const rows = parseUpload(buffer, file.name) as {
                    candidate_id: string;
                    assigned_to: string;
                  }[];
                  setValidation(await workspaceApi.validateCsvAssignment(rows));
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not read file");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Validating…" : "Validate"}
            </Button>
          ) : (
            <Button
              disabled={busy || !validation.validCount}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await workspaceApi.applyCsvAssignment(validation.valid);
                  toast.success(`Assigned ${res.assigned} candidate(s)`);
                  setOpen(false);
                  reset();
                  onDone();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "CSV assignment failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Assigning…" : `Confirm & Assign ${validation.validCount}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
