/**
 * Dropdown mode: a view's rows as the whole list, with no `context` in it.
 *
 * Split out for the reason `search.ts` is: it is the part that is easy to get
 * quietly wrong, and every function here is asserted on the exact text it
 * produces by `dev/smoke.js`.
 *
 * **The view already knows which records it means.** The request this answers
 * (PCF Gallery's most-voted topic, 30 votes) is reference data — countries,
 * categories — where *retiring* a value should take it out of the list. A
 * lookup view already does that: the table's default one filters
 * `statecode eq 0` and orders by name (measured on contact, probe 0.2.9 P2).
 * So the list is that view's own FetchXML with its columns swapped for the
 * three this control renders, and nothing composed from scratch — the same
 * idea as `lib/view-aggregate`, without the aggregate.
 */

import { isLogicalName, parentFilterXml, rootEntityOf } from '../lib/view-aggregate/fetchXml';
import { bareId, Candidate, Constraint, isGuid, QueryColumns } from './search';

/** The most rows a dropdown lists, whatever the maker sets. */
export const LIST_CEILING = 500;

/** What `dropdownLimit` means when the maker leaves it empty. */
export const LIST_DEFAULT = 100;

export function clampLimit(raw: number | null | undefined): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return LIST_DEFAULT;
    }

    return Math.min(LIST_CEILING, Math.max(1, Math.floor(raw)));
}

/** Which view a list came from, so the docs and the suite can say which. */
export type ViewSource = 'field' | 'lookup';

/** What the list resolves with. `unavailable` turns the field back into the type-ahead. */
export type ListResult =
    | { kind: 'rows'; source: ViewSource; candidates: Candidate[]; truncated: boolean }
    | { kind: 'unavailable' };

/**
 * The view's FetchXML, rewritten to list its rows.
 *
 *  - **Every `<attribute>` goes, at every depth**, and `<all-attributes>` with
 *    them: the list needs three columns, and a link-entity's attributes come
 *    back aliased under names nothing here reads. A link-entity left empty
 *    still runs (P3).
 *  - **`<order>` stays.** The view's sort is the maker's order, and it is the
 *    server's collation — case-insensitive — which a JavaScript sort would
 *    disagree with on ties of case (P3). So nothing downstream re-sorts.
 *  - **`<filter>` and `<link-entity>` stay** as written: the retired-values
 *    filter rides along without this control understanding it.
 *  - **`count` is the limit plus one.** One row more than the limit coming back
 *    *is* "there are more", with no annotation to read (P3: `count="6"`
 *    answered 6 rows and `morerecords: true`). `top` and `page` go, because
 *    FetchXML refuses `top` beside `count` and a page number would skip rows.
 *  - **The parent is a second sibling `<filter>`**, which FetchXML ANDs with
 *    the view's own (P5).
 *
 * `null` when the view is not this table's — a view id that resolves to
 * another table lists nothing rather than the wrong records.
 */
export function listFetchXml(
    viewXml: string,
    columns: QueryColumns,
    target: string,
    limit: number,
    constraint: Constraint | null = null,
): string | null {
    const clean = viewXml
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<attribute\b[^>]*\/>/g, '')
        .replace(/<attribute\b[^>]*>[\s\S]*?<\/attribute>/g, '')
        .replace(/<all-attributes\s*\/>/g, '');

    if (rootEntityOf(clean) !== target.toLowerCase()) {
        return null;
    }

    const names = [...new Set([columns.primaryId, columns.primaryName, columns.secondaryColumn].filter(Boolean))];

    if (!names.every(isLogicalName)) {
        return null;
    }

    const attributes = names.map((name) => `<attribute name='${name}'/>`).join('');
    const parent = constraint ? parentCondition(constraint) : '';

    const fetch = clean.replace(/<fetch\b([^>]*?)(\/?)>/, (_whole, attrs: string, selfClosing: string) =>
        `<fetch${attrs.replace(/\s(count|top|page)\s*=\s*(['"])[^'"]*\2/g, '')} count='${clampLimit(limit) + 1}'${selfClosing}>`);

    return fetch.replace(/<entity\b[^>]*>/, (open) => `${open}${attributes}${parent}`);
}

function parentCondition(constraint: Constraint): string {
    if (!isLogicalName(constraint.column) || !isGuid(constraint.id)) {
        throw new Error(`Refusing to filter on ${constraint.column} = ${constraint.id}.`);
    }

    return parentFilterXml(constraint.column, bareId(constraint.id));
}

/**
 * The options string for `retrieveMultipleRecords`.
 *
 * **Encoded**, unlike `lib/view-aggregate`'s `queryString`, which sends its
 * own generated XML raw. A maker's view can carry `&` (as `&amp;`), `#` or
 * `+` inside a condition value, and raw in a query string the first would end
 * the parameter and the second the URL. The platform accepts both forms
 * (measured 2026-09-17 and 2026-09-20, `fetchXml.ts`), so the safe one costs
 * nothing.
 */
export const listQuery = (xml: string): string => `?fetchXml=${encodeURIComponent(xml)}`;

/** The rows as the list renders them, and whether the view held more. */
export function readList(candidates: Candidate[], limit: number): { candidates: Candidate[]; truncated: boolean } {
    const cap = clampLimit(limit);

    return { candidates: candidates.slice(0, cap), truncated: candidates.length > cap };
}

/**
 * Narrow the loaded rows to what has been typed, **in the order they came**.
 *
 * Matches the name or the second line, anywhere, ignoring case — a dropdown of
 * forty countries filtered by "land" should offer Finland, Iceland and
 * Poland. Nothing is sent: the list is already all there is.
 */
export function filterLoaded(candidates: Candidate[], typed: string): Candidate[] {
    const term = typed.trim().toLocaleLowerCase();

    if (term === '') {
        return candidates;
    }

    return candidates.filter((c) =>
        c.name.toLocaleLowerCase().includes(term) || c.secondary.toLocaleLowerCase().includes(term));
}

/**
 * The table's default lookup view, as the options for one `savedquery` read.
 *
 * `querytype eq 64` is the lookup view; `isdefault` picks the one a lookup
 * opens with. Measured on contact: exactly one row, *Contacts Lookup View*
 * (P2). The table name is checked before it is interpolated, like every
 * other name that reaches a URL here, and the filter is encoded for the
 * reason `search.ts` encodes its own: the options string is meant to be.
 */
export function defaultLookupViewQuery(target: string): string | null {
    if (!isLogicalName(target)) {
        return null;
    }

    const filter = encodeURIComponent(`returnedtypecode eq '${target}' and querytype eq 64 and isdefault eq true`);

    return `?$select=savedqueryid,fetchxml&$filter=${filter}`;
}
