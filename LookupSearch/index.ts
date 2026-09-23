import * as React from 'react';
import { IInputs, IOutputs } from './generated/ManifestTypes';
import { ILookupStrings, IProps, LookupSearchControl } from './components/LookupSearchControl';
import {
    bareId,
    buildMembershipQuery,
    buildQuery,
    Candidate,
    MatchMode,
    parseColumnList,
    QueryColumns,
    toCandidates,
} from './components/search';
import {
    allowsBrowse,
    allowsSearch,
    needsRelationships,
    ParentState,
    readRelationships,
    Relationship,
    resolveParent,
} from './components/parent';

type LookupValue = ComponentFramework.LookupValue;

/** The parent column as one pass of `updateView` reads it. */
interface ParentReading {
    mapped: boolean;
    table: string;
    id: string | null;
    name: string;
}

/**
 * A virtual (React) field control bound to a `Lookup.Simple` column.
 *
 * Three things make this different from the template it started as, and all
 * three are about the platform rather than about React:
 *
 *  — **The value is an array.** A lookup's `raw` is `LookupValue[]`, empty
 *    rather than null when the column has no value, and it is cleared by
 *    writing `[]` back. `getOutputs` below is the only place that matters.
 *  — **The control does not know its own target table.** It asks the property
 *    for it, and then asks the platform which of that table's columns is the
 *    name — two calls that exist only in a model-driven app.
 *  — **Everything it reads is asynchronous**, so the async state lives in the
 *    React component and this class exposes promises to it. A virtual control
 *    has no way to make the platform re-render on its own; calling
 *    `notifyOutputChanged` to force one would push an unchanged value at the
 *    form and dirty it.
 */
