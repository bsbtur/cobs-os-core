import { FormEvent, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  HeartHandshake,
  Hotel,
  Loader2,
  MapPin,
  Plane,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import { BrandLockup } from "@/app/shell/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/ciosp-2027")({
  head: () => ({
    meta: [
      { title: "CIOSP 2027 — Experiência BSBTUR" },
      {
        name: "description",
        content:
          "Caravana acadêmica premium BSBTUR para o CIOSP 2027 em São Paulo, de 25 a 31 de janeiro de 2027.",
      },
    ],
  }),
  component: CiospPrelaunch,
});

const inclusions = [
  [Plane, "Passagem aérea", "Brasília → São Paulo → Brasília, conforme contratação final."],
  [Hotel, "Hospedagem", "6 diárias em acomodação dupla, com café da manhã."],
  [MapPin, "Mobilidade em São Paulo", "Transfers e deslocamentos previstos na programação da caravana."],
  [GraduationCap, "CIOSP 2027", "Participação acadêmica conforme a modalidade contemplada no pacote final."],
  [ShieldCheck, "Seguro viagem", "Proteção para os viajantes durante o período da operação."],
  [HeartHandshake, "Equipe BSBTUR", "Acompanhamento e suporte operacional durante toda a experiência."],
] as const;

const experienceImages = [
  {
    src: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1400&q=85",
    alt: "Auditório preparado para congresso e programação profissional",
    label: "Congresso & formação",
  },
  {
    src: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=85",
    alt: "Vista de uma viagem aérea acima das nuvens",
    label: "Viagem organizada",
  },
  {
    src: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=85",
    alt: "Ambiente contemporâneo de hotel",
    label: "Hospedagem confortável",
  },
] as const;

