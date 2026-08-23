---
title: FAQ
description: Questions that come up more than once.
order: 8
---

# FAQ

## The search box is disabled and says search is unavailable. Why?

The control could not read the target table's name column. That call —
`utils.getEntityMetadata` — is model-driven only, so the usual cause is a host
that is not a model-driven app: a canvas app, a preview surface, or the test
harness.

The state is deliberate. A search box that accepts typing and can never return
anything is worse than one that says it cannot search, so the box is disabled
and **Browse** is left available.

## Why does nothing happen until I have typed two characters?

`Minimum characters` defaults to 2. One character matches most of a table, which
costs a query to produce a list nobody can use. Lower it to 1 if the table is
small.

## Can I filter the results — active records only, or by another field on the form?

Not from this control. See [Limitations](limitations.md): the framework's Web
API takes no such context, and its `lookupObjects` has no filter option. A view
with the filter built in, set on the column, will at least narrow what
**Browse** shows.

## Can it search a customer or regarding lookup?

No. Those point at more than one table, and this control searches one. Use the
stock lookup there.

## Does it work offline / on mobile / in a phone layout?

It renders in phone and tablet layouts, and the search needs a connection like
any other Dataverse query. It is not built for mobile offline: the offline Web
API supports a narrower set of query options than this control sends. See
[Limitations](limitations.md).

## How do I report a bug?

Open an issue at <https://github.com/pcfhub/pcf-lookup-search/issues>, with the
platform version and the control version from the solution. If a search is
failing, the message shown under the field is the useful part.
