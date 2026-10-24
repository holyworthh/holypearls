"use client";

import { Checkbox, FormField, Select, TextArea, TextField } from "@holypearls/ui";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import c from "./content-admin.module.css";
import { blank, type PartField } from "./parts";

type Data = Record<string, unknown>;

/** Errors from the API arrive keyed by path, e.g. "data.kit.0.label". */
function Field({ field, value, onChange, path, errors }: { field: PartField; value: unknown; onChange: (next: unknown) => void; path: string; errors: Record<string, string> }) {
  const id = `part-${path.replaceAll(".", "-")}`;
  const error = errors[path];
  switch (field.kind) {
    case "text":
      return (
        <FormField label={field.label} id={id} hint={field.hint} error={error}>
          <TextField value={(value as string | null) ?? ""} maxLength={field.max} onChange={(event) => onChange(field.nullable && !event.target.value.trim() ? null : event.target.value)} />
        </FormField>
      );
    case "textarea":
      return (
        <FormField label={field.label} id={id} hint={field.hint} error={error}>
          <TextArea value={(value as string) ?? ""} maxLength={field.max} rows={3} onChange={(event) => onChange(event.target.value)} />
        </FormField>
      );
    case "number":
      return (
        <FormField label={field.label} id={id} error={error}>
          <TextField type="number" inputMode="numeric" min={field.min} max={field.max} value={String(value ?? field.min)} onChange={(event) => onChange(Math.max(field.min, Math.min(field.max, Number(event.target.value) || field.min)))} />
        </FormField>
      );
    case "checkbox":
      return <Checkbox id={id} label={field.label} checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />;
    case "select":
      return (
        <FormField label={field.label} id={id} error={error}>
          <Select value={(value as string) ?? ""} options={[...field.options]} onValueChange={(next) => onChange(next)} />
        </FormField>
      );
    case "strings": {
      const items = (value as string[] | undefined) ?? [];
      return (
        <Repeat
          label={field.label}
          item={field.item}
          count={items.length}
          max={field.max}
          error={error}
          onAdd={() => onChange([...items, ""])}
          onMove={(from, to) => onChange(move(items, from, to))}
          onRemove={(index) => onChange(items.filter((_, i) => i !== index))}
          render={(index) => (
            <FormField label={`${field.item} ${index + 1}`} id={`${id}-${index}`} error={errors[`${path}.${index}`]}>
              <TextField value={items[index] ?? ""} maxLength={field.length} onChange={(event) => onChange(items.map((item, i) => (i === index ? event.target.value : item)))} />
            </FormField>
          )}
        />
      );
    }
    case "list": {
      const items = (value as Data[] | undefined) ?? [];
      return (
        <Repeat
          label={field.label}
          item={field.item}
          count={items.length}
          max={field.max}
          min={field.min}
          error={error}
          onAdd={() => onChange([...items, blank(field.fields)])}
          onMove={(from, to) => onChange(move(items, from, to))}
          onRemove={(index) => onChange(items.filter((_, i) => i !== index))}
          render={(index) => (
            <Fields fields={field.fields} value={items[index] ?? {}} path={`${path}.${index}`} errors={errors} onChange={(next) => onChange(items.map((item, i) => (i === index ? next : item)))} />
          )}
        />
      );
    }
    case "optional": {
      const on = value !== null && value !== undefined;
      return (
        <fieldset className={c.group}>
          <legend className={c.groupHead}>
            {field.label}
            <button type="button" className={c.textButton} onClick={() => onChange(on ? null : structuredClone(field.empty))}>
              {on ? <Trash2 size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
              {on ? `Remove ${field.label.toLowerCase()}` : `Add ${field.label.toLowerCase()}`}
            </button>
          </legend>
          {field.hint ? <p className={c.hint}>{field.hint}</p> : null}
          {error ? <p className={c.hint}>{error}</p> : null}
          {on ? <Fields fields={field.fields} value={value as Data} path={path} errors={errors} onChange={onChange} /> : null}
        </fieldset>
      );
    }
  }
}

function move<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function Repeat({
  label,
  item,
  count,
  max,
  min = 0,
  error,
  onAdd,
  onMove,
  onRemove,
  render,
}: {
  label: string;
  item: string;
  count: number;
  max: number;
  min?: number;
  error?: string;
  onAdd: () => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  render: (index: number) => React.ReactNode;
}) {
  return (
    <fieldset className={c.group}>
      <legend className={c.groupHead}>
        <span>
          {label} <span className={`${c.meta} ${c.count}`}>{count} of {max}</span>
        </span>
      </legend>
      {error ? <p className={c.hint}>{error}</p> : null}
      {Array.from({ length: count }, (_, index) => (
        <fieldset key={index} className={c.group}>
          <legend className={c.groupHead}>
            {item} {index + 1}
            <span className={c.itemActions}>
              <button type="button" className={c.textButton} aria-label={`Move ${item.toLowerCase()} ${index + 1} up`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
                <ArrowUp size={16} aria-hidden="true" />
              </button>
              <button type="button" className={c.textButton} aria-label={`Move ${item.toLowerCase()} ${index + 1} down`} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
                <ArrowDown size={16} aria-hidden="true" />
              </button>
              <button type="button" className={c.textButton} aria-label={`Remove ${item.toLowerCase()} ${index + 1}`} disabled={count <= min} onClick={() => onRemove(index)}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </span>
          </legend>
          {render(index)}
        </fieldset>
      ))}
      {count < max ? (
        <button type="button" className={`${c.textButton} ${c.add}`} onClick={onAdd}>
          <Plus size={16} aria-hidden="true" />
          Add {item.toLowerCase()}
        </button>
      ) : null}
    </fieldset>
  );
}

function Fields({ fields, value, onChange, path, errors }: { fields: readonly PartField[]; value: Data; onChange: (next: Data) => void; path: string; errors: Record<string, string> }) {
  return (
    <>
      {fields.map((field) => (
        <Field key={field.key} field={field} value={value[field.key]} path={`${path}.${field.key}`} errors={errors} onChange={(next) => onChange({ ...value, [field.key]: next })} />
      ))}
    </>
  );
}

/** The page type's own parts (kit, facts, comparison…), edited as a form. */
export function PartsEditor({ fields, value, onChange, errors, disabled }: { fields: readonly PartField[]; value: Data; onChange: (next: Data) => void; errors: Record<string, string>; disabled?: boolean }) {
  return (
    <fieldset className={c.parts} disabled={disabled}>
      <Fields fields={fields} value={value} path="data" errors={errors} onChange={onChange} />
    </fieldset>
  );
}
