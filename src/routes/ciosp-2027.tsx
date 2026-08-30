import { FormEvent, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, GraduationCap, Hotel, Loader2, MapPin, Plane, ShieldCheck, Users } from "lucide-react";

import { BrandLockup } from "@/app/shell/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/ciosp-2027")({
  head: () => ({
    meta: [
      { title: "CIOSP 2027 — Caravana BSBTUR" },
      {
        name: "description",
        content: "Caravana acadêmica BSBTUR para o CIOSP 2027 em São Paulo, de 25 a 31 de janeiro de 2027.",
      },
    ],
  }),
  component: CiospPrelaunch,
});

const inclusions = [
  [Plane, "Passagem aérea", "Brasília → São Paulo → Brasília, conforme contratação final."],
  [Hotel, "Hospedagem", "6 diárias em acomodação dupla, com café da manhã."],
  [MapPin, "Transporte em São Paulo", "Transfers e deslocamentos previstos na programação da caravana."],
  [GraduationCap, "CIOSP 2027", "Participação acadêmica conforme a modalidade contemplada no pacote final."],
  [ShieldCheck, "Seguro viagem", "Proteção para os viajantes durante o período da operação."],
  [Users, "Equipe BSBTUR", "Acompanhamento e suporte operacional durante a experiência."],
] as const;

