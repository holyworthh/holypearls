"use client";

import { ApiError, type InstallationArea, type InstallationSetup, installationSetupSchema, NIGERIA_STATES } from "@holypearls/contracts";
import { Button, Checkbox, FormField, Notice, Select, StatusChip, TextField } from "@holypearls/ui";
import { api } from "@holypearls/web-kit/api";
import { useState } from "react";
import styles from "../admin-list.module.css";
import css from "../form-layout.module.css";
import { money, toKobo, toNaira } from "../format";

type Pricing = InstallationArea["pricing"];
type Form = { id: string | null; name: string; states: string[]; productIds: string[]; pricing: Pricing; rate: string; travel: string; version: number };
const BLANK: Form = { id: null, name: "", states: [], productIds: [], pricing: "FIXED", rate: "", travel: "", version: 0 };
const PRICING_LABEL: Record<Pricing, string> = { FIXED: "Fixed per piece", FIXED_PLUS_TRAVEL: "Fixed + travel", QUOTE: "Quote required" };

const failure = (error: unknown) =>
  error instanceof ApiError ? (error.body.code === "VERSION_CONFLICT" ? "Someone else changed this. Reload to see it." : (Object.values(error.body.fieldErrors ?? {})[0] ?? error.body.message)) : "That didn't save. Try again.";

/**
 * Installation areas, capabilities and rules (Pen 119; OPS-FR-102). An
 * installation in a state no area covers, or of a product the area can't
 * install, is quoted ("Elsewhere · Quote required").
 */