const journey = [
  {
    date: "25 JAN",
    title: "Brasília → São Paulo",
    description: "Início da experiência com embarque organizado e recepção da caravana.",
  },
  {
    date: "27–30 JAN",
    title: "CIOSP 2027",
    description: "Dias dedicados a conhecimento, conexões, tendências e vivência profissional.",
  },
  {
    date: "31 JAN",
    title: "São Paulo → Brasília",
    description: "Retorno acompanhado, encerrando uma semana pensada para você aproveitar o que realmente importa.",
  },
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
    <div className="min-h-screen bg-white text-zinc-950">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <BrandLockup />
          <a
            href="#lista-prioritaria"
            className="hidden items-center gap-2 rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 sm:flex"
          >
            Lista prioritária <ArrowRight className="size-4" />
          </a>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden bg-zinc-950 text-white">
          <img
            src={experienceImages[0].src}
            alt={experienceImages[0].alt}
            className="absolute inset-0 -z-20 h-full w-full object-cover opacity-45"
            fetchPriority="high"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/85 to-black/30" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-zinc-950 via-transparent to-black/20" />

          <div className="mx-auto grid min-h-[760px] max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-28">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] backdrop-blur">
                <Sparkles className="size-4 text-amber-300" /> CIOSP 2027 · Experiência BSBTUR
              </div>

              <p className="mt-8 text-sm font-medium uppercase tracking-[0.2em] text-white/65">
                25–31 janeiro · Brasília → São Paulo
              </p>
              <h1 className="mt-4 text-5xl font-semibold leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">
                Brasília para o maior palco da Odontologia.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-white/75 sm:text-xl">
                Você vive o congresso. A BSBTUR organiza a experiência — viagem, hospedagem, mobilidade e suporte em uma única jornada.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#lista-prioritaria"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-amber-400 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-amber-300"
                >
                  Quero entrar na lista <ArrowRight className="size-4" />
                </a>
                <a
                  href="#experiencia"
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/25 bg-white/5 px-6 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/10"
                >
                  Conhecer a experiência
                </a>
              </div>

              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/70">
                <span className="inline-flex items-center gap-2"><Users className="size-4 text-amber-300" /> 30 vagas planejadas</span>
                <span className="inline-flex items-center gap-2"><Hotel className="size-4 text-amber-300" /> 6 diárias</span>
                <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-amber-300" /> Suporte BSBTUR</span>
              </div>
            </div>

            <div className="lg:justify-self-end">
              <div className="w-full max-w-md rounded-[2rem] border border-white/15 bg-black/45 p-6 shadow-2xl backdrop-blur-xl sm:p-7">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-white/60">Pré-lançamento 2027</span>
                  <span className="rounded-full bg-amber-300/15 px-3 py-1 text-xs font-semibold text-amber-200">Lista prioritária</span>
                </div>
                <p className="mt-8 text-sm text-white/60">Investimento planejado por viajante</p>
                <p className="mt-1 text-5xl font-semibold tracking-tight">R$ 9.990</p>
                <p className="mt-3 text-sm leading-relaxed text-white/65">
                  Entrada planejada de <strong className="text-white">R$ 2.490</strong> + saldo conforme as condições da contratação.
                </p>

                <div className="my-7 h-px bg-white/10" />

                <div className="space-y-3 text-sm text-white/75">
                  {["Experiência acadêmica integrada", "Viagem com acompanhamento", "Comunicação centralizada", "Sem cobrança nesta etapa"].map((item) => (
                    <div key={item} className="flex items-center gap-3">
                      <CheckCircle2 className="size-4 shrink-0 text-amber-300" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="experiencia" className="bg-white">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="grid items-end gap-8 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">Uma experiência, não só um pacote</p>
                <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                  Uma semana que pode marcar sua formação profissional.
                </h2>
              </div>
              <p className="max-w-2xl text-lg leading-relaxed text-zinc-600 lg:justify-self-end">
                A proposta é tirar da sua frente a complexidade de organizar cada detalhe da viagem e devolver tempo, previsibilidade e tranquilidade para você aproveitar São Paulo e o CIOSP com foco total na experiência.
              </p>
            </div>

            <div className="mt-12 grid gap-4 lg:grid-cols-12 lg:grid-rows-2">
              <figure className="group relative min-h-[480px] overflow-hidden rounded-[2rem] bg-zinc-900 lg:col-span-7 lg:row-span-2">
                <img
                  src={experienceImages[0].src}
                  alt={experienceImages[0].alt}
                  className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <figcaption className="absolute bottom-0 left-0 p-7 text-white sm:p-9">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">{experienceImages[0].label}</p>
                  <p className="mt-2 max-w-md text-2xl font-semibold">Conhecimento, inovação e conexões no centro da viagem.</p>
                </figcaption>
              </figure>

              {experienceImages.slice(1).map((image) => (
                <figure key={image.src} className="group relative min-h-[230px] overflow-hidden rounded-[2rem] bg-zinc-900 lg:col-span-5">
                  <img
                    src={image.src}
                    alt={image.alt}
                    className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />
                  <figcaption className="absolute bottom-0 left-0 p-6 text-lg font-semibold text-white">{image.label}</figcaption>
                </figure>
              ))}
            </div>
            <p className="mt-4 text-xs text-zinc-500">Imagens ilustrativas da experiência. Fornecedores, equipamentos e ambientes definitivos serão informados nas condições de contratação.</p>
          </div>
        </section>

        <section className="bg-zinc-950 text-white">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Experiência integrada</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Você cuida do CIOSP. A gente cuida do resto.</h2>
              <p className="mt-5 text-lg leading-relaxed text-white/60">O planejamento comercial reúne os principais pontos da jornada em uma única experiência BSBTUR.</p>
            </div>

            <div className="mt-12 grid gap-px overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
              {inclusions.map(([Icon, title, description]) => (
                <article key={title} className="bg-zinc-950 p-7 sm:p-8">
                  <span className="grid size-11 place-items-center rounded-full bg-amber-300/10 text-amber-300">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-6 text-xl font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/55">{description}</p>
                </article>
              ))}
            </div>

            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/65">
              <UtensilsCrossed className="size-5 shrink-0 text-amber-300" />
              Alimentação programada e kit BSBTUR também fazem parte do planejamento comercial e serão detalhados nas condições finais.
            </div>
          </div>
        </section>

        <section className="bg-stone-50">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="lg:sticky lg:top-28 lg:self-start">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Do embarque ao retorno</p>
                <h2 className="mt-4 text-4xl font-semibold tracking-tight">Uma jornada com começo, meio e fim organizados.</h2>
                <p className="mt-5 leading-relaxed text-zinc-600">A caravana foi pensada para transformar vários fornecedores e decisões em uma experiência mais simples para o viajante.</p>
              </div>

              <div className="space-y-4">
                {journey.map((step, index) => (
                  <article key={step.date} className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-sm sm:p-8">
                    <div className="grid gap-5 sm:grid-cols-[100px_1fr]">
                      <div>
                        <p className="text-sm font-bold text-amber-700">{step.date}</p>
                        <p className="mt-1 text-xs text-zinc-400">Etapa {index + 1}</p>
                      </div>
                      <div>
                        <h3 className="text-2xl font-semibold">{step.title}</h3>
                        <p className="mt-3 leading-relaxed text-zinc-600">{step.description}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="overflow-hidden rounded-[2.25rem] bg-zinc-950 text-white shadow-2xl">
              <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
                <div className="p-8 sm:p-12 lg:p-14">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Investimento planejado</p>
                  <h2 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">Uma experiência completa para viver o CIOSP com tranquilidade.</h2>
                  <div className="mt-9 flex flex-wrap items-end gap-x-5 gap-y-2">
                    <span className="text-5xl font-semibold sm:text-6xl">R$ 9.990</span>
                    <span className="pb-2 text-sm text-white/50">por viajante</span>
                  </div>
                  <p className="mt-4 max-w-xl leading-relaxed text-white/60">
                    Entrada planejada de R$ 2.490 e saldo de R$ 7.500 parcelado conforme a data da contratação, com quitação integral até 10/01/2027.
                  </p>
                </div>

                <div className="border-t border-white/10 bg-white/[0.04] p-8 sm:p-12 lg:border-l lg:border-t-0 lg:p-14">
                  <div className="space-y-5">
                    <div className="flex gap-4"><Star className="mt-0.5 size-5 shrink-0 text-amber-300" /><div><p className="font-semibold">Prioridade de comunicação</p><p className="mt-1 text-sm text-white/55">Quem entra na lista recebe as novidades da abertura comercial.</p></div></div>
                    <div className="flex gap-4"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-300" /><div><p className="font-semibold">Sem pagamento agora</p><p className="mt-1 text-sm text-white/55">Esta página registra interesse. Não cria reserva nem cobrança.</p></div></div>
                    <div className="flex gap-4"><CalendarDays className="mt-0.5 size-5 shrink-0 text-amber-300" /><div><p className="font-semibold">Pré-lançamento</p><p className="mt-1 text-sm text-white/55">Condições e fornecedores definitivos serão apresentados na abertura das vendas.</p></div></div>
                  </div>
                  <a href="#lista-prioritaria" className="mt-8 inline-flex items-center gap-2 font-semibold text-amber-300 hover:text-amber-200">
                    Quero prioridade quando abrir <ArrowRight className="size-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-stone-50">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[0.85fr_1.15fr] lg:px-8 lg:py-24">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Lista prioritária</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Se essa experiência faz sentido para você, entre primeiro na conversa.</h2>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">
                Registre seu interesse para receber informações sobre a abertura das reservas. Nesta etapa não existe pagamento, contrato ou garantia de vaga.
              </p>
              <div className="mt-8 space-y-3 text-sm text-zinc-700">
                {["Planejamento limitado a 30 viajantes pagantes.", "Informações centralizadas pela BSBTUR.", "Nenhuma cobrança é realizada nesta página."].map((item) => (
                  <div key={item} className="flex gap-3"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-700" /><span>{item}</span></div>
                ))}
              </div>
            </div>

            <div id="lista-prioritaria" className="scroll-mt-28 rounded-[2rem] border border-black/5 bg-white p-6 shadow-xl shadow-black/5 sm:p-8">
              {!submitted ? (
                <form onSubmit={submit} className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-700"><Sparkles className="size-4" /> Quero prioridade</div>
                    <h3 className="mt-3 text-3xl font-semibold">Avise-me quando abrir</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-500">Deixe seus dados para demonstrar interesse. Isso não cria reserva e não gera cobrança.</p>
                  </div>

                  <label className="block space-y-2 text-sm font-semibold text-zinc-800">
                    Nome completo
                    <Input required minLength={2} maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" className="h-12 rounded-xl" />
                  </label>
                  <label className="block space-y-2 text-sm font-semibold text-zinc-800">
                    WhatsApp
                    <Input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(61) 99999-9999" autoComplete="tel" className="h-12 rounded-xl" />
                  </label>
                  <label className="block space-y-2 text-sm font-semibold text-zinc-800">
                    E-mail
                    <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="h-12 rounded-xl" />
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-black/10 bg-stone-50 p-4 text-sm leading-relaxed text-zinc-600">
                    <input required type="checkbox" checked={consentContact} onChange={(e) => setConsentContact(e.target.checked)} className="mt-1 size-4 accent-zinc-950" />
                    <span>Autorizo a BSBTUR a entrar em contato comigo sobre a Caravana CIOSP 2027 pelos dados informados. Posso solicitar a interrupção do contato a qualquer momento.</span>
                  </label>

                  {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

                  <Button type="submit" size="lg" className="h-13 w-full rounded-full bg-zinc-950 text-white hover:bg-zinc-800" disabled={loading || !consentContact}>
                    {loading ? <><Loader2 className="mr-2 size-4 animate-spin" />Registrando...</> : <>Entrar na lista prioritária <ArrowRight className="ml-2 size-4" /></>}
                  </Button>
                  <p className="text-center text-xs text-zinc-400">Sem pagamento e sem reserva nesta etapa.</p>
                </form>
              ) : (
                <div className="grid min-h-[390px] place-items-center text-center">
                  <div className="max-w-md">
                    <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 className="size-8" /></span>
                    <h3 className="mt-6 text-3xl font-semibold">Você entrou na lista prioritária</h3>
                    <p className="mt-3 leading-relaxed text-zinc-500">Seu interesse foi registrado no COBS. A BSBTUR poderá entrar em contato quando houver novidades sobre a abertura das reservas.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Antes de entrar</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight">Informações importantes</h2>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <article className="rounded-2xl border border-black/5 bg-stone-50 p-6"><h3 className="font-semibold">As vendas já estão abertas?</h3><p className="mt-2 text-sm leading-relaxed text-zinc-600">Não. Esta é uma página de pré-lançamento e manifestação de interesse. A abertura das reservas será comunicada pela BSBTUR.</p></article>
              <article className="rounded-2xl border border-black/5 bg-stone-50 p-6"><h3 className="font-semibold">Companhia aérea e hotel já estão definidos?</h3><p className="mt-2 text-sm leading-relaxed text-zinc-600">O planejamento possui referências operacionais, mas os fornecedores definitivos serão informados após contratação.</p></article>
              <article className="rounded-2xl border border-black/5 bg-stone-50 p-6"><h3 className="font-semibold">O preço pode mudar?</h3><p className="mt-2 text-sm leading-relaxed text-zinc-600">R$ 9.990 é o preço-base do planejamento comercial atual. A condição definitiva será apresentada no momento da abertura das vendas.</p></article>
              <article className="rounded-2xl border border-black/5 bg-stone-50 p-6"><h3 className="font-semibold">Entrar na lista garante vaga?</h3><p className="mt-2 text-sm leading-relaxed text-zinc-600">Não. A lista registra interesse e prioridade de comunicação. A vaga somente será formalizada pelo fluxo comercial definitivo.</p></article>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/5 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <BrandLockup />
          <span>CIOSP 2027 · Pré-lançamento BSBTUR</span>
        </div>
      </footer>

      <div className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-white/10 bg-zinc-950/95 p-3 text-white shadow-2xl backdrop-blur-xl sm:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/50">CIOSP 2027</p>
            <p className="text-sm font-semibold">Lista prioritária</p>
          </div>
          <a href="#lista-prioritaria" className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2.5 text-sm font-semibold text-zinc-950">
            Quero entrar <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
