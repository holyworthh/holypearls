import { type Project, PROJECT_TYPE_INFO } from "@holypearls/contracts";
import { StatusChip } from "@holypearls/ui";
import { Check } from "lucide-react";
import s from "./submitted.module.css";

const QUOTE_TEXT: Record<string, { label: string; tone: "info" | "success" | "warning" | "neutral" }> = {
  PENDING_REVIEW: { label: "PENDING REVIEW", tone: "info" },
  READY: { label: "READY", tone: "success" },
  REVISION_REQUESTED: { label: "REVISION REQUESTED", tone: "info" },
  ACCEPTED: { label: "ACCEPTED", tone: "success" },
  DECLINED: { label: "DECLINED", tone: "neutral" },
  EXPIRED: { label: "EXPIRED", tone: "warning" },
};

/**
 * "We've got your project" (Pen 124 · aV0NQ desktop, Lr27c mobile;
 * PROJ-FR-011). The project's link opens this once it's submitted.
 */
export function ProjectSubmitted({ project }: { project: Project }) {
  const quote = project.quote ? QUOTE_TEXT[project.quote.status] : null;
  return (
    <div className={s.page}>
      <section className={s.panel} aria-labelledby="submitted-title">
        <span className={s.icon} aria-hidden="true">
          <Check size={24} />
        </span>
        <p className={s.ref}>PROJECT {project.reference}</p>
        <h1 id="submitted-title" className={s.title}>
          We&apos;ve got your project
        </h1>
        <p className={s.body}>
          {project.title || PROJECT_TYPE_INFO[project.type].label}. {project.sentTo ? `We sent a secure link to ${project.sentTo}. ` : ""}
          {project.quote?.status === "READY" ? "Your quote is ready." : "Your quote is being reviewed."}
        </p>
        {project.quote && quote ? (
          <p className={s.status}>
            Quote {project.quote.reference}
            <StatusChip tone={quote.tone}>{quote.label}</StatusChip>
          </p>
        ) : null}
        <section className={s.next} aria-labelledby="next-title">
          <h2 id="next-title" className={s.nextTitle}>
            What happens next
          </h2>
          <ol className={s.steps}>
            <li>We review your brief and files</li>
            <li>You get a quote with a secure link</li>
            <li>Accept, pay the deposit, approve proofs</li>
          </ol>
        </section>
        <a className={s.outline} href="/start">
          Start another project
        </a>
      </section>
    </div>
  );
}
