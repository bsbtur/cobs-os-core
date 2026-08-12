# Experience OS Hub

COBS OS — CLEAN BUILD

WORKFLOW W00 — PRODUCT CONSTITUTION & EXPERIENCE DESIGN SYSTEM

You are beginning a completely new production-grade SaaS.

This is a CLEAN BUILD.

Do not reuse, copy, migrate, import or infer architecture, schema, code, components, database objects or business rules from any previous Lovable project.

PROJECT NAME:

COBS OS

PRODUCT CATEGORY:

Global Experience Operations SaaS.

VISION:

Build an enterprise-grade operating system for organizations that design, sell, coordinate and execute human experiences involving tourism, travel, events, congresses, excursions, academic travel, transfers, hospitality, transportation, guides, groups and hybrid experiences.

The product must be capable of operating first in Brasília, then throughout Brazil, and eventually internationally.

BSBTUR is the first customer/tenant.

BSBTUR must NOT be hardcoded as the platform itself.

==================================================

W00 PRIMARY OBJECTIVE

==================================================

This workflow establishes ONLY:

1. Product Constitution

2. Architectural Constitution

3. Domain boundaries

4. UX philosophy

5. Design system

6. Application shell

7. Responsive foundation

8. Internationalization foundation

9. Accessibility foundation

10. Future workflow map

DO NOT build operational business domains yet.

DO NOT create Journey.

DO NOT create Passenger Operations.

DO NOT create Mobility.

DO NOT create Hospitality.

DO NOT create Events.

DO NOT create Communication.

DO NOT create WhatsApp.

DO NOT create Commerce.

DO NOT create Payments.

DO NOT create AI features.

Those belong to later workflows.

==================================================

ARCHITECTURE CONSTITUTION

==================================================

The following principles are permanent unless a future Architecture Gate explicitly proves that a change is required.

1. MULTI-TENANT FROM DAY ONE

COBS OS is a SaaS platform.

Platform != Tenant.

A tenant represents an organization using COBS OS.

Never hardcode BSBTUR into domain architecture.

Every tenant-owned business object must have explicit tenant ownership.

Cross-tenant data leakage is unacceptable.

2. PERSON != LOGIN

A human being is a domain entity.

Authentication is only an access mechanism.

A person may exist without a login.

Examples:

traveler

driver

guide

monitor

speaker

supplier contact

hotel contact

temporary staff

Do NOT model every profession as a separate authentication identity.

Do NOT require auth.users simply for a person to participate in an operation.

3. PERSON != ROLE

Roles are contextual.

The same person may be:

traveler in one operation,

guide in another,

coordinator in another.

Never encode permanent professions into the identity model when the responsibility is contextual.

4. EXPERIENCE != OPERATION

Experience describes what an organization knows how to deliver.

Operation represents a concrete execution.

Example:

Experience:

"Caldas Novas Weekend"

Operations:

"Caldas Novas — August 17"

"Caldas Novas — September 21"

Never merge catalog definition with runtime execution.

5. DOMAIN OWNERSHIP

Every operational fact must have exactly one canonical owner.

Other domains may:

reference,

observe,

derive,

warn,

notify.

Other domains must NOT silently mutate another domain's canonical truth.

6. FACTS OVER MANUAL STATUS

Whenever possible:

state = derive(events + current facts)

Prefer immutable facts and deterministic derivation over editable status fields.

7. PLANNED != EXPECTED != ACTUAL

These concepts must never be collapsed.

PLANNED:

original operational intention.

EXPECTED:

latest justified prediction.

ACTUAL:

what truly happened.

Historical truth must never be overwritten.

8. APPEND-ONLY RUNTIME

Operational runtime facts should preferentially use append-only event models.

Never rewrite history merely to make the current UI simpler.

9. IDEMPOTENCY

Every command, integration, webhook, automation and externally-triggered mutation must be designed to tolerate retries safely.

Duplicate requests must not create duplicate business facts.

Idempotency is a platform principle from W00 onward.

10. AUDITABILITY

Critical mutations must eventually answer:

WHO

WHAT

WHEN

WHERE/CONTEXT

BEFORE

AFTER

WHY

Audit is infrastructure, not decoration.

11. SECURITY BY DEFAULT

Future database work must use:

Supabase Auth

PostgreSQL

RLS

least privilege

server-side secrets

explicit grants

tenant isolation

safe SECURITY DEFINER usage

private internal functions where applicable

Never rely on frontend filtering for authorization.

12. REALTIME IS A VIEW OF TRUTH

Realtime must propagate canonical database changes.

Realtime itself is never the source of truth.

13. HUMAN-CENTERED OPERATIONS

COBS should reduce cognitive load during real-world operations.

The user should understand:

What is happening?

What happens next?

What needs my attention?

Who is responsible?

What changed?

What should I do?

without needing database knowledge.

14. GLOBAL-FIRST DATA DESIGN

Prepare architecture for:

multiple languages

multiple currencies

IANA time zones

international phone numbers

different address formats

locale-aware dates/numbers

international operations

Do not assume Brazil-only data structures.

Default initial locale may be pt-BR.

15. NO FAKE ANALYTICS

Never show invented charts, metrics, percentages, operational statuses or AI insights.

When data does not exist, display an intentional empty state.

==================================================

DESIGN DIRECTION

==================================================

The previous prototype visual language must NOT be copied.

Create a new premium interface.

Desired perception:

modern

alive

premium

human

intelligent

calm under pressure

operational

international

high trust

Avoid:

generic admin template appearance

huge empty white areas

excessive bordered cards

static dashboard feeling

