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

`limited`, and the skill's demo section names this exact case: a type-ahead that
searches records the harness was never given is `limited`, because the search
box has no candidates and cannot be made to have any.

Four platform calls, and the harness answers none of them —
`retrieveMultipleRecords`, `getEntityMetadata`, `lookupObjects`, and
`getTargetEntityType` on the property itself. What remains is genuinely
interactive: the selected record renders, Clear empties it and reports the new
value, and the disabled, hidden, no-access and business-rule-error states are
all reachable from presets. `demo.limitations` names each dead path and what a
real form does instead.

The consequence worth flagging: **the demo's default state is the control's
degraded state**, which no correctly configured form ever shows. The limitations
say so rather than leaving a visitor to conclude the control is broken.

## Not verified

Everything below needs a model-driven form, and none of it has met one.

- **`getTargetEntityType()` returning the target on a real lookup column.** The
  whole control is built on it. What would prove it: place the control on a
  contact lookup and confirm the search queries `contact`.
- **`getEntityMetadata()` returning `PrimaryIdAttribute` / `PrimaryNameAttribute`
  by name.** Read as `metadata.PrimaryNameAttribute` rather than by walking the
  object, per the skill's warning about prototype getters — but the specific
  field names are from the Dataverse metadata schema, not from an observed call.
- **The write reaching the column.** `getOutputs` returns a one-element array;
  that a form persists it, and that `[]` clears it, is untested.
- **`lookupObjects` opening on `defaultViewId`.** The view id comes from
  `getViewId()`, which has the same harness caveat as the target.
- **The demo presets' bound value shape.** `"value": [{ id, name, entityType }]`
  assumes the harness builds a usable property from an array of plain objects.
  If it does not, the default preset renders as empty and the demo says nothing
  useful. Proof is one look at the published demo after the first release.
- **Wildcards in a search term.** Dataverse treats `%` and `_` as wildcards in
  string filters, and `encodeURIComponent` turns a typed `%` into `%25`. Whether
  that arrives as a literal percent or as a wildcard is untested; a user typing
  `50%` is the case that would show it.
- **Fluent's `Combobox` in `freeform` mode with a controlled `value`.** It
  renders, and the empty and disabled states were driven in the harness — but no
  option has ever been selected from it, because nothing local can produce
  results to select. Selection, the popup's keyboard behaviour and focus
  returning to the field after a pick are all untested.

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

All five findings this control produced have been promoted, at skill version
0.11.0 — the table under *Platform behaviour worth knowing* says which section
each landed in. Nothing is queued here.

One correction went with them rather than a promotion: an earlier draft of this
file said `pcf-choices-picker` hard-codes `webLightTheme` and so asserts a light
palette over whatever the environment uses. It does not — it reads
`fluentDesignLanguage.tokenTheme` and falls back to `webLightTheme`, which is
the documented pattern. What it does still carry is an `as unknown as` cast and
a comment saying the property is untyped: both were true before types 1.3.18 and
are now merely stale. The skill already records that, and fixing it belongs to
that repository.
