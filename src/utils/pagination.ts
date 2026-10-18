/**
 * The single owner of pagination arithmetic.
 *
 * `DirectorySection`, `AttendanceSection` and `PayrollSection` each held their own
 * `currentPage` state and each computed `totalPages`, the slice bounds and the
 * "Showing X - Y of Z" header inline. They drifted: the page was clamped only at click
 * time inside the Prev/Next handlers, so a page left at 8 by a 200-record roster survived
 * a search down to 3 matches. `employees.slice(175, 200)` on a 3-element array is `[]`, the
 * table reported "No staff records found" while three matching records existed, and the
 * header read "Showing 176 - 3 of 3".
 *
 * Every exported function here is total and total *safely*: a stale, out-of-range or
 * non-finite input produces a correct label rather than `NaN` or an inverted range. That
 * is what lets the callers pass whatever page they are holding without re-deriving it.
 */

/** Coerces a count or index input to a safe non-negative integer, or 0. */
const safeCount = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

/**
 * Coerces a page-size input to a safe positive integer. A size below 1 would make
 * `Math.ceil(total / size)` Infinity and put `NaN` in the header.
 */
const safePageSize = (value: number): number =>
  Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;

/**
 * Brings a page index into `[1, totalPages]`.
 *
 * There is always at least one page, even for an empty dataset — that is what lets a
 * disabled Prev button mean "you are on the first page" rather than a special case.
 */
export function clampPage(currentPage: number, totalPages: number): number {
  const pages = Math.max(1, safeCount(totalPages));
  const page = Math.max(1, safeCount(currentPage));
  return Math.min(page, pages);
}

/** Number of pages `totalItems` occupies at `pageSize` per page. Always >= 1. */
export function totalPagesFor(totalItems: number, pageSize: number): number {
  const size = safePageSize(pageSize);
  return Math.max(1, Math.ceil(safeCount(totalItems) / size));
}

/**
 * The "Showing X - Y of Z" header for a page window.
 *
 * Clamps internally, so passing a stale `currentPage` reports the range that is actually
 * on screen instead of an impossible one. An empty dataset reports `No results` rather
 * than the `Showing 0 - 0 of 0` the three sections rendered before.
 */
export function pageRangeLabel(currentPage: number, pageSize: number, totalItems: number): string {
  const total = safeCount(totalItems);
  if (total === 0) return 'No results';

  const size = safePageSize(pageSize);
  const page = clampPage(currentPage, totalPagesFor(total, size));
  const start = (page - 1) * size + 1;
  const end = Math.min(page * size, total);

  return `Showing ${start} - ${end} of ${total}`;
}

/**
 * The `<caption>` for a data table: its accessible name, and what a screen reader needs
 * to know about the window it is holding.
 *
 * A caption is the only element in a `<table>` that names the table for assistive tech —
 * without one, a 25x11 payroll table is announced as an unlabelled grid of numbers with
 * no indication of which header a cell belongs to. `shown` is the number of rows rendered
 * on this page; `page`/`pages` are the same window the header describes. An unpaginated
 * table passes `1`/`1`.
 */
export function describeTable(
  title: string,
  shown: number,
  total: number,
  page: number,
  pages: number,
): string {
  const totalRows = safeCount(total);
  if (totalRows === 0) return `${title}. No records to display.`;

  const totalPages = Math.max(1, safeCount(pages));
  const safePage = clampPage(page, totalPages);
  const shownRows = Math.min(safeCount(shown), totalRows);

  return `${title}. Page ${safePage} of ${totalPages}, showing ${shownRows} of ${totalRows} records.`;
}

/**
 * Names a horizontal scroll region for assistive tech.
 *
 * `.omni-table-wrap` is `overflow-x: auto`, which makes it scrollable by pointer and
 * unscrollable by keyboard: with an 11-column table the right-hand columns are
 * unreachable without a mouse (WCAG 2.1.1). A `region` role with a name is what tells a
 * screen reader the focusable scroll container exists.
 */
export function scrollRegionLabel(title: string): string {
  return `${title} table, horizontally scrollable`;
}