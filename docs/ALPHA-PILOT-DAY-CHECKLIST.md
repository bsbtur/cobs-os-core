# COBS OS — ALPHA PILOT DAY CHECKLIST

For the Owner/operator. Print or keep open on a second device. Times in local (Brasília); the system stores UTC.

---

## BEFORE OPERATION (T-24h and again T-2h)

- [ ] **Login works** — sign in as owner; you land on the app shell, not `/auth`.
- [ ] **Operation access** — open the operation; roster, journey, mobility tabs load with real data.
- [ ] **Traveler access path** — from your own phone, open one traveler's portal link (or a test grant to your own person) and confirm `/my` shows the operation, journey and messages. Revoke it afterwards if it was a test grant.
- [ ] **Backup state** — a backup artifact exists dated today (see Phase G rule): run `python3 scripts/backup/gen_backup.py` and confirm it completes (~1 min) and the artifact is stored in the protected location.
- [ ] **Health endpoint** — open `/api/public/health`; expect `{"status":"ok"}` with `app`, `auth`, `data_api` all `up`.
- [ ] **Critical data** — participants count matches the customer list; transport leg times correct; rooming list correct (if used); prices/orders correct (if used).
- [ ] **Communication path** — publish one low-stakes operational message and confirm it appears in a recipient inbox.
- [ ] **Recovery runbook available offline** — `docs/ALPHA-OPERATIONAL-RECOVERY-RUNBOOK.md` and this checklist accessible without the app.
- [ ] **Contingency** — paper manifest + rooming list printed; phone numbers for driver/property to hand.

---

## DURING OPERATION

- [ ] **Health poll** — check `/api/public/health` at start, mid-operation, and at each major milestone (departure, arrival, check-in, return).
- [ ] **Command failures** — if any action shows an error: capture the time (UTC), the operation id, and the `[COBS_OBS]` console line. Retry once. If it fails again, switch to paper for that step and log an incident.
- [ ] **Corrections are append-only** — use the approved commands:
  - wrong presence → `retract_presence_fact`, then record the correct fact
  - operation wrongly cancelled → `reinstate_operation`
  - wrong room → change/release + re-assign
  - wrong seat (pre-departure) → release + re-assign; **post-departure** → new ad-hoc leg
  - wrong message → publish a correction message (never delete)
  - wrong payment → reverse/refund fact (never edit)
- [ ] **Never repair history with direct DML.** No manual database edits during an operation, for any reason.
- [ ] **Incident log** — one line per incident: time (UTC) · what happened · what you did · resolved yes/no.
- [ ] **Escalation** — health degraded, repeated command failures, or suspected data exposure → stop writes, record state on paper, escalate to platform support.

---

## AFTER OPERATION

- [ ] **Terminal states** — operation completed; every journey step completed or skipped; every session completed or cancelled; every transport leg arrived or cancelled; every stay completed or cancelled.
- [ ] **Unresolved records** — no participant left in `expected` who actually travelled; no room assignment left open; no seat unaccounted.
- [ ] **Financial obligations** — every order in a terminal status; payments recorded match money actually received; discrepancies recorded as facts, not edits.
- [ ] **Backup** — run `python3 scripts/backup/gen_backup.py` at day close; store the artifact in the protected location.
- [ ] **Audit evidence** — export/preserve the incident log alongside the backup artifact; do not paste PII into chat or tickets.
- [ ] **Artifact hygiene** — destroy any temporary restore environment and any PII-bearing artifact per the M5 runbook once the drill/verification is done.
- [ ] **Pilot findings** — record what broke, what was confusing, and what required paper. This feeds the post-pilot review (M6 → next phase).
