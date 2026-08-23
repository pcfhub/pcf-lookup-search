---
title: Examples
description: Worked configurations of Lookup Search.
order: 6
---

# Examples

## Finding a contact by email as well as by name

The complaint behind this control: a user knows the address they emailed, not
how the record's name was typed.

Place it on the contact lookup, then set:

| Property | Value |
| --- | --- |
| Search columns | `emailaddress1` |
| Secondary column | `emailaddress1` |
| Match mode | Starts with |
| Minimum characters | 2 |
| Maximum results | 8 |
| Allow browse | Yes |

Typing `dana` matches names beginning with it; typing `dana.w` matches nothing
by name and finds the record by address instead. Either way the address appears
under each result, which is what separates two people with the same name.

## Finding an account by reference number

Accounts are often searched by a number nobody remembers the *start* of — the
last four digits of an account code, part of a registration.

| Property | Value |
| --- | --- |
| Search columns | `accountnumber` |
| Secondary column | `accountnumber` |
| Match mode | Contains |
| Minimum characters | 3 |
| Maximum results | 5 |
| Allow browse | Yes |

:::callout{type=warning}
`Contains` cannot use an index. On a large table it is noticeably slower than
`Starts with`, and it is worth raising **Minimum characters** alongside it so
that fewer, more selective queries are sent — three characters here rather than
two.
:::

## A read-only reference on a locked form

No configuration of this control makes it read-only — the form does. When the
column is locked, or field-level security denies write access, the control
renders the current record with no search box and no buttons. A user with no
*read* access sees a message saying so rather than an empty field, which would
read as "no record selected".
