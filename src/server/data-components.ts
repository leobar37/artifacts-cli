import {
  isSafeHref,
  isSafeSrc,
  LIMITS,
  validateProperties,
  validateWorkItems,
  type PropertyEntry,
  type WorkItem,
} from "./data-contracts.js";

/**
 * Read-only JSON-backed MDX views (TaskList / Kanban / Properties).
 *
 * Every renderer takes the raw dataset exactly as parsed from a literal JSX
 * prop (or any unknown value), validates it with the shared contracts in
 * `data-contracts.ts`, and returns HTML. Failure is always visible and
 * component-scoped: `<div class="mv-data-error" role="alert">` with escaped
 * messages. Renderers never throw and never return null.
 *
 * Safety rules (NFR-001): no eval/Function, no filesystem access, no
 * process.env, no executable imports — every dataset string is HTML-escaped
 * before interpolation, and `href` destinations must pass `isSafeHref`.
 */

/** Local copy of mdx-components.ts' escape() (not exported there; importing
 * it back would create a cycle). Identical semantics: escapes & < > " '. */
function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type DataViewKind = "tasklist" | "kanban" | "properties";

const KIND_LABEL: Record<DataViewKind, string> = {
  tasklist: "TaskList",
  kanban: "Kanban",
  properties: "Properties",
};

/**
 * Optional component title: must be a non-empty string of at most
 * LIMITS.maxIdLabel characters after trimming. Overlong, empty, or
 * non-string titles are an error state, never silently dropped.
 */
export function validateDataTitle(
  raw: unknown,
): { ok: true; title?: string } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true };
  if (typeof raw !== "string") {
    return { ok: false, error: `title must be a string, got ${typeof raw}` };
  }
  const title = raw.trim();
  if (!title) return { ok: false, error: "title must be a non-empty string when present" };
  if (title.length > LIMITS.maxIdLabel) {
    return {
      ok: false,
      error: `title must be at most ${LIMITS.maxIdLabel} characters (got ${title.length})`,
    };
  }
  return { ok: true, title };
}

/**
 * Component-level visible failure: readable, escaped, announced to
 * assistive tech via role="alert". Never throws on hostile error text.
 */
export function renderDataError(kind: string, errors: string[]): string {
  const list = errors.map((e) => `<li>${escape(e)}</li>`).join("");
  return `<div class="mv-data-error" role="alert"><p class="mv-data-error-title">${escape(kind)}: invalid data</p><ul class="mv-data-error-list">${list}</ul></div>`;
}

/**
 * Declarative placeholder for a sibling-JSON view. P-003's viewer runtime
 * hydrates `data-kind`/`data-src`; nothing is fetched or resolved here and
 * no repository file is ever read. Ships an accessible loading line plus a
 * <noscript> fallback.
 */
