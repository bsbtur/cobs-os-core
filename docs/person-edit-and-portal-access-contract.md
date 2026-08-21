# Person edit and participant portal access contract

## Identity model

A `Person` is organization identity/contact data. A linked auth account is a separate login identity.

Editing `people.email`:
- updates the person's contact email;
- does **not** change `auth.users.email`;
- does **not** create an administrative login;
- does **not** grant participant portal access by itself.

The UI must make that distinction explicit whenever `profile_id` is present.

## Editing people

Canonical command:

```sql
public.update_person(person_id, changes_jsonb)
```

Allowed patch fields:
- `full_name`
- `email`
- `phone_e164`
- `preferred_locale`
- `notes`

Authorization: tenant `owner` or `admin` only.

Validation:
- `full_name` cannot be blank;
- blank email becomes `null`;
- email is normalized to lowercase;
- blank phone becomes `null`;
- phone, when supplied, must be E.164.

Every effective change records a `person.updated` audit event with before/after values.

## UI behavior

Organization People and Operation People surfaces must expose an **Editar pessoa** action to authorized users.

After save:
1. close edit mode only after the RPC succeeds;
2. update/invalidate the person query and roster surfaces immediately;
3. show a concrete validation/permission error instead of a generic failure toast;
4. when the person is linked to a profile, show the helper text: `Este e-mail é de contato. Alterar aqui não muda o e-mail de login.`

Do not offer direct editing of `profile_id` in this form.

## Participant portal access

Portal access remains governed by the W10 access model.

Invitation command:

```sql
public.invite_participant_access(operation_id, person_id, ...)
```

The generated claim token is returned only once. The application may show a **Copiar link do convite** action immediately after issuance.

An email address is not required for claim-link delivery because the operator may deliver the link by another trusted channel. The UI must not imply that the invitation is automatically emailed unless an actual delivery provider is wired.

Once a grant is active:
- do not continue showing `Convidar para o portal` as the primary action;
- show `Acesso ao portal ativo`;
- expose revoke/reinstate only according to the existing access RPCs and permissions.

## QA case validated 2026-08-21

`Viajante QA 01` in operation `MOBILITY-01` currently has:
- person contact email matching the linked login email;
- linked `profile_id`;
- active participant access grant with origin `invitation_claim`.

The new `update_person` command was executed as the tenant owner inside a rollback transaction and returned the normalized person record with `login_identity_unchanged=true`.
