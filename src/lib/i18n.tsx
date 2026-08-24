import * as React from "react";

import { W01_DICTIONARIES } from "./i18n-w01";
import { W02_DICTIONARIES } from "./i18n-w02";
import { W03_DICTIONARIES } from "./i18n-w03";
import { W04_DICTIONARIES } from "./i18n-w04";
import { W11_DICTIONARIES } from "./i18n-w11";
import { W05_DICTIONARIES } from "./i18n-w05";
import { W06_DICTIONARIES } from "./i18n-w06";
import { W07_DICTIONARIES } from "./i18n-w07";
import { W08_DICTIONARIES } from "./i18n-w08";
import { W09_DICTIONARIES } from "./i18n-w09";
import { W10_DICTIONARIES } from "./i18n-w10";
import { ACCESS_DICTIONARIES } from "./i18n-access";
import { BLUEPRINT_DICTIONARIES } from "./i18n-blueprints";
import { ES_COMPLETE_V1 } from "./i18n-es-complete";

/**
 * COBS OS — i18n foundation (W00)
 * Global-first: locale, timezone and currency are independent runtime context.
 * Dictionaries are flat key maps; missing keys fall back to the default locale.
 */

export const LOCALES = ["pt-BR", "en-US", "es-ES"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pt-BR";
export const DEFAULT_TIMEZONE = "America/Sao_Paulo";
export const DEFAULT_CURRENCY = "BRL";

/** Readiness presets only. Selecting a language never silently selects a region. */
export const REGIONAL_PRESETS = {
  BR: { locale: "pt-BR" as const, timeZone: "America/Sao_Paulo", currency: "BRL" },
  US: { locale: "en-US" as const, timeZone: "America/New_York", currency: "USD" },
  ES: { locale: "es-ES" as const, timeZone: "Europe/Madrid", currency: "EUR" },
};

export const LOCALE_LABELS: Record<Locale, string> = {
  "pt-BR": "Português (BR)",
  "en-US": "English (US)",
  "es-ES": "Español (ES)",
};

type Dictionary = Record<string, string>;

const ptBR: Dictionary = {
  "brand.name": "COBS OS",
  "brand.tagline": "Sistema operacional de experiências globais",
  "nav.overview": "Visão geral",
  "nav.experiences": "Experiências",
  "nav.operations": "Operações",
  "nav.people": "Pessoas",
  "nav.network": "Rede",
  "nav.insights": "Indicadores",
  "nav.settings": "Configurações",
  "nav.more": "Mais",
  "nav.section.command": "Centro de comando",
  "nav.section.domains": "Domínios",
  "nav.section.system": "Sistema",
  "topbar.search": "Buscar ou executar comando",
  "topbar.searchShort": "Buscar",
  "topbar.notifications": "Notificações",
  "topbar.account": "Conta",
  "topbar.theme": "Alternar tema",
  "topbar.language": "Idioma",
  "topbar.menu": "Abrir menu",
  "org.context": "Contexto organizacional",
  "org.placeholder": "Nenhuma organização ativa",
  "org.hint": "A troca de tenant é definida no W01.",
  "command.placeholder": "Digite um comando ou busque…",
  "command.empty": "Nenhum resultado. A busca operacional chega no W01.",
  "command.group.navigate": "Navegar",
  "notifications.empty": "Sem notificações",
  "notifications.emptyHint": "O fluxo de eventos operacionais é habilitado no W01.",
  "account.signedOut": "Sessão estrutural",
  "account.signIn": "Entrar",
  "account.signOut": "Sair",
  "account.profile": "Perfil",
  "state.loading": "Carregando",
  "state.empty.title": "Nada aqui ainda",
  "state.empty.body": "Este domínio será ativado em um workflow posterior.",
  "state.error.title": "Esta página não carregou",
  "state.error.body": "Algo falhou do nosso lado. Tente novamente ou volte ao início.",
  "state.error.retry": "Tentar novamente",
  "state.error.home": "Ir para o início",
  "state.notFound.title": "Página não encontrada",
  "state.notFound.body": "A rota solicitada não existe neste sistema.",
  "landing.eyebrow": "Global Experience Operations",
  "landing.title": "O sistema operacional das experiências que sua organização entrega",
  "landing.body":
    "Planejado, esperado e realizado — separados por design. Fatos acima de status manual. Multi-tenant desde o primeiro dia.",
  "landing.primary": "Entrar no COBS OS",
  "landing.secondary": "Ver a constituição do produto",
  "landing.status": "Fundação W00 ativa",
  "signin.title": "Acessar o COBS OS",
  "signin.body": "Fronteira de autenticação estrutural. A autenticação real é definida no W01.",
  "signin.email": "E-mail corporativo",
  "signin.password": "Senha",
  "signin.submit": "Continuar",
  "signin.notice": "Ambiente estrutural: nenhuma credencial é enviada ou validada.",
  "signin.back": "Voltar",
  "signin.preview": "Ver o shell autenticado",
  "overview.title": "Centro de comando",
  "overview.subtitle": "Fundação estrutural. Nenhum dado operacional é exibido por princípio.",
  "overview.noAnalytics": "Sem analytics falsos",
  "overview.noAnalyticsBody":
    "Indicadores só aparecem quando existirem fatos reais registrados pelo sistema.",
  "principles.title": "Constituição arquitetural",
  "footer.rights": "Fundação W00 — sem dados operacionais.",
};

const enUS: Dictionary = {
  "brand.name": "COBS OS",
  "brand.tagline": "Global experience operations system",
  "nav.overview": "Overview",
  "nav.experiences": "Experiences",
  "nav.operations": "Operations",
  "nav.people": "People",
  "nav.network": "Network",
  "nav.insights": "Insights",
  "nav.settings": "Settings",
  "nav.more": "More",
  "nav.section.command": "Command center",
  "nav.section.domains": "Domains",
  "nav.section.system": "System",
  "topbar.search": "Search or run a command",
  "topbar.searchShort": "Search",
  "topbar.notifications": "Notifications",
  "topbar.account": "Account",
  "topbar.theme": "Toggle theme",
  "topbar.language": "Language",
  "topbar.menu": "Open menu",
  "org.context": "Organization context",
  "org.placeholder": "No active organization",
  "org.hint": "Tenant switching is defined in W01.",
  "command.placeholder": "Type a command or search…",
  "command.empty": "No results. Operational search arrives in W01.",
  "command.group.navigate": "Navigate",
  "notifications.empty": "No notifications",
  "notifications.emptyHint": "The operational event stream is enabled in W01.",
  "account.signedOut": "Structural session",
  "account.signIn": "Sign in",
  "account.signOut": "Sign out",
  "account.profile": "Profile",
  "state.loading": "Loading",
  "state.empty.title": "Nothing here yet",
  "state.empty.body": "This domain is activated in a later workflow.",
  "state.error.title": "This page didn't load",
  "state.error.body": "Something went wrong on our end. Try again or head back home.",
  "state.error.retry": "Try again",
  "state.error.home": "Go home",
  "state.notFound.title": "Page not found",
  "state.notFound.body": "The requested route does not exist in this system.",
  "landing.eyebrow": "Global Experience Operations",
  "landing.title": "The operating system for every experience your organization delivers",
  "landing.body":
    "Planned, expected and actual — separated by design. Facts over manual status. Multi-tenant from day one.",
  "landing.primary": "Enter COBS OS",
  "landing.secondary": "Read the product constitution",
  "landing.status": "W00 foundation live",
  "signin.title": "Access COBS OS",
  "signin.body": "Structural authentication boundary. Real authentication is defined in W01.",
  "signin.email": "Work email",
  "signin.password": "Password",
  "signin.submit": "Continue",
  "signin.notice": "Structural environment: no credentials are sent or validated.",
  "signin.back": "Back",
  "signin.preview": "Preview the authenticated shell",
  "overview.title": "Command center",
  "overview.subtitle": "Structural foundation. No operational data is shown, by principle.",
  "overview.noAnalytics": "No fake analytics",
  "overview.noAnalyticsBody": "Indicators appear only once real facts are recorded by the system.",
  "principles.title": "Architectural constitution",
  "footer.rights": "W00 foundation — no operational data.",
};

const esES: Dictionary = {
  "brand.name": "COBS OS",
  "brand.tagline": "Sistema operativo de experiencias globales",
  "nav.overview": "Visión general",
  "nav.experiences": "Experiencias",
  "nav.operations": "Operaciones",
  "nav.people": "Personas",
  "nav.network": "Red",
  "nav.insights": "Indicadores",
  "nav.settings": "Configuración",
  "nav.more": "Más",
  "nav.section.command": "Centro de mando",
  "nav.section.domains": "Dominios",
  "nav.section.system": "Sistema",
  "topbar.search": "Buscar o ejecutar un comando",
  "topbar.searchShort": "Buscar",
  "topbar.notifications": "Notificaciones",
  "topbar.account": "Cuenta",
  "topbar.theme": "Cambiar tema",
  "topbar.language": "Idioma",
  "topbar.menu": "Abrir menú",
  "org.context": "Contexto de la organización",
  "org.placeholder": "Ninguna organización activa",
  "org.hint": "El cambio de tenant se define en W01.",
  "command.placeholder": "Escribe un comando o busca…",
  "command.empty": "Sin resultados. La búsqueda operativa llega en W01.",
  "command.group.navigate": "Navegar",
  "notifications.empty": "Sin notificaciones",
  "notifications.emptyHint": "El flujo de eventos operativos se habilita en W01.",
  "account.signedOut": "Sesión estructural",
  "account.signIn": "Iniciar sesión",
  "account.signOut": "Cerrar sesión",
  "account.profile": "Perfil",
  "state.loading": "Cargando",
  "state.empty.title": "Todavía no hay nada aquí",
  "state.empty.body": "Este dominio se activará en un flujo de trabajo posterior.",
  "state.error.title": "Esta página no se ha cargado",
  "state.error.body": "Algo ha fallado de nuestro lado. Inténtalo de nuevo o vuelve al inicio.",
  "state.error.retry": "Intentar de nuevo",
  "state.error.home": "Ir al inicio",
  "state.notFound.title": "Página no encontrada",
  "state.notFound.body": "La ruta solicitada no existe en este sistema.",
  "landing.eyebrow": "Global Experience Operations",
  "landing.title": "El sistema operativo para las experiencias que ofrece tu organización",
  "landing.body":
    "Planificado, previsto y realizado — separados por diseño. Hechos por encima del estado manual. Multi-tenant desde el primer día.",
  "landing.primary": "Entrar en COBS OS",
  "landing.secondary": "Ver la constitución del producto",
  "landing.status": "Fundación W00 activa",
  "signin.title": "Acceder a COBS OS",
  "signin.body": "Frontera estructural de autenticación. La autenticación real se define en W01.",
  "signin.email": "Correo corporativo",
  "signin.password": "Contraseña",
  "signin.submit": "Continuar",
  "signin.notice": "Entorno estructural: no se envían ni validan credenciales.",
  "signin.back": "Volver",
  "signin.preview": "Ver el entorno autenticado",
  "overview.title": "Centro de mando",
  "overview.subtitle": "Fundación estructural. Por principio, no se muestran datos operativos.",
  "overview.noAnalytics": "Sin analítica ficticia",
  "overview.noAnalyticsBody": "Los indicadores aparecen únicamente cuando el sistema registra hechos reales.",
  "principles.title": "Constitución arquitectónica",
  "footer.rights": "Fundación W00 — sin datos operativos.",
};

const DICTIONARIES: Record<Locale, Dictionary> = {
  "pt-BR": {
    ...ptBR,
    ...W01_DICTIONARIES["pt-BR"],
    ...W02_DICTIONARIES["pt-BR"],
    ...W03_DICTIONARIES["pt-BR"],
    ...W04_DICTIONARIES["pt-BR"],
    ...W11_DICTIONARIES["pt-BR"],
    ...W05_DICTIONARIES["pt-BR"],
    ...W06_DICTIONARIES["pt-BR"],
    ...W07_DICTIONARIES["pt-BR"],
    ...W08_DICTIONARIES["pt-BR"],
    ...W09_DICTIONARIES["pt-BR"],
    ...W10_DICTIONARIES["pt-BR"],
    ...ACCESS_DICTIONARIES["pt-BR"],
    ...BLUEPRINT_DICTIONARIES["pt-BR"],
  },
  "en-US": {
    ...enUS,
    ...W01_DICTIONARIES["en-US"],
    ...W02_DICTIONARIES["en-US"],
    ...W03_DICTIONARIES["en-US"],
    ...W04_DICTIONARIES["en-US"],
    ...W11_DICTIONARIES["en-US"],
    ...W05_DICTIONARIES["en-US"],
    ...W06_DICTIONARIES["en-US"],
    ...W07_DICTIONARIES["en-US"],
    ...W08_DICTIONARIES["en-US"],
    ...W09_DICTIONARIES["en-US"],
    ...W10_DICTIONARIES["en-US"],
    ...ACCESS_DICTIONARIES["en-US"],
    ...BLUEPRINT_DICTIONARIES["en-US"],
  },
  "es-ES": {
    ...esES,
    ...W01_DICTIONARIES["es-ES"],
    ...W02_DICTIONARIES["es-ES"],
    ...W03_DICTIONARIES["es-ES"],
    ...W04_DICTIONARIES["es-ES"],
    ...W11_DICTIONARIES["es-ES"],
    ...W05_DICTIONARIES["es-ES"],
    ...W06_DICTIONARIES["es-ES"],
    ...W07_DICTIONARIES["es-ES"],
    ...W08_DICTIONARIES["es-ES"],
    ...W09_DICTIONARIES["es-ES"],
    ...W10_DICTIONARIES["es-ES"],
    ...ACCESS_DICTIONARIES["es-ES"],
    ...BLUEPRINT_DICTIONARIES["es-ES"],
    ...ES_COMPLETE_V1,
  },
};

export type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  timeZone: string;
  setTimeZone: (timeZone: string) => void;
  currency: string;
  setCurrency: (currency: string) => void;
  t: (key: string) => string;
};