visual clutter

heavy gradients

gaming aesthetics

cheap travel-agency aesthetics

unnecessary glassmorphism

fake metrics

Design inspiration should come from the product discipline and clarity found in premium modern software, without copying any company.

The interface should feel appropriate for a global mission-critical operations platform.

==================================================

DESIGN SYSTEM

==================================================

Create semantic design tokens.

Do not scatter arbitrary hex values throughout components.

Required token categories:

background

surface

surface-elevated

surface-interactive

text-primary

text-secondary

text-muted

border

accent

success

warning

danger

info

focus

Create consistent:

spacing scale

border radius scale

shadow/elevation scale

typography hierarchy

icon sizing

motion durations

responsive breakpoints

Support:

Light Mode

Dark Mode

Prepare theme architecture for future tenant branding without allowing tenant branding to destroy usability/accessibility.

==================================================

MOTION SYSTEM

==================================================

The product should feel alive but never distracting.

Use subtle motion for:

navigation transitions

drawer opening

modal opening

state changes

loading

success confirmation

new realtime information

attention-required events

Respect:

prefers-reduced-motion

No decorative animation should interfere with operational use.

==================================================

RESPONSIVE STRATEGY

==================================================

COBS must be usable in:

Desktop Command Center

Laptop

Tablet

Mobile field operation

Do NOT merely shrink desktop layouts.

Desktop prioritizes:

overview

coordination

parallel information

Mobile prioritizes:

next action

current context

alerts

quick operational commands

Minimum target width:

320px.

Touch targets must be appropriate for field usage.

==================================================

ACCESSIBILITY

==================================================

Target WCAG 2.2 AA principles.

Require:

semantic HTML

keyboard navigation

visible focus

appropriate contrast

form labels

ARIA only where necessary

non-color-only state communication

reduced motion support

==================================================

INTERNATIONALIZATION FOUNDATION

==================================================

Prepare i18n structure now.

Initial language:

Portuguese (Brazil).

Architecture must support later:

English

Spanish

Do not hardcode UI strings throughout business components if avoidable.

Use locale-aware formatting abstractions for:

date

time

currency

numbers

Do not implement translation management SaaS in W00.

==================================================

APPLICATION SHELL

==================================================

Build ONLY the structural shell.

Required:

responsive application frame

desktop navigation

mobile navigation

top context bar

global command/search placeholder

notification entry point placeholder

user/account entry point

organization context placeholder

main workspace

loading states

error boundary presentation

empty state system

toast/feedback system

Navigation must be designed for future growth.

Do NOT populate fake operational modules just to fill the sidebar.

The shell may show only areas that actually exist at this stage.

==================================================

LANDING / AUTH BOUNDARY

==================================================

Create a clean product entry experience.

It may contain:

COBS OS identity

short product proposition

Sign in entry point

secure/authenticated application boundary

Do NOT build a marketing-heavy website.

Do NOT create fake testimonials.

Do NOT create fake customers.

Do NOT create fake numbers.

==================================================

SUPABASE

==================================================

IMPORTANT:

A NEW CLEAN Supabase project already exists:

COBS OS CLEAN BUILD

This project must be the ONLY Supabase backend used by this Lovable project.

Do not connect to or reuse any previous Supabase project.

However:

DO NOT CREATE THE BUSINESS DATABASE SCHEMA DURING W00.

W01 will own the initial production schema.

If Supabase connection is required for project setup, connect only to the new clean project and leave business schema creation for W01.

Do not create speculative tables.

==================================================

CODE QUALITY

==================================================

Use:

TypeScript

strict typing

small cohesive components

clear naming

domain-oriented folders where appropriate

reusable UI primitives

centralized configuration

centralized formatting utilities

Avoid:

any unless technically unavoidable and justified

giant page components

duplicated constants

duplicated formatting logic

business rules inside presentation components

premature abstraction

==================================================

W00 ARCHITECTURE GATE

==================================================

BEFORE implementing anything substantial, present an Architecture Gate in the chat.

The Architecture Gate must explicitly report:

1. Proposed application structure

2. Design token strategy

3. Navigation strategy

4. Responsive strategy

5. i18n strategy

6. Accessibility strategy

7. Motion strategy

8. Supabase connection status

9. What W00 WILL create

10. What W00 WILL NOT create

11. Risks or assumptions detected

STOP after presenting the Architecture Gate.

Do not continue automatically.

Wait for explicit approval.

==================================================

NON-NEGOTIABLE STOP RULE

==================================================

W00 must NOT:

create domain business tables

create fake operational data

create sample travelers

create sample operations

create sample financial data

implement later workflows

modify previous projects

connect to an old database

At the end of W00, provide a DELIVERY REPORT containing:

FILES CREATED

FILES MODIFIED

DATABASE CHANGES

ROUTES CREATED

DESIGN SYSTEM STATUS

RESPONSIVE STATUS

ACCESSIBILITY STATUS

I18N STATUS

SUPABASE CONNECTION STATUS

TYPECHECK STATUS

LINT STATUS

KNOWN RISKS

TECHNICAL DEBT

NEXT WORKFLOW

End with exactly:

W00 COMPLETE: YES/NO

BUSINESS TABLES CREATED: YES/NO

OLD PROJECT REUSED: YES/NO

OLD DATABASE REUSED: YES/NO

NEW SUPABASE ONLY: YES/NO

FAKE OPERATIONAL DATA CREATED: YES/NO

READY FOR W01 REVIEW: YES/NO

Do not start W01.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://cobs-os-core.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/66707f70-99d2-460f-b1ba-b9b443a5791f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
