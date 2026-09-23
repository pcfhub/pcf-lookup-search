import * as React from 'react';
import {
    Combobox,
    FluentProvider,
    Option,
    Spinner,
    webLightTheme,
} from '@fluentui/react-components';
import { Candidate, describeError } from './search';
import { allowsBrowse, allowsSearch, ParentState } from './parent';

type LookupValue = ComponentFramework.LookupValue;

export interface ILookupStrings {
    fallbackLabel: string;
    noAccess: string;
    browse: string;
    clear: string;
    searching: string;
    noMatches: string;
    /** Carries a `{0}` for the minimum character count. */
    typeMore: string;
    searchUnavailable: string;
    noTarget: string;
    searchFailed: string;
    /** Carries a `{0}` for the parent record's name. */
    filteredBy: string;
    /** Carries `{0}` for the parent's table and `{1}` for the candidate columns. */
    parentAmbiguous: string;
    /** Carries a `{0}` for the parent's table. */
    parentNone: string;
    /** Carries a `{0}` for the parent's table. */
    parentUnavailable: string;
}

export interface IProps {
    value: LookupValue | null;
    /** The target table. Empty when the control is not on a lookup column. */
    entityType: string;
    placeholder: string;
    minimumCharacters: number;
    allowBrowse: boolean;
    visible: boolean;
    readable: boolean;
    disabled: boolean;
    errorMessage: string | null;
    label: string;
    isRTL: boolean;
    theme: ComponentFramework.Theme | undefined;
    strings: ILookupStrings;
    /** Resolves false when this host cannot search — see `index.ts`. */
    prepare: () => Promise<boolean>;
    search: (term: string) => Promise<Candidate[]>;
    browse: () => Promise<LookupValue | null>;
    /**
     * Changes whenever the parent that narrows the search does, and is empty
     * when nothing narrows it — no parent mapped, or the parent is empty. The
     * effect below keys on it, because `parent` is a fresh closure per render.
     */
    parentKey: string;
    /** What the parent allows — see `parent.ts`. Called only for a non-empty key. */
    parent: () => Promise<ParentState>;
    /** null where the host offers no navigation, which makes the chip static. */
    openRecord: ((value: LookupValue) => void) | null;
    onChange: (next: LookupValue | null) => void;
}

/** Long enough that a fast typist sends one request instead of eight. */
const DEBOUNCE_MS = 300;

type Status = 'idle' | 'typeMore' | 'searching' | 'noMatches' | 'results';

const format = (template: string, value: string, second = ''): string =>
    template.split('{0}').join(value).split('{1}').join(second);

/*
 * A form can carry two of these — a primary contact and a parent account is the
 * ordinary case — and a fixed id would point both `aria-describedby`s at the
 * first control's status text. React 16 has no `useId`, so this is the
 * equivalent: one per mounted instance, assigned once.
 */
let instances = 0;

/*
 * Inline SVG rather than `@fluentui/react-icons`, for all three glyphs below.
 *
 * The icon package is not a platform library, so importing from it bundles the
 * package's own runtime alongside the shapes — for markup that is eight lines
 * long. `currentColor` is what makes them follow the host theme, so nothing
 * here states a colour.
 *
 * The magnifier is mirrored, and deliberately so. The usual search glyph —
 * Fluent's included — puts the lens at the upper left with the handle running
 * down to the right. The lookup button in a model-driven form is the other way
 * round: lens upper right, handle down to the left. That is the kind of small
 * thing that leaves a control looking almost right, so the transform flips the
 * standard path within its own viewBox rather than shipping a second one.
 */
const SearchGlyph = (): React.ReactElement => (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path
            transform="translate(20 0) scale(-1 1)"
            d="M8.5 3a5.5 5.5 0 0 1 4.39 8.83l4.14 4.14a.75.75 0 0 1-1.06 1.06l-4.14-4.14A5.5 5.5 0 1 1 8.5 3Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
            fill="currentColor"
        />
    </svg>
);

