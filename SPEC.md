# Lookup Search

A lookup column as a type-ahead search over the target table.

## What the build disagreed with

Nothing, and that is worth one sentence rather than a section: `refreshTypes`,
`tsc --strict`, ESLint and webpack all passed on the first run of the finished
control. The template's react field variant needed no correction to become a
lookup control — see *What the template assumed* below for the one place it
still shows.

The generated types are the part worth quoting, because they answer three
questions that would otherwise be guesses (`npm run refreshTypes`, types
1.3.18):

```ts
value: ComponentFramework.PropertyTypes.LookupProperty;
matchMode: ComponentFramework.PropertyTypes.EnumProperty<"startsWith" | "contains">;
// IOutputs
value?: ComponentFramework.LookupValue[];
```

So a bound lookup is an **array** in both directions, and `Enum` really does
generate a string union — the skill's claim, now true of a second control.

## Platform behaviour worth knowing

Most of what building this taught has been promoted to the skill, and the rule
is one home with a pointer from anywhere else. What went, and where:

| Finding | Now lives in |
| --- | --- |
| `LookupProperty`'s typed `getTargetEntityType()` / `getViewId()`, `raw` as a non-nullable array, clearing with `[]`, resyncing on `raw[0]?.id`, one bound lookup per control, and `lookupObjects` being narrower in PCF than in the Client API | `control-patterns.md`, *Lookup columns* |
| Doubling the quote before URL-encoding a `$filter`, and validating maker-supplied column names before they reach a query | `control-patterns.md`, *Escaping a `$filter`, in the right order* |
| `pcf-start` resolving the `.resx` by manifest order rather than by language | `control-patterns.md`, *Resources* |
| Neither harness being able to produce a lookup value, and what that forces `demo.fidelity` to be | `control-patterns.md`, *Lookup columns*, and `pcfhub-manifest.md`, *The demo block* |
| A virtual control having no way to force a re-render, so async results belong in React state | `control-patterns.md`, *React (virtual) controls* |

Two review-checklist entries went with them, and `SKILL.md` now names this
repository as the exemplar to read before writing a control that *reads* from
Dataverse — the counterpart to `pcf-kanban-board` and `pcf-tag-list` for
writing.

What is left here is specific to this control:

**The degraded state is a design decision, not a fallback.** Where
`getEntityMetadata` is unavailable the control disables the search box and names
why, rather than leaving a box that accepts typing and can never answer. Browse
stays available, because it depends on a different call. The alternative
considered and rejected was an input property letting the maker name the display
column by hand — it makes every maker answer a question the platform can usually
answer itself, to serve a host where the control is not really supported.

**`matchMode` is an `Enum`, and the default is the fast one.** `startsWith` is
servable from an index; `contains` is a scan. Making the slower one opt-in means
a maker who thinks about nothing gets the cheap query, and a maker who needs
substring matching has made that choice on purpose. The docs say what it costs.

**The theme comes from `context.fluentDesignLanguage?.tokenTheme`** with a
`webLightTheme` fallback, which the skill already documented — including that it
is typed as of 1.3.18 and needs no cast. Confirmed again here against
`@fluentui/react-components@9.46.2` under `strict`.

## Demo

**`mocked` from 0.2.0, on a stand-in Dataverse** — and **it needs pcfhub's
`demo-dataverse-field` deployed first.** Until then the hub reads a
`dataverse`-only fixture as malformed, so this `pcfhub.json` and
`demo/contacts.json` must not reach the default branch before the hub change
does.

`demo/contacts.json` is the whole fixture for a field control: a `dataverse`
section with twelve contacts across three accounts, the two contact → account
lookups the test environment has (`parentcustomerid`, `msa_managingpartnerid`),
and `lookupTargets` so an empty lookup still names its table. It travels
beside the props, and the harness answers `getEntityMetadata`,
`retrieveMultipleRecords` (including the `or` a multi-column search sends),
`ManyToOneRelationships` and `lookupObjects` from it.

Watched 2026-09-24 in the hub's own harness (`npm run dev:demo-harness`, the
bundle served from this repository): *search* lists six "an" contacts with
their addresses and Browse opens the dialog, a pick lands as a chip;
*filtered* says "Filtered by Acme Corporation", hides Browse and offers only
Ann Acme and Anya Petrova; *two linking columns* shows the same message the
real form did; *selected* renders its chip with Browse back.