const I18nContext = React.createContext<I18nValue | null>(null);

const LOCALE_STORAGE_KEY = "cobs.locale";
const TIMEZONE_STORAGE_KEY = "cobs.timeZone";
const CURRENCY_STORAGE_KEY = "cobs.currency";

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizeCurrency(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : DEFAULT_CURRENCY;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>(DEFAULT_LOCALE);
  const [timeZone, setTimeZoneState] = React.useState(DEFAULT_TIMEZONE);
  const [currency, setCurrencyState] = React.useState(DEFAULT_CURRENCY);

  React.useEffect(() => {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
    const storedTimeZone = window.localStorage.getItem(TIMEZONE_STORAGE_KEY);
    const storedCurrency = window.localStorage.getItem(CURRENCY_STORAGE_KEY);

    if (storedLocale && (LOCALES as readonly string[]).includes(storedLocale)) {
      setLocaleState(storedLocale);
      document.documentElement.lang = storedLocale;
    } else {
      document.documentElement.lang = DEFAULT_LOCALE;
    }

    if (storedTimeZone && isValidTimeZone(storedTimeZone)) setTimeZoneState(storedTimeZone);
    if (storedCurrency) setCurrencyState(normalizeCurrency(storedCurrency));
  }, []);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);

  const setTimeZone = React.useCallback((next: string) => {
    const value = isValidTimeZone(next) ? next : DEFAULT_TIMEZONE;
    setTimeZoneState(value);
    window.localStorage.setItem(TIMEZONE_STORAGE_KEY, value);
  }, []);

  const setCurrency = React.useCallback((next: string) => {
    const value = normalizeCurrency(next);
    setCurrencyState(value);
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, value);
  }, []);

  const value = React.useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      timeZone,
      setTimeZone,
      currency,
      setCurrency,
      t: (key: string) => DICTIONARIES[locale][key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key,
    }),
    [currency, locale, setCurrency, setLocale, setTimeZone, timeZone],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = React.useContext(I18nValueContextCompat ?? I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

// Compatibility alias is deliberately null; kept out of runtime state.
const I18nValueContextCompat: React.Context<I18nValue | null> | null = null;