function CiospPrelaunch() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consentContact, setConsentContact] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading || !consentContact) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: captureError } = await supabase.functions.invoke("ciosp-public-lead-capture", {
        body: {
          full_name: fullName,
          email,
          phone,
          consent_contact: consentContact,
          idempotency_key: idempotencyKey,
          source: "ciosp_2027_prelaunch",
          campaign: "ciosp-2027-lista-prioritaria",
        },
      });
      if (captureError) throw captureError;
      if (!data?.id) throw new Error("lead_capture_response_invalid");
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar seu interesse agora.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 lg:px-8">
          <BrandLockup />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">CIOSP 2027 · Pré-lançamento</span>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-5 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-20">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Caravana acadêmica · São Paulo · 25–31 jan 2027</p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">Viva o CIOSP 2027 com tudo organizado do início ao fim.</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Uma experiência acadêmica BSBTUR para estudantes e profissionais de Odontologia que querem aproveitar o congresso com mais organização, suporte e tranquilidade.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 text-sm">
              <span className="rounded-full border border-border px-4 py-2">30 vagas planejadas</span>
              <span className="rounded-full border border-border px-4 py-2">6 diárias</span>
              <span className="rounded-full border border-border px-4 py-2">Brasília → São Paulo</span>
            </div>
          </div>

          <aside className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">Investimento planejado por viajante</p>
            <p className="mt-2 text-4xl font-semibold">R$ 9.990</p>
            <div className="mt-5 rounded-xl border border-border bg-surface p-4">
              <p className="font-medium">Entrada de R$ 2.490</p>
              <p className="mt-1 text-sm text-muted-foreground">Saldo de R$ 7.500 parcelado conforme a data da contratação, com quitação integral até 10/01/2027.</p>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Pré-lançamento. As vendas ainda não estão abertas. Condições, fornecedores e serviços ficam sujeitos à contratação e ao instrumento comercial definitivo.
            </p>
          </aside>
        </section>

        <section className="border-y border-border bg-surface/40">
          <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Experiência integrada</p>
            <h2 className="mt-3 text-3xl font-semibold">Você cuida do CIOSP. A BSBTUR organiza a viagem.</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {inclusions.map(([Icon, title, description]) => (
                <article key={title} className="rounded-xl border border-border bg-card p-5">
                  <Icon className="size-5 text-primary" />
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
                </article>
              ))}
            </div>
            <p className="mt-5 text-sm text-muted-foreground">Alimentação programada e kit BSBTUR também fazem parte do planejamento comercial e serão detalhados nas condições finais.</p>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-5 py-12 lg:grid-cols-[1fr_0.8fr] lg:px-8 lg:py-16">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Mais que passagem + hotel</p>
            <h2 className="mt-3 text-3xl font-semibold">Uma experiência acadêmica organizada do embarque ao retorno.</h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
              A proposta da caravana é centralizar viagem, programação e suporte para reduzir a complexidade de quem vai ao CIOSP e permitir que o viajante concentre sua energia na formação, nas conexões e na experiência em São Paulo.
            </p>
            <div className="mt-7 space-y-3 text-sm">
              {["Planejamento limitado a 30 viajantes pagantes.", "Informações e comunicações centralizadas pela BSBTUR.", "Fornecedores e horários definitivos informados após contratação.", "Nenhuma cobrança é realizada nesta página de pré-lançamento."].map((item) => (
                <div key={item} className="flex gap-3"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /><span>{item}</span></div>
              ))}
            </div>
          </div>

          <div id="lista-prioritaria" className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            {!submitted ? (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Lista prioritária</p>
                  <h2 className="mt-2 text-2xl font-semibold">Quero ser avisado quando abrir</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Deixe seus dados para demonstrar interesse. Isso não cria reserva e não gera cobrança.</p>
                </div>
                <label className="block space-y-1.5 text-sm font-medium">Nome completo<Input required minLength={2} maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" /></label>
                <label className="block space-y-1.5 text-sm font-medium">WhatsApp<Input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(61) 99999-9999" autoComplete="tel" /></label>
                <label className="block space-y-1.5 text-sm font-medium">E-mail<Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
                <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
                  <input required type="checkbox" checked={consentContact} onChange={(e) => setConsentContact(e.target.checked)} className="mt-1 size-4" />
                  <span>Autorizo a BSBTUR a entrar em contato comigo sobre a Caravana CIOSP 2027 pelos dados informados. Posso solicitar a interrupção do contato a qualquer momento.</span>
                </label>
                {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
                <Button type="submit" size="lg" className="w-full" disabled={loading || !consentContact}>
                  {loading ? <><Loader2 className="mr-2 size-4 animate-spin" />Registrando...</> : "Entrar na lista prioritária"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">Sem pagamento e sem reserva nesta etapa.</p>
              </form>
            ) : (
              <div className="space-y-5 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-success/10 text-success"><CheckCircle2 className="size-7" /></span>
                <div><h2 className="text-2xl font-semibold">Você entrou na lista prioritária</h2><p className="mt-2 text-sm text-muted-foreground">Seu interesse foi registrado no COBS. A BSBTUR poderá entrar em contato quando houver novidades sobre a abertura das reservas.</p></div>
              </div>
            )}
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8">
            <h2 className="text-2xl font-semibold">Informações importantes</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border p-5"><h3 className="font-semibold">As vendas já estão abertas?</h3><p className="mt-2 text-sm text-muted-foreground">Não. Esta é uma página de pré-lançamento e manifestação de interesse. A abertura das reservas será comunicada pela BSBTUR.</p></div>
              <div className="rounded-xl border border-border p-5"><h3 className="font-semibold">Companhia aérea e hotel já estão definidos?</h3><p className="mt-2 text-sm text-muted-foreground">O planejamento possui referências operacionais, mas os fornecedores definitivos serão informados após contratação.</p></div>
              <div className="rounded-xl border border-border p-5"><h3 className="font-semibold">O preço pode mudar?</h3><p className="mt-2 text-sm text-muted-foreground">R$ 9.990 é o preço-base do planejamento comercial atual. A condição definitiva será apresentada no momento da abertura das vendas.</p></div>
              <div className="rounded-xl border border-border p-5"><h3 className="font-semibold">Entrar na lista garante vaga?</h3><p className="mt-2 text-sm text-muted-foreground">Não. A lista registra interesse e prioridade de comunicação. A vaga somente será formalizada pelo fluxo comercial definitivo.</p></div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
