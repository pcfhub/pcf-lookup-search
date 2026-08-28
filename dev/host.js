/*
 * The platform, stood in for: everything this control reads off `context`.
 *
 * ---
 *
 * **Why this exists when `npm start` already hosts a field control.**
 *
 * Almost nothing this control does can be reached from a property panel. It
 * binds a lookup, which no local harness supplies properly, and every
 * interesting path is a platform capability that is *typed as always present
 * and is not*:
 *
 *   - `webAPI.retrieveMultipleRecords` — absent wherever the manifest's
 *     `required="false"` feature was not granted, and absent in canvas;
 *   - `utils.getEntityMetadata` and `utils.lookupObjects` — model-driven only;
 *   - `navigation.openForm` — absent on hosts with no navigation, where a link
 *     that does nothing is worse than plain text;
 *   - `parameter.getTargetEntityType()` — declared on the property type and
 *     genuinely missing from PCFHub's own demo harness, which builds a plain
 *     property bag with no methods on it.
 *
 * Each of those has a switch here, because each is a branch the control was
 * written for and none of them can be produced by `pcf-start`.
 *
 * ---
 *
 * **A stub must never be more capable than the thing it stands in for.**
 *
 * The three capability switches default to *present*, because that is a
 * model-driven form — but every one of them can be taken away, and the suite
 * takes them away. `security` is `undefined` on a column with no FLS profile.
 * A lookup's `raw` is an **array**, empty rather than null when the column has
 * no value, which is the single thing about this property type that catches
 * people.
 */

