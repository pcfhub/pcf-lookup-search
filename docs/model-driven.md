---
title: Model-driven apps
description: Adding Lookup Search to a form.
order: 4
---

# Using it on a model-driven form

:::steps
1. Open the form in the modern form designer.
2. Select the **lookup column** this control binds to.
3. Under **Components → Add component**, choose **Lookup Search**.
4. Enable it for **Web**, **Phone** and **Tablet** as appropriate.
5. Save and publish.
:::

## Column types

The control binds to one column, and that column must be a **Lookup** —
`Lookup.Simple` in framework terms. It reads the table the lookup points at from
the column itself, so there is nothing to configure for the target: rebinding
the control to a different lookup changes what it searches.

Two lookup shapes it does **not** cover: a customer lookup that can point at
either an account or a contact, and a regarding/party lookup that accepts many
tables. Both are polymorphic, and this control searches a single table.

:::callout{type=info}
The **view** the column is configured with on the form is not used for the
type-ahead — that is a Dataverse query, not a view — but it *is* what the
**Browse** panel opens on. So the view still decides what a maker sees when
they click through, and it is worth setting.
:::

## Configuration

Everything else is optional, and every value is typed into the properties pane
as text:

| Property | Example | Effect |
| --- | --- | --- |
| `Search columns` | `emailaddress1,telephone1` | Also matches these columns. The table's own name column is always matched, and does not need listing. |
| `Secondary column` | `emailaddress1` | Shown as a second line under each result. |
| `Match mode` | `Starts with` | `Contains` finds more and costs more; see [Limitations](limitations.md). |
| `Minimum characters` | `2` | How much has to be typed before anything is requested. |
| `Maximum results` | `8` | How many matches the list shows. |
| `Allow browse` | `Yes` | Whether the platform lookup panel is offered beside the search box. |

Use **logical names**, not display names — `emailaddress1`, not *Email*. A name
that cannot be a logical name at all is ignored; one that is merely wrong
reaches Dataverse, and its error appears under the field, which is how you find
out.
