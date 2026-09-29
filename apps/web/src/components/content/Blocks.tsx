import type { GuideData } from "@holypearls/contracts";
import { ArrowRight, CircleHelp, FileText, Package, Presentation, Printer, Shirt, Sparkles } from "lucide-react";
import { plain, splitBlocks } from "../../lib/rich-text";
import c from "./content.module.css";

const ICONS = { sparkles: Sparkles, printer: Printer, shirt: Shirt, "file-text": FileText, package: Package, presentation: Presentation } as const;

/** "Side by side" (Pen 57 comparison diagram): one table per option, so each reads on its own. */
export function Comparison({ data, title }: { data: NonNullable<GuideData["comparison"]>; title: string }) {
  return (
    <div className={c.comparison} role="group" aria-label={title}>
      {data.columns.map((column) => {
        const Icon = ICONS[column.icon];
        return (
          <table key={column.title} className={c.compareCol} aria-label={`${title}: ${column.title}`}>
            <caption>
              <Icon size={20} aria-hidden="true" />
              {column.title}
            </caption>
            <tbody>
              {column.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}

/** "Decide in 30 seconds" (Pen 57 decision aid). */
export function Decision({ data }: { data: NonNullable<GuideData["decision"]> }) {
  return (
    <div className={c.decision}>
      <ul>
        {data.items.map((item) => (
          <li key={item.question}>
            <CircleHelp size={18} aria-hidden="true" />
            <span>{item.question}</span>
            <ArrowRight size={16} aria-hidden="true" />
            <strong>{item.answer}</strong>
          </li>
        ))}
      </ul>
      {data.note ? <p className={c.noteSmall}>{data.note}</p> : null}
    </div>
  );
}

/**
 * Cleaned rich text with the guide's diagrams where the editor placed them.
 * The HTML comes from the API's allow-list cleaner, so it's safe to render.
 */
export function RichText({ html, className, guide }: { html: string; className?: string; guide?: Partial<GuideData> }) {
  // A diagram is named after the section heading just before it ("Side by side").
  let lastHeading = "Side by side";
  return (
    <div className={className}>
      {splitBlocks(html).map((part, index) => {
        if (part.kind === "html") {
          const headings = [...part.html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)];
          if (headings.length) lastHeading = plain(headings[headings.length - 1]![1]!);
          return <div key={index} className={c.contents} dangerouslySetInnerHTML={{ __html: part.html }} />;
        }
        if (part.name === "comparison" && guide?.comparison) return <Comparison key={index} data={guide.comparison} title={lastHeading} />;
        if (part.name === "decision" && guide?.decision) return <Decision key={index} data={guide.decision} />;
        return null;
      })}
    </div>
  );
}
