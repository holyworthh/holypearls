import tokens from "@holypearls/ui/tokens" with { type: "json" };

/**
 * Email clients need inline values, so templates read the design tokens'
 * resolved values here instead of CSS variables (DESIGN-SYSTEM.md).
 */
const value = (name: string): string => {
  const resolved = (tokens as { resolvedActiveValues: Record<string, string | number> }).resolvedActiveValues[name];
  if (resolved === undefined) throw new Error(`Missing design token: ${name}`);
  return String(resolved);
};

export const theme = {
  ink: value("hp-ink"),
  paper: value("hp-paper"),
  bone: value("hp-bone"),
  line: value("hp-line"),
  graphite: value("hp-graphite"),
  accent: value("hp-accent"),
  radius: `${value("hp-r-control")}px`,
  fontFamily: "Geist, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  monoFamily: "'Geist Mono', ui-monospace, Menlo, Consolas, monospace",
  space: (px: 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40) => `${px}px`,
  text: { body: "16px", support: "14px", title: "24px", mono: "12px", code: "32px" },
} as const;
