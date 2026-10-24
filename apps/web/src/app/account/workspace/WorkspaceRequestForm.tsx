"use client";

import { ApiError, IDEMPOTENCY_KEY_HEADER, organizationRequestInputSchema, organizationRequestSchema, TEAM_SIZES, toFieldErrors } from "@holypearls/contracts";
import { Button, FormField, Notice, Select, TextArea, TextField } from "@holypearls/ui";
import { api, errorReason, newIdempotencyKey } from "@holypearls/web-kit/api";
import { type FormEvent, useState } from "react";
import styles from "../account.module.css";

type Row = { name: string; city: string };

/** The workspace request: company, its locations, roughly how many people and a note (owner decision 2026-10-08). */
export function WorkspaceRequestForm() {
  const [companyName, setCompanyName] = useState("");
  const [locations, setLocations] = useState<Row[]>([{ name: "", city: "" }]);
  const [teamSize, setTeamSize] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => newIdempotencyKey());

  const update = (index: number, field: keyof Row, value: string) => setLocations((rows) => rows.map((row, at) => (at === index ? { ...row, [field]: value } : row)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(undefined);
    const parsed = organizationRequestInputSchema.safeParse({ companyName, locations, teamSize, note: note.trim() ? note : null });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api("/v1/me/organization-request", { method: "POST", body: parsed.data, headers: { [IDEMPOTENCY_KEY_HEADER]: key }, response: organizationRequestSchema });
      window.location.reload();
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiError && error.body.fieldErrors) setErrors(error.body.fieldErrors);
      else if (errorReason(error) === "REQUEST_PENDING") window.location.reload();
      else if (errorReason(error) === "VERIFY_EMAIL_FIRST") setFailure("Verify your email first, then ask for a workspace.");
      else if (error instanceof ApiError && error.body.code === "RATE_LIMITED") setFailure("Too many tries. Wait a few minutes, then send it again.");
      else setFailure("We couldn't send your request. Your answers are still here; try again.");
    }
  };

  return (
    <section className={styles.card} aria-labelledby="request-form-title">
      <h2 id="request-form-title" className={styles.cardTitle}>
        Ask for a workspace
      </h2>
      <p className={styles.support}>Our team checks each request, usually within a working day. Once it&apos;s approved, you&apos;re the workspace&apos;s Owner.</p>
      {failure ? (
        <Notice tone="error" live>
          <p>{failure}</p>
        </Notice>
      ) : null}
      <form className={styles.form} noValidate onSubmit={submit}>
        <FormField id="request-company" label="Company name" error={errors.companyName}>
          <TextField autoComplete="organization" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
        </FormField>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Locations</legend>
          <p className={styles.note}>The branches or sites your team orders for. You can add more later.</p>
          {locations.map((row, index) => (
            <div key={index} className={styles.locationRow}>
              <FormField id={`request-location-${index}-name`} label={`Location ${index + 1} name`} error={errors[`locations.${index}.name`]}>
                <TextField value={row.name} onChange={(event) => update(index, "name", event.target.value)} />
              </FormField>
              <FormField id={`request-location-${index}-city`} label="City" error={errors[`locations.${index}.city`]}>
                <TextField autoComplete="address-level2" value={row.city} onChange={(event) => update(index, "city", event.target.value)} />
              </FormField>
              {locations.length > 1 ? (
                <Button type="button" variant="tertiary" onClick={() => setLocations((rows) => rows.filter((_, at) => at !== index))}>
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
          {errors.locations ? (
            <p className={styles.fieldError} role="alert">
              {errors.locations}
            </p>
          ) : null}
          {locations.length < 20 ? (
            <div>
              <Button type="button" variant="secondary" onClick={() => setLocations((rows) => [...rows, { name: "", city: "" }])}>
                Add another location
              </Button>
            </div>
          ) : null}
        </fieldset>
        <FormField id="request-team-size" label="Roughly how many people?" error={errors.teamSize}>
          <Select value={teamSize} placeholder="Choose" onValueChange={(next) => setTeamSize(next)} options={TEAM_SIZES.map((value) => ({ value, label: `${value} people` }))} />
        </FormField>
        <FormField id="request-note" label="Anything we should know?" optional error={errors.note}>
          <TextArea rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
        </FormField>
        <div className={styles.formActions}>
          <Button type="submit" loading={busy}>
            Send request
          </Button>
        </div>
      </form>
    </section>
  );
}
