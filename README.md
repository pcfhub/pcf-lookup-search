# Lookup Search

A lookup column as a type-ahead search over the target table.

[![Build](https://github.com/pcfhub/pcf-lookup-search/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-lookup-search/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-lookup-search/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-lookup-search/actions/workflows/release.yml)

Documentation lives on [PCFHub](https://pcfhub.dev/components/pcf-lookup-search), built
from the `docs/` directory in this repository. Edit the Markdown here; the hub
recompiles it.


## What it does

Replaces the stock lookup on a model-driven form with a type-ahead that searches
the columns you name, not only the one Dataverse calls the record's name. A
maker points `Search columns` at an email address or a reference number, and a
user who remembers the address instead of the spelling finds the record anyway.
Each match can carry a second line — `Secondary column` — which is the
difference between choosing from a list of eleven J. Martins and giving up.

Two decisions are worth knowing before reading the code.

**The control does not know its own target table, and asks twice.** The bound
property answers `getTargetEntityType()`, and `utils.getEntityMetadata()`
answers which of that table's columns is the name. Both calls are model-driven
only, and both are made defensively: the first is a typed method that the hub's
demo harness does not implement, and the second does not exist off a real form.
Where either is missing the control does not fall back to guessing — the search
box is disabled and says so, the current value still renders, and Browse still
works. A search box that accepts typing and can never answer is the outcome
worth avoiding.

**Both platform features are declared optional**, and that is not caution. With
`required="true"`, a host lacking a feature does not hand the control a degraded
context — it fails the component load outright, and the symptom is blank space
on a form pointing nowhere near one XML attribute. So the manifest asks
optionally and the code feature-detects, which is deliberately narrower than the
type definitions claim.


## Properties

| Property | Type | Usage | Default | What it controls |
| --- | --- | --- | --- | --- |
| `value` | Lookup.Simple | bound, **required** | — | The lookup column this control reads and writes. `raw` is a `LookupValue[]`; an empty array is how it is cleared |
| `placeholder` | SingleLine.Text | input | — | Hint text shown while no record is selected |
| `matchMode` | Enum | input | `startsWith` | `startsWith` or `contains`. Decides which OData function the filter uses |
| `minimumCharacters` | Whole.None | input | `2` | How much must be typed before a query is sent. Floored at 1 |
| `maxResults` | Whole.None | input | `8` | How many matches to show. Clamped to 1–50 |
| `secondaryColumn` | SingleLine.Text | input | — | One logical name, shown under each result. The formatted value is preferred where Dataverse supplies one |
| `searchColumns` | SingleLine.Text | input | — | Comma-separated logical names to match in addition to the primary name column |
| `allowBrowse` | TwoOptions | input | `true` | Whether the platform's own lookup panel is offered beside the search box |

The single output is `value`, the same `LookupValue[]`.

Notes that do not fit the table:

- **Localised into five languages** — 1031 German, 1033 English, 1036 French,
  1041 Japanese, 3082 Spanish — covering the property names and descriptions a
  maker reads as well as every string the control renders.
- **React and Fluent are not bundled.** This is a virtual control declaring both
  as `<platform-library>` entries, so the host resolves them at runtime.
- **Two permission prompts at install**, `WebAPI` and `Utility`, both declared
  optional. What each is for is in
  [docs/installation.md](docs/installation.md).


## On the hub

`demo.fidelity` is **`limited`**, and there is no argument for anything higher.
The control's entire reason to exist is a Dataverse query, and no environment
sits behind the demo origin to answer one. Typing therefore reaches the same
degraded state a canvas app would show — the search box disabled, saying it
cannot search — which is honest, but it is the one thing a real form never
displays.

Three of the four platform calls are gone in the demo, and
`demo.limitations` names each: `retrieveMultipleRecords` has nothing to answer
it, `getEntityMetadata` is absent so no target column is ever resolved, and
`lookupObjects` has no panel to open. `getTargetEntityType()` is the fourth —
the harness builds a property bag with no methods, so the target falls back to
the `entityType` carried by the preset's own value.

What does work is everything that never leaves the browser, and the presets are
chosen to show it: **A record selected** is the state a form is usually in, with
Clear reporting the new value; **Nothing selected** is the empty lookup, which
in the demo also has no target and says so; **Search only** is the same control
with Browse switched off. Every preset sets every input property, because a
manifest `default-value` arrives at the harness as the raw XML string and
`Boolean("false")` is `true`.


## Install

Download the managed solution from the
[latest release](https://github.com/pcfhub/pcf-lookup-search/releases/latest), or from
the component's page on the hub, and import it into your environment.

## Develop

```bash
npm install
npm start          # the PCF test harness
npm run build
npm run lint
npm run check      # what CI runs first: placeholders, pcfhub.json, control shape
```

Run `npm run refreshTypes` after every manifest edit — until you do,
`context.parameters` is typed from the old manifest and `tsc` will accept code that
cannot work.

To pack the solution locally you need msbuild — either Visual Studio or the
Visual Studio Build Tools:

```bash
cd Solution
msbuild /t:build /restore /p:configuration=Release
```

Both zips land in `Solution/bin/Release`. This is the only local step that compiles
in **production** mode, so a green `npm run build` is not evidence the shipping
bundle compiles — and the pack is incremental, so delete `obj/`, `out/`,
`Solution/obj/` and `Solution/bin/` first if you intend to quote a bundle size from
it.

## Release

1. Bump the version in **three** places, in one commit — they are checked
   against each other in CI:
   - `LookupSearch/ControlManifest.Input.xml` → `<control version="…">`
   - `Solution/src/Other/Solution.xml` → `<Version>`
   - `package.json` → `"version"`
2. Tag it: `git tag v1.2.3 && git push --tags`

The release workflow builds, packs both solution types, and attaches them to a
GitHub Release. PCFHub picks the release up from its webhook within seconds, or
from the hourly sweep otherwise. A sync imports a draft; a person publishes it.

## Repository layout

| Path | What it is |
| --- | --- |
| `LookupSearch/` | The control: manifest, entry point, CSS, localised strings |
| `Solution/` | The Dataverse solution that packages it |
| `SPEC.md` | What building this corrected, and what is verified versus read |
| `docs/` | The pages PCFHub publishes — see the comments in each file |
| `media/` | Images and video referenced from the docs |
| `pcfhub.json` | The hub's manifest: identity, links, docs path, demo |
| `scripts/` | Template setup and the CI guard that keeps it adopted |

## Licence

[MIT](LICENSE)
