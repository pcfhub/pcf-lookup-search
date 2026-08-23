---
title: API reference
description: Properties and outputs, generated from the control manifest.
order: 5
---

# API reference

<!--
  Do not write the property tables by hand.

  `props-table` renders from what the hub parsed out of
  ControlManifest.Input.xml at the release being viewed, so it cannot drift from
  the control. A hand-written table is wrong the first time somebody adds a
  property and forgets this file, and a reader has no way to tell.

  kind: input | bound | output | dataset | dataset_column
  Omit `kind` to render every property in one table.
-->

## Input properties

::props-table{kind=input}

## Bound properties

::props-table{kind=bound}

## Outputs

::props-table{kind=output}

## Notes

**`value` is an array.** A `Lookup.Simple` property carries a `LookupValue[]`
rather than a single value: empty when the column holds nothing, and one element
otherwise. Clearing the column means writing an empty array back, which is what
the Clear button does. The element is `{ id, name, entityType }`.

**`searchColumns` is a comma-separated list of logical names** —
`emailaddress1,telephone1`, with or without spaces. Entries that cannot be a
logical name at all are ignored rather than sent. The target table's primary
name column is always searched and does not need to be listed.

**`secondaryColumn` takes one logical name.** Its *formatted* value is shown
where Dataverse provides one, so a choice column reads as its label and a lookup
as the related record's name rather than as a GUID.

**`matchMode` changes the OData function**, not the ranking:
`startsWith` sends `startswith(column,'…')` and `contains` sends
`contains(column,'…')`. There is no relevance ordering in either case — results
come back sorted by name.

**`minimumCharacters` is floored at 1** and `maxResults` is clamped to 1–50. A
value outside those ranges is corrected rather than refused, because a canvas
formula or a stale configuration should not be able to send an unbounded query.

**Both features are optional.** Where `WebAPI` or `Utility` is unavailable, the
search box is disabled and says so; the bound value still renders, and `Browse`
still works if `Utility` is present.

