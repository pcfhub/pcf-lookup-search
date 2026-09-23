/*
 * Drives the real built bundle outside a browser.
 *
 *     npm run build && npm run smoke
 *
 * A **virtual** control returns the element it wants rendered, so these
 * assertions read the props it handed down — and, for this control, the calls
 * it made on the platform. Both halves matter: nearly everything interesting
 * here is a decision about a capability that is *typed as always present and is
 * not*, and the only way to see that decision is to take the capability away.
 *
 * Why it exists alongside `npm start`: that harness binds no lookup, has no Web
 * API, no metadata and no navigation — which is to say it can reach none of the
 * paths below. It is the wrong tool for this control specifically.
 *
 * **What passing here does NOT mean.** Every value is supplied by this file. It
 * cannot tell you that a real `retrieveMultipleRecords` accepts the OData this
 * builds — a mistyped search column is a 400 from the server, and only a real
 * environment produces one — nor that the lookup panel opens. Keep those in
 * SPEC.md under "Not verified".
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const dom = require('./dom.js');
const host = require('./host.js');
const clock = require('./clock.js');

const BUNDLE = path.join(root, 'out', 'controls', 'LookupSearch', 'bundle.js');

if (!fs.existsSync(BUNDLE)) {
    console.error('\n  No bundle at out/controls/LookupSearch. Run npm run build first.\n');
    process.exit(1);
}

/* ----------------------------------------------------------- the platform */

dom.install(global);

const time = clock.install(Date.UTC(2026, 0, 1, 12, 0, 0), global);

const registration = host.captureRegistration(global);

const source = fs.readFileSync(BUNDLE, 'utf8');

const reactGlobals = [...new Set(source.match(/\bReactv[\w]*\b/g) || [])];
const fluentGlobals = [...new Set(source.match(/\bFluentUIReact[\w]*\b/g) || [])];

if (reactGlobals.length > 0) {
    const React = require(path.join(root, 'node_modules', 'react'));

    reactGlobals.forEach((name) => {
        global[name] = React;
    });
}

const fluent = new Proxy({}, { get: (_t, name) => (typeof name === 'string' ? name : undefined) });

fluentGlobals.forEach((name) => {
    global[name] = fluent;
});

vm.runInThisContext(source, { filename: 'bundle.js' });

/* ---------------------------------------------------------------- harness */

const results = [];

function check(label, ok, detail) {
    results.push({ ok, label, detail });
}

const marked = (key) => `resx:${key}`;

const live = [];

function disposeAll() {
    while (live.length > 0) {
        live.pop().destroy();
    }
}

/*
 * The control's inputs as a maker leaves them. The rig's `inputs` replaces
 * rather than merges, so a mount that changes one input names only that one
 * and gets the rest from here.
 */
const INPUTS = {
    minimumCharacters: 2,
    allowBrowse: true,
    searchColumns: 'name,accountnumber',
    secondaryColumn: 'accountnumber',
    matchMode: 'startsWith',
    maxResults: 8,
};

function mount(given) {
    const calls = [];
    // One organisation per mount, handed to every context the instance sees.
    const clientUrl = host.nextClientUrl();
    const options = { ...given, clientUrl, inputs: { ...INPUTS, ...(given.inputs || {}) } };
    const context = host.createContext({ ...options, calls, getString: marked });
    const instance = new registration.ctor();

    let notifications = 0;

    instance.init(context, () => {
        notifications += 1;
    });

    let element = instance.updateView(context);

    const handle = {
        instance,
        calls: () => calls,
        get element() {
            return element;
        },
        props: () => (element && element.props) || {},
        outputs: () => instance.getOutputs(),
        notifications: () => notifications,
        update: (next) => {
            element = instance.updateView(host.createContext({ ...options, ...next, inputs: { ...options.inputs, ...(next.inputs || {}) }, calls, getString: marked }));

            return element;
        },
        destroy: () => {
            instance.destroy();

            const at = live.indexOf(handle);

            if (at !== -1) {
                live.splice(at, 1);
            }
        },
    };

    live.push(handle);

    return handle;
}

check('bundle registered a control', typeof registration.ctor === 'function');

if (typeof registration.ctor !== 'function') {
    report();
}

/* ------------------------------------------------------- what it hands down */

const plain = mount({});

check('returns an element rather than writing into a container', plain.element !== undefined && plain.element !== null);

check('hands down the record the column holds', plain.props().value && plain.props().value.id === 'a3', JSON.stringify(plain.props().value));

check("passes down the form's own label", plain.props().label === 'Account', plain.props().label);

check('and its strings come from the .resx', plain.props().strings.browse === 'resx:LookupSearch_Browse', plain.props().strings.browse);

