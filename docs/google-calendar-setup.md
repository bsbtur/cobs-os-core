# COBS Calendar & Availability — configuração OAuth

Esta integração é opt-in e mantém o COBS como fonte oficial da operação.

1. No Google Cloud, ative a Google Calendar API.
2. Configure a tela de consentimento OAuth.
3. Crie um cliente OAuth do tipo **Aplicativo da Web**.
4. Cadastre exatamente a URI de callback do ambiente:
   - local: `http://localhost:3000/api/google-calendar/callback`
   - produção: `https://SEU_DOMINIO/api/google-calendar/callback`
5. Cadastre no ambiente do servidor:
   - `GOOGLE_CALENDAR_CLIENT_ID`
   - `GOOGLE_CALENDAR_CLIENT_SECRET`
   - `GOOGLE_CALENDAR_REDIRECT_URI`
   - `GOOGLE_CALENDAR_STATE_SECRET` (aleatório, mínimo recomendado de 32 bytes)
   - `GOOGLE_CALENDAR_TOKEN_SECRET` (aleatório, mínimo recomendado de 32 bytes)

Nunca use o prefixo `VITE_` nessas variáveis. Os segredos e tokens não podem chegar ao navegador.

## Escopos V1

- `calendar.events`: criar e atualizar eventos gerenciados pelo COBS.
- `calendar.freebusy`: consultar períodos livres e ocupados.

## Segurança

- OAuth com acesso offline, consentimento incremental e `state` assinado com validade de 10 minutos.
- Tokens cifrados com AES-256-GCM antes de serem persistidos.
- Tabela em `app_private`, sem acesso para `anon` e `authenticated`.
- A conexão pertence ao par organização + usuário e exige membership ativa.

## Gate antes de produção

- Aplicar a migration somente no projeto de staging.
- Configurar credenciais OAuth de teste e adicionar test users no Google Cloud.
- Validar conexão, reconexão, revogação, expiração e conflito de horários.
- Executar Security Advisor, testes, typecheck, lint e build.
