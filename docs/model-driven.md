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
**Browse** panel opens on, and from 0.3.0 it is the list a **dropdown** shows.
So the view still decides what a user sees, and it is worth setting.
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
| `Display as` | `Search` | `Dropdown` lists a view's rows when the field is opened — see below. |
| `Dropdown rows` | `100` | How many rows a dropdown lists, 1 to 500. |

Use **logical names**, not display names — `emailaddress1`, not *Email*. A name
that cannot be a logical name at all is ignored; one that is merely wrong
reaches Dataverse, and its error appears under the field, which is how you find
out.

## Showing it as a dropdown

From 0.3.0, **Display as → Dropdown** turns the field into a list of choices
rather than a search — for reference data a user picks from rather than looks
up: countries, categories, regions, product families.

:::steps
1. Set **Display as** to **Dropdown**.
2. Optionally set **Dropdown rows** (default 100, at most 500).
3. Save and publish. Opening the field lists the rows; typing narrows them.
:::

**Which rows, in which order.** The rows come from a view, never from the
whole table:

1. the view set for this column in the form designer, if there is one;
2. otherwise the table's **default lookup view** — the one the platform's own
   lookup opens with.

The view's filter and its sort order are kept as they are. A table's lookup
view normally shows **active records only**, so a value you deactivate leaves
the dropdown without anything else to configure — the way to *retire* a
country or a category. To change what is listed or its order, edit the view.

**When a view has more rows than Dropdown rows**, the list ends with a line
saying how many it shows; typing still narrows only what was listed. A table
with thousands of records is a search, not a dropdown, and Display as →
Search is still there for it.

**When no view can be read** — the field's view was deleted, or the user
cannot read it, and the table has no default lookup view — the field says so
under the box and **searches as you type instead**, so it keeps working.

**Filter by** narrows a dropdown exactly as it narrows a search: only the
records related to the parent are listed, and Browse is hidden while it does.

## Filtering by a parent column

From 0.2.0 the search can be narrowed by another lookup on the form — the
Primary Contact to contacts of the form's Account, a Product to products in
the chosen Category. Nothing changes until you map the parent.

:::steps
1. In the control's properties, set **Filter by** to the lookup column on
   this form that the search should follow — *Account*, *Category*. It does
   not have to be placed on the form, only mapped.
2. Save and publish. The control reads which column on the searched table
   points at that parent from the table's relationships.
3. If the field says more than one column links the two tables, set
   **Linking column** to the one it lists that you mean.
:::

| Property | Example | Effect |
| --- | --- | --- |
| `Filter by (parent lookup)` | *Account* | A lookup on this form. While it holds a record, the search offers only records related to it. Empty, it filters nothing. |
| `Linking column (only if asked)` | `parentcustomerid` | Only when the field says more than one column links the tables: the logical name of the one to follow. A name that is not one of the listed columns is refused. |
| `On parent change` | `Keep it` | `Clear it` empties the chosen record when the parent changes and the record no longer belongs to it. `Keep it` never touches the record. |

While the search is filtered, the field says so under the box, and **Browse is
hidden**: the platform panel it opens cannot be narrowed from a code component,
so it would offer every record the search holds back.

:::callout{type=warning}
When the relationships cannot be read, or no column links the two tables, the
search is **off** and the field says why. It never falls back to searching
the whole table, because that would offer the records the filter exists to
keep out.
:::

**Linking column** is the one easy to get wrong. It names a column on the
*searched* table — contact's `parentcustomerid` — not the parent's own column,
and it is only needed when the field asks for it. Set without **Filter by**
mapped, the field says so and the search is off until one is mapped.
