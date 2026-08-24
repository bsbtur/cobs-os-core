export const W02_ES_CORE_DELTA: Record<string, string> = {
  "op.emptyUpcoming": "No hay próximas operaciones.",
  "op.emptyUpcomingBody": "Las operaciones programadas aparecerán aquí cuando entren en la próxima ventana.",
  "op.loadError": "No se pudieron cargar las operaciones.",
  "op.loadErrorBody": "Revisa tu conexión e inténtalo de nuevo.",
  "op.retry": "Intentar de nuevo",
};

export const W04_ES_CORE_DELTA: Record<string, string> = {
  "w04.playbook.edit": "Editar",
  "w04.playbook.editTitle": "Editar elemento del checklist",
  "w04.playbook.itemTitle": "Título del elemento",
  "w04.playbook.save": "Guardar",
  "w04.playbook.updated": "Elemento actualizado.",
  "w04.playbook.remove": "Quitar",
  "w04.playbook.removeTitle": "Quitar elemento del checklist",
  "w04.playbook.removeBody":
    "El elemento dejará de aparecer en el checklist. El historial se conserva: no se elimina nada.",
  "w04.playbook.removeReason": "Motivo operativo",
  "w04.playbook.removeReasonRequired": "Indica el motivo operativo para quitarlo.",
  "w04.playbook.removeConfirm": "Confirmar retirada",
  "w04.playbook.removed": "Elemento retirado del checklist.",
  "w04.playbook.duplicate": "Ya existe un elemento activo con este título en esta etapa.",
  "w04.playbook.cancel": "Cancelar",

  "w04.timing.elapsed": "Transcurrido",
  "w04.timing.remaining": "Restante",
  "w04.timing.late": "Retraso",
  "w04.timing.nextIn": "Siguiente en",
  "w04.timing.nextLate": "Siguiente con retraso",
  "w04.timing.none": "No hay horarios definidos para esta etapa.",

  "w04.live.preStart.ready": "Operación lista para ejecutarse.",
  "w04.live.preStart.readyBody":
    "La ejecución todavía no ha comenzado. Inicia la operación desde la visión general para empezar el registro en vivo.",
  "w04.live.preStart.completed": "Operación finalizada.",
  "w04.live.preStart.completedBody":
    "Esta operación se ha completado. El registro en vivo permanece disponible solo para consulta.",
  "w04.live.preStart.cancelled": "Operación cancelada.",
  "w04.live.preStart.cancelledBody":
    "Esta operación ha sido cancelada. No hay una ejecución en vivo en curso.",

  "w04.presence.more": "Más",
  "w04.presence.search": "Buscar viajero por nombre",
  "w04.presence.filter.all": "Todos",
  "w04.presence.filter.pending": "Pendientes",
  "w04.presence.filter.done": "Completados",
  "w04.presence.noResults": "No se encontró ningún viajero.",

  "w04.error.permission": "No tienes permiso para realizar esta acción en esta operación.",
  "w04.error.auth": "Tu sesión ha caducado. Inicia sesión de nuevo para continuar.",
  "w04.error.operationNotReady": "La operación debe estar «lista» antes de iniciar el itinerario.",
  "w04.error.operationNotRunning":
    "Esta operación no está en ejecución. Iníciala antes de registrar hechos.",
  "w04.error.anotherStepRunning":
    "Otra etapa sigue en curso. Complétala antes de iniciar una nueva.",
  "w04.error.stepSkipped": "Esta etapa fue omitida y no puede iniciarse.",
  "w04.error.stepNotStarted": "Esta etapa todavía no ha comenzado. Iníciala primero.",
  "w04.error.stepClosed": "Esta etapa ya está cerrada y no puede modificarse.",
  "w04.error.stepAlreadyStarted": "Una etapa que ya ha comenzado no puede omitirse.",
  "w04.error.notReady":
    "La etapa todavía no está lista. Resuelve las personas pendientes y los elementos obligatorios del checklist.",
  "w04.error.arrivalRequired":
    "La llegada todavía no se ha registrado en esta etapa. Registra la llegada antes de continuar.",
  "w04.error.boardingNotStarted":
    "El embarque todavía no se ha abierto en esta etapa. Pulsa «Iniciar embarque» primero.",
  "w04.error.noBoardingTracking": "Esta etapa no controla el embarque.",
  "w04.error.departureNotAuthorized":
    "La salida todavía no se ha autorizado en esta etapa. Autorízala antes de registrarla.",
  "w04.error.departureAlreadyAuthorized":
    "La salida ya estaba autorizada. No se ha modificado nada.",
  "w04.error.notDeparted": "El grupo todavía no ha iniciado el desplazamiento.",
  "w04.error.reasonRequired": "Indica el motivo para completar esta acción.",
  "w04.error.future": "No se puede registrar un hecho en el futuro.",
  "w04.error.backdated": "No se puede registrar un hecho antes de la ventana de la operación.",

  "w04.live.blockedSummary": "Acción bloqueada por la preparación:",
  "w04.live.blockedPeopleCount": "persona(s) pendiente(s)",
  "w04.live.blockedItemsCount": "elemento(s) obligatorio(s) pendiente(s)",

  "w04.cockpit.title": "Cockpit operativo",
  "w04.cockpit.currentStep": "ETAPA ACTUAL",
  "w04.cockpit.nextAction": "SIGUIENTE ACCIÓN",
  "w04.cockpit.noStep": "No hay ninguna etapa en curso",
  "w04.cockpit.tone.ready": "Listo",
  "w04.cockpit.tone.attention": "Atención",
  "w04.cockpit.tone.blocked": "Bloqueado",
  "w04.cockpit.tone.delayed": "Con retraso",
  "w04.cockpit.tone.neutral": "En espera",
  "w04.cockpit.metric.present": "Presentes",
  "w04.cockpit.metric.boarded": "Embarcados",
  "w04.cockpit.metric.absent": "Ausentes",
  "w04.cockpit.metric.pending": "Pendientes",
  "w04.cockpit.action.operationNotActive": "La operación todavía no está en ejecución.",
  "w04.cockpit.action.startStep": "Inicia la siguiente etapa.",
  "w04.cockpit.action.startGathering": "Inicia la reunión del grupo.",
  "w04.cockpit.action.startBoarding": "Abre el embarque para registrar a los embarcados.",
  "w04.cockpit.action.resolvePresence": "Resuelve las pendientes de presencia.",
  "w04.cockpit.action.resolveChecklist": "Completa los elementos obligatorios del checklist.",
  "w04.cockpit.action.recordArrival": "Registra la llegada al destino.",
  "w04.cockpit.action.completeDisembarkation": "Completa el desembarque.",
  "w04.cockpit.action.completeStep": "Completa esta etapa.",
  "w04.cockpit.action.completeOperation":
    "Itinerario completado. Finaliza la operación desde la visión general.",
  "w04.cockpit.action.waiting": "No hay nada que hacer ahora.",
  "w04.cockpit.cta.operationNotActive": "Abrir visión general",
  "w04.cockpit.cta.startStep": "Iniciar etapa",
  "w04.cockpit.cta.startGathering": "Iniciar reunión",
  "w04.cockpit.cta.startBoarding": "Iniciar embarque",
  "w04.cockpit.cta.resolvePresence": "Ver pendientes",
  "w04.cockpit.cta.resolveChecklist": "Abrir checklist",
  "w04.cockpit.cta.recordArrival": "Registrar llegada",
  "w04.cockpit.cta.completeDisembarkation": "Completar desembarque",
  "w04.cockpit.cta.completeStep": "Completar etapa",
  "w04.cockpit.cta.completeOperation": "Abrir visión general",
  "w04.cockpit.cta.waiting": "Actualizar",
};

export const W05_ES_CORE_DELTA: Record<string, string> = {
  "w05.driver.noCandidates": "No hay conductores elegibles disponibles.",
};