const DismissGlyph = (): React.ReactElement => (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path
            d="M2.28 2.28a.75.75 0 0 1 1.06 0L6 4.94l2.66-2.66a.75.75 0 1 1 1.06 1.06L7.06 6l2.66 2.66a.75.75 0 0 1-1.06 1.06L6 7.06 3.34 9.72a.75.75 0 0 1-1.06-1.06L4.94 6 2.28 3.34a.75.75 0 0 1 0-1.06Z"
            fill="currentColor"
        />
    </svg>
);

const RecordGlyph = (): React.ReactElement => (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" />
        <path d="M5 6h6M5 8.5h6M5 11h3.5" stroke="currentColor" strokeLinecap="round" />
    </svg>
);

/**
 * Typing state, results and the open/closed popup all live here rather than on
 * the control class.
 *
 * On a real form either would work, because the platform re-renders after
 * `notifyOutputChanged()`. PCFHub's demo harness does not: its
 * `notifyOutputChanged` posts the outputs to the parent window and neither
 * re-renders nor writes the value back. A component that rendered straight from
 * props would therefore look dead in the published demo — every selection
 * accepted, nothing changing.
 *
 * The layout follows the platform's own lookup: one bordered field holding
 * either the search box or the selected record as a chip, with the actions
 * inside that border rather than beside it.
 */
