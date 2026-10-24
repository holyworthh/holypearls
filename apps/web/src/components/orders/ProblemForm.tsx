"use client";

import { ApiError, customerProblemSchema, newProblemSchema, PROBLEM_TYPE_LABEL, problemTypeSchema } from "@holypearls/contracts";
import { Button, ButtonLink, ErrorSummary, FormField, Notice, Select, StatusChip, TextArea, TextField } from "@holypearls/ui";
import { FileUpload } from "../FileUpload";
import { useState } from "react";
import { z } from "zod";
import { api, newIdempotencyKey } from "@holypearls/web-kit/api";
import s from "./forms.module.css";

type Item = { position: number; label: string; quantity: number };
type Errors = Partial<Record<"type" | "quantity" | "description" | "photos", string>>;

/**
 * Pen 129 form: which item, what's wrong (five types), how many, photos and
 * what happened. Sent: the reference and NEW. Validation lists every problem
 * at the top and beside each field.
 */
export function ProblemForm({ orderId, items }: { orderId: string; items: Item[] }) {
  const [position, setPosition] = useState(items[0]?.position ?? 1);
  const [type, setType] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<{ id: string; name: string }[]>([]);
  const [uploadKey, setUploadKey] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState<z.infer<typeof customerProblemSchema> | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => newIdempotencyKey());

  const send = async () => {
    const parsed = newProblemSchema.safeParse({ itemPosition: position, type: type || undefined, quantity: quantity ? Number(quantity) : 0, description, photoFileIds: photos.map((photo) => photo.id) });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof Errors;
        next[field] ??= field === "type" ? "Choose what's wrong" : issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setFailure(null);
    setBusy(true);
    try {
      setSent(await api(`/v1/orders/${orderId}/problems`, { method: "POST", body: parsed.data, headers: { "idempotency-key": key }, response: customerProblemSchema }));
    } catch (problem) {
      if (problem instanceof ApiError && problem.body.fieldErrors) setErrors(problem.body.fieldErrors as Errors);
      else setFailure(problem instanceof ApiError ? problem.body.message : "We couldn't send your report. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <>
        <Notice tone="success" title={`Report ${sent.number}`} live>
          <StatusChip tone="info">NEW</StatusChip> Thanks. We&apos;ll look at this within 1 working day and email you.
        </Notice>
        <ButtonLink href={`/orders/${orderId}`} variant="secondary">
          Back to order
        </ButtonLink>
      </>
    );
  }

  const max = items.find((item) => item.position === position)?.quantity ?? 1;
  const summary = (Object.entries(errors) as [keyof Errors, string][]).map(([field, message]) => ({ fieldId: `problem-${field}`, message }));
  return (
    <div className={s.form}>
      {summary.length ? <ErrorSummary errors={summary} title={`${summary.length} ${summary.length === 1 ? "thing" : "things"} to fix`} /> : null}
      {failure ? (
        <Notice tone="error" live>
          {failure}
        </Notice>
      ) : null}
      {items.length > 1 ? (
        <FormField id="problem-item" label="Which item?">
          <Select value={String(position)} options={items.map((item) => ({ value: String(item.position), label: item.label }))} onValueChange={(next) => setPosition(Number(next))} />
        </FormField>
      ) : (
        <p className={s.lead}>{items[0]?.label}</p>
      )}
      <fieldset className={s.choices} id="problem-type" aria-describedby={errors.type ? "problem-type-error" : undefined}>
        <legend>What&apos;s wrong?</legend>
        {problemTypeSchema.options.map((value) => (
          <label key={value} className={s.choice}>
            <input type="radio" name="problem-type" value={value} checked={type === value} onChange={() => setType(value)} />
            {PROBLEM_TYPE_LABEL[value]}
          </label>
        ))}
        {errors.type ? (
          <p id="problem-type-error" className={s.hint} role="alert">
            {errors.type}
          </p>
        ) : null}
      </fieldset>
      <FormField id="problem-quantity" label="How many are affected?" hint={`Up to ${max.toLocaleString("en-NG")}`} error={errors.quantity}>
        <TextField inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/\D/g, "").slice(0, 7))} />
      </FormField>
      <div className={s.form} id="problem-photos">
        <FileUpload key={uploadKey} purpose="PROBLEM_PHOTO" label="Add photos" hint="JPEG or PNG, up to 15 MB each" accept="image/jpeg,image/png" onChange={(file) => {
          if (file) {
            setPhotos((current) => [...current, { id: file.id, name: file.name }]);
            setUploadKey((value) => value + 1);
          }
        }} />
        {photos.length ? (
          <ul className={s.photos} aria-label="Photos added">
            {photos.map((photo) => (
              <li key={photo.id}>
                {photo.name}{" "}
                <button type="button" className={s.link} onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {errors.photos ? <p className={s.hint}>{errors.photos}</p> : null}
      </div>
      <FormField id="problem-description" label="Tell us what happened" error={errors.description}>
        <TextArea rows={4} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} />
      </FormField>
      <div>
        <Button type="button" loading={busy} onClick={() => void send()}>
          Send report
        </Button>
      </div>
    </div>
  );
}
