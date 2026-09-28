import { render as renderEmail } from "@react-email/render";
import { TEMPLATES, type TemplateData, type TemplateName } from "./templates/index.js";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Checks the data against the template's schema, then renders HTML and a plain-text copy. */
export async function renderTemplate<T extends TemplateName>(template: T, data: TemplateData<T>): Promise<RenderedEmail> {
  const definition = TEMPLATES[template];
  const parsed = definition.data.parse(data) as never;
  const element = definition.render(parsed);
  return {
    subject: definition.subject(parsed),
    html: await renderEmail(element),
    text: await renderEmail(element, { plainText: true }),
  };
}

export const isTemplate = (name: string): name is TemplateName => name in TEMPLATES;