(function (root, factory) {
    'use strict';

    var api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.__pcfHost = api;
    }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    var STRINGS = {
        LookupSearch_Name: 'Lookup Search',
        LookupSearch_NoAccess: 'You do not have access to this value.',
        LookupSearch_Browse: 'Browse',
        LookupSearch_Clear: 'Clear',
        LookupSearch_Searching: 'Searching…',
        LookupSearch_NoMatches: 'No matches.',
        LookupSearch_TypeMore: 'Keep typing…',
        LookupSearch_SearchUnavailable: 'Search is not available here.',
        LookupSearch_NoTarget: 'This column points at no table.',
        LookupSearch_SearchFailed: 'The search failed.',
    };

    var SECURITY = {
        none: undefined,
        'read-only': { editable: false, readable: true, secured: true },
        'no-access': { editable: false, readable: false, secured: true },
    };

    /** What the target table's rows look like, for the search stub. */
    var ROWS = [
        { accountid: 'a1', name: 'Adventure Works', accountnumber: 'ACC-001' },
        { accountid: 'a2', name: 'Alpine Ski House', accountnumber: 'ACC-002' },
        { accountid: 'a3', name: 'Contoso Ltd', accountnumber: 'ACC-003' },
        { accountid: 'a4', name: "O'Brien Holdings", accountnumber: 'ACC-004' },
    ];

    var DEFAULTS = {
        /**
         * The bound column. **An array**, and empty rather than null when the
         * column has no value — which is the one thing about `Lookup.Simple`
         * that catches people, and the reason `getOutputs` writes `[]` to
         * clear.
         */
        value: [{ id: 'a3', name: 'Contoso Ltd', entityType: 'account' }],
        /**
         * What `getTargetEntityType()` answers, and whether the method exists
         * at all. PCFHub's demo harness builds a property bag with no methods,
         * so `absent` is a real host rather than a hypothetical.
         */
        target: 'account',
        targetMethod: 'present',
        viewId: '00000000-0000-0000-0000-000000000001',
        /** Input properties. */
        placeholder: 'Search accounts…',
        minimumCharacters: 2,
        allowBrowse: true,
        searchColumns: 'name,accountnumber',
        secondaryColumn: 'accountnumber',
        matchMode: 'startsWith',
        maxResults: 8,
        /**
         * The three capabilities typed as always present that are not.
         * Model-driven has all three; take them away one at a time.
         */
        hasWebApi: true,
        hasMetadata: true,
        hasNavigation: true,
        hasLookupObjects: true,
        /** Make the search reject, which the component surfaces to the maker. */
        searchFails: false,
        /** What the Browse panel returns. `[]` is a cancelled panel. */
        browseReturns: null,
        label: 'Account',
        visible: true,
        disabled: false,
        security: 'none',
        error: false,
        errorMessage: 'Select an account before saving.',
        rtl: false,
    };

    function createContext(options) {
        var o = Object.assign({}, DEFAULTS, options || {});
        var calls = o.calls || [];

        function log(name, argument) {
            calls.push(argument === undefined ? name : name + '(' + JSON.stringify(argument) + ')');
        }

        var getString =
            o.getString
            || function (key) {
                return STRINGS[key] !== undefined ? STRINGS[key] : key;
            };

        var value = {
            raw: o.value,
            security: SECURITY[o.security],
            error: o.error,
            // The platform sets no message when there is no error.
            errorMessage: o.error ? o.errorMessage : undefined,
            type: 'Lookup.Simple',
        };

        /*
         * Declared on LookupProperty, so the control compiles without a cast —
         * and called defensively anyway, because the type is a claim about the
         * *type definitions* rather than about the host.
         */
        if (o.targetMethod === 'present') {
            value.getTargetEntityType = function () {
                return o.target;
            };
            value.getViewId = function () {
                return o.viewId;
            };
        } else if (o.targetMethod === 'throws') {
            value.getTargetEntityType = function () {
                throw new Error('not available here');
            };
        }

        var context = {
            parameters: {
                value: value,
                placeholder: { raw: o.placeholder, type: 'SingleLine.Text' },
                minimumCharacters: { raw: o.minimumCharacters, type: 'Whole.None' },
                allowBrowse: { raw: o.allowBrowse, type: 'TwoOptions' },
                searchColumns: { raw: o.searchColumns, type: 'SingleLine.Text' },
                secondaryColumn: { raw: o.secondaryColumn, type: 'SingleLine.Text' },
                matchMode: { raw: o.matchMode, type: 'Enum' },
                maxResults: { raw: o.maxResults, type: 'Whole.None' },
            },

            mode: {
                isVisible: o.visible,
                isControlDisabled: o.disabled,
                label: o.label,
            },

            resources: { getString: getString },

            userSettings: { isRTL: o.rtl, languageId: 1033 },

            /*
             * Absent, because it is absent in the demo harness and this control
             * falls back rather than asserting a light palette over a themed
             * host. Adding it here would test the branch nobody is on.
             */
            fluentDesignLanguage: undefined,
        };

        /*
         * `retrieveMultipleRecords` takes (entity, options, maxPageSize). The
         * query string is logged verbatim, because *what was asked for* is the
         * decision worth asserting — the OData filter this control builds is
         * the only place a mistyped search column becomes a 400.
         */
        if (o.hasWebApi) {
            context.webAPI = {
                retrieveMultipleRecords: function (entity, query, max) {
                    log('retrieveMultipleRecords', entity + ' ' + query + ' max=' + max);

                    if (o.searchFails) {
                        return Promise.reject({ message: 'Invalid property name in $filter' });
                    }

                    return Promise.resolve({ entities: ROWS.slice(0, max) });
                },
            };
        }

        context.utils = {};

        /*
         * Resolves with a **class instance** whose public surface is prototype
         * getters, which `Object.keys` does not enumerate — code that walks the
         * object sees private fields and concludes the table has no columns. So
         * this hands back an object shaped the way the platform's is, and the
         * control reads the two names it wants directly.
         */
        if (o.hasMetadata) {
            context.utils.getEntityMetadata = function (name) {
                log('getEntityMetadata', name);

                return Promise.resolve(
                    Object.create(
                        {
                            get PrimaryIdAttribute() {
                                return 'accountid';
                            },
                            get PrimaryNameAttribute() {
                                return 'name';
                            },
                        },
                        { _private: { value: 'not part of the surface', enumerable: true } },
                    ),
                );
            };
        }

        if (o.hasLookupObjects) {
            context.utils.lookupObjects = function (lookupOptions) {
                log('lookupObjects', JSON.stringify(lookupOptions));

                // A cancelled panel resolves *empty* rather than rejecting,
                // which is the same shape as "picked nothing".
                return Promise.resolve(o.browseReturns || []);
            };
        }

        if (o.hasNavigation) {
            context.navigation = {
                openForm: function (formOptions) {
                    log('openForm', formOptions.entityName + ' ' + formOptions.entityId);

                    return Promise.resolve();
                },
            };
        }

        context.__calls = calls;

        return context;
    }

    function captureRegistration(global) {
        var box = { name: null, ctor: null };

        global.ComponentFramework = global.ComponentFramework || {};
        global.ComponentFramework.registerControl = function (fullName, ctor) {
            box.name = fullName;
            box.ctor = ctor;
        };

        return box;
    }

    return {
        STRINGS: STRINGS,
        SECURITY: SECURITY,
        DEFAULTS: DEFAULTS,
        ROWS: ROWS,
        createContext: createContext,
        captureRegistration: captureRegistration,
    };
});
