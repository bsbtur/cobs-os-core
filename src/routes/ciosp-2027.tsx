import { FormEvent, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Hotel,
  Loader2,
  MapPin,
  Plane,
  ShieldCheck,
  Smartphone,
  Star,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { CIOSP_PUBLIC_SALES_OPEN } from "@/lib/ciosp-public-sales";

const gold = "#D6B56D";
const heroImage = "/ciosp/ciosp-pavilhao.jpg";

const META_DESCRIPTION =
  "CIOSP Experience 2027 com a BSBTUR: uma jornada acadêmica completa de Brasília a São Paulo, de 25 a 31 de janeiro de 2027. Investimento de R$ 12.490 por passageiro em acomodação dupla.";

export const Route = createFileRoute("/ciosp-2027")({
  head: () => ({
    meta: [
      { title: "CIOSP Experience 2027 — BSBTUR" },
      { name: "description", content: META_DESCRIPTION },
      { property: "og:title", content: "CIOSP Experience 2027 — BSBTUR" },
      { property: "og:description", content: META_DESCRIPTION },
      { name: "twitter:title", content: "CIOSP Experience 2027 — BSBTUR" },
      { name: "twitter:description", content: META_DESCRIPTION },
    ],
  }),
  component: CiospLanding,
});

const experienceCards = [
  [Plane, "Aéreo BSB ↔ São Paulo", "A experiência começa em Brasília e segue com uma jornada estruturada até São Paulo."],
  [Hotel, "Hospedagem", "Acomodação dupla dentro da proposta comercial da CIOSP Experience 2027."],
  [GraduationCap, "CIOSP", "Participação integrada ao contexto acadêmico de um dos principais eventos de Odontologia."],
  [MapPin, "Traslados", "Deslocamentos previstos dentro da operação organizada pela BSBTUR."],
  [ShieldCheck, "Suporte BSBTUR", "Acompanhamento e gestão da experiência ao longo da viagem."],
  [CalendarDays, "Cronograma organizado", "Uma jornada estruturada para reduzir improviso e aumentar previsibilidade."],
  [Smartphone, "Comunicação centralizada", "Informações da experiência reunidas em um fluxo de comunicação organizado."],
] as const;

const journey = ["Brasília", "Embarque", "São Paulo", "Hospedagem", "CIOSP", "Experiências programadas", "Retorno"] as const;

const gallery = [
  [heroImage, "O centro da Odontologia", "Conhecimento, inovação e conexões no ambiente real do CIOSP."],
  ["/ciosp/ciosp-bem-vindos.jpg", "Você chega dentro da experiência", "Uma jornada construída ao redor do principal motivo da viagem: viver o CIOSP."],
  ["/ciosp/expo-center-norte.jpg", "São Paulo como palco", "A operação conecta Brasília, hospedagem, congresso e experiências programadas."],
] as const;

const audience = [
  "Estudantes de Odontologia",
  "Profissionais de Odontologia",
  "Quem valoriza networking e desenvolvimento acadêmico",
  "Quem quer viver o CIOSP com uma operação organizada",
] as const;

const inclusions = [
  "Aéreo Brasília ↔ São Paulo",
  "Hospedagem em acomodação dupla",
  "CIOSP",
  "Traslados",
  "Suporte BSBTUR",
  "Cronograma organizado",
  "Comunicação centralizada",
] as const;

const faq = [
  ["Como funciona a reserva?", "Quando as vendas estiverem oficialmente abertas, o botão de reserva direcionará para o fluxo oficial do COBS. Enquanto isso, você pode entrar na lista prioritária."],
  ["Qual é o valor?", "O investimento é de R$ 12.490 por passageiro em acomodação dupla."],
  ["Como funciona a entrada?", "A entrada é de R$ 3.490 via Pix."],
  ["Como pago o saldo?", "O saldo de R$ 9.000 é pago no cartão, com parcelamento disponível no ambiente seguro do Mercado Pago."],
  ["O que está incluso?", "Aéreo BSB ↔ São Paulo, hospedagem, CIOSP, traslados, suporte BSBTUR, cronograma organizado e comunicação centralizada."],
  ["Como funciona a hospedagem?", "A condição comercial considera acomodação dupla."],
  ["Quem pode participar?", "A experiência é voltada principalmente para estudantes e profissionais de Odontologia."],
  ["As vagas são limitadas?", "Sim. A experiência prevê até 30 passageiros."],
  ["Como recebo as informações?", "A BSBTUR centraliza a comunicação da experiência e o participante terá acesso à estrutura digital do COBS para acompanhar as informações disponibilizadas."],
] as const;

const motionCss = `
  .ciosp-premium { scroll-behavior:smooth; }
  .ciosp-premium * { box-sizing:border-box; }
  .ciosp-premium a, .ciosp-premium button { -webkit-tap-highlight-color: transparent; }
  .ciosp-premium .noise { background-image: radial-gradient(rgba(255,255,255,.055) .55px, transparent .55px); background-size: 4px 4px; }
  .ciosp-premium .glass { background: linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.025)); backdrop-filter: blur(16px); }
  .ciosp-premium .gold-text { background: linear-gradient(105deg,#f6e7bd 0%,#d6b56d 45%,#f0d49a 72%,#b88935 100%); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .ciosp-premium .display { font-family: Georgia, "Times New Roman", serif; }
  .ciosp-premium .muted-readable { color: rgba(255,255,255,.62); }\n  .ciosp-premium .product-grid { background-image: linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px); background-size:64px 64px; }
  @media (prefers-reduced-motion:no-preference) {
    .ciosp-premium .hero-image { animation: heroBreath 16s ease-in-out infinite alternate; }
    .ciosp-premium .lift { transition: transform .35s cubic-bezier(.22,1,.36,1), border-color .35s ease, box-shadow .35s ease; }
    .ciosp-premium .lift:hover { transform: translateY(-5px); border-color: rgba(214,181,109,.34); box-shadow: 0 24px 70px rgba(0,0,0,.4); }
    .ciosp-premium .cta { transition: transform .28s cubic-bezier(.22,1,.36,1), box-shadow .28s ease, filter .28s ease; }
    .ciosp-premium .cta:hover { transform: translateY(-2px); box-shadow: 0 18px 48px rgba(214,181,109,.2); filter: brightness(1.04); }
    @keyframes heroBreath { from { transform: scale(1.01); } to { transform: scale(1.055) translate3d(-.4%,-.3%,0); } }
  }
`;

function BsbTurSignature() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-full border text-sm font-bold" style={{ borderColor: gold, color: gold }}>B</span>
      <span>
        <span className="block text-sm font-semibold tracking-[0.22em] text-white">BSBTUR</span>
        <span className="block text-[9px] uppercase tracking-[0.28em] text-white/45">Experiências acadêmicas</span>
      </span>
    </div>
  );
}

