---
title: Installation
description: Import the solution and make the control available.
order: 2
---

# Installation

:::steps
1. Download the **managed** solution for your environment.
2. In the Power Platform admin centre, import the solution.
3. Publish all customizations.
:::

:::callout{type=warning}
Import the managed solution into production. The unmanaged one is for a
development environment where you intend to change the control itself — it
cannot be cleanly uninstalled.
:::

## Requirements

- A **model-driven app**. There is no canvas support; see
  [Limitations](limitations.md).
- Nothing to switch on for canvas apps, for the same reason.

## Permissions the maker is asked for

The solution declares two platform features, and both appear as a prompt when
the control is added to a form:

| Feature | What it is used for |
| --- | --- |
| `WebAPI` | Reading candidate records from the target table as the user types |
| `Utility` | Finding the target table's name column, and opening the Browse panel |

Both are declared **optional**. A host that provides neither still loads the
control — it renders the current value and says that search is unavailable,
rather than failing to appear at all.
