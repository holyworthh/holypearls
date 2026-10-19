/*
 * Garment configuration rules (T03-05). Pure functions, tested on their own:
 * placement conflicts (COM-FR-026), artwork resolution (COM-FR-051) and the
 * personalization CSV (COM-FR-029).
 */

export const GARMENT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;

export type Position = "LEFT_CHEST" | "RIGHT_CHEST" | "CENTRE_CHEST" | "FULL_FRONT" | "UPPER_BACK" | "FULL_BACK" | "LEFT_SLEEVE" | "RIGHT_SLEEVE" | "CUSTOM";
export type Size = "SMALL" | "STANDARD" | "LARGE";
export type Method = "EMBROIDERY" | "PRINT" | "BOTH" | "RECOMMEND";

export interface Placement {
  position: Position;
  size: Size;
  method: Method | null;
  note: string | null;
}

export const POSITION_LABEL: Record<Position, string> = {
  LEFT_CHEST: "Left chest",
  RIGHT_CHEST: "Right chest",
  CENTRE_CHEST: "Centre chest",
  FULL_FRONT: "Full front",
  UPPER_BACK: "Upper back",
  FULL_BACK: "Full back",
  LEFT_SLEEVE: "Left sleeve",
  RIGHT_SLEEVE: "Right sleeve",
  CUSTOM: "Custom position",
};

/** A way to fix a conflict that changes only the placement it names (COM-FR-026). */
export interface PlacementFix {
  label: string;
  position: Position;
  change: { remove: true } | { size: Size } | { method: Method };
}

export interface PlacementConflict {
  positions: Position[];
  message: string;
  fixes: PlacementFix[];
}

/** Areas that cover the same part of the garment. */
const OVERLAPS: [Position, Position][] = [
  ["FULL_FRONT", "LEFT_CHEST"],
  ["FULL_FRONT", "RIGHT_CHEST"],
  ["FULL_FRONT", "CENTRE_CHEST"],
  ["FULL_BACK", "UPPER_BACK"],
];


/**
 * Overlapping or incompatible placements, each with fixes that change only the
 * placement involved, so nothing else is reset (COM-FR-026).
 */
/** A decoration method that can't go on a placement, from the garment data (T13-01b; OPS-FR-022). */
export interface PlacementBlock {
  method: "EMBROIDERY" | "PRINT";
  position: string;
  message: string;
}

export function placementConflicts(placements: Placement[], decoration: Method | null, blocked: readonly PlacementBlock[] = []): PlacementConflict[] {
  const conflicts: PlacementConflict[] = [];
  const at = (position: Position) => placements.find((placement) => placement.position === position);
  for (const [big, small] of OVERLAPS) {
    if (at(big) && at(small)) {
      conflicts.push({
        positions: [big, small],
        message: `${POSITION_LABEL[big]} covers the ${POSITION_LABEL[small].toLowerCase()} area, so the two would overlap.`,
        fixes: [
          { label: `Remove ${POSITION_LABEL[small].toLowerCase()}`, position: small, change: { remove: true } },
          { label: `Remove ${POSITION_LABEL[big].toLowerCase()}`, position: big, change: { remove: true } },
        ],
      });
    }
  }
  const centre = at("CENTRE_CHEST");
  if (centre?.size === "LARGE") {
    for (const side of ["LEFT_CHEST", "RIGHT_CHEST"] as const) {
      if (at(side)) {
        conflicts.push({
          positions: ["CENTRE_CHEST", side],
          message: `A large centre-chest design reaches the ${POSITION_LABEL[side].toLowerCase()}.`,
          fixes: [
            { label: "Make the centre design standard size", position: "CENTRE_CHEST", change: { size: "STANDARD" } },
            { label: `Remove ${POSITION_LABEL[side].toLowerCase()}`, position: side, change: { remove: true } },
          ],
        });
      }
    }
  }
  for (const placement of placements) {
    const method = placement.method ?? decoration;
    const block = blocked.find((rule) => rule.position === placement.position && rule.method === method);
    if (block) {
      const other = block.method === "EMBROIDERY" ? "PRINT" : "EMBROIDERY";
      conflicts.push({
        positions: [placement.position],
        message: block.message,
        fixes: [{ label: other === "PRINT" ? "Print this area instead" : "Embroider this area instead", position: placement.position, change: { method: other } }],
      });
    }
    if ((placement.position === "LEFT_SLEEVE" || placement.position === "RIGHT_SLEEVE") && placement.size === "LARGE") {
      conflicts.push({
        positions: [placement.position],
        message: `${POSITION_LABEL[placement.position]} takes small or standard designs only.`,
        fixes: [{ label: "Make it standard size", position: placement.position, change: { size: "STANDARD" } }],
      });
    }
    if (placement.position === "CUSTOM" && !placement.note?.trim()) {
      conflicts.push({ positions: ["CUSTOM"], message: "Describe where the custom design goes.", fixes: [] });
    }
  }
  return conflicts;
}

