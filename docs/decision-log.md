# Decision log

Dated record of non-obvious choices. Newest first.

## 2026-09-18 — B2B routing built in GHL, not Zapier
BD contact-form webhook → GHL Inbound Webhook trigger → If/Else on `inquirer_type` →
pipeline record + Slack post via incoming webhook. Chosen over a Zapier zap because the
spec (Workflows 5–6) needs B2B inquiries as GHL pipeline records for Constansa anyway;
this creates the record and the alert in one motion, one less tool in the chain.
Zapier remains the fallback if GHL's Inbound Webhook trigger can't be enabled.

## 2026-09-18 — Patient contact-form submissions captured in GHL (Else branch)
The B2B router's Else branch tags patients `patient-inquiry` instead of discarding.
Starts the patient database and per-source lead reporting. No Slack noise.

## 2026-09-17 — Reminder cadence: 24/48/72 hours
Billy confirmed on the Sep 15 call, overriding the spec's day 2/4/5. Reminder at 24h
and 48h, expiration + cascade handoff at 72h.

## 2026-09-17 — Do not rebuild BD's native lead engine
Audit proved capture, tier routing, radius matching, and notifications work natively.
Scope is the management layer only: reminders, expiration, cascade, patient loop,
B2B routing, tracking. The 404 on Lead Action edit pages is a BD admin-UI bug
(ticket filed), not missing config.

## 2026-09-17 — Dashboard is standalone, no dependency on Nick's platform
Tracking view built on GHL pipelines + a lightweight standalone view with a clean data
contract, so it works day one and can plug into Nick's platform later if that survives.

## OPEN — Maximum Matches = 5 vs one-doctor cascade
BD currently allows up to 5 doctors to match/buy the same lead. Spec assumes exclusive
sequential cascade. Billy decision needed: exclusive leads (spec) or shared (current).
Shapes the Workflow 4 build.

## OPEN — Reminder stop condition on doctor accept
GHL can't natively see a BD accept event. Options: BD webhook on lead status/payment
(check Developer Hub event list), or v1 ships with "already responded? disregard" line
in reminder copy and the proper stop lands in week two.
