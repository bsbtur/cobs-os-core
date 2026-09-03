# CIOSP 2027 — Public lead privacy gap

Priority: **P1 — required before public commercial launch**.

The `/ciosp-2027` public lead form captures personal data (name, email and phone) and requires contact consent. Repository searches performed on 2026-09-02 did not find a reusable public Privacy Policy / Terms route or document.

## Required outcome

Before public launch, the customer must have clear, accessible information about the treatment of the data submitted through the lead form, with an approved privacy notice/policy linked from the capture experience.

## Constraints

- Do not invent legal/company contact details.
- Do not weaken or bypass consent.
- Do not change shared auth, RLS, schema or infrastructure from the COMERCIAL / CLIENTE front.
- If a shared privacy/legal surface is introduced, coordinate it through COBS — CENTRAL / ARQUITETURA.

## Acceptance evidence

- approved privacy/legal content exists;
- public URL/route is accessible;
- lead form links to it before submission;
- mobile rendering and keyboard access are validated;
- no raw technical information or internal identifiers are exposed.
