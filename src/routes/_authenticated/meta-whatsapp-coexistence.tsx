import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, ExternalLink, ShieldAlert } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { Button } from "@/components/ui/button";

const META_APP_ID = "1069669865565624";
const META_CONFIG_ID = "969361429527409";
const META_API_VERSION = "v26.0";

type FacebookLoginResponse = {
  authResponse?: {
    code?: string;
  };
  status?: string;
};

type EmbeddedSignupData = {
  event?: string;
  data?: {
    waba_id?: string;
    phone_number_id?: string;
  };
};

type FacebookSdk = {
  init: (options: {
    appId: string;
    autoLogAppEvents: boolean;
    xfbml: boolean;
    version: string;
  }) => void;
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: {
      config_id: string;
      response_type: "code";
      override_default_response_type: true;
      extras: {
        featureType: "whatsapp_business_app_onboarding";
        sessionInfoVersion: "3";
      };
    },
  ) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

export const Route = createFileRoute("/_authenticated/meta-whatsapp-coexistence")({
  head: () => ({
    meta: [
      { title: "WhatsApp Coexistência — COBS OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MetaWhatsAppCoexistencePage,
});

function isFacebookOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "facebook.com" || hostname.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

function parseEmbeddedSignupMessage(value: unknown): EmbeddedSignupData | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  }

  if (!candidate || typeof candidate !== "object") return null;
  const record = candidate as Record<string, unknown>;
  if (record["type"] !== "WA_EMBEDDED_SIGNUP") return null;
  const rawData = record["data"];
  if (!rawData || typeof rawData !== "object") return null;
  const data = rawData as Record<string, unknown>;
  const rawNested = data["data"];
  const nested =
    rawNested && typeof rawNested === "object"
      ? (rawNested as Record<string, unknown>)
      : undefined;

  const result: EmbeddedSignupData = {};
  if (typeof data["event"] === "string") result.event = data["event"];

  if (nested) {
    const sanitized: NonNullable<EmbeddedSignupData["data"]> = {};
    if (typeof nested["waba_id"] === "string") sanitized.waba_id = nested["waba_id"];
    if (typeof nested["phone_number_id"] === "string") {
      sanitized.phone_number_id = nested["phone_number_id"];
    }
    if (Object.keys(sanitized).length > 0) result.data = sanitized;
  }

  return result;
}

function CoexistenceLauncher() {
  const [sdkReady, setSdkReady] = React.useState(false);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [launching, setLaunching] = React.useState(false);
  const [codeReceived, setCodeReceived] = React.useState(false);
  const [sessionEvent, setSessionEvent] = React.useState<string | null>(null);
  const [wabaId, setWabaId] = React.useState<string | null>(null);
  const [phoneNumberId, setPhoneNumberId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!isFacebookOrigin(event.origin)) return;
      const parsed = parseEmbeddedSignupMessage(event.data);
      if (!parsed) return;
      setSessionEvent(parsed.event ?? "evento_sem_nome");
      setWabaId(parsed.data?.waba_id ?? null);
      setPhoneNumberId(parsed.data?.phone_number_id ?? null);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  React.useEffect(() => {
    if (window.FB) {
      setSdkReady(true);
      return;
    }

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: META_APP_ID,
        autoLogAppEvents: true,
        xfbml: true,
        version: META_API_VERSION,
      });
      setSdkReady(Boolean(window.FB));
    };

    const existing = document.getElementById("facebook-jssdk");
    if (existing) return;

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.onerror = () => setError("Não foi possível carregar o SDK JavaScript da Meta.");
    document.body.appendChild(script);
  }, []);

  function launch() {
    if (!acknowledged || !window.FB) return;
    setLaunching(true);
    setError(null);
    setCodeReceived(false);

    window.FB.login(
      (response) => {
        setLaunching(false);
        if (response.authResponse?.code) {
          // Deliberadamente não exibimos, persistimos ou trocamos o code nesta etapa.
          setCodeReceived(true);
          return;
        }
        setError("O Cadastro Incorporado foi fechado ou não retornou um código de autorização.");
      },
      {
        config_id: META_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
        },
      },
    );
  }

  const finished = sessionEvent === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";

  return (
    <div className="space-y-5">
      <header className="surface-panel p-5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-5" />
          <h2 className="text-2xl font-semibold">WhatsApp Business App · Coexistência</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Launcher controlado do Embedded Signup. Esta etapa não troca o código por token, não registra telefone via API e não grava credenciais no COBS.
        </p>
      </header>

      <section className="surface-panel space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Status label="SDK Meta" value={sdkReady ? "pronto" : "carregando"} />
          <Status label="Configuração" value="COBS OS WhatsApp" />
          <Status label="Feature" value="whatsapp_business_app_onboarding" />
          <Status label="Session info" value="v3" />
        </div>

        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium">Antes de abrir o fluxo</p>
          <p className="mt-1 text-muted-foreground">
            A Coexistência pode desconectar temporariamente dispositivos vinculados do WhatsApp Business App; grupos não são sincronizados e alguns recursos do app têm limitações próprias. Não use o fluxo tradicional de “Registrar número”.
          </p>
          <label className="mt-3 flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>Li o aviso e quero apenas abrir o fluxo oficial de Coexistência.</span>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button disabled={!sdkReady || !acknowledged || launching} onClick={launch}>
            {launching ? "Abrindo Meta…" : "Abrir Embedded Signup de Coexistência"}
          </Button>
          <Button asChild variant="outline">
            <a
              href="https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users"
              target="_blank"
              rel="noreferrer"
            >
              Documentação oficial <ExternalLink className="ml-2 size-4" />
            </a>
          </Button>
        </div>

        {error ? <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="surface-panel space-y-3 p-5">
        <h3 className="text-lg font-semibold">Evidência da sessão</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Status label="Authorization code" value={codeReceived ? "recebido · não exibido · não trocado" : "não recebido"} />
          <Status label="Evento" value={sessionEvent ?? "aguardando"} />
          <Status label="WABA ID" value={wabaId ?? "—"} />
          <Status label="Phone number ID" value={phoneNumberId ?? "—"} />
        </div>
        {finished ? (
          <p className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm font-medium">
            <CheckCircle2 className="size-5" />
            Meta informou FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING. Ainda não há troca de token nesta rota.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-elevated/50 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm">{value}</div>
    </div>
  );
}

function MetaWhatsAppCoexistencePage() {
  return (
    <AppShell activeId="settings" title="WhatsApp · Coexistência">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app">
            <ArrowLeft className="mr-2 size-4" />
            Voltar
          </Link>
        </Button>
        <RequireTenant>
          <CoexistenceLauncher />
        </RequireTenant>
      </div>
    </AppShell>
  );
}
