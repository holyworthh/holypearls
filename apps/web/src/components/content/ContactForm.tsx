"use client";

import { createHelpRequestSchema, type FileView, HELP_TOPIC_LABEL, type HelpContext, helpRequestSchema, type HelpTopic, toFieldErrors } from "@holypearls/contracts";
import { ErrorSummary, Notice } from "@holypearls/ui";
import { ArrowRight, Paperclip, Send } from "lucide-react";
import { type FormEvent, useState } from "react";
import { api, errorCode } from "@holypearls/web-kit/api";
import { FileUpload } from "../FileUpload";
import s from "./contact.module.css";

const TOPICS = Object.keys(HELP_TOPIC_LABEL) as HelpTopic[];
const ID = { topic: "contact-topic", name: "contact-name", company: "contact-company", email: "contact-email", phone: "contact-phone", message: "contact-need", fileIds: "contact-files" } as const;

/**
 * The contact enquiry (Pen 60 · Czozq; PUB-FR-015, PRD-00 §18). It becomes a
 * help request with the page it came from attached. Signed-in customers can
 * attach files straight away; visitors add them right after sending, once
 * their request exists (uploads need a session, TECH-04).
 */
export function ContactForm({
  initialTopic,
  initialNeed,
  context,
  signedIn,
}: {
  initialTopic: HelpTopic;
  initialNeed: string;
  context: HelpContext;
  signedIn: { name: string; email: string } | null;
}) {
  const [topic, setTopic] = useState<HelpTopic>(initialTopic);
  const [name, setName] = useState(signedIn?.name ?? "");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(initialNeed);
  const [files, setFiles] = useState<FileView[]>([]);
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ id: string; reference: string } | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const input = {
      message,
      topic,
      context,
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(company.trim() ? { company: company.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(signedIn ? {} : { email: email.trim() || undefined }),
      ...(files.length ? { fileIds: files.map((file) => file.id) } : {}),
    };
    const parsed = createHelpRequestSchema.safeParse(input);
    const fieldErrors = parsed.success ? {} : toFieldErrors(parsed.error);
    if (!name.trim()) fieldErrors.name ??= "Tell us your name";
    if (!signedIn && !email.trim()) fieldErrors.email ??= "Enter your email so we can reply";
    if (!parsed.success || Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const created = await api("/v1/help-requests", { method: "POST", body: parsed.data, response: helpRequestSchema });
      setSent({ id: created.id, reference: created.reference });
    } catch (error) {
      setFailure(errorCode(error) === "RATE_LIMITED" ? "You've sent several messages in a short time. Wait a few minutes, then try again." : "We couldn't send your enquiry. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className={s.sent} role="status">
        <h2 className={s.sentTitle} tabIndex={-1} ref={(node) => node?.focus()}>
          We got your enquiry
        </h2>
        <p className={s.sentBody}>
          Your reference is <strong>{sent.reference}</strong>. We&apos;ll reply by email{phone ? " or phone" : ""}, usually within one working day.
        </p>
        {!signedIn ? (
          <div className={s.addFiles}>
            <p className={s.label}>Add files to your enquiry</p>
            <p className={s.hint}>A logo, references or a brief help us reply with a better answer.</p>
            <FileUpload purpose="PROJECT_ATTACHMENT" label="Attach a file" hint="PDF, AI, SVG, PNG or JPEG" owner={{ type: "HELP_REQUEST", id: sent.id }} />
          </div>
        ) : null}
        <a className={s.outline} href={`/help/${sent.id}`}>
          See your enquiry
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
    );
  }

  const invalid = (field: keyof typeof ID) => (errors[field] ? { "aria-invalid": true, "aria-describedby": `${ID[field]}-error` } : {});
  const error = (field: keyof typeof ID) =>
    errors[field] ? (
      <p id={`${ID[field]}-error`} className={s.error}>
        {errors[field]}
      </p>
    ) : null;

  return (
    <form className={s.form} noValidate onSubmit={onSubmit}>
      <ErrorSummary errors={Object.entries(errors).map(([field, text]) => ({ fieldId: ID[field as keyof typeof ID] ?? ID.message, message: text }))} />
      {failure ? <Notice tone="error" title="Not sent" live>{failure}</Notice> : null}
      <fieldset className={s.chips}>
        <legend className={s.label}>What&apos;s it about?</legend>
        <div className={s.chipRow} id={ID.topic}>
          {TOPICS.map((value) => (
            <label key={value} className={s.chip}>
              <input type="radio" name="topic" value={value} checked={topic === value} onChange={() => setTopic(value)} />
              <span>{HELP_TOPIC_LABEL[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className={s.row}>
        <div className={s.field}>
          <label className={s.labelRow} htmlFor={ID.name}>
            <span className={s.label}>Your name</span>
            <span className={s.need}>Required</span>
          </label>
          <input id={ID.name} className={s.input} name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} {...invalid("name")} />
          {error("name")}
        </div>
        <div className={s.field}>
          <label className={s.labelRow} htmlFor={ID.company}>
            <span className={s.label}>Company</span>
            <span className={s.need}>Optional</span>
          </label>
          <input id={ID.company} className={s.input} name="company" autoComplete="organization" value={company} onChange={(event) => setCompany(event.target.value)} maxLength={120} {...invalid("company")} />
          {error("company")}
        </div>
      </div>
      <div className={s.row}>
        <div className={s.field}>
          <label className={s.labelRow} htmlFor={ID.email}>
            <span className={s.label}>Email</span>
            <span className={s.need}>{signedIn ? "From your account" : "Required"}</span>
          </label>
          {signedIn ? (
            <input id={ID.email} className={s.input} value={signedIn.email} readOnly aria-readonly="true" />
          ) : (
            <input id={ID.email} className={s.input} name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} {...invalid("email")} />
          )}
          {error("email")}
        </div>
        <div className={s.field}>
          <label className={s.labelRow} htmlFor={ID.phone}>
            <span className={s.label}>Phone</span>
            <span className={s.need}>Optional</span>
          </label>
          <input id={ID.phone} className={s.input} name="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+234 800 000 0000" {...invalid("phone")} />
          {error("phone")}
        </div>
      </div>
      <div className={s.field}>
        <label className={s.labelRow} htmlFor={ID.message}>
          <span className={s.label}>What do you need?</span>
          <span className={s.need}>Required</span>
        </label>
        <textarea
          id={ID.message}
          className={`${s.input} ${s.textarea}`}
          name="message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="e.g. 120 staff polos with our logo, needed by November"
          maxLength={4000}
          rows={4}
          {...invalid("message")}
        />
        {error("message")}
      </div>
      <div className={s.field}>
        <p className={s.labelRow}>
          <span className={s.label}>Attach files</span>
          <span className={s.need}>Optional</span>
        </p>
        {signedIn ? (
          <>
            {files.length ? (
              <ul className={s.attached}>
                {files.map((file) => (
                  <li key={file.id}>
                    <Paperclip size={16} aria-hidden="true" />
                    {file.name}
                  </li>
                ))}
              </ul>
            ) : null}
            {adding || !files.length ? (
              <FileUpload
                purpose="PROJECT_ATTACHMENT"
                label="Logo, references or a brief"
                hint="PDF, AI, SVG, PNG or JPEG"
                onChange={(file) => {
                  if (file && !files.some((existing) => existing.id === file.id)) setFiles((current) => [...current, file]);
                  setAdding(false);
                }}
              />
            ) : files.length < 5 ? (
              <button type="button" className={s.textButton} onClick={() => setAdding(true)}>
                Attach another file
              </button>
            ) : null}
            {error("fileIds")}
          </>
        ) : (
          <p className={s.hint} id={ID.fileIds}>
            <Paperclip size={16} aria-hidden="true" /> You can add a logo, references or a brief as soon as you&apos;ve sent this.
          </p>
        )}
      </div>
      <div className={s.actions}>
        <button type="submit" className={s.red} disabled={busy}>
          {busy ? "Sending…" : "Send enquiry"}
          <Send size={16} aria-hidden="true" />
        </button>
        <a className={s.outline} href="/contact?topic=project">
          Start a structured project
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
    </form>
  );
}
