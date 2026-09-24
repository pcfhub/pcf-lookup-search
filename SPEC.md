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
- **Browse.** `lookupObjects` opening at all, and opening on the `defaultViewId`
  taken from `getViewId()`. Seen *hidden* while filtered and back once the
  parent was emptied; never clicked.
- **The demo presets' bound value shape.** `"value": [{ id, name, entityType }]`
  assumes the harness builds a usable property from an array of plain objects.
  If it does not, the default preset renders as empty and the demo says nothing
  useful. Proof is one look at the published demo after the first release.
- **Wildcards in a search term.** Dataverse treats `%` and `_` as wildcards in
  string filters, and `encodeURIComponent` turns a typed `%` into `%25`. Whether
  that arrives as a literal percent or as a wildcard is untested; a user typing
  `50%` is the case that would show it.
- **The `Combobox` by keyboard.** A pick with the pointer is now settled (see
  above). Choosing with the arrow keys and Enter, and focus returning to the
  field afterwards, are not.

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
