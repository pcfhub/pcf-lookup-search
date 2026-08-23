---
title: Limitations
description: What Lookup Search does not do.
order: 7
---

# Limitations

- **Model-driven apps only.** `Lookup.Simple` properties cannot be bound in a
  canvas app, and the two platform calls this control makes — `webAPI` for the
  search, `utils.getEntityMetadata` for the target table's name column — are
  model-driven surfaces. This is a platform constraint rather than a decision,
  and it is not going to be lifted here.

- **One target table.** The control searches the table its lookup points at. A
  polymorphic lookup — a customer field accepting accounts *or* contacts, a
  regarding field accepting many — is not supported; use the stock lookup there.

- **No filtering beyond the columns you name.** There is no way to restrict
  results to, say, active records only. `context.webAPI` offers five methods and
  none of them takes the form's other values into account, and the framework's
  own `lookupObjects` — unlike the Client API's version of the same call — has
  no `filters` option to pass one through. The Browse panel does honour the
  view configured on the column, so a view with its own filter is the way to
  narrow what a user browses.

- **Results are ordered by name, not by relevance.** Dataverse returns matches
  sorted by the primary name column. A record whose *email* matched sorts
  wherever its name puts it, which can look arbitrary when the name is not what
  the user typed.

- **`Contains` is a scan.** `startswith` can be served from an index and
  `contains` cannot. On a table with hundreds of thousands of rows the
  difference is visible, and raising `Minimum characters` alongside it is the
  mitigation.

- **A wrong column name is reported, not prevented.** `Search columns` and
  `Secondary column` are free text, and nothing at configuration time knows
  which columns the target table has. A name that could not be a logical name is
  dropped; a plausible but wrong one reaches Dataverse, and the error it returns
  appears under the field.

- **No recently-used list.** The platform lookup offers most-recently-used
  records before you type. This control has nothing to show until a search
  returns, and the framework exposes no MRU list to read.

- **The demo on this page cannot search.** Nothing behind it can answer a
  Dataverse query. See the demo's own limitations, listed beside it.
