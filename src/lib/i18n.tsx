import * as React from "react";

import { W01_DICTIONARIES } from "./i18n-w01";

/**
 * COBS OS — i18n foundation (W00)
 * Global-first: locale, timezone and currency are runtime context, never hardcoded.
 * Dictionaries are flat key maps; missing keys fall back to the default locale.
 */

export const LOCALES = ["pt-BR", "en-US", "es-ES"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pt-BR";
export const DEFAULT_TIMEZONE = "America/Sao_Paulo";
export const DEFAULT_CURRENCY = "BRL";

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
  ...enUS,
  "brand.tagline": "Sistema operativo de experiencias globales",
  "nav.overview": "Visión general",
  "nav.experiences": "Experiencias",
  "nav.operations": "Operaciones",
  "nav.people": "Personas",
  "nav.network": "Red",
  "nav.insights": "Indicadores",
  "nav.settings": "Ajustes",
  "nav.section.command": "Centro de mando",
  "nav.section.domains": "Dominios",
  "nav.section.system": "Sistema",
  "topbar.search": "Buscar o ejecutar un comando",
  "topbar.searchShort": "Buscar",
  "account.signIn": "Entrar",
  "signin.title": "Acceder a COBS OS",
  "landing.primary": "Entrar en COBS OS",
};

const DICTIONARIES: Record<Locale, Dictionary> = {
  "pt-BR": { ...ptBR, ...W01_DICTIONARIES["pt-BR"] },
  "en-US": { ...enUS, ...W01_DICTIONARIES["en-US"] },
  "es-ES": { ...esES, ...W01_DICTIONARIES["es-ES"] },
};

export type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  timeZone: string;
  currency: string;
  t: (key: string) => string;
};

const I18nContext = React.createContext<I18nValue | null>(null);

const STORAGE_KEY = "cobs.locale";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>(DEFAULT_LOCALE);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored && (LOCALES as readonly string[]).includes(stored)) setLocaleState(stored);
  }, []);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);

  const value = React.useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      timeZone: DEFAULT_TIMEZONE,
      currency: DEFAULT_CURRENCY,
      t: (key: string) => DICTIONARIES[locale][key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key,
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = React.useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