export class LookupSearch implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private notifyOutputChanged!: () => void;
    private context!: ComponentFramework.Context<IInputs>;

    private selected: LookupValue | null = null;

    /**
     * The id of the last value the *platform* supplied, as opposed to the one
     * the user picked. Without this guard, `updateView` running after our own
     * `notifyOutputChanged` re-adopts the platform's value and discards the
     * selection that caused it.
     *
     * It compares ids rather than objects because every pass hands down a fresh
     * array holding a fresh object; identity says nothing here.
     */
    private lastIncomingId: string | null = null;

    /** The table the bound column points at, re-read on every pass. */
    private target = '';

    /**
     * The metadata lookup for one target table, kept as the promise rather than
     * its result so that concurrent searches share a single call. Keyed by
     * target so a re-bound control does not search the old table's columns.
     */
    private columns: { target: string; promise: Promise<Pick<QueryColumns, 'primaryId' | 'primaryName'> | null> } | null = null;

    /** The parent column as this pass reads it — see `readParent`. */
    private parent: ParentReading = { mapped: false, table: '', id: null, name: '' };

    /**
     * The parent id the last pass saw, and whether there has been a pass at
     * all. The first pass is the form loading, not the parent changing, so it
     * is never a reason to clear anything.
     */
    private lastParentId: string | null = null;
    private seenParent = false;

    /**
     * The searched table's many-to-one relationships, per table, kept as the
     * promise so a burst of typing shares one metadata read.
     */
    private relationships = new Map<string, Promise<Relationship[] | null>>();

    /** What the current parent allows, keyed like `parentKey`. */
    private parentState: { key: string; promise: Promise<ParentState> } | null = null;

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
    ): void {
        // No container: a virtual control never receives one.
        this.context = context;
        this.notifyOutputChanged = notifyOutputChanged;
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        this.context = context;

        const parameter = context.parameters.value;
        const incoming = parameter.raw?.[0] ?? null;
        const incomingId = incoming?.id ? bareId(incoming.id) : null;

        if (incomingId !== this.lastIncomingId) {
            this.lastIncomingId = incomingId;
            this.selected = incoming;
        }

        this.target = this.resolveTarget(parameter);
        this.readParent(context);

        // Field-level security is NOT the form's read-only state, and
        // conflating them is a real information bug: a user denied read access
        // gets an empty `raw`, indistinguishable from "no record selected"
        // unless `security.readable` is checked.
        const security = parameter.security;

        const disabled =
            context.mode.isControlDisabled
            || (security !== undefined && !security.editable);

        const props: IProps = {
            value: this.selected,
            entityType: this.target,
            placeholder: context.parameters.placeholder.raw ?? '',
            minimumCharacters: Math.max(1, context.parameters.minimumCharacters.raw ?? 2),
            allowBrowse: context.parameters.allowBrowse.raw !== false,
            visible: context.mode.isVisible,
            readable: security === undefined || security.readable,
            disabled,
            // The platform's own validation. Without somewhere to put it, a
            // failing business rule is silent inside a code component.
            errorMessage: parameter.error ? parameter.errorMessage : null,
            // The label the maker gave the field on this form is a better
            // accessible name than anything shipped in the .resx, which cannot
            // know what the field is called.
            label: context.mode.label,
            isRTL: context.userSettings.isRTL,
            // The host's own Fluent v9 theme when it offers one, so the control
            // follows a themed or dark environment instead of asserting a light
            // palette over it. Optional on the type, and absent in the test
            // harness — the component falls back.
            theme: context.fluentDesignLanguage?.tokenTheme,
            strings: this.readStrings(context),
            prepare: (): Promise<boolean> => this.prepare(),
            search: (term: string): Promise<Candidate[]> => this.search(term),
            browse: (): Promise<LookupValue | null> => this.browse(),
            parentKey: this.parentKey(),
            parent: (): Promise<ParentState> => this.currentParent(),
            // The platform's own lookup renders the selected record as a link
            // to it. `openForm` needs no <uses-feature>, so this costs the
            // maker no extra permission — but it is still absent on hosts
            // without navigation, and a link that does nothing is worse than
            // plain text.
            openRecord: typeof context.navigation?.openForm === 'function'
                ? (value: LookupValue): void => this.openRecord(value)
                : null,
            onChange: (next: LookupValue | null): void => {
                this.selected = next;
                this.notifyOutputChanged();
            },
        };

        return React.createElement(LookupSearchControl, props);
    }

    /**
     * A lookup is cleared with an empty array. Returning `null` or `undefined`
     * leaves the column at whatever it held, which reads as the Clear button
     * doing nothing.
     */
    public getOutputs(): IOutputs {
        return { value: this.selected ? [this.selected] : [] };
    }

    public destroy(): void {
        // Usually empty for a virtual control: React unmounts its own tree, and
        // anything added outside it in `init` would be released here.
    }

    // ---------------------------------------------------------------- platform

    /**
     * Which table the bound column points at.
     *
     * `getTargetEntityType()` is declared on `PropertyTypes.LookupProperty`, so
     * this compiles without a cast — but it is *called* defensively anyway. The
     * type is a claim about the type definitions, not about the host: PCFHub's
     * demo harness builds a generic property bag with no methods on it, and the
     * same is true of anything else that fakes a context.
     *
     * The fallback is the current value's own `entityType`, which is present
     * whenever the column has a value at all.
     */
    private resolveTarget(parameter: ComponentFramework.PropertyTypes.LookupProperty): string {
        if (typeof parameter.getTargetEntityType === 'function') {
            try {
                const target = parameter.getTargetEntityType();

                if (target) {
                    return target;
                }
            } catch {
                // Fall through: a host that declares the method and throws from
                // it is no different here from one that never had it.
            }
        }

        return parameter.raw?.[0]?.entityType ?? '';
    }

    /**
     * The parent column, re-read on every pass.
     *
     * **Mapped is decided by `type`, not by `raw`.** A parent picker the maker
     * left empty arrives as `{ type: null, raw: null, ... }` — measured on
     * pcf-address-autocomplete-azure, 2026-09-13 — while a mapped, empty lookup
     * has a type and `raw: []`. The generated `IInputs` types the property as
     * always there, which a form saved before 0.2.0 and PCFHub's demo harness
     * can both contradict, so its absence is read as unmapped too.
     */
    private readParent(context: ComponentFramework.Context<IInputs>): void {
        const parameter = context.parameters.parentValue as ComponentFramework.PropertyTypes.LookupProperty | undefined;
        const mapped = parameter !== undefined && parameter !== null
            && parameter.type !== null && Array.isArray(parameter.raw);
        const first = mapped ? parameter.raw[0] : undefined;

        this.parent = {
            mapped,
            table: mapped ? this.resolveTarget(parameter) : '',
            id: first?.id ? bareId(first.id) : null,
            name: first?.name ?? '',
        };

        const id = mapped ? this.parent.id : null;

        if (this.seenParent && id !== this.lastParentId && id !== null
            && context.parameters.onParentChange?.raw === 'clear') {
            void this.clearIfOrphaned(id);
        }

        this.seenParent = true;
        this.lastParentId = id;
    }

    /** Empty when nothing narrows the search; otherwise changes with anything that could. */
    private parentKey(): string {
        const { mapped, table, id } = this.parent;
        const named = (this.context.parameters.parentColumn?.raw ?? '').trim().toLowerCase();

        // A Linking column with nothing mapped to link: a state of its own,
        // settled without reading anything.
        if (!mapped && named !== '') {
            return `unbound|${named}`;
        }

        if (!needsRelationships(mapped, id)) {
            return '';
        }

        return [this.target, table, id, named].join('|');
    }

    private currentParent(): Promise<ParentState> {
        const key = this.parentKey();

        if (key === '') {
            return Promise.resolve({ kind: 'off' });
        }

        if (!this.parentState || this.parentState.key !== key) {
            const reading = this.parent;
            const parentColumn = this.context.parameters.parentColumn?.raw ?? null;

            this.parentState = {
                key,
                promise: needsRelationships(reading.mapped, reading.id)
                    ? this.relationshipsOf(this.target).then((relationships) =>
                        resolveParent({ ...reading, relationships, parentColumn }))
                    : Promise.resolve(resolveParent({ ...reading, relationships: [], parentColumn })),
            };
        }

        return this.parentState.promise;
    }

    private relationshipsOf(table: string): Promise<Relationship[] | null> {
        let pending = this.relationships.get(table);

        if (!pending) {
            pending = this.loadRelationships(table);
            this.relationships.set(table, pending);
        }

        return pending;
    }

    /**
     * The searched table's lookup columns and the tables they point at.
     *
     * A same-origin `fetch` from `page.getClientUrl()`, the way `pcf-tag-list`
     * and `pcf-chart-view` read theirs: `getEntityMetadata` answers about
     * attributes, not relationships. `context.page` is not in the typings and
     * is read defensively; without it this resolves null, which the caller
     * shows as "could not be read" rather than searching unfiltered.
     */
    private async loadRelationships(table: string): Promise<Relationship[] | null> {
        const clientUrl = this.clientUrl();

        if (clientUrl === null || typeof fetch !== 'function' || !table) {
            return null;
        }

        try {
            const response = await fetch(
                `${clientUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${table}')/ManyToOneRelationships`
                + '?$select=ReferencingAttribute,ReferencedEntity',
                {
                    method: 'GET',
                    headers: { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
                    credentials: 'same-origin',
                },
            );

            if (!response.ok) {
                return null;
            }

            return readRelationships(((await response.json()) as { value?: unknown } | null)?.value);
        } catch {
            return null;
        }
    }

    private clientUrl(): string | null {
        try {
            const page = (this.context as unknown as { page?: { getClientUrl?: () => string } }).page;
            const url = page?.getClientUrl?.();

            return typeof url === 'string' && url !== '' ? url.replace(/\/+$/, '') : null;
        } catch {
            // Canvas publishes `getClientUrl` and throws from it (pcf-data-table,
            // measured 2026-09-22).
            return null;
        }
    }

    /**
     * `onParentChange = clear`: empty the chosen record if it does not belong
     * to the new parent.
     *
     * Asked rather than assumed, so a record that still belongs — a parent
     * changed and changed back — is left alone. So is anything the check could
     * not settle: clearing a value because the network failed is worse than
     * keeping a stale one.
     */
    private async clearIfOrphaned(parentId: string): Promise<void> {
        const chosen = this.selected;

        if (!chosen?.id || typeof this.context.webAPI?.retrieveMultipleRecords !== 'function') {
            return;
        }

        try {
            const [state, metadata] = await Promise.all([this.currentParent(), this.metadataColumns()]);

            if (state.kind !== 'filtered' || !metadata) {
                return;
            }

            const answer = await this.context.webAPI.retrieveMultipleRecords(
                this.target,
                buildMembershipQuery(metadata.primaryId, chosen.id, state),
                1,
            );

            // Settled only if nothing moved while the check was in flight: a
            // second parent change, or the user choosing again.
            if (answer.entities.length === 0 && this.lastParentId === parentId && this.selected === chosen) {
                this.selected = null;
                this.notifyOutputChanged();
            }
        } catch {
            // Keep the value — see above.
        }
    }

    /** The view the maker configured on the form, for the Browse panel. */
    private resolveViewId(parameter: ComponentFramework.PropertyTypes.LookupProperty): string {
        if (typeof parameter.getViewId === 'function') {
            try {
                return parameter.getViewId() ?? '';
            } catch {
                return '';
            }
        }

        return '';
    }

    /**
     * Can this host actually search? Resolved once per target and reported to
     * the component, which disables the search box and says so rather than
     * offering one that returns nothing.
     *
     * Both feature checks are narrower than the types allow, deliberately:
     * `context.webAPI` and `context.utils` are typed as always present, and
     * with `required="false"` in the manifest that is exactly what they are
     * not.
     */
    private async prepare(): Promise<boolean> {
        if (!this.target || typeof this.context.webAPI?.retrieveMultipleRecords !== 'function') {
            return false;
        }

        return (await this.metadataColumns()) !== null;
    }

    private metadataColumns(): Promise<Pick<QueryColumns, 'primaryId' | 'primaryName'> | null> {
        const target = this.target;

        if (!this.columns || this.columns.target !== target) {
            this.columns = { target, promise: this.loadMetadataColumns(target) };
        }

        return this.columns.promise;
    }

    /**
     * The primary key and primary name columns of the target table.
     *
     * Read by name rather than by walking the object. `getEntityMetadata`
     * resolves with a *class instance* whose public surface is prototype
     * getters, and `Object.keys` does not enumerate those — code that iterates
     * it sees private fields and concludes the table has no columns.
     *
     * Model-driven only, so a rejection here is a host difference rather than a
     * bug, and it is reported as one.
     */
    private async loadMetadataColumns(
        target: string,
    ): Promise<Pick<QueryColumns, 'primaryId' | 'primaryName'> | null> {
        if (!target || typeof this.context.utils?.getEntityMetadata !== 'function') {
            return null;
        }

        try {
            const metadata = await this.context.utils.getEntityMetadata(target);
            const primaryId = String(metadata.PrimaryIdAttribute ?? '');
            const primaryName = String(metadata.PrimaryNameAttribute ?? '');

            return primaryId && primaryName ? { primaryId, primaryName } : null;
        } catch {
            return null;
        }
    }

    /**
     * One search. Errors are not swallowed: a 400 from a mistyped
     * `searchColumns` is the only signal the maker gets, and the component puts
     * its message on screen.
     */
    private async search(term: string): Promise<Candidate[]> {
        const [metadata, parent] = await Promise.all([this.metadataColumns(), this.currentParent()]);

        // The component does not search in these states; this is the second
        // lock on the same door, for a caller that does not ask first.
        if (!metadata || !allowsSearch(parent)) {
            return [];
        }

        const parameters = this.context.parameters;
        const secondary = (parameters.secondaryColumn.raw ?? '').trim().toLowerCase();

        const columns: QueryColumns = {
            ...metadata,
            secondaryColumn: parseColumnList(secondary)[0] ?? '',
            searchColumns: parseColumnList(parameters.searchColumns.raw),
        };

        // The union the manifest generates is a compile-time claim about a
        // runtime that can hand down anything, so narrow rather than trust it.
        const matchMode: MatchMode = parameters.matchMode.raw === 'contains' ? 'contains' : 'startsWith';
        const maxResults = Math.min(50, Math.max(1, parameters.maxResults.raw ?? 8));

        const response = await this.context.webAPI.retrieveMultipleRecords(
            this.target,
            buildQuery(columns, matchMode, term, parent.kind === 'filtered' ? parent : null),
            maxResults,
        );

        return toCandidates(response.entities, columns);
    }

    /**
     * The platform's own lookup panel, as the way out of a search that cannot
     * find it — a record the maker's search columns do not cover, or a host
     * where searching is unavailable entirely.
     *
     * `defaultViewId` is the view the maker configured on the form, so the
     * panel opens where the stock lookup would. PCF's `LookupOptions` has
     * neither `filters` nor `disableMru`; those exist only on the Client API's
     * version of this call.
     *
     * A cancelled panel resolves empty rather than rejecting, which is the same
     * shape as "picked nothing" and is treated as leaving the value alone.
     */
    private async browse(): Promise<LookupValue | null> {
        if (!this.target || typeof this.context.utils?.lookupObjects !== 'function') {
            return null;
        }

        // `LookupOptions` carries no `filters`, so the panel cannot be narrowed
        // to the parent. The component hides the button; this refuses too.
        if (!allowsBrowse(await this.currentParent())) {
            return null;
        }

        const options: ComponentFramework.UtilityApi.LookupOptions = {
            entityTypes: [this.target],
            allowMultiSelect: false,
        };

        const viewId = this.resolveViewId(this.context.parameters.value);

        if (viewId) {
            options.defaultViewId = viewId;
        }

        const picked = (await this.context.utils.lookupObjects(options))?.[0];

        // Braced and upper-case from the panel; bare and lower-case everywhere
        // else. Written back in the form the column itself hands down.
        return picked ? { ...picked, id: bareId(picked.id) } : null;
    }

    /**
     * Open the selected record, the way the stock lookup's link does.
     *
     * Failures are swallowed deliberately: the user asked to navigate, and if
     * the host refuses there is nothing for them to act on — unlike a failed
     * search, where the message names a column somebody has to fix.
     */
    private openRecord(value: LookupValue): void {
        const entityName = value.entityType ?? this.target;

        if (!entityName) {
            return;
        }

        void this.context.navigation.openForm({ entityName, entityId: value.id })
            .catch(() => undefined);
    }

    private readStrings(context: ComponentFramework.Context<IInputs>): ILookupStrings {
        const get = (key: string): string => context.resources.getString(key);

        return {
            fallbackLabel: get('LookupSearch_Name'),
            noAccess: get('LookupSearch_NoAccess'),
            browse: get('LookupSearch_Browse'),
            clear: get('LookupSearch_Clear'),
            searching: get('LookupSearch_Searching'),
            noMatches: get('LookupSearch_NoMatches'),
            typeMore: get('LookupSearch_TypeMore'),
            searchUnavailable: get('LookupSearch_SearchUnavailable'),
            noTarget: get('LookupSearch_NoTarget'),
            searchFailed: get('LookupSearch_SearchFailed'),
            filteredBy: get('LookupSearch_FilteredBy'),
            parentAmbiguous: get('LookupSearch_ParentAmbiguous'),
            parentNone: get('LookupSearch_ParentNone'),
            parentUnavailable: get('LookupSearch_ParentUnavailable'),
            parentUnbound: get('LookupSearch_ParentUnbound'),
        };
    }
}
