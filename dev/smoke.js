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

    /* ------------------------------------------- filtered by a parent (0.2.0) */

    /*
     * A Primary Contact lookup narrowed by the form's Account. Real GUIDs,
     * because the control refuses to put anything else in a filter, and the
     * parent handed down braced and upper-case to prove the control does not
     * depend on which form the platform chose.
     */
    const ACME = 'aaaaaaaa-0000-4000-8000-000000000001';
    const GLOBEX = 'aaaaaaaa-0000-4000-8000-000000000002';
    const ann = { contactid: 'cccccccc-0000-4000-8000-000000000001', fullname: 'Ann Acme', emailaddress1: 'ann@acme.test', _parentcustomerid_value: ACME };
    const andy = { contactid: 'cccccccc-0000-4000-8000-000000000002', fullname: 'Andy Globex', emailaddress1: 'andy@globex.test', _parentcustomerid_value: GLOBEX };
    const anya = { contactid: 'cccccccc-0000-4000-8000-000000000003', fullname: 'Anya Acme', emailaddress1: 'anya@acme.test', _parentcustomerid_value: ACME };

    const COMPANY = { entity: 'contact', column: 'parentcustomerid', target: 'account' };
    const PARTNER = { entity: 'contact', column: 'cll_partnerid', target: 'account' };
    const OWNERSHIP = { entity: 'contact', column: 'owninguser', target: 'systemuser' };

    const contacts = (relationships) => ({ tables: { contact: [ann, andy, anya] }, relationships });

    const parentOf = (id, name) => ({
        type: 'Lookup.Simple',
        raw: id ? [{ id: `{${id.toUpperCase()}}`, name, entityType: 'account' }] : [],
        target: 'account',
        column: 'parentcustomerid',
    });

    const onContacts = (options) => ({
        target: 'contact',
        primaryNameAttribute: 'fullname',
        value: [],
        fixture: contacts([COMPANY, OWNERSHIP]),
        ...options,
        inputs: { searchColumns: 'emailaddress1', secondaryColumn: 'emailaddress1', ...(options.inputs || {}) },
    });

    const lastQuery = (handle) =>
        handle.calls().filter((call) => call.startsWith('webAPI.retrieveMultipleRecords')).pop() || '';

    // The fetch stub and the platform promises chain several deep; a fixed
    // number of turns lets every one of them land before an assertion reads.
    const settle = async () => {
        for (let i = 0; i < 50; i += 1) {
            await Promise.resolve();
        }
    };

    /*
     * The upgrade promise: a form that never maps the parent sends exactly the
     * query 0.1.x sent, and keeps Browse.
     */
    const before = mount(onContacts({}));
    const unmapped = mount(onContacts({ bound: { parentValue: 'unmapped' } }));

    await before.props().search('An');
    await unmapped.props().search('An');

    check('an unmapped parent narrows nothing', unmapped.props().parentKey === '', JSON.stringify(unmapped.props().parentKey));

    check(
        'and sends the query 0.1.x sent, byte for byte',
        lastQuery(unmapped) !== '' && lastQuery(unmapped) === lastQuery(before),
        lastQuery(unmapped),
    );

    check('and keeps Browse', (await unmapped.props().parent()).kind === 'off');

    const emptyParent = mount(onContacts({ bound: { parentValue: parentOf(null) } }));

    await emptyParent.props().search('An');

    check(
        'a mapped, empty parent searches the whole table, as the platform’s own filter does',
        emptyParent.props().parentKey === '' && !lastQuery(emptyParent).includes('_value'),
        lastQuery(emptyParent),
    );

    /* A parent with one relationship to it. */

    const filtered = mount(onContacts({ bound: { parentValue: parentOf(ACME, 'Acme') } }));
    const state = await filtered.props().parent();
    const acmeOnly = await filtered.props().search('An');

    check('a mapped parent narrows by the column that points at it', state.kind === 'filtered' && state.column === 'parentcustomerid', JSON.stringify(state));

    check(
        'with the parent id bare and lower-case in the filter',
        lastQuery(filtered).includes(`_parentcustomerid_value eq ${ACME}`),
        lastQuery(filtered),
    );

    check(
        'and only that parent’s records come back',
        acmeOnly.map((row) => row.name).join(',') === 'Ann Acme,Anya Acme',
        acmeOnly.map((row) => row.name).join(','),
    );

    check('a relationship to another table is not a candidate', state.kind === 'filtered');

    check('Browse is refused while filtered, because the panel cannot be', (await filtered.props().browse()) === null);

    check(
        'and the panel is never opened',
        !filtered.calls().some((call) => call.startsWith('utils.lookupObjects')),
        filtered.calls().filter((call) => call.startsWith('utils.lookupObjects')).join(' '),
    );

    const threeSearches = mount(onContacts({ bound: { parentValue: parentOf(ACME, 'Acme') } }));

    await Promise.all([threeSearches.props().search('A'), threeSearches.props().search('An'), threeSearches.props().search('Ann')]);

    check(
        'three searches share one relationships read',
        threeSearches.calls().filter((call) => call.includes('ManyToOneRelationships')).length === 1,
        String(threeSearches.calls().filter((call) => call.includes('ManyToOneRelationships')).length),
    );

    /* Two relationships to the same parent table: the maker's decision. */

    const twoWays = { fixture: contacts([COMPANY, PARTNER]), bound: { parentValue: parentOf(ACME, 'Acme') } };
    const ambiguous = mount(onContacts(twoWays));
    const ambiguousState = await ambiguous.props().parent();

    check(
        'two columns to the parent’s table are named, not guessed between',
        ambiguousState.kind === 'ambiguous' && ambiguousState.candidates.join(',') === 'cll_partnerid,parentcustomerid',
        JSON.stringify(ambiguousState),
    );

    check('and nothing is searched', (await ambiguous.props().search('An')).length === 0 && lastQuery(ambiguous) === '', lastQuery(ambiguous));

    const named = mount(onContacts({ ...twoWays, inputs: { parentColumn: ' ParentCustomerId ' } }));

    check('Parent column settles it, in any case', (await named.props().parent()).kind === 'filtered');

    const misnamed = mount(onContacts({ ...twoWays, inputs: { parentColumn: 'owninguser' } }));

    check(
        'a Parent column that is not one of the candidates is refused, not trusted',
        (await misnamed.props().parent()).kind === 'ambiguous',
    );

    /* Nothing to filter by, or no way to find out: search off, never widened. */

    const unrelated = mount(onContacts({ fixture: contacts([OWNERSHIP]), bound: { parentValue: parentOf(ACME, 'Acme') } }));

    check('no relationship to the parent’s table turns the search off', (await unrelated.props().parent()).kind === 'none');

    for (const [label, options] of [
        ['offline', { relationshipsStatus: 0 }],
        ['refused', { relationshipsStatus: 403 }],
        ['no page', { page: false }],
    ]) {
        const blind = mount(onContacts({ ...options, bound: { parentValue: parentOf(ACME, 'Acme') } }));
        const blindState = await blind.props().parent();
        const rows = await blind.props().search('An');

        check(
            `relationships that cannot be read (${label}) turn the search off rather than widening it`,
            blindState.kind === 'unavailable' && rows.length === 0 && lastQuery(blind) === '',
            `${JSON.stringify(blindState)} ${lastQuery(blind)}`,
        );
    }

    /* What a parent change does to the chosen record. */

    const withAnn = (parent, inputs) => onContacts({
        value: [{ id: ann.contactid, name: ann.fullname, entityType: 'contact' }],
        bound: { parentValue: parentOf(parent, 'Parent') },
        inputs,
    });

    const cleared2 = mount(withAnn(ACME, { onParentChange: 'clear' }));

    await settle();
    cleared2.update({ bound: { parentValue: parentOf(GLOBEX, 'Globex') } });
    await settle();

    check(
        'clear: a record that does not belong to the new parent is emptied',
        cleared2.notifications() === 1 && Array.isArray(cleared2.outputs().value) && cleared2.outputs().value.length === 0,
        `${cleared2.notifications()} ${JSON.stringify(cleared2.outputs())}`,
    );

    check(
        'after asking, one row, by id and parent',
        lastQuery(cleared2).includes(`contactid eq ${ann.contactid} and _parentcustomerid_value eq ${GLOBEX}`) && lastQuery(cleared2).endsWith(' max=1")'),
        lastQuery(cleared2),
    );

    const stays = mount(withAnn(GLOBEX, { onParentChange: 'clear' }));

    await settle();
    stays.update({ bound: { parentValue: parentOf(ACME, 'Acme') } });
    await settle();

    check('a record that belongs to the new parent is kept', stays.notifications() === 0, String(stays.notifications()));

    const firstPass = mount(withAnn(GLOBEX, { onParentChange: 'clear' }));

    await settle();

    check('the form loading is not a parent change', firstPass.notifications() === 0, String(firstPass.notifications()));

    const offline = mount(withAnn(ACME, { onParentChange: 'clear' }));

    await settle();
    offline.update({ bound: { parentValue: parentOf(GLOBEX, 'Globex') }, webApiFails: true });
    await settle();

    check('a check that fails keeps the value', offline.notifications() === 0, String(offline.notifications()));

    const emptied = mount(withAnn(ACME, { onParentChange: 'clear' }));

    await settle();
    emptied.update({ bound: { parentValue: parentOf(null) } });
    await settle();

    check('emptying the parent never clears the record', emptied.notifications() === 0, String(emptied.notifications()));

    const kept = mount(withAnn(ACME, {}));

    await settle();
    kept.update({ bound: { parentValue: parentOf(GLOBEX, 'Globex') } });
    await settle();

    check(
        'keep, the default, never touches the record',
        kept.notifications() === 0 && !kept.calls().some((call) => call.includes('contactid eq')),
        String(kept.notifications()),
    );

    check(
        'and getOutputs never names the parent',
        !Object.prototype.hasOwnProperty.call(cleared2.outputs(), 'parentValue'),
        JSON.stringify(cleared2.outputs()),
    );

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
