/**
 * Which records a cascading lookup may offer, decided with no `context` in it.
 *
 * The control is handed two facts by the platform — the parent column's table
 * and value — and has to find a third itself: which lookup column on the
 * searched table points at that parent. The platform does not say; the
 * searched table's `ManyToOneRelationships` does, and it can answer none, one
 * or several. `pcf-tag-list`'s `binding.ts` settles the same question for a
 * subgrid, and the rule is the same: more than one candidate is the maker's
 * decision, never the control's guess.
 */

import { bareId, isGuid, isLogicalName } from './search';

/** One row of the searched table's `ManyToOneRelationships`. */
export interface Relationship {
    /** The lookup column on the searched table: `ReferencingAttribute`. */
    column: string;
    /** The table it points at: `ReferencedEntity`. */
    target: string;
}

/**
 * What the search may do, and what the field says about it.
 *
 * Only `off` and `filtered` allow a search. The other three disable it rather
 * than falling back to searching everything, because an unfiltered list under
 * a filtered lookup offers exactly the records the maker set it up to exclude.
 */
export type ParentState =
    /** No parent mapped, or the parent is empty: search the whole table, Browse allowed. */
    | { kind: 'off' }
    | { kind: 'filtered'; column: string; id: string; name: string }
    /** Two or more columns point at the parent and the maker has not named one of them. */
    | { kind: 'ambiguous'; table: string; candidates: string[] }
    /** Nothing on the searched table points at the parent's table. */
    | { kind: 'none'; table: string }
    /** The relationships could not be read, or the parent is not something a query can hold. */
    | { kind: 'unavailable'; table: string }
    /**
     * A Linking column with no Filter by mapped. The maker meant to filter
     * and bound nothing to filter by — measured as the first mistake on the
     * test form, 2026-09-23, where it searched the whole table in silence.
     */
    | { kind: 'unbound' };

export interface ParentInput {
    /**
     * Whether the maker mapped the parent at all. An unmapped optional bound
     * property arrives with `type: null`; a mapped, empty one does not.
     */
    mapped: boolean;
    /** The parent column's table, from `getTargetEntityType()` or the value. */
    table: string;
    /** The parent record, or null when the parent column is empty. */
    id: string | null;
    name: string;
    /** The searched table's many-to-one relationships; null when they could not be read. */
    relationships: Relationship[] | null;
    /** The maker's `parentColumn`, for the ambiguous case. */
    parentColumn: string | null;
}

/**
 * A parent that is mapped and empty filters nothing, which is what the
 * platform's own "filter by related rows" does: an empty Account leaves the
 * Primary Contact lookup open to every contact. Narrowing to nothing instead
 * would leave a new record's lookup unusable until the parent is filled in.
 */
export function needsRelationships(mapped: boolean, id: string | null): boolean {
    return mapped && id !== null && id !== '';
}

export function resolveParent(input: ParentInput): ParentState {
    if (!input.mapped && (input.parentColumn ?? '').trim() !== '') {
        return { kind: 'unbound' };
    }

    if (!needsRelationships(input.mapped, input.id)) {
        return { kind: 'off' };
    }

    const table = input.table.toLowerCase();

    if (!table || !isGuid(input.id as string) || input.relationships === null) {
        return { kind: 'unavailable', table };
    }

    const candidates = [
        ...new Set(
            input.relationships
                .filter((row) => row.target.toLowerCase() === table && isLogicalName(row.column.toLowerCase()))
                .map((row) => row.column.toLowerCase()),
        ),
    ].sort();

    if (candidates.length === 0) {
        return { kind: 'none', table };
    }

    const named = (input.parentColumn ?? '').trim().toLowerCase();

    // A named column is honoured only when it is one of the candidates. A name
    // that points somewhere else would filter on a column that is not the
    // parent, which is a quieter version of not filtering at all.
    const column = named !== ''
        ? candidates.find((candidate) => candidate === named)
        : candidates.length === 1 ? candidates[0] : undefined;

    if (column === undefined) {
        return { kind: 'ambiguous', table, candidates };
    }

    return { kind: 'filtered', column, id: bareId(input.id as string), name: input.name };
}

/** Whether a search may run in this state. */
export function allowsSearch(state: ParentState): boolean {
    return state.kind === 'off' || state.kind === 'filtered';
}

/**
 * Whether Browse may be offered. PCF's `lookupObjects` takes no `filters`, so
 * the panel it opens cannot be narrowed to the parent — offering it while a
 * filter is active would hand the user every record the search withholds.
 */
export function allowsBrowse(state: ParentState): boolean {
    return state.kind === 'off';
}

/** Rows of a `ManyToOneRelationships` answer, with anything malformed dropped. */
export function readRelationships(value: unknown): Relationship[] | null {
    if (!Array.isArray(value)) {
        return null;
    }

    const rows: Relationship[] = [];

    for (const row of value) {
        const column = (row as { ReferencingAttribute?: unknown })?.ReferencingAttribute;
        const target = (row as { ReferencedEntity?: unknown })?.ReferencedEntity;

        if (typeof column === 'string' && typeof target === 'string') {
            rows.push({ column, target });
        }
    }

    return rows;
}
