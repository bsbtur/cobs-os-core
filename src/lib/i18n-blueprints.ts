import type { Locale } from "./i18n";

/**
 * COBS OS · W04 — Journey blueprint vocabulary (POST_PILOT_RELEASE_05).
 * Operator-facing language: "roteiro" (blueprint), "versão", "etapa".
 * Technical identifiers are never surfaced; only names, versions and checksums.
 */

export const BLUEPRINT_PT: Record<string, string> = {
  "nav.blueprints": "Roteiros",

  "bp.title": "Roteiros de jornada",
  "bp.subtitle":
    "Roteiros reutilizáveis e versionados. Publique uma versão e provisione jornadas sem scripts manuais.",
  "bp.open": "Abrir",
  "bp.create": "Criar roteiro",
  "bp.loading": "Carregando roteiros",
  "bp.empty": "Nenhum roteiro cadastrado.",
  "bp.emptyBody":
    "Nenhum roteiro cadastrado. Crie um roteiro reutilizável para provisionar jornadas sem scripts manuais.",
  "bp.loadError": "Não foi possível carregar os roteiros.",
  "bp.forbidden": "Você não tem acesso aos roteiros desta organização.",
  "bp.forbiddenBody": "Fale com um proprietário ou administrador.",
  "bp.readOnly": "Você pode consultar os roteiros, mas não editá-los.",

  "bp.field.name": "Nome",
  "bp.field.slug": "Identificador",
  "bp.field.description": "Descrição",
  "bp.field.timezone": "Fuso horário padrão",
  "bp.field.notes": "Notas da versão",
  "bp.field.reason": "Motivo",
  "bp.status.active": "Ativo",
  "bp.status.archived": "Arquivado",
  "bp.version.status.draft": "Rascunho",
  "bp.version.status.published": "Publicada",
  "bp.version.status.archived": "Arquivada",
  "bp.version": "Versão",
  "bp.versions": "Versões",
  "bp.versionShort": "v",
  "bp.publishedVersion": "Última versão publicada",
  "bp.draftVersion": "Rascunho aberto",
  "bp.noPublished": "Nenhuma versão publicada",
  "bp.noDraft": "Nenhum rascunho aberto",
  "bp.stepCount": "Etapas",
  "bp.updatedAt": "Atualizado em",
  "bp.publishedAt": "Publicada em",
  "bp.checksum": "Assinatura do conteúdo",

  "bp.create.title": "Criar roteiro",
  "bp.create.submit": "Criar roteiro",
  "bp.create.success": "Roteiro criado. Rascunho da versão 1 aberto.",
  "bp.create.nameHint": "Como sua equipe chama este roteiro.",
  "bp.create.slugHint": "Identificador curto e único dentro da organização.",

  "bp.detail.back": "Voltar aos roteiros",
  "bp.detail.immutable":
    "Versões publicadas são imutáveis. Qualquer mudança exige criar uma nova versão.",
  "bp.detail.archivedNotice":
    "Este roteiro está arquivado. Não é possível criar versões nem aplicá-lo a operações.",
  "bp.detail.notFound": "Roteiro não encontrado.",

  "bp.step.add": "Adicionar etapa",
  "bp.step.edit": "Editar etapa",
  "bp.step.remove": "Remover",
  "bp.step.removeConfirm": "Remover esta etapa do rascunho?",
  "bp.step.removeConfirmBody":
    "A etapa sai desta versão em rascunho. Versões publicadas não são afetadas.",
  "bp.step.removed": "Etapa removida.",
  "bp.step.added": "Etapa adicionada.",
  "bp.step.updated": "Etapa atualizada.",
  "bp.step.empty": "Este rascunho ainda não tem etapas.",
  "bp.step.emptyBody": "Adicione as etapas na ordem em que devem acontecer.",
  "bp.step.title": "Título",
  "bp.step.kind": "Tipo de etapa",
  "bp.step.description": "Descrição",
  "bp.step.offset": "Início relativo (minutos)",
  "bp.step.duration": "Duração (minutos)",
  "bp.step.durationHint": "Deixe vazio quando a etapa não tiver duração definida.",
  "bp.step.location": "Local",
  "bp.step.travelerLabel": "Título para o viajante",
  "bp.step.travelerFacing": "Visível para o viajante",
  "bp.step.presence": "Conferência de presença",
  "bp.step.population": "Público conferido",
  "bp.step.presenceDefault": "Padrão do tipo de etapa",
  "bp.step.presenceHint":
    "O padrão é definido pelo sistema. Escolha outro valor apenas quando o roteiro exigir.",
  "bp.step.sequence": "Ordem",
  "bp.step.moveUp": "Mover para cima",
  "bp.step.moveDown": "Mover para baixo",
  "bp.step.reordered": "Ordem atualizada.",
  "bp.step.reorderFailed": "Não foi possível reordenar. A ordem anterior foi restaurada.",

  "bp.error.required": "Campo obrigatório.",
  "bp.error.invalid_offset": "Informe minutos inteiros a partir de zero.",
  "bp.error.invalid_duration": "A duração deve ser maior que zero.",
  "bp.error.presence_contract": "Esta conferência não é permitida para este tipo de etapa.",
  "bp.error.slugTaken": "Já existe um roteiro com este identificador.",
  "bp.error.duplicate": "Este registro já existe.",
  "bp.error.draftExists": "Já existe um rascunho aberto neste roteiro.",
  "bp.error.draftRequired": "Só é possível editar uma versão em rascunho.",
  "bp.error.immutable": "Esta versão já foi publicada e não pode ser alterada.",
  "bp.error.archived": "Este roteiro está arquivado.",
  "bp.error.forbidden": "Seu papel não permite esta ação.",
  "bp.error.session": "Sua sessão expirou. Entre novamente.",
  "bp.error.tenant": "Organização inválida para esta ação.",
  "bp.error.presenceContract": "A conferência de presença não é válida para o tipo de etapa.",
  "bp.error.operationHasJourney":
    "Esta operação já possui uma jornada e não pode receber outro roteiro.",
  "bp.error.alreadyProvisioned":
    "Esta operação já possui uma jornada e não pode receber outro roteiro.",
  "bp.error.noAnchor": "Informe a data e hora de início para aplicar o roteiro.",
  "bp.error.unexpected": "Não foi possível concluir. Tente novamente.",

  "bp.validate.action": "Validar roteiro",
  "bp.validate.valid": "Roteiro válido.",
  "bp.validate.invalid": "Foram encontradas pendências nesta versão.",
  "bp.validate.violations": "Pendências",
  "bp.validate.step": "Etapa",
  "bp.validate.code": "Código",
  "bp.validate.message": "Mensagem",
  "bp.validate.noStep": "Versão",
  "bp.validate.pending": "Valide a versão antes de publicar.",

  "bp.publish.action": "Publicar versão",
  "bp.publish.confirmTitle": "Publicar esta versão?",
  "bp.publish.confirmBody":
    "Depois de publicada, esta versão não poderá ser alterada. Mudanças futuras exigirão uma nova versão.",
  "bp.publish.success": "Versão publicada.",
  "bp.publish.needsValidation": "Valide a versão sem pendências antes de publicar.",
  "bp.publish.roleHint": "Somente proprietários e administradores publicam versões.",

  "bp.newVersion.action": "Criar nova versão",
  "bp.newVersion.confirmTitle": "Criar nova versão a partir da publicada?",
  "bp.newVersion.confirmBody":
    "As etapas da versão publicada serão copiadas para um novo rascunho. A versão publicada original não será alterada.",
  "bp.newVersion.success": "Nova versão em rascunho criada.",

  "bp.archive.action": "Arquivar roteiro",
  "bp.archive.confirmTitle": "Arquivar este roteiro?",
  "bp.archive.confirmBody":
    "O roteiro deixa de aceitar novas versões e não pode mais ser aplicado. Operações já provisionadas não serão alteradas.",
  "bp.archive.reasonRequired": "Informe o motivo do arquivamento.",
  "bp.archive.success": "Roteiro arquivado.",

  "bp.apply.action": "Aplicar roteiro",
  "bp.apply.title": "Aplicar roteiro a esta operação",
  "bp.apply.blueprint": "Roteiro",
  "bp.apply.version": "Versão publicada",
  "bp.apply.anchor": "Início de referência",
  "bp.apply.anchorHint":
    "Sem preencher, o sistema usa o início planejado da operação como referência.",
  "bp.apply.preview": "Prévia das etapas",
  "bp.step.hide": "Ocultar etapas",
  "bp.apply.atomic":
    "A aplicação é atômica e nunca substitui uma jornada existente. Nada é criado se algo falhar.",
  "bp.apply.confirm": "Confirmar aplicação",
  "bp.apply.success": "Jornada provisionada.",
  "bp.apply.successCount": "etapas criadas.",
  "bp.apply.noBlueprints": "Nenhum roteiro publicado disponível para aplicar.",
  "bp.apply.noBlueprintsBody": "Publique uma versão de roteiro antes de provisionar jornadas.",
  "bp.apply.hasJourney":
    "Esta operação já possui uma jornada e não pode receber outro roteiro.",
  "bp.apply.working": "Aplicando roteiro",
  "bp.apply.previewLoading": "Carregando prévia das etapas",
  "bp.apply.previewError": "Não foi possível carregar a prévia das etapas.",
  "bp.apply.previewEmpty": "Esta versão não possui etapas e não pode ser aplicada.",
  "bp.apply.plannedStart": "Início planejado da operação",
  "bp.apply.anchorEffective": "Os horários serão calculados a partir de:",
  "bp.apply.anchorFromPlanned": "usando o início planejado da operação",
  "bp.apply.anchorFromManual":
    "referência informada manualmente; substitui o início planejado apenas neste provisionamento",
  "bp.apply.anchorMissing":
    "Esta operação não tem início planejado. Informe a data e hora de início da jornada para continuar.",
  "bp.apply.anchorInvalid": "Data e hora inválidas.",
  "bp.apply.colStart": "Início",
  "bp.apply.colEnd": "Fim",
  "bp.apply.noDuration": "sem duração definida",
  "bp.apply.travelerFacing": "Visível ao viajante",

  "bp.origin.title": "Origem da jornada",
  "bp.origin.provisioned": "Provisionada a partir do roteiro",
  "bp.origin.appliedAt": "Aplicada em",
  "bp.origin.step": "Origem: roteiro",
  "bp.origin.manual": "Criada manualmente",

  "bp.offset.zero": "no início da operação",
  "bp.offset.after": "após o início da operação",
  "bp.busy": "Processando…",
};

