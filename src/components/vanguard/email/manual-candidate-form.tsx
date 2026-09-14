import { useState } from "react";
import { toast } from "sonner";
import { emailApi, type LocalBatch } from "@/lib/email/api";
import { DataCard, SectionTitle } from "@/components/vanguard/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const VERIFICATION_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "VERIFICATION_COMPLETE"];

interface FormState {
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  joiningDate: string;
  location: string;
  department: string;
  role: string;
  verificationLink: string;
  verificationStatus: string;
}

const EMPTY_FORM: FormState = {
  candidateId: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  joiningDate: "",
  location: "",
  department: "",
  role: "",
  verificationLink: "",
  verificationStatus: "NOT_STARTED",
};

function validate(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.candidateId.trim()) errors["candidateId"] = "Candidate ID is required.";
  if (!form.firstName.trim()) errors["firstName"] = "First name is required.";
  if (!form.lastName.trim()) errors["lastName"] = "Last name is required.";
  if (!form.email.trim()) errors["email"] = "Email is required.";
  else if (!EMAIL_RE.test(form.email.trim()))
    errors["email"] = "Please enter a valid email address.";
  if (!form.joiningDate.trim()) errors["joiningDate"] = "Joining date is required.";
  if (!form.location.trim()) errors["location"] = "Location is required.";
  return errors;
}

export function ManualCandidateForm({
  batches,
  batchId,
  onBatchChange,
  onBatchCreated,
  onCandidateAdded,
}: {
  batches: LocalBatch[];
  batchId: string;
  onBatchChange: (id: string) => void;
  onBatchCreated: (batch: LocalBatch) => void;
  onCandidateAdded: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [newBatchName, setNewBatchName] = useState("");
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const field = (key: keyof FormState) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
      setJustAdded(null);
    },
  });

  const submit = async () => {
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (!batchId) {
      toast.error("Select or create a batch first");
      return;
    }
    setBusy(true);
    try {
      await emailApi.createCandidate({
        batchId,
        candidateId: form.candidateId.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        joiningDate: form.joiningDate,
        location: form.location.trim(),
        department: form.department.trim() || undefined,
        role: form.role.trim() || undefined,
        verificationLink: form.verificationLink.trim() || undefined,
        verificationStatus: form.verificationStatus,
      });
      toast.success("Candidate added successfully.");
      setJustAdded(`${form.firstName.trim()} ${form.lastName.trim()}`);
      setForm(EMPTY_FORM);
      setErrors({});
      onCandidateAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add candidate");
    }
    setBusy(false);
  };

  const createBatch = async () => {
    if (!newBatchName.trim()) {
      toast.error("Enter a batch name");
      return;
    }
    setCreatingBatch(true);
    try {
      const batch = await emailApi.createBatch({ name: newBatchName.trim() });
      onBatchCreated(batch);
      onBatchChange(batch.id);
      setNewBatchName("");
      toast.success(`Batch "${batch.name}" created`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create batch");
    }
    setCreatingBatch(false);
  };

  return (
    <DataCard className="max-w-2xl space-y-4 p-5">
      <SectionTitle>Add candidate</SectionTitle>

      <div>
        <Label>Batch</Label>
        <div className="mt-1 flex gap-2">
          <select
            className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
            value={batchId}
            onChange={(e) => onBatchChange(e.target.value)}
          >
            <option value="">Select a batch…</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.candidate_count ?? 0})
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            placeholder="New batch name"
            value={newBatchName}
            onChange={(e) => setNewBatchName(e.target.value)}
            className="h-8 text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={creatingBatch}
            onClick={() => void createBatch()}
          >
            Create New Batch
          </Button>
        </div>
      </div>

      {justAdded ? (
        <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          ✓ {justAdded} added successfully. Add another candidate below, or switch to Upload File /
          view the Candidates list.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Candidate ID" error={errors["candidateId"]}>
          <Input {...field("candidateId")} placeholder="V001" />
        </FormField>
        <FormField label="First Name" error={errors["firstName"]}>
          <Input {...field("firstName")} placeholder="Rahul" />
        </FormField>
        <FormField label="Last Name" error={errors["lastName"]}>
          <Input {...field("lastName")} placeholder="Sharma" />
        </FormField>
        <FormField label="Email" error={errors["email"]}>
          <Input {...field("email")} placeholder="rahul@example.com" type="email" />
        </FormField>
        <FormField label="Phone (optional)">
          <Input {...field("phone")} placeholder="+91 90000 00000" />
        </FormField>
        <FormField label="Joining Date" error={errors["joiningDate"]}>
          <Input {...field("joiningDate")} type="date" />
        </FormField>
        <FormField label="Location" error={errors["location"]}>
          <Input {...field("location")} placeholder="Gurugram" />
        </FormField>
        <FormField label="Department (optional)">
          <Input {...field("department")} placeholder="Engineering" />
        </FormField>
        <FormField label="Role (optional)">
          <Input {...field("role")} placeholder="Software Engineer" />
        </FormField>
        <FormField label="Verification Link (optional)">
          <Input {...field("verificationLink")} placeholder="https://…" />
        </FormField>
        <FormField label="Verification Status">
          <select
            className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
            value={form.verificationStatus}
            onChange={(e) => setForm((f) => ({ ...f, verificationStatus: e.target.value }))}
          >
            {VERIFICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => void submit()}>
          Add Candidate
        </Button>
      </div>
    </DataCard>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
