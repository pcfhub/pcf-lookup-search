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

- **One parent, and it must be a lookup.** The search can follow one lookup
  on the form (**Filter by**). A Choice column, several parents at once, or
  a fixed condition such as *active records only* are not supported;
  `context.webAPI` takes no form context of its own, and the parent is the one
  value the platform hands the control. A view with the filter built in, set
  on the column, narrows what **Browse** shows.

- **Browse is hidden while a parent filters the search.** The framework's
  `lookupObjects` — unlike the Client API's version of the same call — has no
  `filters` option, so the panel cannot be narrowed to the parent. Offering it
  would list every record the search holds back.

- **A filtered search is off, not widened, when the filter cannot be worked
  out.** When the searched table's relationships cannot be read, or nothing on
  it points at the parent's table, the field says so and nothing is searched.

- **`On parent change: Clear it` asks before it clears.** It runs one query for
  the chosen record under the new parent, and keeps the value if that query
  fails. Emptying the parent never clears the record.

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
