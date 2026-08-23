import * as React from 'react';
import {
    Button,
    Combobox,
    FluentProvider,
    Option,
    Spinner,
    webLightTheme,
} from '@fluentui/react-components';
import { Candidate } from './search';

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
    onChange: (next: LookupValue | null) => void;
}

/** Long enough that a fast typist sends one request instead of eight. */
const DEBOUNCE_MS = 300;

type Status = 'idle' | 'typeMore' | 'searching' | 'noMatches' | 'results';

const format = (template: string, value: string): string => template.split('{0}').join(value);

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
 */
export function LookupSearchControl(props: IProps): React.ReactElement | null {
    const { strings } = props;

    const input = React.useRef<HTMLInputElement>(null);

    const [selected, setSelected] = React.useState<LookupValue | null>(props.value);
    const [query, setQuery] = React.useState(props.value?.name ?? '');
    const [candidates, setCandidates] = React.useState<Candidate[]>([]);
    const [status, setStatus] = React.useState<Status>('idle');
    const [open, setOpen] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);

    /** null while the host is still being asked whether it can search. */
    const [canSearch, setCanSearch] = React.useState<boolean | null>(null);

    // Resync when the *platform* hands down a genuinely different record, so a
    // form-driven change still wins over local state. Keyed on the record's id
    // rather than the object, which is new on every pass.
    //
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => {
        setSelected(props.value);
        setQuery(props.value?.name ?? '');
        setCandidates([]);
        setStatus('idle');
        setOpen(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.value?.id]);

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

    // The search itself: debounced, and guarded by the effect's own lifetime.
    //
    // `live` is what makes a slow answer harmless. Each keystroke re-runs this
    // effect, whose cleanup retires the previous run — so an earlier request
    // that lands after a later one cannot repaint the list, and neither can one
    // that lands after the control is gone. `context.webAPI` returns a bare
    // promise with nothing to abort, so retiring the *handler* is the only
    // cancellation available.
    React.useEffect(() => {
        if (canSearch !== true || props.disabled) {
            return;
        }

        const term = query.trim();

        // The field is showing its own selection rather than a search.
        if (selected && term === (selected.name ?? '')) {
            return;
        }

        if (term.length < props.minimumCharacters) {
            setCandidates([]);
            setOpen(false);
            setFailure(null);
            setStatus(term.length === 0 ? 'idle' : 'typeMore');
            return;
        }

        let live = true;
        setStatus('searching');
        setFailure(null);

        const timer = window.setTimeout(() => {
            props.search(term).then(
                (rows) => {
                    if (!live) {
                        return;
                    }

                    setCandidates(rows);
                    setStatus(rows.length > 0 ? 'results' : 'noMatches');
                    setOpen(rows.length > 0);
                },
                (error: unknown) => {
                    if (!live) {
                        return;
                    }

                    setCandidates([]);
                    setOpen(false);
                    setStatus('idle');
                    // The message is the only account of a mistyped search
                    // column the maker will ever see.
                    setFailure(error instanceof Error ? error.message : String(error));
                },
            );
        }, DEBOUNCE_MS);

        return () => {
            live = false;
            window.clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, canSearch, props.disabled, props.minimumCharacters]);

    const commit = (next: LookupValue | null): void => {
        setSelected(next);
        setQuery(next?.name ?? '');
        setCandidates([]);
        setStatus('idle');
        setOpen(false);
        setFailure(null);
        props.onChange(next);

        // Selecting from the popup and clearing both remove what had focus.
        // Putting it back on the field is the only landing place that does not
        // send the user to the top of the form.
        input.current?.focus();
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

    const message = (): string => {
        if (!props.entityType) {
            return strings.noTarget;
        }

        if (canSearch === false) {
            return strings.searchUnavailable;
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

    const searchable = canSearch === true && !props.disabled;
    const browsable = props.allowBrowse && props.entityType !== '' && !props.disabled;

    return (
        <FluentProvider
            className="LookupSearch"
            theme={props.theme ?? webLightTheme}
            dir={props.isRTL ? 'rtl' : 'ltr'}
        >
            <div className="LookupSearch-row">
                <Combobox
                    ref={input}
                    className="LookupSearch-input"
                    freeform
                    // Controlled on both halves: `value` is what the user sees,
                    // `selectedOptions` is what the listbox marks. Leaving
                    // either to Fluent lets the two disagree after a write the
                    // platform did not echo back.
                    value={query}
                    selectedOptions={selected ? [selected.id] : []}
                    open={open && candidates.length > 0}
                    onOpenChange={(_, data) => setOpen(data.open)}
                    onChange={(event) => setQuery(event.target.value)}
                    onOptionSelect={(_, data) => onSelect(data.optionValue)}
                    placeholder={props.placeholder}
                    disabled={props.disabled || !searchable}
                    aria-label={props.label || strings.fallbackLabel}
                    aria-invalid={props.errorMessage !== null}
                    aria-describedby="LookupSearch-status"
                >
                    {candidates.map((candidate) => (
                        <Option key={candidate.id} value={candidate.id} text={candidate.name}>
                            <span className="LookupSearch-option">
                                <span className="LookupSearch-option-name">{candidate.name}</span>
                                {candidate.secondary !== '' && (
                                    <span className="LookupSearch-option-secondary">{candidate.secondary}</span>
                                )}
                            </span>
                        </Option>
                    ))}
                </Combobox>

                {status === 'searching' && <Spinner size="tiny" aria-hidden="true" />}

                {selected !== null && !props.disabled && (
                    <Button appearance="subtle" onClick={() => commit(null)}>
                        {strings.clear}
                    </Button>
                )}

                {browsable && (
                    <Button
                        appearance="secondary"
                        onClick={() => {
                            props.browse().then(
                                (picked) => {
                                    if (picked) {
                                        commit(picked);
                                    }
                                },
                                (error: unknown) => setFailure(error instanceof Error ? error.message : String(error)),
                            );
                        }}
                    >
                        {strings.browse}
                    </Button>
                )}
            </div>

            {/*
                Rendered whether or not it has anything to say: a live region
                announces changes to text inside it, and one that appears at the
                same moment as its text is announced by fewer screen readers
                than one that was already there.
            */}
            <p
                className="LookupSearch-message"
                id="LookupSearch-status"
                role="status"
                aria-live="polite"
            >
                {message()}
            </p>

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