What it cannot show, and `demo.limitations` says so: the unbound message (the
harness builds every lookup as mapped), a refused request, and a parent
changed by the user — a preset switch is the only way to move it.

**A refused request stays out of reach after pcfhub/pcfhub#53** (2026-09-28).
That let a fixture refuse a *write*, and this control writes nothing: the form
saves the lookup it hands back through `value`. Its one request is the search,
a read, and the stand-in answers every read. Showing a refused search would
take the harness refusing reads, and a fixture per preset: one contact table
that refuses reads would break every preset, not one. The limitation now says
why, instead of saying the stand-in grants everything, which stopped being
true.

**One oddity to look at, not yet explained:** after clearing the chip with
the ×, typing ran the search (the query is in the log) but the list did not
open until the field was clicked again. Not seen on the real form, where the
same path was used in test (b). If it reproduces there, it is the focus the
clear restores racing the popup's own open state.

## What a real form settled

The control was placed on a contact lookup and typed into. Two entries moved out
of *Not verified* on the strength of what that proved, and one bug came back.

**`getTargetEntityType()` and `getEntityMetadata()` both work**, and neither
needed a fallback. This is inference rather than a console reading, but it is
tight: the search only runs when `canSearch` is true, `canSearch` is true only
when the metadata call resolved with both column names, and that call is only
made against a non-empty target. A request was sent, so both returned.

**`context.webAPI` does not reject with an `Error`.** It rejects with a plain
object carrying `errorCode` and `message`, exactly as the Client API's
`errorCallback` documents — and the usual
`error instanceof Error ? error.message : String(error)` therefore rendered the
literal string **`[object Object]`** under the field. Every webAPI failure would
have shown it, which means the control's only account of what went wrong was
replaced by a message that says nothing. Fixed in `describeError`, which reads
`message` off an object shape before falling back to a localised sentence.

**The search then worked, and the failure was never read.** By the time the
message rendered rather than stringified, the query no longer failed — so what
the original rejection said is not recorded anywhere and now cannot be. The
likeliest cause is the one thing that changed in the query between the two runs:
`$orderby=<column> asc` carried a literal space, and it is now `%20`. That is a
hypothesis, not a finding, and it is written here as one.

The screenshot in `media/` is the state that settled it: two matching contacts
listed under the field, each with the email address on a second line. That one
image is worth four separate verifications — the query Dataverse accepts, the
`toCandidates` mapping including a formatted secondary value, the listbox styling
reaching portalled content, and the dropdown sized to the whole field rather than
to the Combobox inside it.

## 0.2.0: a parent lookup

Chosen from outside and inside at once: filtering a lookup by another column
on the form is one of the most repeated model-driven questions, answered with
`addPreSearch` script or the form designer's single-relationship "filter by
related rows" — and "No filtering beyond the columns you name" was this
repository's own limitation, written as a refusal.

The decisions, each asserted and mutation-tested in `dev/smoke.js`:

