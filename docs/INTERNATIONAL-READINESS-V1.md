# COBS OS — International Readiness Checklist V1

Status: **VALIDATION IN PROGRESS — DO NOT MERGE UNTIL QUALITY + VISUAL WALKTHROUGH PASS**

## Principle

Language, country, timezone and currency are independent runtime concerns. Changing the UI language must never silently change operational time or financial currency.

## V1 validation scenarios

| Scenario | Locale | QA timezone | QA currency |
|---|---|---|---|
| Brazil | `pt-BR` | `America/Sao_Paulo` | `BRL` |
| United States | `en-US` | `America/New_York` | `USD` |
| Spain | `es-ES` | `Europe/Madrid` | `EUR` |

Production operations may combine these independently (for example: Portuguese UI + Madrid timezone + EUR).

## Corrections in this branch

- Locale, timezone and currency are independent runtime state.
- Timezone and currency persist independently from language.
- Stored locale restores the HTML `lang` attribute.
- Invalid timezone input safely falls back to the platform default.
- Currency is normalized to a three-letter code.
- Spanish base shell is native instead of inheriting English.
- W01, W02, W03, W04, W05 and W07 have full Spanish V1 dictionaries.
- W11 was audited and already has a native Spanish dictionary.
- Journey Blueprints have a complete Spanish V1 dictionary.
- A compatibility overlay is applied last to remove legacy English aliases without changing domain contracts.
- Automated tests enforce Spanish key parity for all current workflow dictionaries and regional formatting for BR/US/ES.

## Frozen operational glossary

| Concept | pt-BR | en-US | es-ES |
|---|---|---|---|
| Operação | Operação | Operation | Operación |
| Jornada | Jornada | Journey | Itinerario |
| Etapa | Etapa | Step | Etapa |
| Ao Vivo | Operação ao vivo | Live Operations | Operación en vivo |
| Embarque | Embarque | Boarding | Embarque |
| Desembarque | Desembarque | Disembarkation | Desembarque |
| Deslocamento | Deslocamento | Movement / Transfer | Desplazamiento |
| Ponto da visita | Ponto da visita | Visit point | Punto de la visita |
| Ponto de encontro | Ponto de encontro | Meeting point | Punto de encuentro |
| Guia de turismo | Guia de turismo | Tour guide | Guía de turismo |
| Monitor | Monitor | Group leader / Tour assistant | Acompañante de grupo |
| Coordenador | Coordenador | Coordinator | Coordinador |
| Passageiro | Passageiro | Traveler / Passenger | Viajero / Pasajero |
| Presença | Presença | Attendance | Asistencia |
| Próxima ação | Próxima ação | Next action | Siguiente acción |
| Checklist | Checklist | Checklist | Checklist |
| Ocorrência | Ocorrência | Incident | Incidencia |
| Planejado | Planejado | Planned | Planificado |
| Previsto | Previsto | Expected | Previsto |
| Realizado | Realizado | Actual | Realizado |

### Terminology rules

- Do not translate English `monitor` literally for the field role; use `Group leader / Tour assistant`.
- Use `Traveler` in person/portal UX and `Passenger` in transport-count contexts.
- Use `Movement` for a journey movement step and `Transfer` for a commercial transfer service.
- `Visit point` is the internal interpretive micro-step object, not necessarily a transport stop.

## Automated gate

The repository Quality Gate must pass:

- Build
- Formatting
- Typecheck
- Lint
- Tests

International tests additionally validate:

- Same instant in São Paulo / New York / Madrid.
- BRL / USD / EUR formatting.
- Locale-specific number separators.
- Spanish key parity for W01–W11 current dictionaries, Access and Blueprints.

## Visual walkthrough — required before PASS

For each locale (`pt-BR`, `en-US`, `es-ES`) validate in the preview build:

- [ ] Sign-in / access states
- [ ] Command center / navigation
- [ ] Operations list and operation overview
- [ ] People / roster / responsibilities
- [ ] Journey / Live cockpit
- [ ] Visit points
- [ ] Mobility
- [ ] Hospitality
- [ ] Events
- [ ] Communication / inbox
- [ ] Commerce / payments
- [ ] Traveler portal
- [ ] Blueprints
- [ ] Date/time output uses the operation timezone where applicable
- [ ] Currency/number output uses explicit financial context
- [ ] No raw i18n key is visible
- [ ] No unintended English text appears in `es-ES`
- [ ] Long Spanish/English labels do not clip critical actions on mobile
- [ ] Dialogs/toasts/errors remain readable
- [ ] `document.documentElement.lang` matches selected locale

## International data checklist

- Phone values should use international/provider-compatible representation (E.164 where required); no Brazilian-only global mask.
- Address fields must not globally require CEP/UF semantics; country remains explicit and machine-readable.
- Operation timezone must be the canonical source for operational times; browser timezone must not silently rewrite facts.
- Currency is attached to the commercial/financial context, never inferred solely from UI language.

## Release decision

`🌍 INTERNATIONAL READINESS V1 — PASS` may be issued only after:

1. Repository Quality Gate is green on this branch/PR.
2. Automated international tests pass.
3. Preview walkthrough passes in pt-BR, en-US and es-ES.
4. No P0/P1 internationalization defect remains.

Until then the branch remains a release candidate and must not be merged solely because translation files exist.
