"use client";

import { ApiError, type Fabric, fabricSchema } from "@holypearls/contracts";
import { Button, FormField, Notice, Select, StatusChip, TextField } from "@holypearls/ui";
import { api } from "@holypearls/web-kit/api";
import { useState } from "react";
import styles from "../admin-list.module.css";
import css from "../form-layout.module.css";

const EMPTY = { key: "", name: "", detail: "", colours: "", sizeRange: "", supplierCode: "", status: "ACTIVE" as Fabric["status"] };
const shortColours = (colours: string[]) => (colours.length > 4 ? `${colours.slice(0, 4).join(", ")} +${colours.length - 4}` : colours.join(", ")) || "—";

/** Fabrics, colours and size ranges with the staff-only supplier code (Pen 118 DGylb). Archived fabrics keep their history. */
export function FabricManager({ initial }: { initial: Fabric[] }) {
  const [fabrics, setFabrics] = useState(initial);
  const [editing, setEditing] = useState<Fabric | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const field = (key: Exclude<keyof typeof EMPTY, "status">) => ({ value: form[key], onChange: (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value }) });

  const edit = (fabric: Fabric | null) => {
    setEditing(fabric);
    setNotice(null);
    setForm(fabric ? { key: fabric.key, name: fabric.name, detail: fabric.detail, colours: fabric.colours.join(", "), sizeRange: fabric.sizeRange, supplierCode: fabric.supplierCode ?? "", status: fabric.status } : EMPTY);
  };
  const save = async () => {
    setBusy(true);
    setNotice(null);
    const body = { ...form, colours: form.colours.split(",").map((colour) => colour.trim()).filter(Boolean), supplierCode: form.supplierCode.trim() || null, version: editing?.version ?? 0 };
    try {
      const saved = await api(editing ? `/v1/admin/garment-data/fabrics/${editing.id}` : "/v1/admin/garment-data/fabrics", { method: editing ? "PUT" : "POST", body, response: fabricSchema });
      setFabrics((all) => [...all.filter((fabric) => fabric.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      edit(null);
      setNotice({ tone: "success", text: `${saved.name} saved.` });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof ApiError ? (error.body.code === "VERSION_CONFLICT" ? "Someone else changed this fabric. Reload to see it." : (Object.values(error.body.fieldErrors ?? {})[0] ?? error.body.message)) : "That didn't save. Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={css.layout}>
      <section className={styles.panel} aria-labelledby="fabrics-title">
        <h2 id="fabrics-title" className={styles.panelTitle}>
          Fabrics & colours (OPS-FR-021)
        </h2>
        {fabrics.length === 0 ? (
          <p className={styles.hint}>No fabrics yet. Add the ones your garments are made from.</p>
        ) : (
          <table className={styles.table}>
            <caption className="hp-visually-hidden">Fabrics, their colours, sizes and the products that use them</caption>
            <thead>
              <tr>
                <th scope="col">FABRIC</th>
                <th scope="col">COLOURS</th>
                <th scope="col">SIZES</th>
                <th scope="col">USED BY</th>
                <th scope="col">INTERNAL (STAFF ONLY)</th>
              </tr>
            </thead>
            <tbody>
              {fabrics.map((fabric) => (
                <tr key={fabric.id}>
                  <td>
                    <button type="button" className={styles.action} onClick={() => edit(fabric)}>
                      {fabric.name}
                      {fabric.detail ? ` ${fabric.detail}` : ""}
                    </button>
                    {fabric.status === "ARCHIVED" ? <StatusChip tone="neutral">ARCHIVED</StatusChip> : null}
                  </td>
                  <td>{shortColours(fabric.colours)}</td>
                  <td>{fabric.sizeRange || "—"}</td>
                  <td>{fabric.usedBy.map((product) => product.name).join(", ") || "Not used yet"}</td>
                  <td className={styles.mono}>{fabric.supplierCode ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className={styles.panel} aria-labelledby="fabric-form-title">
        <h2 id="fabric-form-title" className={styles.panelTitle}>
          {editing ? `Change ${editing.name}` : "Add a fabric"}
        </h2>
        {notice ? (
          <Notice tone={notice.tone} live>
            <p>{notice.text}</p>
          </Notice>
        ) : null}
        <form
          className={css.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className={css.row}>
            <FormField id="fabric-name" label="Name">
              <TextField {...field("name")} />
            </FormField>
            <FormField id="fabric-detail" label="Weight or detail" optional>
              <TextField {...field("detail")} />
            </FormField>
          </div>
          <FormField id="fabric-key" label="Key" hint="The value key products use in their fabric option, like pique-cotton.">
            <TextField autoComplete="off" {...field("key")} />
          </FormField>
          <FormField id="fabric-colours" label="Colours" hint="Separated by commas.">
            <TextField {...field("colours")} />
          </FormField>
          <div className={css.row}>
            <FormField id="fabric-sizes" label="Size range" optional>
              <TextField {...field("sizeRange")} />
            </FormField>
            <FormField id="fabric-supplier" label="Supplier code (staff only)" optional>
              <TextField autoComplete="off" {...field("supplierCode")} />
            </FormField>
          </div>
          {editing ? (
            <FormField id="fabric-status" label="Status">
              <Select
                value={form.status}
                onValueChange={(next) => setForm({ ...form, status: next as Fabric["status"] })}
                options={[
                  { value: "ACTIVE", label: "Active" },
                  { value: "ARCHIVED", label: "Archived (history kept)" },
                ]}
              />
            </FormField>
          ) : null}
          <div className={css.actions}>
            <Button type="submit" loading={busy}>
              {editing ? "Save fabric" : "Add fabric"}
            </Button>
            {editing ? (
              <Button variant="tertiary" onClick={() => edit(null)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}