export function InstallationPanel({ initial }: { initial: InstallationSetup }) {
  const [setup, setSetup] = useState(initial);
  const [form, setForm] = useState<Form>(BLANK);
  const [survey, setSurvey] = useState({ on: initial.rules.surveyAboveSqM !== null, value: String(initial.rules.surveyAboveSqM ?? 6) });
  const [notice, setNotice] = useState({ on: initial.rules.noticeWorkingDays !== null, value: String(initial.rules.noticeWorkingDays ?? 5) });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const call = async (label: string, run: () => Promise<InstallationSetup>, done: string) => {
    setBusy(label);
    setMessage(null);
    try {
      setSetup(await run());
      setMessage({ tone: "success", text: done });
      return true;
    } catch (error) {
      setMessage({ tone: "error", text: failure(error) });
      return false;
    } finally {
      setBusy(null);
    }
  };
  const edit = (area: InstallationArea | null) => {
    setMessage(null);
    setForm(area ? { id: area.id, name: area.name, states: area.states, productIds: area.products.map((product) => product.id), pricing: area.pricing, rate: area.rateMinor ? toNaira(area.rateMinor) : "", travel: area.travelMinor ? toNaira(area.travelMinor) : "", version: area.version } : BLANK);
  };
  const toggle = (list: string[], value: string, on: boolean) => (on ? [...list, value] : list.filter((entry) => entry !== value));

  const saveArea = async () => {
    const rateMinor = form.pricing === "QUOTE" ? null : toKobo(form.rate);
    const travelMinor = form.pricing === "FIXED_PLUS_TRAVEL" ? toKobo(form.travel) : null;
    if ((form.pricing !== "QUOTE" && rateMinor === null) || (form.pricing === "FIXED_PLUS_TRAVEL" && travelMinor === null)) {
      setMessage({ tone: "error", text: "Enter the fees in naira." });
      return;
    }
    const body = { name: form.name, states: form.states, productIds: form.productIds, pricing: form.pricing, rateMinor, travelMinor, version: form.version };
    const saved = await call(
      "area",
      () => api(form.id ? `/v1/admin/installation/areas/${form.id}` : "/v1/admin/installation/areas", { method: form.id ? "PUT" : "POST", body, response: installationSetupSchema }),
      `${form.name} saved. Checkout and quotes use it from now on.`,
    );
    if (saved) setForm(BLANK);
  };
  const removeArea = () =>
    form.id &&
    void call("remove", () => api(`/v1/admin/installation/areas/${form.id}`, { method: "DELETE", response: installationSetupSchema }), `${form.name} removed. Its states are quoted now.`).then((done) => done && setForm(BLANK));
  const saveRules = () => {
    const surveyAboveSqM = survey.on ? Number(survey.value) : null;
    const noticeWorkingDays = notice.on ? Number(notice.value) : null;
    if ((survey.on && !(Number.isInteger(surveyAboveSqM) && surveyAboveSqM! > 0)) || (notice.on && !(Number.isInteger(noticeWorkingDays) && noticeWorkingDays! > 0))) {
      setMessage({ tone: "error", text: "Enter whole numbers for the size and the working days." });
      return;
    }
    void call(
      "rules",
      () => api("/v1/admin/installation/rules", { method: "PUT", body: { surveyAboveSqM, noticeWorkingDays, version: setup.rules.version }, response: installationSetupSchema }),
      "Rules saved. Checkout and quotes use these rules for installation products from now on.",
    );
  };

  return (
    <div className={css.layout}>
      <section className={styles.panel} aria-labelledby="installation-title">
        <h2 id="installation-title" className={styles.panelTitle}>
          Installation areas and capabilities (OPS-FR-102)
        </h2>
        {message ? (
          <Notice tone={message.tone} live>
            <p>{message.text}</p>
          </Notice>
        ) : null}
        <table className={styles.table}>
          <caption className="hp-visually-hidden">Where we install, what, and how it&apos;s priced</caption>
          <thead>
            <tr>
              <th scope="col">AREA</th>
              <th scope="col">CAPABILITIES</th>
              <th scope="col">PRICING</th>
            </tr>
          </thead>
          <tbody>
            {setup.areas.map((area) => (
              <tr key={area.id}>
                <td>
                  <button type="button" className={styles.action} onClick={() => edit(area)}>
                    {area.name}
                  </button>
                  <span className={styles.hint}> · {area.states.join(", ")}</span>
                </td>
                <td>{area.products.map((product) => product.name).join(", ") || "—"}</td>
                <td>
                  {PRICING_LABEL[area.pricing]}
                  {area.rateMinor ? <span className={styles.hint}> · {money(area.rateMinor, "NGN")} a piece</span> : null}
                  {area.travelMinor ? <span className={styles.hint}> + {money(area.travelMinor, "NGN")} travel</span> : null}
                </td>
              </tr>
            ))}
            <tr>
              <td>Elsewhere</td>
              <td>—</td>
              <td>
                <StatusChip tone="warning">QUOTE REQUIRED</StatusChip>
              </td>
            </tr>
          </tbody>
        </table>
        <fieldset className={css.form}>
          <legend className={styles.strong}>Rules</legend>
          <div className={css.row}>
            <Checkbox id="rule-survey" label="Site survey for graphics larger than (m²)" checked={survey.on} onChange={(event) => setSurvey({ ...survey, on: event.target.checked })} />
            {survey.on ? (
              <FormField id="rule-survey-size" label="Square metres">
                <TextField inputMode="numeric" value={survey.value} onChange={(event) => setSurvey({ ...survey, value: event.target.value })} />
              </FormField>
            ) : null}
          </div>
          <div className={css.row}>
            <Checkbox id="rule-notice" label="Installation needs a confirmed date ahead" checked={notice.on} onChange={(event) => setNotice({ ...notice, on: event.target.checked })} />
            {notice.on ? (
              <FormField id="rule-notice-days" label="Working days">
                <TextField inputMode="numeric" value={notice.value} onChange={(event) => setNotice({ ...notice, value: event.target.value })} />
              </FormField>
            ) : null}
          </div>
          <div className={css.actions}>
            <Button variant="secondary" loading={busy === "rules"} onClick={saveRules}>
              Save rules
            </Button>
          </div>
        </fieldset>
      </section>
      <section className={styles.panel} aria-labelledby="area-form-title">
        <h2 id="area-form-title" className={styles.panelTitle}>
          {form.id ? `Change ${form.name}` : "Add an installation area"}
        </h2>
        <form
          className={css.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void saveArea();
          }}
        >
          <FormField id="area-name" label="Area name">
            <TextField value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </FormField>
          <fieldset className={css.form}>
            <legend className={styles.strong}>States</legend>
            <div className={css.row}>
              {NIGERIA_STATES.map((state) => (
                <Checkbox key={state} id={`area-state-${state}`} label={state} checked={form.states.includes(state)} onChange={(event) => setForm({ ...form, states: toggle(form.states, state, event.target.checked) })} />
              ))}
            </div>
          </fieldset>
          <fieldset className={css.form}>
            <legend className={styles.strong}>Products we install here</legend>
            {setup.installable.map((product) => (
              <Checkbox key={product.id} id={`area-product-${product.id}`} label={product.name} checked={form.productIds.includes(product.id)} onChange={(event) => setForm({ ...form, productIds: toggle(form.productIds, product.id, event.target.checked) })} />
            ))}
          </fieldset>
          <FormField id="area-pricing" label="Pricing">
            <Select value={form.pricing} onValueChange={(next) => setForm({ ...form, pricing: next as Pricing })} options={(Object.keys(PRICING_LABEL) as Pricing[]).map((value) => ({ value, label: PRICING_LABEL[value] }))} />
          </FormField>
          {form.pricing !== "QUOTE" ? (
            <div className={css.row}>
              <FormField id="area-rate" label="Fee per piece (₦, before VAT)">
                <TextField inputMode="decimal" value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value })} />
              </FormField>
              {form.pricing === "FIXED_PLUS_TRAVEL" ? (
                <FormField id="area-travel" label="Travel per order (₦)">
                  <TextField inputMode="decimal" value={form.travel} onChange={(event) => setForm({ ...form, travel: event.target.value })} />
                </FormField>
              ) : null}
            </div>
          ) : null}
          <div className={css.actions}>
            <Button type="submit" loading={busy === "area"}>
              {form.id ? "Save area" : "Add area"}
            </Button>
            {form.id ? (
              <>
                <Button variant="tertiary" onClick={() => edit(null)}>
                  Cancel
                </Button>
                <Button variant="tertiary" loading={busy === "remove"} onClick={removeArea}>
                  Remove {form.name}
                </Button>
              </>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}
