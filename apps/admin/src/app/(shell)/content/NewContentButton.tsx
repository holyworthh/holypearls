"use client";

import { adminContentPageSchema, ApiError, CONTENT_PATH, type ContentType } from "@holypearls/contracts";
import { Button, Dialog, FormField, Notice, TextField } from "@holypearls/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { api } from "@holypearls/web-kit/api";
import c from "./content-admin.module.css";
import { toSlug } from "../format";


/** "New guide" and friends: a title and address make a draft, then the editor opens. */
export function NewContentButton({ type, label }: { type: Exclude<ContentType, "ABOUT">; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setOpen(false);
    setErrors({});
    setFailure(null);
  };

  const create = async (event?: FormEvent) => {
    event?.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Give the page a title";
    if (!slug) next.slug = "Choose an address";
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const page = await api("/v1/admin/content", { method: "POST", body: { type, title: title.trim(), slug }, response: adminContentPageSchema });
      router.push(`/content/${page.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.body.fieldErrors) setErrors(error.body.fieldErrors);
      else setFailure("We couldn't create the draft. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={label}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form="new-content" loading={busy}>
              Create draft
            </Button>
          </>
        }
      >
        <form id="new-content" noValidate onSubmit={create} className={c.editorCol}>
          {failure ? (
            <Notice tone="error" title="Not created">
              <p>{failure}</p>
            </Notice>
          ) : null}
          <FormField label="Title" id="new-content-title" error={errors.title}>
            <TextField
              value={title}
              maxLength={140}
              autoFocus
              onChange={(event) => {
                setTitle(event.target.value);
                if (!touched) setSlug(toSlug(event.target.value));
              }}
            />
          </FormField>
          <FormField label="Address" id="new-content-slug" error={errors.slug} hint={`${CONTENT_PATH[type]}/${slug || "…"}`}>
            <TextField
              value={slug}
              maxLength={80}
              onChange={(event) => {
                setTouched(true);
                setSlug(event.target.value);
              }}
            />
          </FormField>
          <p className={c.hint}>It stays a draft, off the site, until you publish it.</p>
        </form>
      </Dialog>
    </>
  );
}