function Cta({ href, children, compact = false }: { href: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <a
      href={href}
      className={`cta inline-flex items-center justify-center gap-2 rounded-full font-semibold text-black ${compact ? "min-h-11 px-5 py-2.5 text-sm" : "min-h-12 px-7 py-3"}`}
      style={{ background: "linear-gradient(135deg,#f2dfad,#d6b56d 52%,#b88731)" }}
    >
      {children}
      <ArrowRight className="size-4" aria-hidden="true" />
    </a>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-[.24em] text-[#D6B56D]">{children}</p>;
}

function CiospLanding() {
  const salesOpen = CIOSP_PUBLIC_SALES_OPEN;
  const checkoutHref = salesOpen ? "/ciosp-2027/reserva" : "#reserva";
  const ctaLabel = salesOpen ? "Reservar minha vaga" : "Receber abertura das reservas";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consentContact, setConsentContact] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  async function submitLead(event: FormEvent) {
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
    } catch {
      setError("Não foi possível registrar seu interesse agora. Revise seus dados e tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }

  const leadForm = !submitted ? (
    <form onSubmit={submitLead} className="space-y-4">
      <div>
        <SectionEyebrow>Lista prioritária</SectionEyebrow>
        <h3 className="mt-3 text-2xl font-semibold text-white">Receba a liberação das reservas.</h3>
        <p className="mt-2 text-sm leading-6 text-white/52">O cadastro não gera cobrança, reserva ou garantia de vaga.</p>
      </div>
      <label className="block space-y-1.5 text-sm text-white/75">Nome completo
        <Input required name="fullName" minLength={2} maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" className="border-white/15 bg-black/35 text-white" />
      </label>
      <label className="block space-y-1.5 text-sm text-white/75">WhatsApp
        <Input required name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="(61) 99999-9999" className="border-white/15 bg-black/35 text-white" />
      </label>
      <label className="block space-y-1.5 text-sm text-white/75">E-mail
        <Input required name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="border-white/15 bg-black/35 text-white" />
      </label>
      <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/55">
        <input required name="consentContact" type="checkbox" checked={consentContact} onChange={(e) => setConsentContact(e.target.checked)} className="mt-1 size-4" />
        <span>Autorizo a BSBTUR a entrar em contato comigo sobre a CIOSP Experience 2027.</span>
      </label>
      <p className="text-xs leading-5 text-white/42">Consulte o <a href="/privacidade-ciosp-2027" className="font-semibold text-[#E4CA91] underline underline-offset-4">Aviso de Privacidade</a> antes de enviar.</p>
      {error && <div role="alert" className="rounded-xl border border-red-900/50 bg-red-950/20 p-3 text-sm text-red-300">{error}</div>}
      <Button type="submit" size="lg" className="w-full bg-[#D6B56D] text-black hover:bg-[#E4CA91]" disabled={loading || !consentContact}>
        {loading ? <><Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />Registrando...</> : <>Quero acesso prioritário <ArrowRight className="ml-2 size-4" aria-hidden="true" /></>}
      </Button>
    </form>
  ) : (
    <div role="status" aria-live="polite" className="py-10 text-center">
      <CheckCircle2 className="mx-auto size-12 text-emerald-400" aria-hidden="true" />
      <SectionEyebrow>Cadastro recebido</SectionEyebrow>
      <h3 className="mt-3 text-2xl font-semibold">Interesse registrado.</h3>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-white/50">A equipe BSBTUR poderá entrar em contato quando houver atualização sobre a abertura das reservas.</p>
    </div>
  );

  return (
    <div className="ciosp-premium min-h-screen bg-[#050505] text-[#F6F2EA] selection:bg-[#D6B56D] selection:text-black">
      <style>{motionCss}</style>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050505]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 lg:px-8">
          <BsbTurSignature />
          <nav className="hidden items-center gap-6 text-[11px] font-medium text-white/60 xl:flex" aria-label="Navegação principal">
            <a href="#experiencia" className="transition hover:text-[#E4CA91]">A Experiência</a>
            <a href="#inclusoes" className="transition hover:text-[#E4CA91]">O que inclui</a>
            <a href="#jornada" className="transition hover:text-[#E4CA91]">Cronograma</a>
            <a href="#ciosp" className="transition hover:text-[#E4CA91]">CIOSP</a>
            <a href="#investimento" className="transition hover:text-[#E4CA91]">Investimento</a>
            <a href="#faq" className="transition hover:text-[#E4CA91]">FAQ</a>
          </nav>
          <a href={checkoutHref} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#D6B56D]/35 px-4 py-2 text-xs font-semibold text-[#E8D39C] sm:text-sm">
            {ctaLabel}
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden border-b border-white/10 bg-black">
          <img src="/ciosp/expo-center-norte.jpg" alt="São Paulo e o ambiente da experiência CIOSP" className="absolute inset-0 -z-30 h-full w-full object-cover object-center opacity-78 saturate-[.85] contrast-125" />
          <div className="absolute inset-0 -z-20 bg-[linear-gradient(90deg,rgba(2,2,2,.98)_0%,rgba(2,2,2,.82)_37%,rgba(2,2,2,.16)_68%,rgba(2,2,2,.42)_100%)]" />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,#050505_0%,transparent_26%)]" />
          <div className="mx-auto flex min-h-[650px] max-w-7xl items-center px-5 py-12 lg:px-8">
            <div className="max-w-[640px]">
              <SectionEyebrow>Viagem acadêmica premium</SectionEyebrow>
              <h1 className="mt-4 text-5xl font-black uppercase leading-[.84] tracking-[-.065em] sm:text-7xl lg:text-[6.1rem]">
                CIOSP<br/><span className="gold-text">EXPERIENCE</span><br/>2027
              </h1>
              <p className="mt-5 max-w-md text-xl leading-7 text-white/88">Uma jornada acadêmica completa<br className="hidden sm:block"/> de Brasília a São Paulo.</p>
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold uppercase tracking-[.08em] text-white/82">
                <span className="flex items-center gap-2"><CalendarDays className="size-4 text-[#D6B56D]"/>25–31 JAN 2027</span>
                <span className="flex items-center gap-2"><MapPin className="size-4 text-[#D6B56D]"/>São Paulo · 44º CIOSP</span>
                <span className="flex items-center gap-2"><Users className="size-4 text-[#D6B56D]"/>Até 30 viajantes</span>
              </div>
              <div className="mt-7"><Cta href={checkoutHref}>{ctaLabel}</Cta></div>
              <p className="mt-4 flex items-center gap-2 text-[11px] text-white/50"><ShieldCheck className="size-3 text-[#D6B56D]"/>Ambiente seguro do COBS · Pagamento via Mercado Pago</p>
            </div>
            <div className="ml-auto hidden self-start pt-20 text-right lg:block">
              <p className="display text-4xl italic text-[#D6B56D]">São Paulo</p>
              <p className="mt-4 text-xs font-semibold uppercase leading-6 tracking-[.18em] text-white/80">Conhecimento<br/>Inovação<br/>Networking<br/>Evolução</p>
            </div>
          </div>
        </section>

        <section id="experiencia" className="border-b border-white/10 bg-[#050505]">
          <div className="mx-auto grid max-w-7xl lg:grid-cols-[.82fr_1.18fr]">
            <div className="flex flex-col justify-center px-5 py-10 lg:px-8 lg:py-14">
              <SectionEyebrow>Mais que uma viagem</SectionEyebrow>
              <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">Uma experiência organizada para quem vive a odontologia.</h2>
              <p className="mt-4 max-w-lg text-sm leading-6 text-white/62">A BSBTUR cuida da organização da sua viagem para que você foque no que realmente importa: aprender, se atualizar e viver o CIOSP com conforto, segurança e uma operação organizada.</p>
            </div>
            <div className="relative min-h-[330px] overflow-hidden border-l border-white/10">
              <img src="/ciosp/ciosp-bem-vindos.jpg" alt="Participantes no ambiente do CIOSP" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-transparent to-transparent lg:w-1/3"/>
            </div>
          </div>
        </section>

        <section className="bg-[#070707]">
          <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-12">
            <SectionEyebrow>O que faz parte da experiência</SectionEyebrow>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Tudo organizado em um só pacote.</h2>
            <p className="mt-2 text-sm text-white/52">Uma jornada completa, com os componentes confirmados conectados pela operação BSBTUR.</p>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {experienceCards.map(([Icon,title,copy],i)=>(
                <article key={title} className="group relative min-h-[210px] overflow-hidden rounded-xl border border-white/15 bg-[#101010]">
                  <img src={gallery[i%gallery.length][0]} alt="" loading="lazy" className="absolute inset-0 h-[58%] w-full object-cover opacity-72 transition duration-500 group-hover:scale-105"/>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/70 to-transparent"/>
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <Icon className="mb-2 size-4 text-[#D6B56D]"/>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-1 text-[10px] leading-4 text-white/48">{copy}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="jornada" className="overflow-hidden border-y border-white/10 bg-[linear-gradient(90deg,#070707,#0d0b08,#070707)]">
          <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-12">
            <SectionEyebrow>A jornada</SectionEyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Do embarque ao último dia, tudo planejado.</h2>
            <div className="mt-7 -mx-5 overflow-x-auto px-5 pb-4 sm:mx-0 sm:px-0">
              <div className="flex w-max snap-x snap-mandatory gap-3 sm:grid sm:w-full sm:grid-cols-7 sm:gap-0">
                {journey.map((item, index) => (
                  <div key={item} className="relative w-[180px] snap-start rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:w-auto sm:rounded-none sm:border-x-0 sm:border-b-0 sm:bg-transparent sm:px-2">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#D6B56D]/35 bg-[#D6B56D]/10 text-xs font-bold text-[#E4CA91]">{String(index + 1).padStart(2, "0")}</span>
                      {index < journey.length - 1 && <div className="hidden h-px flex-1 bg-gradient-to-r from-[#D6B56D]/45 to-white/10 sm:block" />}
                    </div>
                    <p className="mt-5 text-xs font-semibold uppercase tracking-[.1em] text-white/75 sm:max-w-[130px]">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="ciosp" className="bg-[#050505]">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-14">
            <div className="relative min-h-[330px] overflow-hidden border-r border-white/10">
              <img src="/ciosp/ciosp-bem-vindos.jpg" alt="Ambiente do CIOSP" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
              <div className="absolute bottom-0 p-7 sm:p-9">
                <p className="text-xs uppercase tracking-[.22em] text-[#E4CA91]">44º CIOSP</p>
                <p className="mt-2 max-w-md text-2xl font-semibold">Conhecimento, inovação, conexões e uma agenda acadêmica de alto valor.</p>
              </div>
            </div>
            <div>
              <SectionEyebrow>Valor acadêmico</SectionEyebrow>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Um dos grandes encontros da Odontologia dentro da sua jornada.</h2>
              <p className="mt-6 text-lg leading-8 text-white/68">A proposta combina participação no congresso com uma operação organizada ao redor do evento. Isso permite que o viajante concentre energia no conteúdo acadêmico, nas conexões profissionais e nas oportunidades que São Paulo oferece durante o período.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {["Conteúdo acadêmico", "Networking", "Mercado e inovação", "Vivência profissional"].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.025] p-4 text-sm text-white/72">
                    <CheckCircle2 className="size-4 text-emerald-400" aria-hidden="true" />{item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#090909]">
          <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-14">
            <SectionEyebrow>Para quem é</SectionEyebrow>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {audience.map((item) => (
                <div key={item} className="lift flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.025] p-4">
                  <Users className="mt-0.5 size-5 shrink-0 text-[#E4CA91]" aria-hidden="true" />
                  <p className="text-sm font-medium leading-5 text-white/82">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="inclusoes" className="bg-[#050505]">
          <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-14">
            <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
              <div>
                <SectionEyebrow>Inclusões confirmadas</SectionEyebrow>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Tudo o que você precisa para viver o CIOSP 2027.</h2>
                <p className="mt-5 text-base leading-7 text-white/62">A página comercial apresenta apenas os componentes confirmados da experiência. Detalhes contratuais permanecem no fluxo oficial do COBS.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {inclusions.map((item) => (
                  <div key={item} className="flex items-center gap-3 border-b border-white/10 py-3">
                    <CheckCircle2 className="size-5 shrink-0 text-emerald-400" aria-hidden="true" />
                    <span className="text-sm font-medium text-white/78">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="investimento" className="border-y border-[#D6B56D]/18 bg-[radial-gradient(circle_at_50%_0%,rgba(214,181,109,.12),transparent_42%),#080808]">
          <div className="mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-12">
            <div className="text-center">
              <SectionEyebrow>Investimento</SectionEyebrow>
              <h2 className="mt-3 text-5xl font-black tracking-tight text-[#E4B84F] sm:text-6xl">R$ 12.490</h2>
              <p className="mt-3 text-sm text-white/46">por passageiro · acomodação dupla</p>
            </div>
            <div className="mx-auto mt-7 grid max-w-4xl gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
              <div className="rounded-2xl border border-emerald-500/35 bg-emerald-950/20 p-5 text-center">
                <p className="text-xs uppercase tracking-[.22em] text-white/42">Entrada</p>
                <p className="mt-2 text-4xl font-semibold text-[#F0DCA7]">R$ 3.490</p>
                <p className="mt-2 text-sm text-white/48">via Pix</p>
              </div>
              <ChevronRight className="mx-auto hidden size-7 text-[#D6B56D]/60 md:block" aria-hidden="true" />
              <div className="rounded-2xl border border-emerald-500/35 bg-emerald-950/20 p-5 text-center">
                <p className="text-xs uppercase tracking-[.22em] text-white/42">Saldo</p>
                <p className="mt-2 text-4xl font-semibold text-white">R$ 9.000</p>
                <p className="mt-2 text-sm text-white/48">no cartão · parcelamento pelo Mercado Pago</p>
              </div>
            </div>
            <div className="mt-8 text-center"><Cta href={checkoutHref}>{ctaLabel}</Cta></div>
          </div>
        </section>

        <section className="bg-[#050505]">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 lg:grid-cols-[1fr_1fr] lg:items-center lg:px-8 lg:py-16">
            <div>
              <SectionEyebrow>COBS</SectionEyebrow>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Sua experiência também é digital.</h2>
              <p className="mt-6 text-lg leading-8 text-white/68">O COBS é a estrutura digital usada para o processo de contratação e para disponibilizar informações da experiência ao participante. A landing page apresenta e vende a experiência; o COBS conduz a etapa oficial de contratação.</p>
              <div className="mt-7 flex items-center gap-3 text-sm text-emerald-300">
                <ShieldCheck className="size-5" aria-hidden="true" />
                Pagamento processado no ambiente do Mercado Pago.
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-xl">
              <div className="rounded-[1.8rem] border border-white/12 bg-[#111] p-3 shadow-[0_30px_90px_rgba(0,0,0,.55)]">
                <div className="rounded-[1.35rem] border border-white/8 bg-[linear-gradient(160deg,#171717,#090909)] p-7">
                  <div className="flex items-center justify-between">
                    <BsbTurSignature />
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] uppercase tracking-[.18em] text-emerald-300">COBS</span>
                  </div>
                  <div className="mt-10 grid gap-3">
                    {["CIOSP Experience 2027", "Informações da experiência", "Contratação oficial"].map((item) => (
                      <div key={item} className="rounded-2xl border border-white/8 bg-white/[.03] p-4 text-sm text-white/70">{item}</div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-10 right-4 w-[38%] rounded-[1.8rem] border border-white/12 bg-[#101010] p-2 shadow-2xl">
                <div className="rounded-[1.35rem] border border-white/8 bg-black p-4">
                  <Smartphone className="size-5 text-[#E4CA91]" aria-hidden="true" />
                  <p className="mt-8 text-xs text-white/42">CIOSP 2027</p>
                  <p className="mt-1 text-sm font-semibold">Experiência conectada.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#090909]">
          <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-14">
            <SectionEyebrow>Confiança operacional</SectionEyebrow>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [Building2, "BSBTUR", "Organização da experiência e gestão da viagem."],
                [ShieldCheck, "Processo estruturado", "Contratação conduzida no fluxo oficial do COBS."],
                [Users, "Suporte", "Acompanhamento dentro da operação organizada."],
                [CheckCircle2, "Mercado Pago", "Processamento de pagamento no ambiente do provedor."],
              ].map(([Icon, title, copy]) => {
                const Comp = Icon as typeof Building2;
                return (
                  <div key={String(title)} className="lift rounded-[1.6rem] border border-white/10 bg-white/[.025] p-6">
                    <Comp className="size-5 text-[#E4CA91]" aria-hidden="true" />
                    <h3 className="mt-5 text-lg font-semibold">{title as string}</h3>
                    <p className="mt-2 text-sm leading-6 text-white/62">{copy as string}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="faq" className="bg-[#050505]">
          <div className="mx-auto max-w-5xl px-5 py-12 lg:px-8 lg:py-14">
            <SectionEyebrow>FAQ</SectionEyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Tudo o que você precisa saber.</h2>
            <div className="mt-8 grid gap-2 md:grid-cols-2">
              {faq.map(([question, answer]) => (
                <details key={question} className="group rounded-xl border border-white/10 bg-white/[.025] px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-base font-semibold text-white/85">
                    {question}
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 text-[#E4CA91] transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="pt-3 text-sm leading-6 text-white/62">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="reserva" className="relative overflow-hidden border-t border-[#D6B56D]/18 bg-[#080808]">\n          <img src="/ciosp/expo-center-norte.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" loading="lazy"/><div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/55"/>
          <div className="relative mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:px-8 lg:py-12">
            <div>
              <SectionEyebrow>Próximo capítulo</SectionEyebrow>
              <h2 className="display mt-4 text-5xl font-normal leading-[1.02] tracking-tight sm:text-6xl">Seu próximo grande capítulo na Odontologia pode começar aqui.</h2>
              <p className="mt-5 text-lg leading-8 text-white/52">CIOSP Experience 2027 · 25 a 31 de janeiro · São Paulo · até 30 passageiros.</p>
              <div className="mt-8 flex flex-wrap gap-4 text-sm text-white/60">
                <span><strong className="text-white">R$ 12.490</strong> total</span>
                <span><strong className="text-white">R$ 3.490</strong> entrada</span>
              </div>
              {salesOpen && <div className="mt-8"><Cta href="/ciosp-2027/reserva">Reservar minha vaga</Cta></div>}
            </div>
            <div className="glass rounded-[2rem] border border-[#D6B56D]/28 p-6 sm:p-8">
              {salesOpen ? (
                <div className="space-y-5">
                  <div className="inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[.18em] text-emerald-300">Reservas abertas</div>
                  <h3 className="text-3xl font-semibold">Contratação oficial no COBS.</h3>
                  <p className="text-sm leading-6 text-white/52">A próxima etapa reúne cadastro, termos e pagamento no fluxo oficial da experiência.</p>
                  <Cta href="/ciosp-2027/reserva">Reservar minha vaga</Cta>
                </div>
              ) : leadForm}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-black pb-24 sm:pb-0">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <BsbTurSignature />
          <span>CIOSP Experience 2027 · Brasília → São Paulo</span>
        </div>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#060606]/94 p-3 backdrop-blur-xl sm:hidden">
        <a href={checkoutHref} className="flex min-h-12 w-full items-center justify-between rounded-full bg-[#D6B56D] px-5 font-semibold text-black">
          <span>{salesOpen ? "Reservar vaga" : "Receber abertura"}</span>
          <span className="text-sm">R$ 12.490</span>
        </a>
      </div>
    </div>
  );
}