export function LookupSearchControl(props: IProps): React.ReactElement | null {
    const { strings } = props;

    const input = React.useRef<HTMLInputElement>(null);
    const restoreFocus = React.useRef(false);
    const statusId = React.useRef('');

    /*
     * The field, held as state rather than a ref because the dropdown has to be
     * positioned against it and a ref's assignment does not re-render.
     *
     * Fluent anchors and sizes the listbox to the Combobox, which here is only
     * part of the field — the browse button sits beside it. Left alone, the
     * dropdown comes out exactly one button narrower than the control it
     * belongs to. A callback ref costs one extra render at mount, long before
     * anything can open.
     */
    const [fieldEl, setFieldEl] = React.useState<HTMLDivElement | null>(null);

    if (statusId.current === '') {
        instances += 1;
        statusId.current = `LookupSearch-status-${instances}`;
    }

    const [selected, setSelected] = React.useState<LookupValue | null>(props.value);
    const [query, setQuery] = React.useState('');
    const [candidates, setCandidates] = React.useState<Candidate[]>([]);
    const [status, setStatus] = React.useState<Status>('idle');
    const [open, setOpen] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);

    /** null while the host is still being asked whether it can search. */
    const [canSearch, setCanSearch] = React.useState<boolean | null>(null);

    /**
     * What the parent allows; null while its relationships are being read.
     * Nothing narrows an empty key, so that case is settled without asking.
     */
    const [parent, setParent] = React.useState<ParentState | null>(
        props.parentKey === '' ? { kind: 'off' } : null,
    );

    // Resync when the *platform* hands down a genuinely different record, so a
    // form-driven change still wins over local state. Keyed on the record's id
    // rather than the object, which is new on every pass.
    React.useEffect(() => {
        setSelected(props.value);
        setQuery('');
        setCandidates([]);
        setStatus('idle');
        setOpen(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.value?.id]);

    // Clearing swaps the chip out for the search box, so the field that should
    // take focus does not exist until after this render.
    React.useEffect(() => {
        if (restoreFocus.current && selected === null) {
            restoreFocus.current = false;
            input.current?.focus();
        }
    }, [selected]);

    // Ask once per target whether searching is possible here. `prepare` is a
    // fresh closure on every render, so the target is the dependency that
    // actually means something.
    React.useEffect(() => {
        let live = true;

        props.prepare().then(
            (ready) => {
                if (live) {
                    setCanSearch(ready);
                }
            },
            () => {
                if (live) {
                    setCanSearch(false);
                }
            },
        );

        return () => {
            live = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.entityType]);

    // Re-read what the parent allows whenever it changes. The list is cleared
    // with it: rows found under the old parent are not choosable under the new.
    React.useEffect(() => {
        setCandidates([]);
        setOpen(false);

        if (props.parentKey === '') {
            setParent({ kind: 'off' });
            return;
        }

        let live = true;
        setParent(null);

        props.parent().then(
            (state) => {
                if (live) {
                    setParent(state);
                }
            },
            () => {
                if (live) {
                    setParent({ kind: 'unavailable', table: '' });
                }
            },
        );

        return () => {
            live = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.parentKey]);

    const parentAllowsSearch = parent !== null && allowsSearch(parent);

    // The search itself: debounced, and guarded by the effect's own lifetime.
    //
    // `live` is what makes a slow answer harmless. Each keystroke re-runs this
    // effect, whose cleanup retires the previous run — so an earlier request
    // that lands after a later one cannot repaint the list, and neither can one
    // that lands after the control is gone. `context.webAPI` returns a bare
    // promise with nothing to abort, so retiring the *handler* is the only
    // cancellation available.
    React.useEffect(() => {
        if (canSearch !== true || !parentAllowsSearch || props.disabled || selected !== null) {
            return;
        }

        const term = query.trim();

        /*
         * Every `setOpen` below reads "is there something to show", not "are
         * there results".
         *
         * Since the messages moved into the dropdown, closing it is how they get
         * hidden — and the message most worth showing is the one that explains
         * an *empty* result. Gating the popup on `rows.length > 0` left a search
         * that found nothing looking like a search that never finished, until
         * the user clicked the field and reopened it.
         *
         * The rendered `open` prop is still ANDed with having content, so
         * setting this true with nothing to say stays closed anyway.
         */
        if (term.length < props.minimumCharacters) {
            setCandidates([]);
            setOpen(term.length > 0);
            setFailure(null);
            setStatus(term.length === 0 ? 'idle' : 'typeMore');
            return;
        }

        let live = true;
        setStatus('searching');
        setFailure(null);
        // Not left to Fluent's own open-on-type: a value pasted straight past
        // the minimum never passes through the branch above.
        setOpen(true);

        const timer = window.setTimeout(() => {
            props.search(term).then(
                (rows) => {
                    if (!live) {
                        return;
                    }

                    setCandidates(rows);
                    setStatus(rows.length > 0 ? 'results' : 'noMatches');
                    // Both outcomes have something in the dropdown: the rows,
                    // or the line saying there were none.
                    setOpen(true);
                },
                (error: unknown) => {
                    if (!live) {
                        return;
                    }

                    setCandidates([]);
                    // The one case that genuinely closes it: a failure is not a
                    // result, and it is rendered under the field rather than in
                    // a dropdown left open over nothing.
                    setOpen(false);
                    setStatus('idle');
                    // The platform's message is the only account of a mistyped
                    // search column the maker will ever see, and it does not
                    // arrive as an Error — see `describeError`.
                    setFailure(describeError(error) || strings.searchFailed);
                },
            );
        }, DEBOUNCE_MS);

        return () => {
            live = false;
            window.clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, canSearch, parentAllowsSearch, props.parentKey, selected, props.disabled, props.minimumCharacters]);

    const commit = (next: LookupValue | null): void => {
        restoreFocus.current = next === null;

        setSelected(next);
        setQuery('');
        setCandidates([]);
        setStatus('idle');
        setOpen(false);
        setFailure(null);
        props.onChange(next);
    };

    // Canvas relies on this; a model-driven form hides the section itself, so
    // honouring it costs a line and covers both hosts.
    if (!props.visible) {
        return null;
    }

    // A user denied read access must not be shown an empty field, which reads
    // as "no record selected" rather than as "not allowed to see it".
    if (!props.readable) {
        return <p className="LookupSearch-message">{strings.noAccess}</p>;
    }

    const onSelect = (id: string | undefined): void => {
        const candidate = candidates.find((row) => row.id === id);

        if (candidate) {
            commit({ id: candidate.id, name: candidate.name, entityType: props.entityType });
        }
    };

    const onBrowse = (): void => {
        props.browse().then(
            (picked) => {
                if (picked) {
                    commit(picked);
                }
            },
            (error: unknown) => setFailure(describeError(error) || strings.searchFailed),
        );
    };

    /*
     * Two kinds of message, and they belong in two different places.
     *
     * Anything about the *search* — how much more to type, that a request is in
     * flight, that nothing matched — goes inside the dropdown, where the
     * platform's own lookup puts "No records found". It is transient, it is
     * about the list, and under the field it reads as a fault in the control.
     *
     * Anything about the control's *state* — no target column, no search on
     * this host, a failing business rule, a rejected query — stays under the
     * field. It persists, it is not about the list, and there may be no
     * dropdown open to put it in.
     */
    const popupMessage = (): string => {
        if (selected !== null || canSearch !== true || !parentAllowsSearch) {
            return '';
        }

        switch (status) {
            case 'searching':
                return strings.searching;
            case 'noMatches':
                return strings.noMatches;
            case 'typeMore':
                return format(strings.typeMore, String(props.minimumCharacters));
            default:
                return '';
        }
    };

    const fieldMessage = (): string => {
        if (!props.entityType) {
            return strings.noTarget;
        }

        // A parent the control cannot filter by is a configuration problem the
        // maker has to fix, so it is said whether or not a record is chosen.
        switch (parent?.kind) {
            case 'ambiguous':
                return format(strings.parentAmbiguous, parent.table, parent.candidates.join(', '));
            case 'none':
                return format(strings.parentNone, parent.table);
            case 'unavailable':
                return format(strings.parentUnavailable, parent.table);
            default:
                break;
        }

        return selected === null && canSearch === false ? strings.searchUnavailable : '';
    };

    // Said only while choosing: once a record is chosen the filter has nothing
    // left to explain.
    const hint = parent?.kind === 'filtered' && selected === null && canSearch === true
        ? format(strings.filteredBy, parent.name)
        : '';

    const popupText = popupMessage();
    const invalid = props.errorMessage !== null || failure !== null;
    const searchable = canSearch === true && parentAllowsSearch && !props.disabled;
    // Hidden while anything narrows the search, and while that is still being
    // worked out: the panel cannot be narrowed, so it would offer every record
    // the search withholds.
    const browsable = props.allowBrowse && props.entityType !== '' && !props.disabled
        && parent !== null && allowsBrowse(parent);
    const name = selected?.name ?? '';

    const field = [
        'LookupSearch-field',
        props.disabled ? 'LookupSearch-field--disabled' : '',
        invalid ? 'LookupSearch-field--invalid' : '',
        selected !== null ? 'LookupSearch-field--filled' : '',
    ].filter(Boolean).join(' ');

    return (
        <FluentProvider
            className="LookupSearch"
            theme={props.theme ?? webLightTheme}
            dir={props.isRTL ? 'rtl' : 'ltr'}
        >
            <div className={field} ref={setFieldEl}>
                {selected !== null ? (
                    <span className="LookupSearch-chip">
                        <span className="LookupSearch-chip-icon">
                            <RecordGlyph />
                        </span>

                        {props.openRecord !== null && !props.disabled ? (
                            <button
                                type="button"
                                className="LookupSearch-chip-name LookupSearch-chip-name--link"
                                onClick={() => props.openRecord?.(selected)}
                            >
                                {name}
                            </button>
                        ) : (
                            <span className="LookupSearch-chip-name">{name}</span>
                        )}

                        {!props.disabled && (
                            <button
                                type="button"
                                className="LookupSearch-action LookupSearch-action--remove"
                                aria-label={`${strings.clear} ${name}`.trim()}
                                title={strings.clear}
                                onClick={() => commit(null)}
                            >
                                <DismissGlyph />
                            </button>
                        )}
                    </span>
                ) : (
                    <Combobox
                        ref={input}
                        className="LookupSearch-combobox"
                        freeform
                        // The chevron is the wrong affordance here: this list
                        // has nothing in it until something is typed. The
                        // magnifier below is what a lookup offers instead.
                        expandIcon={null}
                        // Controlled on both halves. Leaving either to Fluent
                        // lets the input and the listbox disagree after a write
                        // the platform did not echo back.
                        value={query}
                        selectedOptions={[]}
                        // Open for anything worth showing, not only for results:
                        // the message rows below live in here too.
                        open={open && (candidates.length > 0 || popupText !== '')}
                        onOpenChange={(_, data) => setOpen(data.open)}
                        onChange={(event) => setQuery(event.target.value)}
                        onOptionSelect={(_, data) => onSelect(data.optionValue)}
                        placeholder={props.placeholder}
                        disabled={props.disabled || !searchable}
                        aria-label={props.label || strings.fallbackLabel}
                        aria-invalid={invalid}
                        aria-describedby={statusId.current}
                        // Fluent renders the listbox through a portal, so it is
                        // NOT a descendant of this control's root element and
                        // nothing scoped under `.LookupSearch` reaches it. The
                        // class goes on the listbox itself instead, and the
                        // stylesheet targets it directly — still namespaced, so
                        // it cannot touch the host page.
                        listbox={{ className: 'LookupSearch-listbox' }}
                        // Anchor and size the dropdown to the whole field, not
                        // to the Combobox inside it. Without the explicit
                        // target, Fluent measures its own trigger and the
                        // dropdown lands exactly one browse-button short of the
                        // control's right edge.
                        positioning={{ target: fieldEl, matchTargetSize: 'width' }}
                    >
                        {candidates.length > 0 ? (
                            candidates.map((candidate) => (
                                <Option key={candidate.id} value={candidate.id} text={candidate.name}>
                                    <span className="LookupSearch-option">
                                        <span className="LookupSearch-option-name">{candidate.name}</span>
                                        {candidate.secondary !== '' && (
                                            <span className="LookupSearch-option-secondary">
                                                {candidate.secondary}
                                            </span>
                                        )}
                                    </span>
                                </Option>
                            ))
                        ) : (
                            // Not an <Option>: a disabled option is still
                            // announced as a choice and is still in the keyboard
                            // order, and none of this is choosable. The live
                            // region under the field is what announces it.
                            <div className="LookupSearch-notice" role="presentation">
                                {status === 'searching' && (
                                    <Spinner size="extra-tiny" aria-hidden="true" />
                                )}
                                <span>{popupText}</span>
                            </div>
                        )}
                    </Combobox>
                )}

                {browsable && (
                    <button
                        type="button"
                        className="LookupSearch-action LookupSearch-action--browse"
                        aria-label={strings.browse}
                        title={strings.browse}
                        onClick={onBrowse}
                    >
                        <SearchGlyph />
                    </button>
                )}
            </div>

            {/*
                The search messages moved into the dropdown, where they are
                visible — but a dropdown is not a live region, and it appears at
                the same moment as its text, which is announced by fewer screen
                readers than an element that was already there. So this stays,
                carrying the same words with nothing to look at: always present,
                visually hidden, and the target of `aria-describedby`.
            */}
            <p
                className="LookupSearch-live"
                id={statusId.current}
                role="status"
                aria-live="polite"
            >
                {popupText}
            </p>

            {hint !== '' && (
                <p className="LookupSearch-message">{hint}</p>
            )}

            {fieldMessage() !== '' && (
                <p className="LookupSearch-message">{fieldMessage()}</p>
            )}

            {failure !== null && (
                <p className="LookupSearch-message LookupSearch-message--error" role="alert">
                    {failure}
                </p>
            )}

            {props.errorMessage !== null && (
                <p className="LookupSearch-message LookupSearch-message--error" role="alert">
                    {props.errorMessage}
                </p>
            )}
        </FluentProvider>
    );
}