/*
 * `minimumCharacters` is clamped: zero would fire a search on every keystroke
 * including the empty one, which is a query per character against Dataverse.
 */
check('a minimum of zero characters is clamped up', mount({ inputs: { minimumCharacters: 0 } }).props().minimumCharacters === 1, String(mount({ inputs: { minimumCharacters: 0 } }).props().minimumCharacters));

check('allowBrowse defaults on rather than off', mount({ inputs: { allowBrowse: null } }).props().allowBrowse === true);

/* --------------------------------------------------------- the array value */

/*
 * **A lookup's `raw` is an array**, empty rather than null when the column has
 * no value — the single thing about `Lookup.Simple` that catches people, and
 * the reason clearing writes `[]`.
 */
check('an empty column is an empty array, not a null', mount({ value: [] }).props().value === null, JSON.stringify(mount({ value: [] }).props().value));

const cleared = mount({});

cleared.props().onChange(null);

check(
    'clearing writes an empty array, which is what the platform acts on',
    Array.isArray(cleared.outputs().value) && cleared.outputs().value.length === 0,
    JSON.stringify(cleared.outputs()),
);

check('and notifies exactly once', cleared.notifications() === 1, String(cleared.notifications()));

const picked = mount({ value: [] });

picked.props().onChange({ id: 'a1', name: 'Adventure Works', entityType: 'account' });

check(
    'picking a record writes it back as a one-element array',
    picked.outputs().value.length === 1 && picked.outputs().value[0].id === 'a1',
    JSON.stringify(picked.outputs()),
);

/*
 * The re-render that discards a selection. Every pass hands down a fresh array
 * holding a fresh object, so identity says nothing — the guard compares ids.
 */
const edited = mount({});

edited.props().onChange({ id: 'a1', name: 'Adventure Works', entityType: 'account' });
edited.update({});

check(
    'a selection survives a re-render carrying the platform’s older value',
    edited.props().value.id === 'a1',
    JSON.stringify(edited.props().value),
);

const refreshed = mount({});

refreshed.update({ value: [{ id: 'a2', name: 'Alpine Ski House', entityType: 'account' }] });

check('a new record from the platform replaces the old one', refreshed.props().value.id === 'a2', JSON.stringify(refreshed.props().value));

/* ------------------------------------------------ the target it does not know */

/*
 * The control does not know its own table — it asks the property. The method is
 * *declared* on `LookupProperty`, so this compiles without a cast, and it is
 * still called defensively: the type is a claim about the type definitions, not
 * about the host. PCFHub's own demo harness builds a property bag with no
 * methods on it at all.
 */
check('asks the property which table it points at', plain.props().entityType === 'account', plain.props().entityType);

check(
    'falls back to the value’s own entityType where the method is missing',
    mount({ targetMethod: 'absent' }).props().entityType === 'account',
    mount({ targetMethod: 'absent' }).props().entityType,
);

check(
    'and where the host declares it and throws from it',
    mount({ targetMethod: 'throws' }).props().entityType === 'account',
    mount({ targetMethod: 'throws' }).props().entityType,
);

check(
    'an empty column on a host with neither leaves it with no table',
    mount({ targetMethod: 'absent', value: [] }).props().entityType === '',
    JSON.stringify(mount({ targetMethod: 'absent', value: [] }).props().entityType),
);

/* ------------------------------------------------------------ the states */

/*
 * Field-level security is NOT the form's read-only state. A user denied read
 * access gets an empty `raw`, indistinguishable from "no record selected"
 * unless `security.readable` is checked.
 */
check('a column the user cannot read is marked unreadable', mount({ security: 'no-access', value: [] }).props().readable === false);

check('a read-only column disables the control on an editable form', mount({ security: 'read-only' }).props().disabled === true);

check('and an ordinary column is neither', plain.props().readable === true && plain.props().disabled === false);

check('a validation error reaches the component', mount({ error: true }).props().errorMessage === host.DEFAULTS.errorMessage);

check('and there is none to show when the platform reported none', plain.props().errorMessage === null);

check('hidden is passed down rather than ignored', mount({ visible: false }).props().visible === false);

/*
 * `openForm` needs no <uses-feature>, so the link costs the maker no extra
 * permission — but it is still absent on hosts without navigation, and a link
 * that does nothing is worse than plain text.
 */
check('offers a link to the record where the host can navigate', typeof plain.props().openRecord === 'function');

check('and none at all where it cannot', mount({ hasNavigation: false }).props().openRecord === null);

/* --------------------------------------------------- searching, and not */

