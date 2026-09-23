---
title: Overview
description: What Lookup Search does, and when to reach for it.
order: 1
---

# Lookup Search

A lookup column as a type-ahead search over the target table.

::image{src=media/screenshot.png alt="Typing two characters into a contact lookup, with two matching records listed beneath the field and each showing its email address on a second line" zoom}

Place it on any `Lookup.Simple` column. It reads the table that column points
at, asks Dataverse which of that table's columns is the record name, and
searches it as the user types — showing each match with an optional second line,
and writing the chosen record straight back to the column.

## Why this one

- **It searches the columns you name, not just the primary one.** The stock
  lookup finds records by name. This one takes a comma-separated list of extra
  columns — an email address, a reference number, a phone number — and matches
  any of them, which is how people actually remember the record they are after.
- **It shows a second line.** A list of eleven people called *J. Martin* is not
  a choice. Point `Secondary column` at the column that tells them apart and it
  appears under each result.
- **It can follow another lookup on the form.** Map *Parent value* to the
  form's Account and the contact search offers only that account's contacts —
  the cascading lookup that otherwise takes an `addPreSearch` script. It finds
  the linking column from the table's relationships, and asks rather than
  guesses when there are two.
- **It does not replace the platform panel, it keeps it.** The Browse button
  opens the environment's own lookup dialog, on the view the maker configured
  for the column. When the search box cannot find something, the way out is one
  click rather than a different control.

## What it works with

:::callout{type=info}
**Model-driven apps only.** `Lookup.Simple` properties are a model-driven
feature — a canvas app cannot bind one at all — and the two platform calls this
control makes, `webAPI.retrieveMultipleRecords` and `utils.getEntityMetadata`,
exist only there as well. There is no canvas page in this documentation because
there is no canvas story to tell.
:::

On a host that offers no entity metadata, the control does not pretend: the
search box is disabled, it says why, and Browse — if enabled — still works.
