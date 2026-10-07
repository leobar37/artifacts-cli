/**
 * Version-1 dataset contracts for generic JSON-backed MDX views
 * (TaskList / Kanban / Properties) plus the document-relative source and
 * link boundary rules (FR-001, FR-003, NFR-001, NFR-002).
 *
 * Pure validators: no filesystem access, no eval/Function, no new
 * dependencies. Every validator returns an explicit result and never
 * throws on malformed input. Over-limit data is rejected visibly; values
 * are never silently truncated.
 */

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface ValidationOk<T> {
  ok: true;
  data: T;
}

export interface ValidationError {
  ok: false;
  errors: string[];
}

export type ValidationResult<T> = ValidationOk<T> | ValidationError;

function ok<T>(data: T): ValidationResult<T> {
  return { ok: true, data };
}

function fail(errors: string[]): ValidationResult<never> {
  return { ok: false, errors };
}

/** Human-safe description of an unexpected value; never throws on cycles. */
function describeValue(v: unknown): string {
  if (v === undefined) return "missing";
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** Optional string field; pushes a readable error instead of throwing. */
function optionalString(v: unknown, name: string, max: number, errors: string[]): string | undefined {
  if (v === undefined) return undefined;
  if (!isNonEmptyString(v) || v.length > max) {
    errors.push(`${name} must be a non-empty string of at most ${max} characters when present`);
    return undefined;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Limits (NFR-002)
// ---------------------------------------------------------------------------

export const LIMITS = {
  /** 1 MiB UTF-8 JSON per source. */
  maxJsonBytes: 1024 * 1024,
  maxItems: 1000,
  maxColumns: 50,
  maxGroups: 100,
  maxEntries: 100,
  /** IDs, titles and labels. */
  maxIdLabel: 256,
  /** Descriptions and value strings. */
  maxText: 4096,
} as const;

const utf8 = new TextEncoder();

/**
 * Size guard: true when `text` exceeds `limit` UTF-8 bytes (default 1 MiB
 * per source). Cheap length pre-check avoids encoding clearly-small inputs;
 * UTF-8 never expands past 3 bytes per UTF-16 code unit.
 */
export function byteLengthExceeded(text: string, limit: number = LIMITS.maxJsonBytes): boolean {
  if (text.length * 3 <= limit) return false;
  return utf8.encode(text).length > limit;
}

// ---------------------------------------------------------------------------
// Document-relative path boundary (NFR-001)
// ---------------------------------------------------------------------------

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const MALFORMED_PCT_RE = /%(?![0-9a-fA-F]{2})/;

function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return true;
  }
  return false;
}

/** One percent-decoding round; null on a malformed escape (fail-closed). */
function pctDecodeOnce(s: string): string | null {
  if (!s.includes("%")) return s;
  if (MALFORMED_PCT_RE.test(s)) return null;
  return s.replace(/%([0-9a-fA-F]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Iteratively percent-decode up to `rounds` times so repeated encodings
 * (`%252e` → `%2e` → `.`) collapse before checks. Returns null when a
 * malformed `%` escape is found — treated as hostile, not lenient.
 */
function decodeMax(s: string, rounds: number): string | null {
  let cur = s;
  for (let i = 0; i < rounds; i++) {
    const next = pctDecodeOnce(cur);
    if (next === null) return null;
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

/**
 * Safe literal `src` for sibling JSON sources: a non-empty relative path
 * ending in `.json` (case-sensitive) with no absolute/protocol-relative
 * form, no scheme, no backslash, no control characters, no query or
 * fragment, and no dot-dot traversal — including percent-encoded
 * `%2e`/`%2f`/`%5c` forms, repeated encodings and malformed escapes
 * (decoded iteratively up to 3 rounds before checking). Pure string rule:
 * never touches the filesystem.
 */
export function isSafeSrc(src: string): boolean {
  if (typeof src !== "string" || src.length === 0) return false;
  const decoded = decodeMax(src, 3);
  if (decoded === null) return false;
  for (const s of [src, decoded]) {
    if (hasControlChars(s) || s.includes("\\") || s.includes("#") || s.includes("?")) return false;
    if (s.startsWith("/") || SCHEME_RE.test(s)) return false;
  }
  if (!decoded.endsWith(".json")) return false;
  if (decoded.split("/").some((seg) => seg === "..")) return false;
  return true;
}

/**
 * Explicit-result variant of {@link isSafeSrc} for component dispatch:
 * returns the validated path or readable errors; never throws.
 */
export function validateSrc(src: unknown): ValidationResult<string> {
  if (typeof src !== "string") {
    return fail([`src must be a string, got ${describeValue(src)}`]);
  }
  if (src.length === 0) {
    return fail(["src must be a non-empty relative .json path"]);
  }
  if (!isSafeSrc(src)) {
    const shown = src.length > 80 ? `${src.slice(0, 77)}...` : src;
    return fail([
      `src must be a relative .json path without scheme, absolute form, query, fragment, backslash, control characters or traversal (including percent-encoded forms): ${JSON.stringify(shown)}`,
    ]);
  }
  return ok(src);
}

/**
 * Safe item `href`: an in-document `#fragment` or a document-relative
 * sibling path (md/mdx/html/json/png/jpg/svg, ...). No scheme (rejects
 * `javascript:`, `data:`, `file:`, `http(s):`), no backslash, no control
 * characters, no query (`?`) boundary, no absolute/protocol-relative form,
 * and traversal rejected exactly like `src` — including encoded forms.
 */
export function isSafeHref(href: string): boolean {
  if (typeof href !== "string" || href.length === 0) return false;
  let cur = href;
  for (let round = 0; round < 3; round++) {
    const decoded = pctDecodeOnce(cur);
    if (decoded === null) return false;
    // Re-check at every decoding level: an encoded `#`/`?`/`/` must not
    // relocate the path/fragment boundary or hide traversal.
    if (hasControlChars(decoded) || decoded.includes("\\") || decoded.includes("?")) return false;
    if (decoded.startsWith("/") || SCHEME_RE.test(decoded)) return false;
    const hash = decoded.indexOf("#");
    const pathPart = hash === -1 ? decoded : decoded.slice(0, hash);
    if (pathPart.split("/").some((seg) => seg === "..")) return false;
    if (decoded === cur) break;
    cur = decoded;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Work-item dataset (TaskList / Kanban) — FR-001, FR-002
// ---------------------------------------------------------------------------

export interface WorkItemColumn {
  id: string;
  label: string;
}

export interface WorkItemGroup {
  id: string;
  label: string;
}

export interface WorkItem {
  id: string;
  title: string;
  /** Free-form status label; must reference a declared column id. */
  status: string;
  /** Optional group id; missing group means "Ungrouped" downstream. */
  group?: string;
  owner?: string;
  description?: string;
  /** In-document fragment or safe document-relative sibling path. */
  href?: string;
}

export interface WorkItemsDataset {
  version: 1;
  columns: WorkItemColumn[];
  groups?: WorkItemGroup[];
  items: WorkItem[];
}

function parseIdLabelList(
  raw: unknown,
  what: string,
  max: number,
  errors: string[],
): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  if (!Array.isArray(raw)) {
    errors.push(`${what} must be an array`);
    return out;
  }
  if (raw.length > max) {
    errors.push(`too many ${what}: ${raw.length} (max ${max})`);
    return out;
  }
  raw.forEach((entry, i) => {
    const at = `${what}[${i}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${at} must be an object with id and label`);
      return;
    }
    if (!isNonEmptyString(entry.id) || entry.id.length > LIMITS.maxIdLabel) {
      errors.push(`${at}.id must be a non-empty string of at most ${LIMITS.maxIdLabel} characters`);
      return;
    }
    if (!isNonEmptyString(entry.label) || entry.label.length > LIMITS.maxIdLabel) {
      errors.push(`${at}.label must be a non-empty string of at most ${LIMITS.maxIdLabel} characters`);
      return;
    }
    out.push({ id: entry.id, label: entry.label });
  });
  return out;
}

/**
 * Validate a version-1 work-item dataset. Rules: `version` must equal 1;
 * empty items are valid; a zero-column empty dataset is valid but nonempty
 * items require known column ids (item `status` references a column);
 * duplicate item ids are rejected; unknown column/group references are
 * rejected; a missing optional `group` is valid (rendered as Ungrouped);
 * counts and string lengths are capped; `href` must pass the safe-href
 * rule. Status carries no workflow semantics — any declared label works.
 */
export function validateWorkItems(data: unknown): ValidationResult<WorkItemsDataset> {
  if (!isPlainObject(data)) {
    return fail([`work-item dataset must be a JSON object, got ${describeValue(data)}`]);
  }
  if (data.version !== 1) {
    return fail([`unsupported dataset version: expected 1, got ${describeValue(data.version)}`]);
  }

  const errors: string[] = [];

  if (!Array.isArray(data.columns)) {
    return fail(["columns must be an array (use [] for none)"]);
  }
  if (data.columns.length > LIMITS.maxColumns) {
    return fail([`too many columns: ${data.columns.length} (max ${LIMITS.maxColumns})`]);
  }
  const columns = parseIdLabelList(data.columns, "columns", LIMITS.maxColumns, errors);

  let groups: WorkItemGroup[] = [];
  if (data.groups !== undefined) {
    groups = parseIdLabelList(data.groups, "groups", LIMITS.maxGroups, errors);
  }

  if (!Array.isArray(data.items)) {
    return fail(["items must be an array (use [] for none)"]);
  }
  if (data.items.length > LIMITS.maxItems) {
    return fail([`too many items: ${data.items.length} (max ${LIMITS.maxItems})`]);
  }

  const columnIds = new Set(columns.map((c) => c.id));
  const groupIds = new Set(groups.map((g) => g.id));
  const seenIds = new Set<string>();
  const items: WorkItem[] = [];

  if (data.items.length > 0 && columns.length === 0) {
    errors.push("non-empty items require at least one declared column");
  }

  data.items.forEach((raw, i) => {
    const at = `items[${i}]`;
    if (!isPlainObject(raw)) {
      errors.push(`${at} must be an object`);
      return;
    }
    if (!isNonEmptyString(raw.id) || raw.id.length > LIMITS.maxIdLabel) {
      errors.push(`${at}.id must be a non-empty string of at most ${LIMITS.maxIdLabel} characters`);
      return;
    }
    if (seenIds.has(raw.id)) {
      errors.push(`duplicate item id: ${raw.id}`);
      return;
    }
    seenIds.add(raw.id);
    if (!isNonEmptyString(raw.title) || raw.title.length > LIMITS.maxIdLabel) {
      errors.push(`${at}.title must be a non-empty string of at most ${LIMITS.maxIdLabel} characters`);
      return;
    }
    if (!isNonEmptyString(raw.status) || raw.status.length > LIMITS.maxIdLabel) {
      errors.push(`${at}.status must be a non-empty status label of at most ${LIMITS.maxIdLabel} characters`);
      return;
    }
    if (columns.length > 0 && !columnIds.has(raw.status)) {
      errors.push(`${at} references unknown column ${JSON.stringify(raw.status)}`);
    }
    const group = optionalString(raw.group, `${at}.group`, LIMITS.maxIdLabel, errors);
    if (group !== undefined && !groupIds.has(group)) {
      errors.push(`${at} references unknown group ${JSON.stringify(group)}`);
    }
    const owner = optionalString(raw.owner, `${at}.owner`, LIMITS.maxIdLabel, errors);
    const description = optionalString(raw.description, `${at}.description`, LIMITS.maxText, errors);
    let href: string | undefined;
    if (raw.href !== undefined) {
      if (typeof raw.href !== "string" || raw.href.length === 0 || !isSafeHref(raw.href)) {
        errors.push(
          `${at}.href must be an in-document #fragment or a document-relative path (no scheme, query, backslash, control characters or traversal)`,
        );
      } else {
        href = raw.href;
      }
    }
    items.push({
      id: raw.id,
      title: raw.title,
      status: raw.status,
      ...(group !== undefined ? { group } : {}),
      ...(owner !== undefined ? { owner } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(href !== undefined ? { href } : {}),
    });
  });

  if (errors.length > 0) return fail(errors);
  return ok({
    version: 1,
    columns,
    ...(data.groups !== undefined ? { groups } : {}),
    items,
  });
}

// ---------------------------------------------------------------------------
// Properties dataset — FR-003
// ---------------------------------------------------------------------------

export interface PropertyEntry {
  label: string;
  /** Scalar only: string, finite number, boolean, or null. */
  value: string | number | boolean | null;
  group?: string;
}

export interface PropertiesDataset {
  version: 1;
  entries: PropertyEntry[];
}

/**
 * Validate a version-1 properties dataset: labeled scalar values with an
 * optional free-form section group. Values must be a string (max 4096
 * chars), finite number, boolean, or null — nested objects/arrays and
 * executable shapes are rejected, as are NaN/Infinity. Never executes
 * strings; producers select safe fields.
 */
export function validateProperties(data: unknown): ValidationResult<PropertiesDataset> {
  if (!isPlainObject(data)) {
    return fail([`properties dataset must be a JSON object, got ${describeValue(data)}`]);
  }
  if (data.version !== 1) {
    return fail([`unsupported dataset version: expected 1, got ${describeValue(data.version)}`]);
  }
  if (!Array.isArray(data.entries)) {
    return fail(["entries must be an array"]);
  }
  if (data.entries.length > LIMITS.maxEntries) {
    return fail([`too many property entries: ${data.entries.length} (max ${LIMITS.maxEntries})`]);
  }

  const errors: string[] = [];
  const entries: PropertyEntry[] = [];

  data.entries.forEach((raw, i) => {
    const at = `entries[${i}]`;
    if (!isPlainObject(raw)) {
      errors.push(`${at} must be an object with label and value`);
      return;
    }
    if (!isNonEmptyString(raw.label) || raw.label.length > LIMITS.maxIdLabel) {
      errors.push(`${at}.label must be a non-empty string of at most ${LIMITS.maxIdLabel} characters`);
      return;
    }
    if (raw.value === undefined) {
      errors.push(`${at}.value is required`);
      return;
    }
    let value: string | number | boolean | null;
    const v = raw.value;
    if (v === null) {
      value = null;
    } else if (typeof v === "string") {
      if (v.length > LIMITS.maxText) {
        errors.push(`${at}.value must be at most ${LIMITS.maxText} characters`);
        return;
      }
      value = v;
    } else if (typeof v === "number") {
      if (!Number.isFinite(v)) {
        errors.push(`${at}.value must be a finite number (NaN and Infinity are not allowed)`);
        return;
      }
      value = v;
    } else if (typeof v === "boolean") {
      value = v;
    } else {
      errors.push(
        `${at}.value must be a string, finite number, boolean, or null (nested objects, arrays and executable shapes are not allowed)`,
      );
      return;
    }
    const group = optionalString(raw.group, `${at}.group`, LIMITS.maxIdLabel, errors);
    entries.push(
      group !== undefined ? { label: raw.label, value, group } : { label: raw.label, value },
    );
  });

  if (errors.length > 0) return fail(errors);
  return ok({ version: 1, entries });
}
