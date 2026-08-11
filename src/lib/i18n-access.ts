/**
 * COBS OS · P0.2.1 — Access posture vocabulary.
 * Neutral, non-administrative language for an authenticated identity that has
 * neither an operational Membership nor effective Participant Access.
 */

export const ACCESS_DICTIONARIES = {
  "pt-BR": {
    "access.none.title": "Sua conta está criada, mas ainda sem acesso",
    "access.none.body":
      "Nenhuma organização e nenhuma viagem estão vinculadas a esta conta. Se você recebeu um convite, abra o link enviado por quem organiza sua viagem.",
    "access.none.recheck": "Verificar novamente",
    "access.none.signOut": "Sair",
    "access.none.org": "Criar uma organização",
    "access.none.orgHint": "Somente se você for responsável por operar experiências.",

    "roster.portal.title": "Acesso ao portal do viajante",
    "roster.portal.invite": "Convidar para o portal",
    "roster.portal.copy": "Copiar link do convite",
    "roster.portal.copied": "Link copiado.",
    "roster.portal.once": "Este link aparece uma única vez. Copie e envie agora.",
    "roster.portal.expires": "Expira em",
    "roster.portal.hint":
      "O convite dá acesso somente a esta experiência, no portal do viajante. Não cria login administrativo.",
    "roster.portal.done": "Convite gerado.",
  },
  "en-US": {
    "access.none.title": "Your account exists, but has no access yet",
    "access.none.body":
      "No organization and no trip are linked to this account. If you were invited, open the link sent by whoever organizes your trip.",
    "access.none.recheck": "Check again",
    "access.none.signOut": "Sign out",
    "access.none.org": "Create an organization",
    "access.none.orgHint": "Only if you are responsible for operating experiences.",

    "roster.portal.title": "Traveler portal access",
    "roster.portal.invite": "Invite to portal",
    "roster.portal.copy": "Copy invitation link",
    "roster.portal.copied": "Link copied.",
    "roster.portal.once": "This link is shown only once. Copy and send it now.",
    "roster.portal.expires": "Expires",
    "roster.portal.hint":
      "The invitation grants access to this experience only, in the traveler portal. It never creates an administrative login.",
    "roster.portal.done": "Invitation created.",
  },
  "es-ES": {
    "access.none.title": "Tu cuenta existe, pero aún no tiene acceso",
    "access.none.body":
      "Ninguna organización ni viaje están vinculados a esta cuenta. Si recibiste una invitación, abre el enlace enviado por quien organiza tu viaje.",
    "access.none.recheck": "Comprobar de nuevo",
    "access.none.signOut": "Salir",
    "access.none.org": "Crear una organización",
    "access.none.orgHint": "Solo si eres responsable de operar experiencias.",

    "roster.portal.title": "Acceso al portal del viajero",
    "roster.portal.invite": "Invitar al portal",
    "roster.portal.copy": "Copiar enlace de invitación",
    "roster.portal.copied": "Enlace copiado.",
    "roster.portal.once": "Este enlace se muestra una sola vez. Cópialo y envíalo ahora.",
    "roster.portal.expires": "Caduca",
    "roster.portal.hint":
      "La invitación da acceso solo a esta experiencia, en el portal del viajero. Nunca crea un acceso administrativo.",
    "roster.portal.done": "Invitación creada.",
  },
} as const;
