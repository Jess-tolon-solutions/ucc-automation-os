# UCC Automation OS

Lead & Inquiry Automation for [UpperCervicalCare.com](https://uppercervicalcare.com) —
routing, reminders, cascade logic, and tracking across Brilliant Directories, GoHighLevel,
Zapier, and Slack.

Built by [Tolon Solutions AI](https://tolonsolutions.ai). Ownership transfers to UCC at handover.

## Start here

1. `CLAUDE.md` — system context, platform map, audit findings, build status
2. `docs/workflow-specification.md` — the full 9-workflow spec (source of truth for behavior)
3. `docs/decision-log.md` — why things are the way they are

## Layout

| Folder | Contents |
|---|---|
| `docs/` | Architecture, spec, decisions, runbooks, handover |
| `bd/` | Brilliant Directories config records (webhooks, templates, forms) |
| `ghl/` | GoHighLevel workflow and pipeline specs |
| `copy/` | All system email/SMS copy, with approval status |
| `code/` | Dashboard and any scripts/parsers |

## The one rule

If a workflow, webhook, or template changes on a platform and the change isn't documented
here, the change doesn't exist at handover. Document as you build.