(async () => {
    /*
     * Both feature checks are narrower than the types allow, deliberately:
     * `webAPI` and `utils` are typed as always present, and with
     * `required="false"` in the manifest that is exactly what they are not.
     * The control reports the answer so the component can disable the box and
     * say so, rather than offering a search that returns nothing.
     */
    check('a host with Web API and metadata can search', (await plain.props().prepare()) === true);

    check('one without Web API cannot', (await mount({ webAPI: false }).props().prepare()) === false);

    check('nor one without entity metadata', (await mount({ utils: false }).props().prepare()) === false);

    check('nor one whose column points at no table', (await mount({ targetMethod: 'absent', value: [] }).props().prepare()) === false);

    /*
     * The query is where a mistyped search column becomes a 400 from the
     * server, so what was asked for is the thing worth asserting.
     */
    const searched = mount({});
    const found = await searched.props().search('Con');
    const request = searched.calls().find((call) => call.startsWith('webAPI.retrieveMultipleRecords'));

    check('a search returns candidates', found.length > 0, `${found.length} candidates`);

    check(
        'asking the target table, with the maker’s columns in the filter',
        Boolean(request) && request.includes('account ') && request.includes('name'),
        request || 'no request',
    );

    check(
        'and capping the rows it asks for',
        Boolean(request) && /max=\d+/.test(request),
        request || 'no request',
    );

    /*
     * A term with a quote in it is the one that breaks an OData filter, and
     * `O'Brien` is a real customer name rather than a contrived one.
     */
    const quoted = mount({});

    await quoted.props().search("O'Brien");

    const quotedRequest = quoted.calls().find((call) => call.startsWith('webAPI.retrieveMultipleRecords'));

    check(
        'a quote in the term is escaped rather than passed through',
        Boolean(quotedRequest) && quotedRequest.includes("O''Brien"),
        quotedRequest || 'no request',
    );

    const capped = mount({ inputs: { maxResults: 5000 } });

    await capped.props().search('Con');

    const cappedRequest = capped.calls().find((call) => call.startsWith('webAPI.retrieveMultipleRecords'));

    check(
        'a maxResults nobody should send is clamped down',
        Boolean(cappedRequest) && !cappedRequest.includes('max=5000'),
        cappedRequest || 'no request',
    );

    /*
     * Errors are not swallowed: a 400 from a mistyped `searchColumns` is the
     * only signal the maker gets, and the component puts its message on screen.
     */
    let rejected = false;

    try {
        await mount({ webApiFails: true }).props().search('Con');
    } catch {
        rejected = true;
    }

    check('a failed search is reported rather than swallowed', rejected === true);

    /*
     * The metadata call is shared between searches for one target, so a burst
     * of typing does not become a burst of metadata round trips.
     */
    const shared = mount({});

    await Promise.all([shared.props().search('A'), shared.props().search('Ad'), shared.props().search('Adv')]);

    check(
        'three searches share one metadata lookup',
        shared.calls().filter((call) => call.startsWith('getEntityMetadata')).length === 1,
        `${shared.calls().filter((call) => call.startsWith('getEntityMetadata')).length} metadata calls`,
    );

    /* ------------------------------------------------------------ browsing */

    const browsed = mount({ lookupPick: { id: 'a4', name: "O'Brien Holdings", entityType: 'account' } });
    const brought = await browsed.props().browse();

    check('the browse panel hands back what was picked', brought && brought.id === 'a4', JSON.stringify(brought));

    check(
        'opening it at the view the maker configured on the form',
        browsed.calls().some((call) => call.includes('defaultViewId')),
        browsed.calls().filter((c) => c.startsWith('utils.lookupObjects')).join(' ') || 'no utils.lookupObjects',
    );

    check('a cancelled panel is "picked nothing", not a failure', (await mount({}).props().browse()) === null);

    check('and a host without the panel offers nothing rather than throwing', (await mount({ lookupObjects: false }).props().browse()) === null);

    /* --------------------------------------------------- what destroy owes */

    disposeAll();

    const timersBefore = time.pending();
    const listeners = () => Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0);
    const listenersBefore = listeners();

    mount({}).destroy();

    check('destroy() releases every timer the control took', time.pending() === timersBefore, `${timersBefore} → ${time.pending()}`);

    check('and every document-level listener', listeners() === listenersBefore, `${listenersBefore} → ${listeners()}`);

    disposeAll();

    report();
})();

function report() {
    const failed = results.filter((result) => !result.ok);

    for (const result of results) {
        const detail = result.detail ? `  — ${result.detail}` : '';

        console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${detail}`);
    }

    console.log(
        failed.length > 0
            ? `\n  ${failed.length} of ${results.length} failed\n`
            : `\n  ${results.length} passed — the control's own decisions only; see SPEC.md for what a real form still has to confirm\n`,
    );

    process.exit(failed.length > 0 ? 1 : 0);
}
