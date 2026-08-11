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
    "access.none.checking": "Verificando acesso...",
    "access.none.nochange": "Nenhum acesso novo encontrado.",
    "access.none.error": "Não foi possível verificar seu acesso agora. Tente novamente.",
    "access.none.signOut": "Sair",
    "access.none.org": "Criar uma organização",
    "access.none.orgHint": "Somente se você for responsável por operar experiências.",
    "access.recover.title": "Já recebeu um convite para sua viagem?",
    "access.recover.label": "Cole aqui o link de convite enviado pela organização.",
    "access.recover.placeholder": "https://.../my/claim/...",
    "access.recover.cta": "Acessar minha viagem",
    "access.recover.empty": "Cole o link do convite para continuar.",
    "access.recover.invalid":
      "Este link não é um convite válido do portal do viajante. Copie o link completo que você recebeu.",

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
    "access.none.checking": "Checking access...",
    "access.none.nochange": "No new access found.",
    "access.none.error": "We couldn't check your access right now. Please try again.",
    "access.none.signOut": "Sign out",
    "access.none.org": "Create an organization",
    "access.none.orgHint": "Only if you are responsible for operating experiences.",
    "access.recover.title": "Already received an invitation to your trip?",
    "access.recover.label": "Paste here the invitation link sent by the organization.",
    "access.recover.placeholder": "https://.../my/claim/...",
    "access.recover.cta": "Access my trip",
    "access.recover.empty": "Paste the invitation link to continue.",
    "access.recover.invalid":
      "This link is not a valid traveler portal invitation. Copy the full link you received.",

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
    "access.none.checking": "Verificando acceso...",
    "access.none.nochange": "No se encontró ningún acceso nuevo.",
    "access.none.error": "No pudimos verificar tu acceso ahora. Inténtalo de nuevo.",
    "access.none.signOut": "Salir",
    "access.none.org": "Crear una organización",
    "access.none.orgHint": "Solo si eres responsable de operar experiencias.",
    "access.recover.title": "¿Ya recibiste una invitación para tu viaje?",
    "access.recover.label": "Pega aquí el enlace de invitación enviado por la organización.",
    "access.recover.placeholder": "https://.../my/claim/...",
    "access.recover.cta": "Acceder a mi viaje",
    "access.recover.empty": "Pega el enlace de invitación para continuar.",
    "access.recover.invalid":
      "Este enlace no es una invitación válida al portal del viajero. Copia el enlace completo que recibiste.",

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