export function renderDataSrcPlaceholder(
  kind: DataViewKind,
  src: string,
  title?: string,
): string {
  const label = KIND_LABEL[kind] ?? kind;
  if (!isSafeSrc(src)) {
    return renderDataError(label, [
      "src must be a relative .json path without scheme, absolute form, query, fragment, backslash, control characters or traversal",
    ]);
  }
  const titleAttr = title ? ` data-title="${escape(title)}"` : "";
  return (
    `<div class="mv-data mv-data-src" data-kind="${kind}" data-src="${escape(src)}"${titleAttr}>` +
    `<p class="mv-data-loading" role="status">Loading ${escape(label)} data from ${escape(src)}…</p>` +
    `<noscript><p class="mv-data-noscript">This ${escape(label)} view loads sibling JSON data and needs JavaScript. The data is not shown without it.</p></noscript>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Work-item views (TaskList / Kanban) — FR-001, FR-002
// ---------------------------------------------------------------------------

/** One work item card: textual status badge, escaped title, optional
 * owner/description/link. Links are real <a> elements only when the
 * destination passes isSafeHref; otherwise the link is omitted with a
 * visible note (defense in depth — the validator already rejects unsafe
 * hrefs, so this branch is unreachable through validated datasets). */
function workItemHtml(item: WorkItem): string {
  const badge = `<span class="mv-badge">${escape(item.status)}</span>`;
  let title: string;
  if (item.href !== undefined && isSafeHref(item.href)) {
    title = `<a class="mv-task-title" href="${escape(item.href)}">${escape(item.title)}</a>`;
  } else {
    const note =
      item.href !== undefined
        ? `<span class="mv-task-href-note">(link omitted: unsafe destination)</span>`
        : "";
    title = `<span class="mv-task-title">${escape(item.title)}</span>${note}`;
  }
  const owner = item.owner !== undefined ? `<span class="mv-task-owner">${escape(item.owner)}</span>` : "";
  const desc =
    item.description !== undefined ? `<p class="mv-task-desc">${escape(item.description)}</p>` : "";
  return `<li class="mv-task"><div class="mv-task-head">${badge}${title}${owner}</div>${desc}</li>`;
}

/**
 * TaskList: flat list preserving item order, or grouped by `groupBy="group"`
 * using the declared groups order with an "Ungrouped" section last.
 */
export function renderTaskList(
  dataset: unknown,
  opts?: { title?: unknown; groupBy?: unknown },
): string {
  const title = validateDataTitle(opts?.title);
  if (!title.ok) return renderDataError("TaskList", [title.error]);
  const validated = validateWorkItems(dataset);
  if (!validated.ok) return renderDataError("TaskList", validated.errors);
  const data = validated.data;
  const heading = title.title !== undefined ? `<p class="mv-data-title">${escape(title.title)}</p>` : "";
  if (data.items.length === 0) {
    return `<section class="mv-data mv-tasklist">${heading}<div class="mv-data-empty">No items in this task list.</div></section>`;
  }
  if (opts?.groupBy === "group") {
    const buckets = new Map<string, WorkItem[]>();
    for (const item of data.items) {
      const key = item.group ?? "";
      const bucket = buckets.get(key);
      if (bucket) bucket.push(item);
      else buckets.set(key, [item]);
    }
    const sections: { label: string; items: WorkItem[] }[] = [];
    for (const group of data.groups ?? []) {
      const bucket = buckets.get(group.id);
      if (bucket) sections.push({ label: group.label, items: bucket });
    }
    const ungrouped = buckets.get("");
    if (ungrouped) sections.push({ label: "Ungrouped", items: ungrouped });
    const groups = sections
      .map(
        (section) =>
          `<div class="mv-data-group"><p class="mv-data-group-label">${escape(
            section.label,
          )}</p><ul class="mv-tasklist-items">${section.items.map(workItemHtml).join("")}</ul></div>`,
      )
      .join("");
    return `<section class="mv-data mv-tasklist">${heading}<div class="mv-data-groups">${groups}</div></section>`;
  }
  return `<section class="mv-data mv-tasklist">${heading}<ul class="mv-tasklist-items">${data.items
    .map(workItemHtml)
    .join("")}</ul></section>`;
}

/**
 * Kanban: one column per declared column in declared order; items are
 * filtered by `status === column.id` preserving item order. An empty column
 * shows its own empty note; a zero-column empty dataset is a valid board
 * and renders the component-level empty state.
 */
export function renderKanban(dataset: unknown, opts?: { title?: unknown }): string {
  const title = validateDataTitle(opts?.title);
  if (!title.ok) return renderDataError("Kanban", [title.error]);
  const validated = validateWorkItems(dataset);
  if (!validated.ok) return renderDataError("Kanban", validated.errors);
  const data = validated.data;
  const heading = title.title !== undefined ? `<p class="mv-data-title">${escape(title.title)}</p>` : "";
  if (data.columns.length === 0) {
    return `<section class="mv-data mv-kanban">${heading}<div class="mv-data-empty">This board has no columns and no items.</div></section>`;
  }
  const columns = data.columns
    .map((col) => {
      const items = data.items.filter((item) => item.status === col.id);
      const body =
        items.length > 0
          ? `<ul class="mv-kanban-items">${items.map(workItemHtml).join("")}</ul>`
          : `<p class="mv-kanban-empty">No items</p>`;
      return `<div class="mv-kanban-col"><p class="mv-kanban-col-label">${escape(
        col.label,
      )}<span class="mv-kanban-count">${items.length}</span></p>${body}</div>`;
    })
    .join("");
  return `<section class="mv-data mv-kanban">${heading}<div class="mv-kanban-columns">${columns}</div></section>`;
}

// ---------------------------------------------------------------------------
// Properties view — FR-003
// ---------------------------------------------------------------------------

/**
 * Properties: labeled scalar values, optionally sectioned by the free-form
 * `group` field. Sections keep first-appearance order and "Ungrouped" goes
 * last; without any group the list renders flat with no section headers.
 * Values are scalars (validator-enforced): numbers/booleans/null are
 * stringified for display.
 */
export function renderProperties(dataset: unknown, opts?: { title?: unknown }): string {
  const title = validateDataTitle(opts?.title);
  if (!title.ok) return renderDataError("Properties", [title.error]);
  const validated = validateProperties(dataset);
  if (!validated.ok) return renderDataError("Properties", validated.errors);
  const data = validated.data;
  const heading = title.title !== undefined ? `<p class="mv-data-title">${escape(title.title)}</p>` : "";
  if (data.entries.length === 0) {
    return `<section class="mv-data mv-properties">${heading}<div class="mv-data-empty">No properties in this dataset.</div></section>`;
  }

  const sections: { label?: string; entries: PropertyEntry[] }[] = [];
  if (data.entries.some((entry) => entry.group !== undefined)) {
    const buckets = new Map<string, PropertyEntry[]>();
    for (const entry of data.entries) {
      const key = entry.group ?? "";
      const bucket = buckets.get(key);
      if (bucket) bucket.push(entry);
      else buckets.set(key, [entry]);
    }
    // Declared order = first appearance among entries; Ungrouped last.
    for (const key of buckets.keys()) {
      if (key !== "") sections.push({ label: key, entries: buckets.get(key) ?? [] });
    }
    const ungrouped = buckets.get("");
    if (ungrouped) sections.push({ label: "Ungrouped", entries: ungrouped });
  } else {
    sections.push({ entries: data.entries });
  }

  const body = sections
    .map((section) => {
      const rows = section.entries
        .map(
          (entry) =>
            `<div class="mv-prop"><dt>${escape(entry.label)}</dt><dd>${escape(
              entry.value === null ? "null" : String(entry.value),
            )}</dd></div>`,
        )
        .join("");
      if (section.label === undefined) return `<dl class="mv-props">${rows}</dl>`;
      return `<div class="mv-data-group"><p class="mv-data-group-label">${escape(
        section.label,
      )}</p><dl class="mv-props">${rows}</dl></div>`;
    })
    .join("");
  const wrapped =
    sections[0]?.label !== undefined ? `<div class="mv-data-groups">${body}</div>` : body;
  return `<section class="mv-data mv-properties">${heading}${wrapped}</section>`;
}