/** Applies one fix, leaving every other placement untouched. */
export function applyFix(placements: Placement[], fix: PlacementFix): Placement[] {
  if ("remove" in fix.change) return placements.filter((placement) => placement.position !== fix.position);
  const change = fix.change;
  return placements.map((placement) => (placement.position === fix.position ? { ...placement, ...change } : placement));
}

/** Width a design prints at, in millimetres, by size (Stage 1.4 garment decoration standards; confirmed in the proof). */
export const PRINT_WIDTH_MM: Record<Size, number> = { SMALL: 70, STANDARD: 100, LARGE: 280 };

/** Pixels needed across for a width at 300 DPI (the raster print target, Stage 1.4). */
export const pixelsNeeded = (widthMm: number, dpi = 300) => Math.ceil((widthMm / 25.4) * dpi);

/**
 * Is a raster file wide enough for the largest placement? Vector files (PDF,
 * AI, SVG) scale without loss. A low-resolution file never blocks the order
 * (COM-FR-051); the customer replaces it, asks for clean-up or asks for review.
 */
export function resolutionCheck(file: { type: string; width: number | null }, placements: Placement[]) {
  const vector = ["application/pdf", "application/illustrator", "image/svg+xml"].includes(file.type);
  if (vector || !placements.length) return { ok: true as const };
  const largest = placements.reduce((size, placement) => Math.max(size, PRINT_WIDTH_MM[placement.size]), 0);
  const needed = pixelsNeeded(largest);
  if (file.width !== null && file.width >= needed) return { ok: true as const };
  return {
    ok: false as const,
    neededPixels: needed,
    actualPixels: file.width,
    message: `This image is ${file.width ?? "an unknown number of"} pixels wide. For a ${largest / 10} cm design it should be at least ${needed} pixels, or it may look blurry. Replace it, ask us to clean it up, or send it for review.`,
  };
}

export interface PersonalizationRow {
  row: number;
  name: string | null;
  number: string | null;
  department: string | null;
  size: string | null;
}

export interface CsvResult {
  rows: PersonalizationRow[];
  errors: { row: number; field: string; message: string }[];
}

/** Splits CSV text into rows of cells: quoted cells, doubled quotes, commas or semicolons. */
export function parseCsv(text: string): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = (clean.split(/\r?\n/)[0] ?? "").includes(";") && !(clean.split(/\r?\n/)[0] ?? "").includes(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index]!;
    if (quoted) {
      if (char === '"' && clean[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim()));
}

const HEADERS: Record<string, keyof Omit<PersonalizationRow, "row">> = {
  name: "name",
  names: "name",
  number: "number",
  no: "number",
  "shirt number": "number",
  department: "department",
  dept: "department",
  team: "department",
  size: "size",
};

/**
 * Checks a personalization CSV row by row (COM-FR-029; "a 120-row CSV checked
 * row by row"). The first line names the columns: name, number, department,
 * size (any of them, any order). Every problem is listed with its row number.
 */
export function checkPersonalizationCsv(text: string, maxRows = 5_000): CsvResult {
  const table = parseCsv(text);
  const errors: CsvResult["errors"] = [];
  if (!table.length) return { rows: [], errors: [{ row: 1, field: "file", message: "The file is empty." }] };
  const columns = table[0]!.map((header) => HEADERS[header.trim().toLowerCase()] ?? null);
  if (!columns.some(Boolean)) {
    return { rows: [], errors: [{ row: 1, field: "header", message: "The first row should name the columns: name, number, department, size." }] };
  }
  const data = table.slice(1);
  if (data.length > maxRows) errors.push({ row: maxRows + 2, field: "file", message: `Up to ${maxRows} rows at a time.` });
  const rows: PersonalizationRow[] = [];
  data.slice(0, maxRows).forEach((cells, index) => {
    const line = index + 2;
    const row: PersonalizationRow = { row: index + 1, name: null, number: null, department: null, size: null };
    columns.forEach((field, column) => {
      if (!field) return;
      const value = (cells[column] ?? "").trim();
      row[field] = value || null;
    });
    if (row.name && row.name.length > 30) errors.push({ row: line, field: "name", message: "Names can be up to 30 characters." });
    if (row.number && !/^\d{1,3}$/.test(row.number)) errors.push({ row: line, field: "number", message: "Numbers are 1 to 3 digits." });
    if (row.department && row.department.length > 40) errors.push({ row: line, field: "department", message: "Departments can be up to 40 characters." });
    if (row.size) {
      const size = row.size.toUpperCase().replace("XXXL", "3XL").replace("XXL", "2XL");
      if (!(GARMENT_SIZES as readonly string[]).includes(size)) errors.push({ row: line, field: "size", message: `Size ${row.size} isn't one of ${GARMENT_SIZES.join(", ")}.` });
      else row.size = size;
    }
    if (!row.name && !row.number && !row.department) errors.push({ row: line, field: "row", message: "Add a name, number or department." });
    rows.push(row);
  });
  return { rows, errors };
}