- **A second bound `Lookup.Simple`, optional.** The column picker it renders
  is the feature. Unmapped is `type === null` (address-autocomplete's
  measurement, not this repository's — see below); an unmapped parent sends the
  0.1.x query byte for byte, and the suite compares the two strings.
- **The linking column is read, not configured.** `ManyToOneRelationships` of
  the searched table, filtered on `ReferencedEntity`. One candidate filters; two
  or more is `ambiguous` and `parentColumn` must name one *of them*; none is
  `none`. `components/parent.ts`, pure.
- **Every state that cannot filter turns the search off.** Unreadable
  relationships (offline, 403, no `context.page`) included. Widening would
  offer exactly what the maker meant to exclude.
- **Browse is hidden while filtered**, because `lookupObjects` has no
  `filters`. Decided without a probe: the typings and Microsoft's reference
  agree the option does not exist, and an untyped option the platform happened
  to honour would be a behaviour nothing promises to keep.
- **`clear` asks first**, with one `maxPageSize: 1` query, and keeps the value
  on any failure, on the first pass, and when the parent is emptied.

Moving to the template's rig found one real bug on the way in: a Browse pick
was written back braced and upper-case, because the old host answered
`lookupObjects` in the shape the control expected. Ids now go through `bareId`.

## What a real form settled for 0.2.0

Measured 2026-09-23 on the Account main form of the test environment, with the
control on **Primary Contact** and **Parent value** bound to **Parent
Account**. The Opportunity table is not installed there, so the form the docs
use as the example was not the one tested; the relationship is the same one
(contact's `parentcustomerid` to account).

- **Relationships arrive as logical names, and contact → account is
  ambiguous in the ordinary case.** The field showed *"More than one column
  links this table to account. Set Parent column to one of:
  msa_managingpartnerid, parentcustomerid."* — sorted, the search box off.
  `msa_managingpartnerid` comes with a Microsoft package, so a maker should
  expect to set Parent column here; `docs/examples.md` says so.
- **A Parent column that is not a candidate is refused.** It was first set to
  `parentaccountid` — Account's own column — and the message above stayed.
- **The filter holds.** With `parentcustomerid` named: under *PCF Test - Acme*,
  typing `an` offered Ann Acme and Anya Acme and not Andy Globex, whose name
  also matches; under *PCF Test - Globex*, Andy only. "Filtered by …" under
  the box, and no Browse button, both times.
- **A parent changed on the form reaches `updateView` before any save.** The
  hint read "Filtered by PCF Test - Globex" while the record was still
  *Unsaved*.
- **The write persists.** Ann picked from the list, saved, and still there
  after a refresh — the first time a pick from this control has been watched
  reaching the column, so the 0.1.x entry about it is settled too.
- **`keep` keeps.** Changing the parent to Globex left Ann in place.
- **`clear` clears only a record that no longer belongs.** With Ann selected,
  clearing the parent left her, and choosing Globex then emptied her — the
  check runs on the next parent that holds a record, which is the design.
  *PCF Test - Mismatch* (parent Acme, contact Andy Globex) kept Andy on load.
  Emptying the parent never cleared the contact, and Browse came back.

**The labels changed after the form run.** The first configuration put
Account's own column into what was then *Parent column* and left *Parent
value* unmapped — and the control searched the whole table in silence. So the
two are now **Filter by (parent lookup)** and **Linking column (only if
asked)**, and a Linking column with no Filter by mapped is a state of its own,
`unbound`, that turns the search off and says why. Only display strings and
that one state changed; the property names are the same, so a form configured
under the old labels keeps its settings.

## Probe 0.2.9: what a dropdown rests on

Asked before 0.3.0 was written, because the PCF Gallery request board's
most-voted topic (30 votes, read 2026-10-13) is "render a lookup as a
dropdown", and every part of the answer rests on platform behaviour this
repository had not watched. The rule stated up front: an answer that goes the
wrong way removes what depends on it.

P2–P5 were measured on 2026-10-13 against the test environment's Web API with
the same FetchXML the probe sends through `context.webAPI` — the server's
answer does not depend on which client asks. P1 is the one question only the
form can answer.

- **P2 — the table's default lookup view is one row and carries the
  filter the request asks for.** `savedqueries?$filter=returnedtypecode eq
  'contact' and querytype eq 64` answered exactly one view, *Contacts Lookup
  View*, `isdefault: true`, whose FetchXML is ten `<attribute>`s, a
  `<filter>` on `statecode eq 0` and `<order attribute="fullname">`. So
  "retire a value and it leaves the list" is the platform's own lookup view
  doing what it already does, not something this control adds.
- **P3 — the view rewritten runs, in the view's order, and `count` is the
  limit.** Every `<attribute>` removed and three put back (`contactid`,
  `fullname`, `emailaddress1`), the `<filter>` and `<order>` untouched,
  `count="6"`: 6 rows, `@Microsoft.Dynamics.CRM.morerecords: true` and a
  paging cookie. At `count="501"` all 25 active contacts, `morerecords`
  absent. The order is the server's collation — case-insensitive, `charles`
  between `asasadsdas` and `Charles Ll` — and `descending="true"` reverses it.
  So the client must **keep the server's order** and filter without
  re-sorting; a JavaScript sort disagrees with SQL's on ties of case.
  Truncation is read as *one row more than the limit came back*, which needs
  no annotation. A `<link-entity>` whose own `<attribute>` was removed still
  runs (left as an empty element), so stripping at every depth is safe.
- **P4 — a deactivated row is not listed.** Ten inactive contacts in the
  environment, none of them among the 25 the rewritten view returned, which is
  every active one.
- **P5 — a parent condition as a second sibling `<filter>` narrows the
  view.** `parentcustomerid eq` *PCF Test - Acme* beside the view's own
  `statecode` filter: Ann Acme and Anya Acme, the same two the 0.2.0 search
  offers under that parent. FetchXML ANDs sibling filters, as `pcf-data-table`
  measured for the runtime filter.
- **P6 — not measurable here.** The environment has 25 active contacts; the
  first request took 3,057 ms (cold), the next 121–304 ms. A 500-row list is
  timed in the rig instead.
- **P1 — `getViewId()` on a field control names no view, set or not.**
  Read on the form 2026-10-13 from 0.2.10's own requests, which read a view by
  id whenever `getViewId()` names one. *Left alone* — Currency, no view on
  the column — no `savedqueries(<id>)` read was sent and the list came from
  the lookup view. *Set* — Primary Contact with `<DefaultViewId>` patched to
  *Inactive Contacts* and published; the Client API's
  `getControl('primarycontactid').getDefaultView()` answered
  `{00000000-0000-0000-00AA-000010001033}` — and still no read by id, and the
  25 **active** contacts listed. So "the view set on the column" went the wrong
  way, and by the rule it is removed from what the control promises: the
  docs say the table's default lookup view, and a maker who wants another
  names it in a new **Dropdown view** property (name or GUID). `getViewId()` is
  still asked, second, for a host that answers it — it costs nothing when it
  does not. The same reading means Browse's `defaultViewId` has been empty on
  this host all along; the overview no longer says Browse opens on the
  configured view.

## What the form settled for 0.3.0

Walked on the test environment's account form, 2026-10-13, build 0.2.10, two
placements: **Currency** (`transactioncurrencyid`, dropdown, secondary
`isocurrencycode`, no Browse) bound with `ppdev form control bind`, and the
existing **Primary Contact** placement switched to dropdown by patching the
published form XML.

- **The dropdown opens on click, with the chevron, and lists the view.**
  Currency: *US Dollar* with *USD* on the second line. The one list request:
  the lookup view's FetchXML with its six attributes swapped for three, its
  `<order>` kept, `count='101'`.
- **Typing filters without asking the server.** `acme` narrowed 25 contacts to
  Ann Acme and Anya Acme; the network log held exactly one `contacts?fetchXml=`
  request for the whole session.
- **The keyboard chooses.** Down then Enter picked Anya Acme; the chip
  rendered and `getAttribute('primarycontactid').getValue()` held her
  (`{B5EF9F52-…}`). The save was refused by the form's own required fields
  (Main Phone, Parent Account), not by the control — the write-back is the
  0.2.0 path whose save was measured then.
- **A parent changed on the form narrows the dropdown before any save.**
  Parent Account set to *PCF Test - Acme* through the Client API: "Filtered by
  PCF Test - Acme" under the field, Browse gone, and the reopened list read
  again and held Ann Acme and Anya Acme only.
- **A long list was placed beside the field — fixed in two steps.** 25 rows
  did not fit above or below, and Fluent's positioning put the listbox over
  the form's other column. With `overflow-y: auto` (0.2.11) it opened below
  and scrolled, but ran to the bottom of the window: the positioning writes
  the room left as an **inline** `max-height` (`614px` read from the style
  attribute), which outranks any stylesheet rule. `max-height: min(320px,
  45vh) !important` — injected on the live form before it shipped — gave a
  320 px list below the field, scrolling.

Build 0.2.11 added **Dropdown view**, because of P1, and was walked the same
evening on Primary Contact:

- **A named view is the one listed.** `Inactive Contacts` with *Dropdown
  rows* 5: Charles Llamas, Charles Llamas, Charles Llamas de la Cruz, don
  ramon, jose lopez — inactive contacts, in the view's order — and *Showing
  the first 5. Type to narrow the list, or narrow the view.* at the end.
- **A misspelt one is named back, and the field searches.** `Inactive
  Contactz`: *The view "Inactive Contactz" could not be read, so this field
  searches as you type instead. Check Dropdown view.*, the chevron gone, and
  `ann` found Ann Acme, Paul Cannon and Scott Konersmann through the
  placement's own search columns. No lookup view was listed in its place.

The form was put back afterwards: Primary Contact in search mode with no
view set; the Currency dropdown stays on the test form as a placement to look
at.

## Not verified

- **The unmapped shape on this control.** A form with no Parent value mapped
  searching exactly as 0.1.x did is inferred from address-autocomplete's
  measurement (`type: null`, `raw: null`) and from the suite's byte-for-byte
  comparison, not watched here. One look at an existing 0.1.1 placement after
  the upgrade settles it.
- **A cleared contact surviving Save.** `clear` emptying the field was watched;
  saving the record afterwards and finding the column empty was not.
- **The record link on the chip.** The chip itself has been seen on a form —
  rendered from a value the platform supplied — but `navigation.openForm` behind
  the record name has never been clicked.
- **Browse.** `lookupObjects` opening at all. Seen *hidden* while filtered and
  back once the parent was emptied; never clicked. Its `defaultViewId` is
  empty on a field control, now that P1 is measured, so whatever view it opens
  on is the platform's choice.
- **The demo presets' bound value shape.** `"value": [{ id, name, entityType }]`
  assumes the harness builds a usable property from an array of plain objects.
  If it does not, the default preset renders as empty and the demo says nothing
  useful. Proof is one look at the published demo after the first release.
- **Wildcards in a search term.** Dataverse treats `%` and `_` as wildcards in
  string filters, and `encodeURIComponent` turns a typed `%` into `%25`. Whether
  that arrives as a literal percent or as a wildcard is untested; a user typing
  `50%` is the case that would show it.
- **The `Combobox` by keyboard, in search mode.** Down and Enter chose a
  record in **dropdown** mode on the form (0.3.0 walkthrough); the type-ahead
  has not been driven that way, nor focus returning to the field afterwards.
- **Dropdown mode on a phone, in another language, or with a screen reader.**
  The web client in English, in the browser pane, is where every 0.3.0 claim
  was checked.
- **A view with a link-entity filter, and a list near the 500 ceiling.** Both
  are asserted against the rig (the link stays, the ceiling clamps), and P3
  ran a stripped link-entity on the server; neither was opened in a dropdown
  on the form, whose largest table here has 25 active rows.
- **A personal view named in Dropdown view.** `userquery` is read after
  `savedquery` for a GUID, as `lib/view-aggregate` does; a *name* is matched
  against system views only.

## What the template assumed

Not a platform finding — a note for `_template`, since this control was built to
find them.

The react field variant models a bound value as a **string**: `private value =
''`, `lastIncoming: string | undefined`, and a resync that compares the two
directly. Every non-string binding rewrites the same three places, and the
lookup rewrite is representative rather than special — the value became an
object inside an array, and the guard became a comparison on `id` because each
pass hands down a fresh object whose identity means nothing.

The variant is still the right starting point; what it could say is that the
resync guard compares *content*, and that what counts as content depends on the
binding. The comment beside it currently demonstrates the string case without
naming the rule.

## Promoting a finding

All five findings from building the control were promoted at skill version
0.11.0 — the table under *Platform behaviour worth knowing* says which section
each landed in.

The bug the form reported went with them, at 0.11.1: `context.webAPI` rejecting
with a plain `{ errorCode, message }` rather than an `Error` is now a section of
its own in `control-patterns.md`, carrying the `describeError` shape that fixes
it. The review checklist's item about not swallowing webAPI errors gained a
second item beside it — that the visible state shows the *message*, not the
object. This control satisfied the first and failed the second, which is what
the pair is there to catch.

The dead-stylesheet bug went with them at 0.11.2: a portalled Fluent surface is
not a descendant of the control's root, so rules scoped under the root class
silently reach nothing inside it. This control shipped two of them — the name
and secondary line of every result row — and found them only by reading Fluent's
source. `control-patterns.md` now carries it beside the `FluentProvider` note,
which had covered the theming half of the same fact and not the styling half.

Nothing is queued.

One correction went with them rather than a promotion: an earlier draft of this
file said `pcf-choices-picker` hard-codes `webLightTheme` and so asserts a light
palette over whatever the environment uses. It does not — it reads
`fluentDesignLanguage.tokenTheme` and falls back to `webLightTheme`, which is
the documented pattern. What it does still carry is an `as unknown as` cast and
a comment saying the property is untyped: both were true before types 1.3.18 and
are now merely stale. The skill already records that, and fixing it belongs to
that repository.
