# COBS OS — Product & Architectural Constitution

Status: **W00 (foundation)** — ratified. Future workflows MUST reference this document.
This file is normative. Where code and this document disagree, this document wins until it is
explicitly amended in a later workflow.

---

## 1. Product constitution

**COBS OS** is a global Experience Operations SaaS: an enterprise-grade operating system for
organizations that plan, deliver and account for experiences across countries, timezones,
currencies and languages.

- **Category**: Global Experience Operations.
- **Primary users**: operations teams (command center) and field teams (mobile, on the ground).
- **Product promise**: the system reflects reality — it never asks a human to keep a status field
  honest.

---

## 2. Non-negotiable rules

These fifteen rules govern every workflow, schema, route and component.

| # | Rule | Meaning |
|---|------|---------|
| 1 | **MULTI-TENANT FROM DAY ONE** | Every business row is tenant-scoped. No global business data. |
| 2 | **PERSON != LOGIN** | A Person exists without an auth account. Auth users are optional attachments. |
| 3 | **PERSON != ROLE** | Identity never implies authorization. Roles live in their own table. |
| 4 | **EXPERIENCE != OPERATION** | What is promised to a participant is not the operational work that delivers it. |
| 5 | **DOMAIN OWNERSHIP** | Each fact has exactly one owning domain. Cross-domain writes are forbidden. |
| 6 | **FACTS OVER MANUAL STATUS** | Status is derived from recorded facts, never hand-set as truth. |
| 7 | **PLANNED != EXPECTED != ACTUAL** | Three separate values, never collapsed into a single field. |
| 8 | **APPEND-ONLY RUNTIME WHERE APPROPRIATE** | Runtime/event data is appended, not mutated in place. |
| 9 | **IDEMPOTENCY** | Every write path is safe to retry, keyed by a stable idempotency key. |
| 10 | **AUDITABILITY** | Who / what / when is reconstructable for every state change. |
| 11 | **SECURITY BY DEFAULT** | Deny-by-default RLS; explicit grants; least privilege. |
| 12 | **REALTIME IS NOT SOURCE OF TRUTH** | Realtime is a delivery channel; the database is the truth. |
| 13 | **HUMAN-CENTERED OPERATIONS** | Interfaces respect field conditions, cognitive load and language. |
| 14 | **GLOBAL-FIRST DATA DESIGN** | UTC storage, explicit timezones, currency minor units, locale at the edge. |
| 15 | **NO FAKE ANALYTICS** | No placeholder metrics, seeded charts or invented numbers. Ever. |

---

## 3. Identity model boundary (defined, not implemented)

```text
Person        real human, may never log in
  ^
  | optional 1:1
Auth User     credential holder (Supabase auth.users)
  ^
  | 1:1 within a tenant
Profile       tenant-scoped presentation of a Person
  ^
  | N:M via Membership
Tenant        organization boundary
```

W00 implements **none** of this. W01 defines Person, Profile, Auth User, Tenant, Membership,
Invitation, Authorization, RLS and idempotent onboarding **together**, so authentication never
becomes the canonical identity model by accident.

---

## 4. Application architecture

```text
src/
  app/shell/        AppShell, SideNav, TopBar, MobileNav, CommandPalette,
                    OrgContext, Brand — composition only, no business logic
  components/
    ui/             shadcn primitives (unmodified surface)
    feedback/       EmptyState, loading, success/error feedback channel
  lib/
    i18n.tsx        locale registry, dictionaries, provider
    format.ts       locale / timezone / currency formatters
    navigation.ts   typed navigation registry + route metadata
    theme.tsx       light/dark token controller
  routes/
    __root.tsx      providers, head metadata, 404 + error presentation
    index.tsx       product entry page (public)
    sign-in.tsx     structural authentication boundary (public)
    app.tsx         authenticated shell (structural in W00)
```

Rules:
- Domain code never lives in `app/shell`.
- Feedback toasts go through `components/feedback/feedback.tsx` only.
- Navigation is declared once in `lib/navigation.ts` and consumed by desktop nav, mobile nav and
  the command palette.

---

## 5. Design system

- Tokens only. No hardcoded color utilities in components.
- oklch color space; light and dark are both first-class.
- Type: Space Grotesk (display), Plus Jakarta Sans (UI), JetBrains Mono (operational metadata).
- Motion: `--ease-cobs` (0.22, 1, 0.36, 1); entrances rise 14px; ambient sheen for command
  surfaces; all motion disabled under `prefers-reduced-motion`.
- Utilities: `surface-panel`, `command-canvas`, `hairline-grid`, `focus-ring`.

### Responsive intent

| Context | Desktop (>= 1024px) | Mobile (< 1024px) |
|---|---|---|
| Model | Command center | Field surface |
| Navigation | Persistent dark rail + sections + shortcut hints | Bottom tab bar (4 destinations) + drawer for the rest |
| Density | Dense, clock + timezone visible | Sparse, thumb-reachable, >= 44px targets |
| Search | Inline ⌘K affordance | Icon-triggered full-screen palette |

---

## 6. Backend constitution

- Exactly **one** backend: the external Supabase project **"COBS OS CLEAN BUILD"**.
- No other Supabase project may be provisioned, inspected, reused or migrated from.
- W00 database state is frozen: 0 business tables, 0 business migrations, 0 tenants, 0 users,
  0 RLS policies, 0 triggers, 0 business functions, 0 sample data.
- Schema design begins in W01, not before.

---

## 7. Workflow ladder

| Workflow | Scope |
|---|---|
| W00 | Constitution, design system, shell, i18n, accessibility, structural auth boundary |
| W01 | Identity: Person, Profile, Auth User, Tenant, Membership, Invitation, Authorization, RLS, idempotent onboarding |
| W02 | Experience domain |
| W03 | Operations domain |
| W04 | Network domain |
| W05 | Insights (only over real recorded facts) |
