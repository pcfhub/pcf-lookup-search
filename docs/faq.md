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

## Can I filter the results by another field on the form?

By another **lookup**, yes, from 0.2.0: map **Parent value** to it, and the
search offers only records related to the parent. See
[Model-driven apps](model-driven.md#filtering-by-a-parent-column). A Choice
column or a fixed condition such as *active records only* is not supported;
for those, a view with the filter built in, set on the column, narrows what
**Browse** shows.

## Why did Browse disappear?

Because a parent is filtering the search. The platform panel Browse opens
cannot be narrowed from a code component, so it would list every record the
search is holding back. Browse comes back while the parent is empty.

## The field says more than one column links the tables. What do I set?

Set **Parent column** to one of the names the message lists — the lookup on the
searched table that points at the parent you mapped. A contact, for instance,
can point at an account both as its company and through a custom column, and
the control will not guess which one you mean.

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
