/**
 * Query building and response mapping, with no `context` anywhere in it.
 *
 * This is split out for the same reason `pcf-choices-picker` splits `resolve.ts`
 * out: it is the part that is easy to get quietly wrong, and reading it should
 * not require knowing anything about the control's lifecycle.
 */

export type MatchMode = 'startsWith' | 'contains';

/** The columns a query needs, from two different places. */
export interface QueryColumns {
    /** The target table's primary key, from entity metadata. */
    primaryId: string;
    /** The target table's primary name column, from entity metadata. */
    primaryName: string;
    /** A column shown under each result, from the maker. May be empty. */
    secondaryColumn: string;
    /** Extra columns to match against, from the maker. May be empty. */
    searchColumns: string[];
}

export interface Candidate {
    id: string;
    name: string;
    secondary: string;
}

/**
 * Dataverse logical names are lowercase, and start with a letter. Anything else
 * cannot name a real column, so it can only reach the server as a malformed
 * query — or, if it contains `&` or `$`, as a *different* query than the one
 * this code meant to send.
 *
 * Both `secondaryColumn` and `searchColumns` are free text a maker types, and
 * both are interpolated into a URL. This is the boundary where that stops.
 */
const LOGICAL_NAME = /^[a-z][a-z0-9_]*$/;

export function isLogicalName(value: string): boolean {
    return LOGICAL_NAME.test(value);
}

/**
 * Split a comma-separated list of logical names.
 *
 * Entries that cannot be a logical name are dropped rather than passed on: they
 * would never match a column, and letting them through is the injection above.
 * A *plausible* typo — `emailadress1` — is shaped like a logical name and does
 * go to the server, which answers with a 400 the control shows the user. That
 * is the case worth surfacing, and it is the one that survives this filter.
 */
export function parseColumnList(raw: string | null): string[] {
    if (!raw) {
        return [];
    }

    const seen = new Set<string>();

    for (const entry of raw.split(',')) {
        const name = entry.trim().toLowerCase();

        if (isLogicalName(name)) {
            seen.add(name);
        }
    }

    return [...seen];
}

/**
 * Escape a user-typed term for use inside an OData string literal.
 *
 * Two separate rules, and each is silently wrong on its own:
 *
 *  1. A single quote inside a literal is written as two. Without this, a search
 *     for `O'Brien` closes the literal early and the request is rejected.
 *  2. The query string as a whole must be URL encoded — Microsoft's
 *     `retrieveMultipleRecords` reference says so in as many words. Without
 *     this, a term containing `&`, `+`, `#` or `?` changes what the rest of the
 *     query means rather than what it matches.
 *
 * The order matters. `encodeURIComponent` leaves `'` alone (it is an unreserved
 * mark), so doubling first and encoding second keeps the `''` pair intact while
 * still encoding everything else.
 */
export function escapeTerm(term: string): string {
    return encodeURIComponent(term.replace(/'/g, "''"));
}

/**
 * A GUID the way the Web API writes one: no braces, lower case.
 *
 * The platform does not agree with itself. `utils.lookupObjects` hands a pick
 * back braced and upper-case (`{8FE84297-…}`, measured 2026-09-11), while a
 * lookup's `raw` and every Web API row carry the bare lower-case form. Two ids
 * for one record compare unequal, so everything compared or sent goes through
 * here first. Found by moving this control onto the template's rig, whose
 * `lookupObjects` answers in the measured shape; the old one answered in the
 * shape the control expected.
 */
export function bareId(id: string): string {
    return id.replace(/^\{|\}$/g, '').toLowerCase();
}

const unique = (names: string[]): string[] => [...new Set(names.filter(Boolean))];

/**
 * Build the `options` string for `retrieveMultipleRecords`.
 *
 * Note what is *not* here: `$top`. The result limit goes through the method's
 * third argument, `maxPageSize`, which is the documented way to page a PCF
 * retrieve — `$top` and `maxPageSize` do not combine.
 */
export function buildQuery(columns: QueryColumns, matchMode: MatchMode, term: string): string {
    const select = unique([columns.primaryId, columns.primaryName, columns.secondaryColumn]);
    const match = unique([columns.primaryName, ...columns.searchColumns]);

    const fn = matchMode === 'contains' ? 'contains' : 'startswith';
    const literal = escapeTerm(term);
    const clauses = match.map((column) => `${fn}(${column},'${literal}')`);

    const filter = clauses.length > 1 ? `(${clauses.join(' or ')})` : clauses.join('');

    // `%20` rather than a literal space: the whole options string is meant to be
    // encoded, and this is the only place the builder produces one.
    return `?$select=${select.join(',')}&$filter=${filter}&$orderby=${columns.primaryName}%20asc`;
}

/**
 * What to show the user when a platform call rejects.
 *
 * **`context.webAPI` does not reject with an `Error`.** It rejects with a plain
 * object carrying `errorCode` and `message`, exactly as the Client API's
 * `errorCallback` documents — so the usual
 * `error instanceof Error ? error.message : String(error)` falls through to
 * `String({…})` and renders the string `[object Object]` under the control.
 * That is not a cosmetic bug: it replaces the only account of what went wrong
 * with a message that says nothing, and it is the shape *every* webAPI failure
 * arrives in, so it is the message every user would have seen.
 *
 * Observed on a real model-driven form, typing into a contact lookup.
 */
export function describeError(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === 'object' && error !== null) {
        const message = (error as { message?: unknown }).message;

        if (typeof message === 'string' && message !== '') {
            return message;
        }
    }

    if (typeof error === 'string' && error !== '') {
        return error;
    }

    return '';
}

/**
 * Map retrieved records onto what the list renders.
 *
 * The Web API returns raw values, so a secondary column that is a choice, a
 * lookup or a date arrives as a number, a GUID or an ISO string. The formatted
 * value is available beside it under an annotation key, and using it is the
 * difference between a subtitle reading "Contoso Ltd" and one reading
 * "b2f1…-9c" — so prefer the annotation and fall back to the raw value.
 */
const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

export function toCandidates(
    entities: ComponentFramework.WebApi.Entity[],
    columns: QueryColumns,
): Candidate[] {
    const candidates: Candidate[] = [];

    for (const entity of entities) {
        const id = entity[columns.primaryId];

        // A record with no primary key cannot be written back to a lookup, so
        // there is nothing useful to show for it.
        if (typeof id !== 'string' || id === '') {
            continue;
        }

        const secondary = columns.secondaryColumn
            ? entity[`${columns.secondaryColumn}${FORMATTED}`] ?? entity[columns.secondaryColumn]
            : null;

        candidates.push({
            id,
            name: String(entity[columns.primaryName] ?? ''),
            secondary: secondary === null || secondary === undefined ? '' : String(secondary),
        });
    }

    return candidates;
}
