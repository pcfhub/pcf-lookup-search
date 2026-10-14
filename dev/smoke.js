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

    /*
     * The first mistake on the test form (2026-09-23): the parent's own column
     * typed into Linking column, and Filter by left unmapped. The maker meant
     * to filter, so the search is off and says why — it used to search the
     * whole table in silence.
     */
    const unbound = mount(onContacts({ bound: { parentValue: 'unmapped' }, inputs: { parentColumn: 'parentaccountid' } }));
    const unboundState = await unbound.props().parent();
    const unboundRows = await unbound.props().search('An');

    check(
        'a Linking column with no Filter by mapped turns the search off',
        unboundState.kind === 'unbound' && unboundRows.length === 0 && lastQuery(unbound) === '',
        `${JSON.stringify(unboundState)} ${lastQuery(unbound)}`,
    );

    check('and reads nothing to find that out', !unbound.calls().some((call) => call.includes('ManyToOneRelationships')));

    check('and offers no Browse', (await unbound.props().browse()) === null);

    check(
        'and its message comes from the .resx',
        unbound.props().strings.parentUnbound === 'resx:LookupSearch_ParentUnbound',
        unbound.props().strings.parentUnbound,
    );

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

    /* ------------------------------------------------------- dropdown mode */

    /*
     * 0.3.0. A view's rows as the whole list — the PCF Gallery request
     * board's most-voted topic. Every query below is asserted on what it
     * *asked*, because the server's answer to it was measured once, on the
     * form (SPEC.md, probe 0.2.9), and the rig only has to model that answer.
     */
    const FIELD_VIEW = '00000000-0000-0000-00aa-000010001002';
    const LOOKUP_VIEW = '00000000-0000-0000-00aa-0000000000aa';
    const old = { contactid: 'cccccccc-0000-4000-8000-000000000009', fullname: 'Olga Retired', emailaddress1: 'olga@acme.test', _parentcustomerid_value: ACME, statecode: 1 };
    const active = [ann, andy, anya].map((row) => ({ ...row, statecode: 0 }));
    const viewXml = (order, entity = 'contact') =>
        `<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false" top="7">`
        + `<entity name="${entity}"><attribute name="fullname" /><attribute name="telephone1" /><attribute name="contactid" />`
        + `<filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter>`
        + `<order attribute="fullname" descending="${order === 'desc'}" /></entity></fetch>`;
    const views = (rows) => ({
        tables: {
            contact: [...active, old],
            savedquery: rows,
        },
        relationships: [COMPANY, OWNERSHIP],
    });
    // The field's view sorts descending and the lookup view ascending, so the
    // order of the rows says which view a list came from without asking.
    const FIELD = { savedqueryid: FIELD_VIEW, returnedtypecode: 'contact', querytype: 0, isdefault: false, fetchxml: viewXml('desc') };
    const LOOKUP = { savedqueryid: LOOKUP_VIEW, returnedtypecode: 'contact', querytype: 64, isdefault: true, fetchxml: viewXml('asc') };
    const onViews = (options) => onContacts({ retrieveRecord: 'fixture', fixture: views([FIELD, LOOKUP]), ...options, inputs: { displayMode: 'dropdown', ...(options.inputs || {}) } });
    const listQueries = (handle) => handle.calls()
        .filter((call) => call.startsWith('webAPI.retrieveMultipleRecords') && call.includes('contact ?fetchXml='))
        .map((call) => decodeURIComponent(call.slice(call.indexOf('?fetchXml=') + 10)));
    const names = (result) => (result.kind === 'rows' ? result.candidates.map((c) => c.name) : [result.kind]);

    check('a form placed before 0.3.0 keeps the type-ahead', mount(onContacts({})).props().mode === 'search', mount(onContacts({})).props().mode);
    check('displayMode dropdown hands down dropdown', mount(onViews({})).props().mode === 'dropdown');
    check(
        'and a value nobody declared reads as search',
        mount(onViews({ inputs: { displayMode: 'grid' } })).props().mode === 'search',
        mount(onViews({ inputs: { displayMode: 'grid' } })).props().mode,
    );

    const fromField = mount(onViews({}));
    const fieldList = await fromField.props().list();
    const fieldQuery = listQueries(fromField)[0] || '';

    check('the view set on the column is the one listed', fieldList.kind === 'rows' && fieldList.source === 'field', JSON.stringify({ kind: fieldList.kind, source: fieldList.source }));
    check('in that view\'s order, not re-sorted', JSON.stringify(names(fieldList)) === JSON.stringify(['Anya Acme', 'Ann Acme', 'Andy Globex']), names(fieldList).join(', '));
    check('and a retired row is not in it', !names(fieldList).includes('Olga Retired'), names(fieldList).join(', '));
    check(
        'the view\'s own columns are swapped for the three the list renders',
        !fieldQuery.includes('telephone1') && /<attribute name='contactid'\/><attribute name='fullname'\/><attribute name='emailaddress1'\/>/.test(fieldQuery),
        fieldQuery,
    );
    check('its filter and its order ride along untouched', fieldQuery.includes('<condition attribute="statecode" operator="eq" value="0" />') && fieldQuery.includes('<order attribute="fullname" descending="true" />'), fieldQuery);
    check('top goes and count is the limit plus one', !/\btop=/.test(fieldQuery) && fieldQuery.includes("count='101'"), fieldQuery);
    check('the second line carries the secondary column', fieldList.kind === 'rows' && fieldList.candidates[0].secondary === 'anya@acme.test', JSON.stringify(fieldList.candidates && fieldList.candidates[0]));
    check('nothing is listed on mount — only when asked', mount(onViews({})).calls().every((call) => !call.includes('?fetchXml=')));

    const noView = mount(onViews({ viewId: null }));
    const noViewList = await noView.props().list();

    check('no view on the column lists the table\'s default lookup view', noViewList.kind === 'rows' && noViewList.source === 'lookup', JSON.stringify({ kind: noViewList.kind, source: noViewList.source }));
    check('which is asked for by querytype 64 and isdefault', noView.calls().some((call) => call.includes('savedquery') && decodeURIComponent(call).includes("returnedtypecode eq 'contact' and querytype eq 64 and isdefault eq true")), noView.calls().filter((c) => c.includes('savedquery')).join(' | '));
    check('in its order', JSON.stringify(names(noViewList)) === JSON.stringify(['Andy Globex', 'Ann Acme', 'Anya Acme']), names(noViewList).join(', '));

    /*
     * Dropdown view. The column's own view does not reach a field control
     * (0.2.10 on the test form: getViewId() named nothing with a view set),
     * so a maker who wants another view names it — and gets that view or a
     * message, never a different one.
     */
    const NAMED_ID = '00000000-0000-0000-00aa-0000000000bb';
    const NAMED = { savedqueryid: NAMED_ID, name: 'Acme last first', returnedtypecode: 'contact', querytype: 0, isdefault: false, fetchxml: viewXml('desc') };
    const onNamed = (dropdownView, rows = [NAMED, LOOKUP]) => onViews({ viewId: null, fixture: views(rows), inputs: { dropdownView } });

    const byName = mount(onNamed('Acme last first'));
    const byNameList = await byName.props().list();

    check('Dropdown view, by name, is the view listed', byNameList.kind === 'rows' && byNameList.source === 'named', JSON.stringify({ kind: byNameList.kind, source: byNameList.source }));
    check('in its order', JSON.stringify(names(byNameList)) === JSON.stringify(['Anya Acme', 'Ann Acme', 'Andy Globex']), names(byNameList).join(', '));
    check(
        'asked for by name and table',
        byName.calls().some((call) => decodeURIComponent(call).includes("returnedtypecode eq 'contact' and name eq 'Acme last first'")),
        byName.calls().filter((c) => c.includes('savedquery')).join(' | '),
    );

    const byId = await mount(onNamed(`{${NAMED_ID.toUpperCase()}}`)).props().list();

    check('and by id, braced and upper-case as a maker may paste it', byId.kind === 'rows' && byId.source === 'named', JSON.stringify({ kind: byId.kind, source: byId.source }));

    const missing = mount(onNamed('No such view'));
    const missingList = await missing.props().list();

    check('a named view that is not there is unavailable, naming it', missingList.kind === 'unavailable' && missingList.view === 'No such view', JSON.stringify(missingList));
    check(
        'and the lookup view is not listed in its place',
        !missing.calls().some((call) => decodeURIComponent(call).includes('querytype eq 64')) && listQueries(missing).length === 0,
        missing.calls().join(' | '),
    );

    const quotedName = mount(onNamed("Bob's contacts"));
    await quotedName.props().list();

    check(
        'a quote in the name is doubled for the OData literal',
        quotedName.calls().some((call) => decodeURIComponent(call).includes("name eq 'Bob''s contacts'")),
        quotedName.calls().filter((c) => c.includes('savedquery')).join(' | '),
    );

    check('and Dropdown view is part of the list key', mount(onNamed('A')).props().listKey !== mount(onNamed('B')).props().listKey);

    const gone = await mount(onViews({ viewId: '00000000-0000-0000-00aa-00000000dead' })).props().list();

    check('a view id that resolves to nothing falls to the lookup view', gone.kind === 'rows' && gone.source === 'lookup', JSON.stringify({ kind: gone.kind, source: gone.source }));

    const elsewhere = { ...FIELD, savedqueryid: '00000000-0000-0000-00aa-00000000e15e', fetchxml: viewXml('desc', 'account') };
    const otherTable = await mount(onViews({ viewId: elsewhere.savedqueryid, fixture: views([elsewhere, LOOKUP]) })).props().list();

    check('a view of another table is not listed', otherTable.kind === 'rows' && otherTable.source === 'lookup', JSON.stringify({ kind: otherTable.kind, source: otherTable.source }));

    const nothing = mount(onViews({ viewId: null, fixture: views([]) }));
    const nothingList = await nothing.props().list();

    check('no view at all is unavailable', nothingList.kind === 'unavailable', nothingList.kind);
    check('and never the bare table', listQueries(nothing).length === 0 && !nothing.calls().some((call) => call.startsWith('webAPI.retrieveMultipleRecords contact')), nothing.calls().join(' | '));

    /*
     * The view is cached for the page (lib/view-aggregate's rule), so a host
     * that read it once and then refuses the list query rejects — and is not
     * swallowed, for the reason a refused search is not: the platform's words
     * are the only account of a mistyped secondary column. The component shows
     * them and falls back to the type-ahead.
     */
    let listRefused = false;

    try {
        await mount(onViews({ webApiFails: true })).props().list();
    } catch {
        listRefused = true;
    }

    check('a refused list query is reported rather than swallowed', listRefused === true);

    const two = await mount(onViews({ inputs: { dropdownLimit: 2 } })).props().list();

    check('a view with more rows than the limit is truncated, and says so', two.kind === 'rows' && two.candidates.length === 2 && two.truncated === true, JSON.stringify({ n: two.candidates && two.candidates.length, truncated: two.truncated }));
    check('one with exactly the limit is not', (await mount(onViews({ inputs: { dropdownLimit: 3 } })).props().list()).truncated === false);

    const huge = mount(onViews({ inputs: { dropdownLimit: 99999 } }));
    await huge.props().list();
    const zero = mount(onViews({ inputs: { dropdownLimit: 0 } }));
    await zero.props().list();

    check('a limit above 500 is clamped to it', (listQueries(huge)[0] || '').includes("count='501'"), listQueries(huge)[0]);
    check('and one below 1 up to it', (listQueries(zero)[0] || '').includes("count='2'"), listQueries(zero)[0]);

    const underAcme = mount(onViews({ bound: { parentValue: parentOf(ACME, 'Acme') } }));
    const acmeList = await underAcme.props().list();
    const acmeQuery = listQueries(underAcme)[0] || '';

    check('a parent narrows the list', JSON.stringify(names(acmeList)) === JSON.stringify(['Anya Acme', 'Ann Acme']), names(acmeList).join(', '));
    check(
        'as a second sibling filter beside the view\'s own',
        acmeQuery.includes(`<filter type='and'><condition attribute='parentcustomerid' operator='eq' value='${ACME}'/></filter>`) && acmeQuery.includes('statecode'),
        acmeQuery,
    );
    check('and the list key moves with the parent', underAcme.props().listKey !== fromField.props().listKey, `${underAcme.props().listKey} / ${fromField.props().listKey}`);

    const unresolved = mount(onViews({ fixture: { ...views([FIELD, LOOKUP]), relationships: [COMPANY, PARTNER] }, bound: { parentValue: parentOf(ACME, 'Acme') } }));
    const unresolvedList = await unresolved.props().list();

    check('a parent the control cannot resolve lists nothing', unresolvedList.kind === 'unavailable' && listQueries(unresolved).length === 0, unresolvedList.kind);

    const twice = mount(onViews({}));
    await Promise.all([twice.props().list(), twice.props().list(), twice.props().list()]);

    check('three opens share one list query', listQueries(twice).length === 1, `${listQueries(twice).length} list queries`);

    // Its own id: views are cached per id for the page, as on a form.
    const ampersand = {
        ...FIELD,
        savedqueryid: '00000000-0000-0000-00aa-0000000a3e5d',
        fetchxml: FIELD.fetchxml.replace('<filter type="and">', '<filter type="and"><condition attribute="fullname" operator="ne" value="A &amp; B #1" />'),
    };
    const encoded = mount(onViews({ viewId: ampersand.savedqueryid, fixture: views([ampersand, LOOKUP]) }));
    await encoded.props().list();
    const sent = encoded.calls().find((call) => call.includes('contact ?fetchXml=')) || '';

    check(
        'the view\'s own text is URL-encoded, so an & or # in a value cannot end the query',
        sent.includes('%26amp%3B') && sent.includes('%231') && !/[&#]/.test(sent.slice(sent.indexOf('?fetchXml=') + 10)),
        sent,
    );

    const typed = mount(onViews({}));
    const fallback = await typed.props().search('An');

    check('a dropdown placement can still search, for when it falls back', fallback.length > 0, `${fallback.length} found`);

    /*
     * The pure half, loaded on its own: what the component does with the rows
     * once they arrive. The bundle's Fluent is a stub here, so this is the
     * only way to reach it.
     */
    const { createLoader } = require('./modules.js');
    const load = createLoader({ root: path.join(root, 'LookupSearch'), forbid: [[/react|fluentui/, 'stay free of React']] });
    const list = load('components/list');

    /*
     * Closing once the field scrolls out of the form (0.3.1). The observer is
     * a fake that records what it was asked and fires what the test says:
     * the half that needs a browser — that an observer with no root clips by
     * the form's scroller — was measured on the form, not here.
     */
    const watch = load('lib/close-when-hidden/watch');
    const observed = [];
    let fire = null;
    let disconnected = 0;
    class FakeObserver {
        constructor(callback, options) {
            fire = callback;
            observed.push(options.threshold);
        }
        observe(target) {
            observed.push(target);
        }
        disconnect() {
            disconnected += 1;
        }
    }
    let hidden = 0;
    const stopWatching = watch.watchAnchor('field', () => (hidden += 1), FakeObserver);

    fire([{ intersectionRatio: 0.6 }]);
    check('a field more than half in view keeps the list open', hidden === 0);
    fire([{ intersectionRatio: 0.49 }]);
    check('less than half in view closes it', hidden === 1);
    fire([{ intersectionRatio: 0 }]);
    check('and a field gone in one jump closes it too', hidden === 2 && JSON.stringify(observed[0]) === '[0,0.5,1]', JSON.stringify(observed[0]));
    stopWatching();
    check('the watch is on the field, and stops when the list closes', observed[1] === 'field' && disconnected === 1);
    check('a host without IntersectionObserver leaves the list as it was', typeof watch.watchAnchor('field', () => (hidden += 1), undefined) === 'function' && hidden === 2);

    const rows = [
        { id: '1', name: 'Finland', secondary: 'FI' },
        { id: '2', name: 'France', secondary: 'FR' },
        { id: '3', name: 'Iceland', secondary: 'IS' },
        { id: '4', name: 'Poland', secondary: 'PL' },
    ];

    check('typing filters the loaded rows anywhere in the name', JSON.stringify(list.filterLoaded(rows, 'LAND').map((r) => r.name)) === JSON.stringify(['Finland', 'Iceland', 'Poland']));
    check('or the second line', JSON.stringify(list.filterLoaded(rows, 'fr').map((r) => r.name)) === JSON.stringify(['France']));
    check(
        'and keeps the view\'s order, which is not always alphabetical',
        JSON.stringify(list.filterLoaded([...rows].reverse(), 'land').map((r) => r.name)) === JSON.stringify(['Poland', 'Iceland', 'Finland']),
        list.filterLoaded([...rows].reverse(), 'land').map((r) => r.name).join(', '),
    );
    check('and an empty term is every row, in order', list.filterLoaded(rows, '  ').length === 4 && list.filterLoaded(rows, '')[3].name === 'Poland');
    check('a view whose root is another table is refused', list.listFetchXml(viewXml('asc', 'account'), { primaryId: 'contactid', primaryName: 'fullname', secondaryColumn: '', searchColumns: [] }, 'contact', 10) === null);
    check(
        'a link-entity\'s attributes go too, the link stays',
        (list.listFetchXml('<fetch><entity name="contact"><link-entity name="account" from="accountid" to="parentcustomerid"><attribute name="name" /></link-entity></entity></fetch>', { primaryId: 'contactid', primaryName: 'fullname', secondaryColumn: '', searchColumns: [] }, 'contact', 10) || '')
            .includes('<link-entity name="account" from="accountid" to="parentcustomerid"></link-entity>'),
    );
    check('a column that is not a logical name is refused before it reaches XML', list.listFetchXml(viewXml('asc'), { primaryId: 'contactid', primaryName: 'fullname', secondaryColumn: "x'/><all-attributes", searchColumns: [] }, 'contact', 10) === null);
    check('clampLimit reads a missing limit as 100', list.clampLimit(null) === 100 && list.clampLimit(undefined) === 100 && list.clampLimit(Number.NaN) === 100);

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