export const BLUEPRINT_EN: Record<string, string> = {
  "nav.blueprints": "Blueprints",

  "bp.title": "Journey blueprints",
  "bp.subtitle":
    "Reusable, versioned itineraries. Publish a version and provision journeys without manual scripts.",
  "bp.open": "Open",
  "bp.create": "Create blueprint",
  "bp.loading": "Loading blueprints",
  "bp.empty": "No blueprints yet.",
  "bp.emptyBody":
    "No blueprints yet. Create a reusable blueprint to provision journeys without manual scripts.",
  "bp.loadError": "Blueprints could not be loaded.",
  "bp.forbidden": "You do not have access to this organization's blueprints.",
  "bp.forbiddenBody": "Talk to an owner or administrator.",
  "bp.readOnly": "You can review blueprints, but not edit them.",

  "bp.field.name": "Name",
  "bp.field.slug": "Identifier",
  "bp.field.description": "Description",
  "bp.field.timezone": "Default time zone",
  "bp.field.notes": "Version notes",
  "bp.field.reason": "Reason",
  "bp.status.active": "Active",
  "bp.status.archived": "Archived",
  "bp.version.status.draft": "Draft",
  "bp.version.status.published": "Published",
  "bp.version.status.archived": "Archived",
  "bp.version": "Version",
  "bp.versions": "Versions",
  "bp.versionShort": "v",
  "bp.publishedVersion": "Latest published version",
  "bp.draftVersion": "Open draft",
  "bp.noPublished": "No published version",
  "bp.noDraft": "No open draft",
  "bp.stepCount": "Steps",
  "bp.updatedAt": "Updated",
  "bp.publishedAt": "Published",
  "bp.checksum": "Content signature",

  "bp.create.title": "Create blueprint",
  "bp.create.submit": "Create blueprint",
  "bp.create.success": "Blueprint created. Draft version 1 is open.",
  "bp.create.nameHint": "What your team calls this blueprint.",
  "bp.create.slugHint": "Short identifier, unique inside the organization.",

  "bp.detail.back": "Back to blueprints",
  "bp.detail.immutable":
    "Published versions are immutable. Any change requires creating a new version.",
  "bp.detail.archivedNotice":
    "This blueprint is archived. New versions and applications are not allowed.",
  "bp.detail.notFound": "Blueprint not found.",

  "bp.step.add": "Add step",
  "bp.step.edit": "Edit step",
  "bp.step.remove": "Remove",
  "bp.step.removeConfirm": "Remove this step from the draft?",
  "bp.step.removeConfirmBody":
    "The step leaves this draft version. Published versions are untouched.",
  "bp.step.removed": "Step removed.",
  "bp.step.added": "Step added.",
  "bp.step.updated": "Step updated.",
  "bp.step.empty": "This draft has no steps yet.",
  "bp.step.emptyBody": "Add the steps in the order they should happen.",
  "bp.step.title": "Title",
  "bp.step.kind": "Step kind",
  "bp.step.description": "Description",
  "bp.step.offset": "Relative start (minutes)",
  "bp.step.duration": "Duration (minutes)",
  "bp.step.durationHint": "Leave empty when the step has no defined duration.",
  "bp.step.location": "Location",
  "bp.step.travelerLabel": "Traveler-facing title",
  "bp.step.travelerFacing": "Visible to travelers",
  "bp.step.presence": "Presence check",
  "bp.step.population": "Checked population",
  "bp.step.presenceDefault": "Default for this step kind",
  "bp.step.presenceHint":
    "The default is set by the system. Pick another value only when the blueprint requires it.",
  "bp.step.sequence": "Order",
  "bp.step.moveUp": "Move up",
  "bp.step.moveDown": "Move down",
  "bp.step.reordered": "Order updated.",
  "bp.step.reorderFailed": "Reordering failed. The previous order was restored.",

  "bp.error.required": "This field is required.",
  "bp.error.invalid_offset": "Enter whole minutes from zero.",
  "bp.error.invalid_duration": "Duration must be greater than zero.",
  "bp.error.presence_contract": "This check is not allowed for this step kind.",
  "bp.error.slugTaken": "A blueprint with this identifier already exists.",
  "bp.error.duplicate": "This record already exists.",
  "bp.error.draftExists": "This blueprint already has an open draft.",
  "bp.error.draftRequired": "Only a draft version can be edited.",
  "bp.error.immutable": "This version is published and cannot be changed.",
  "bp.error.archived": "This blueprint is archived.",
  "bp.error.forbidden": "Your role does not allow this action.",
  "bp.error.session": "Your session expired. Sign in again.",
  "bp.error.tenant": "Invalid organization for this action.",
  "bp.error.presenceContract": "The presence check is not valid for this step kind.",
  "bp.error.operationHasJourney":
    "This operation already has a journey and cannot receive another blueprint.",
  "bp.error.alreadyProvisioned":
    "This operation already has a journey and cannot receive another blueprint.",
  "bp.error.noAnchor": "Provide the start date and time to apply the blueprint.",
  "bp.error.unexpected": "Could not complete. Try again.",

  "bp.validate.action": "Validate blueprint",
  "bp.validate.valid": "Blueprint is valid.",
  "bp.validate.invalid": "This version has pending issues.",
  "bp.validate.violations": "Pending issues",
  "bp.validate.step": "Step",
  "bp.validate.code": "Code",
  "bp.validate.message": "Message",
  "bp.validate.noStep": "Version",
  "bp.validate.pending": "Validate the version before publishing.",

  "bp.publish.action": "Publish version",
  "bp.publish.confirmTitle": "Publish this version?",
  "bp.publish.confirmBody":
    "Once published, this version cannot be changed. Future changes will require a new version.",
  "bp.publish.success": "Version published.",
  "bp.publish.needsValidation": "Validate the version with no pending issues before publishing.",
  "bp.publish.roleHint": "Only owners and administrators publish versions.",

  "bp.newVersion.action": "Create new version",
  "bp.newVersion.confirmTitle": "Create a new version from the published one?",
  "bp.newVersion.confirmBody":
    "Steps from the published version are copied into a new draft. The published version is not changed.",
  "bp.newVersion.success": "New draft version created.",

  "bp.archive.action": "Archive blueprint",
  "bp.archive.confirmTitle": "Archive this blueprint?",
  "bp.archive.confirmBody":
    "The blueprint stops accepting new versions and can no longer be applied. Operations already provisioned are unaffected.",
  "bp.archive.reasonRequired": "Provide the reason for archiving.",
  "bp.archive.success": "Blueprint archived.",

  "bp.apply.action": "Apply blueprint",
  "bp.apply.title": "Apply a blueprint to this operation",
  "bp.apply.blueprint": "Blueprint",
  "bp.apply.version": "Published version",
  "bp.apply.anchor": "Reference start",
  "bp.apply.anchorHint": "If left empty, the operation's planned start is used as the anchor.",
  "bp.apply.preview": "Step preview",
  "bp.step.hide": "Hide steps",
  "bp.apply.atomic":
    "The application is atomic and never replaces an existing journey. Nothing is created if anything fails.",
  "bp.apply.confirm": "Confirm application",
  "bp.apply.success": "Journey provisioned.",
  "bp.apply.successCount": "steps created.",
  "bp.apply.noBlueprints": "No published blueprint is available to apply.",
  "bp.apply.noBlueprintsBody": "Publish a blueprint version before provisioning journeys.",
  "bp.apply.hasJourney":
    "This operation already has a journey and cannot receive another blueprint.",
  "bp.apply.working": "Applying blueprint",

  "bp.origin.title": "Journey origin",
  "bp.origin.provisioned": "Provisioned from blueprint",
  "bp.origin.appliedAt": "Applied on",
  "bp.origin.appliedBy": "Applied by",
  "bp.origin.step": "Origin: blueprint",
  "bp.origin.manual": "Created manually",

  "bp.offset.zero": "at the operation start",
  "bp.offset.after": "after the operation start",
  "bp.busy": "Working…",
};

/** es-ES inherits en-US, following the established locale fallback of this project. */
export const BLUEPRINT_ES: Record<string, string> = { ...BLUEPRINT_EN };

export const BLUEPRINT_DICTIONARIES: Record<Locale, Record<string, string>> = {
  "pt-BR": BLUEPRINT_PT,
  "en-US": BLUEPRINT_EN,
  "es-ES": BLUEPRINT_ES,
};
