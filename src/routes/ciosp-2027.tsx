import { FormEvent, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Crown,
  GraduationCap,
  HeartHandshake,
  Hotel,
  Loader2,
  MapPin,
  Plane,
  ShieldCheck,
  Sparkles,
  Users,
  UtensilsCrossed,
} from "lucide-react";
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
          "Pré-lançamento CIOSP 2027 com a BSBTUR. Cadastre seu interesse para receber condições comerciais quando estiverem disponíveis.",
      },
      { property: "og:title", content: "CIOSP 2027 — Experiência BSBTUR" },
      {
        property: "og:description",
        content:
          "Pré-lançamento CIOSP 2027 com a BSBTUR. Cadastre seu interesse para receber condições comerciais quando estiverem disponíveis.",
      },
      { name: "twitter:title", content: "CIOSP 2027 — Experiência BSBTUR" },
      {
        name: "twitter:description",
        content:
          "Pré-lançamento CIOSP 2027 com a BSBTUR. Cadastre seu interesse para receber condições comerciais quando estiverem disponíveis.",
      },
    ],
  }),
  component: CiospLanding,
});

const gold = "#D6B56D";
const heroImage = "/ciosp/ciosp-pavilhao.jpg";

const planningInclusions = [
  [Plane, "Passagem aérea", "Planejamento interno sujeito à contratação final."],
  [Hotel, "Hospedagem", "Planejamento interno sujeito à contratação final."],
  [MapPin, "Mobilidade em São Paulo", "Planejamento interno sujeito à contratação final."],
  [GraduationCap, "CIOSP 2027", "Planejamento interno sujeito à modalidade final do pacote."],
  [ShieldCheck, "Seguro viagem", "Planejamento interno sujeito à contratação final."],
  [HeartHandshake, "Equipe BSBTUR", "Planejamento interno de acompanhamento da experiência."],
] as const;

const gallery = [
  [heroImage, "O centro da Odontologia", "Conhecimento, inovação e conexões no ambiente real do CIOSP."],
  ["/ciosp/ciosp-bem-vindos.jpg", "Você já chega dentro do CIOSP", "O ambiente real do congresso reforça a dimensão da experiência."],
  ["/ciosp/expo-center-norte.jpg", "O palco da experiência", "Expo Center Norte, em São Paulo, será o centro da jornada CIOSP 2027."],
] as const;

const motionCss = `
  .ciosp-motion { scroll-behavior: smooth; }
  .ciosp-motion a, .ciosp-motion button, .ciosp-motion article, .ciosp-motion figure { -webkit-tap-highlight-color: transparent; }
  @media (prefers-reduced-motion: no-preference) {
    .ciosp-motion header { transition: background-color .35s ease, border-color .35s ease, box-shadow .35s ease; }
    .ciosp-motion header:hover { border-color: rgba(214,181,109,.22); box-shadow: 0 12px 40px rgba(0,0,0,.26); }
    .ciosp-motion a[href^="#"], .ciosp-motion button[type="submit"] { transition: transform .28s cubic-bezier(.22,1,.36,1), box-shadow .28s ease, border-color .28s ease, filter .28s ease, background-color .28s ease; }
    .ciosp-motion a[href^="#"]:hover, .ciosp-motion button[type="submit"]:not(:disabled):hover { transform: translateY(-3px); box-shadow: 0 18px 52px rgba(214,181,109,.18); }
    .ciosp-motion main > section:first-child > img { animation: ciospHeroBreath 14s ease-in-out infinite alternate; will-change: transform; }
    .ciosp-motion main > section:first-child h1 span { background: linear-gradient(105deg,#c79d4e 0%,#f4dfae 44%,#d6b56d 67%,#f1d89e 100%); background-size: 220% auto; -webkit-background-clip: text; background-clip: text; color: transparent; animation: ciospGoldFlow 7s ease-in-out infinite; }
    .ciosp-motion figure { transition: transform .5s cubic-bezier(.22,1,.36,1), border-color .4s ease, box-shadow .5s ease; }
    .ciosp-motion figure:hover { transform: translateY(-6px); border-color: rgba(214,181,109,.34); box-shadow: 0 24px 70px rgba(0,0,0,.42),0 0 38px rgba(214,181,109,.07); }
    .ciosp-motion article { transition: transform .36s cubic-bezier(.22,1,.36,1), background-color .36s ease, box-shadow .36s ease; }
    .ciosp-motion article:hover { transform: translateY(-5px); box-shadow: inset 0 1px 0 rgba(214,181,109,.14),0 16px 42px rgba(0,0,0,.2); }
    .ciosp-motion input { transition: border-color .25s ease, box-shadow .25s ease, background-color .25s ease, transform .25s ease; }
    .ciosp-motion input:focus { transform: translateY(-1px); border-color: rgba(214,181,109,.55)!important; box-shadow: 0 0 0 3px rgba(214,181,109,.09),0 10px 30px rgba(0,0,0,.18); background-color: rgba(12,11,8,.72); }
    @keyframes ciospHeroBreath { from { transform:scale(1.015) translate3d(0,0,0); } to { transform:scale(1.065) translate3d(-.6%,-.4%,0); } }
    @keyframes ciospGoldFlow { 0%,100% { background-position:0% center; } 50% { background-position:100% center; } }
  }
`;

function BsbTurSignature() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-full border text-sm font-bold" style={{ borderColor: gold, color: gold }}>B</span>
      <span>
        <span className="block text-base font-semibold tracking-[0.18em] text-white">BSBTUR</span>
        <span className="block text-[9px] uppercase tracking-[0.28em] text-white/45">Turismo & Experiências</span>
      </span>
    </div>
  );
}

function CiospLanding() {
  const salesQaMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("sales_qa") === "1";
  const targetId = salesQaMode ? "reserva" : "lista-prioritaria";
  const ctaLabel = salesQaMode ? "Testar reserva" : "Quero acesso prioritário";

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

  if (salesQaMode) return <main className="min-h-screen bg-[#070707] p-8 text-white"><h1 className="text-2xl font-semibold">Validação da reserva CIOSP 2027</h1><p className="mt-4">O teste usa o mesmo checkout da reserva e exige uma conta interna autorizada.</p><a className="mt-6 inline-block min-h-11 text-[#E4CA91] underline" href="/ciosp-2027/reserva?sales_qa=1">Abrir checkout de validação</a></main>;

  const form = !submitted ? (
    <form onSubmit={submitLead} className="space-y-4">
      <div><p className="text-xs uppercase tracking-[.2em]" style={{ color: gold }}>Acesso prioritário</p><h3 className="mt-2 text-2xl font-semibold">Quero receber as condições primeiro</h3><p className="mt-2 text-sm text-white/45">Leva menos de 1 minuto.</p></div>
      <label className="block space-y-1.5 text-sm">Nome completo<Input required name="fullName" minLength={2} maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" className="border-white/15 bg-black/40 text-white" /></label>
      <label className="block space-y-1.5 text-sm">WhatsApp<Input required name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="(61) 99999-9999" className="border-white/15 bg-black/40 text-white" /></label>
      <label className="block space-y-1.5 text-sm">E-mail<Input required name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="border-white/15 bg-black/40 text-white" /></label>
      <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/60"><input required name="consentContact" type="checkbox" checked={consentContact} onChange={(e) => setConsentContact(e.target.checked)} className="mt-1 size-4" /><span>Autorizo a BSBTUR a entrar em contato comigo sobre a Caravana CIOSP 2027. Posso solicitar a interrupção do contato a qualquer momento.</span></label>
      <p className="text-xs leading-5 text-white/45">Antes de enviar, consulte o <a href="/privacidade-ciosp-2027" className="font-semibold text-[#E4CA91] underline decoration-[#D6B56D]/50 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6B56D]">Aviso de Privacidade</a> aplicável a este cadastro.</p>
      {error && <div role="alert" className="rounded-lg border border-red-900/50 bg-red-950/20 p-3 text-sm text-red-300">{error}</div>}
      <Button type="submit" size="lg" className="w-full bg-[#D6B56D] text-black hover:bg-[#E4CA91]" disabled={loading || !consentContact}>{loading ? <><Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />Registrando...</> : <>Quero acesso prioritário <ArrowRight className="ml-2 size-4" aria-hidden="true" /></>}</Button>
      <p className="text-center text-xs text-white/35">Sem pagamento · sem compromisso · seus dados usados apenas para contato sobre o CIOSP 2027.</p>
    </form>
  ) : (
    <div role="status" aria-live="polite" className="py-10 text-center"><CheckCircle2 className="mx-auto size-12" style={{ color: gold }} aria-hidden="true" /><p className="mt-5 text-xs uppercase tracking-[.2em] text-[#D6B56D]">Acesso registrado</p><h3 className="mt-2 text-2xl font-semibold">Você está entre os primeiros.</h3><p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/50">Seu interesse foi registrado com sucesso. Este registro não é uma reserva, não garante vaga e não representa nenhum pagamento. A equipe BSBTUR poderá entrar em contato quando houver novidades e condições comerciais disponíveis.</p></div>
  );

  const publicHighlights = [
    "Pré-lançamento em andamento",
    "Condições comerciais em preparação",
    "Sem cobrança nesta etapa",
  ];

  return (
    <div className="ciosp-motion min-h-screen bg-[#070707] text-[#F5F1E8] selection:bg-[#D6B56D] selection:text-black">
      <style>{motionCss}</style>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070707]/88 backdrop-blur-xl"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8"><BsbTurSignature /><a href={`#${targetId}`} className="inline-flex rounded-full border px-5 py-2.5 text-sm font-semibold" style={{ borderColor: `${gold}66`, color: gold }}>{ctaLabel}<ArrowRight className="ml-2 size-4" aria-hidden="true" /></a></div></header>
      <main>
        <section className="relative isolate overflow-hidden border-b border-white/10">
          <img src={heroImage} alt="Pavilhão do CIOSP" className="absolute inset-0 -z-30 h-full w-full object-cover object-center opacity-60" />
          <div className="absolute inset-0 -z-20 bg-[linear-gradient(90deg,rgba(0,0,0,.98)_0%,rgba(0,0,0,.92)_38%,rgba(0,0,0,.56)_68%,rgba(0,0,0,.42)_100%)]" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_76%_45%,rgba(214,181,109,.20),transparent_30%)]" />
          <div className="mx-auto grid min-h-[780px] max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-[1.12fr_.88fr] lg:px-8 lg:py-28">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#D6B56D]/40 bg-black/40 px-4 py-2 text-xs font-semibold uppercase tracking-[.2em] text-[#E4CA91] backdrop-blur"><Sparkles className="size-4" aria-hidden="true" /> CIOSP 2027 · Experiência BSBTUR</div>
              <p className="mt-8 text-sm uppercase tracking-[.24em] text-white/55">VIAGEM BSBTUR · 25–31 JAN 2027</p>
              <p className="mt-2 text-xs uppercase tracking-[.2em] text-white/40">CIOSP · 27–30 JAN 2027 · EXPO CENTER NORTE</p>
              <h1 className="mt-4 text-5xl font-semibold leading-[.96] tracking-[-.035em] sm:text-6xl lg:text-7xl">Viva o CIOSP.<br /><span>Com uma jornada preparada para você.</span></h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-white/72 sm:text-xl">A BSBTUR está preparando a experiência CIOSP 2027. Cadastre seu interesse para receber a composição final, condições comerciais e disponibilidade quando forem aprovadas para publicação.</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row"><a href={`#${targetId}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 py-3 font-semibold text-black shadow-[0_16px_50px_rgba(214,181,109,.18)]" style={{ background: `linear-gradient(135deg,#F0D9A3,${gold},#B78B38)` }}>{ctaLabel}<ArrowRight className="size-4" aria-hidden="true" /></a><a href="#experiencia" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/25 bg-black/30 px-7 py-3 font-semibold text-white/90 backdrop-blur">Conhecer a experiência</a></div>
              <p className="mt-4 text-xs text-white/42">{salesQaMode ? "QA interno · vendas públicas continuam fechadas" : "Sem pagamento agora · sem compromisso de compra · acesso antecipado às condições"}</p>
              {salesQaMode ? (
                <div className="mt-9 flex flex-wrap gap-6 text-sm text-white/60"><span><Users className="mr-2 inline size-4" style={{ color: gold }} aria-hidden="true" />30 vagas planejadas</span><span><Hotel className="mr-2 inline size-4" style={{ color: gold }} aria-hidden="true" />6 diárias planejadas</span><span><ShieldCheck className="mr-2 inline size-4" style={{ color: gold }} aria-hidden="true" />QA · não publicado</span></div>
              ) : (
                <div className="mt-9 flex flex-wrap gap-6 text-sm text-white/60"><span><Sparkles className="mr-2 inline size-4" style={{ color: gold }} aria-hidden="true" />Pré-lançamento</span><span><ShieldCheck className="mr-2 inline size-4" style={{ color: gold }} aria-hidden="true" />Condições em preparação</span><span><Users className="mr-2 inline size-4" style={{ color: gold }} aria-hidden="true" />Disponibilidade a confirmar</span></div>
              )}
            </div>
            <div className="lg:justify-self-end"><div className="w-full max-w-md rounded-[2rem] border bg-black/72 p-7 shadow-2xl backdrop-blur-xl" style={{ borderColor: `${gold}66`, boxShadow: "0 30px 90px rgba(0,0,0,.55),0 0 70px rgba(214,181,109,.10)" }}><div className="flex items-center justify-between"><span className="text-sm text-white/45">{salesQaMode ? "QA comercial · CIOSP 2027" : "Pré-lançamento · CIOSP 2027"}</span><Crown className="size-5" style={{ color: gold }} aria-hidden="true" /></div>{salesQaMode ? <><p className="mt-9 text-xs uppercase tracking-[.2em] text-white/45">Planejamento QA · não publicado</p><p className="mt-2 text-5xl font-semibold tracking-tight text-[#F5E7C5]">R$ 12.490</p><p className="mt-3 text-sm leading-relaxed text-white/58">Entrada planejada de <strong className="text-white">R$ 3.490</strong> + saldo planejado de <strong className="text-white">R$ 9.000</strong>.</p></> : <><p className="mt-9 text-xs uppercase tracking-[.2em] text-white/45">Condições comerciais</p><p className="mt-2 text-4xl font-semibold tracking-tight text-[#F5E7C5]">Em preparação</p><p className="mt-3 text-sm leading-relaxed text-white/58">Preço, forma de pagamento, itens incluídos e disponibilidade serão informados somente após aprovação para publicação.</p></>}<div className="my-7 h-px bg-[#D6B56D]/20" /><div className="space-y-3 text-sm text-white/72">{(salesQaMode ? ["Planejamento interno", "Checkout pronto para QA", "Vendas públicas fechadas"] : publicHighlights).map((x) => <div key={x} className="flex items-center gap-3"><CheckCircle2 className="size-4" style={{ color: gold }} aria-hidden="true" />{x}</div>)}</div><a href={`#${targetId}`} className="mt-7 flex w-full items-center justify-center rounded-full border border-[#D6B56D]/35 py-3 text-sm font-semibold text-[#E4CA91]">{ctaLabel}<ArrowRight className="ml-2 size-4" aria-hidden="true" /></a></div></div>
          </div>
        </section>

        <section className="border-b border-white/10 bg-black"><div className="mx-auto grid max-w-7xl gap-px bg-white/10 sm:grid-cols-3"><div className="bg-[#080808] px-6 py-7"><p className="text-xs uppercase tracking-[.2em] text-[#D6B56D]">01 · Clareza</p><p className="mt-2 text-sm text-white/65">As condições publicadas devem refletir somente informações confirmadas.</p></div><div className="bg-[#080808] px-6 py-7"><p className="text-xs uppercase tracking-[.2em] text-[#D6B56D]">02 · Decisão</p><p className="mt-2 text-sm text-white/65">Você poderá analisar a proposta completa antes de decidir comprar.</p></div><div className="bg-[#080808] px-6 py-7"><p className="text-xs uppercase tracking-[.2em] text-[#D6B56D]">03 · Segurança</p><p className="mt-2 text-sm text-white/65">Nesta etapa, cadastro de interesse não é reserva nem pagamento.</p></div></div></section>

        <section id="experiencia" className="bg-[#0B0B0B]"><div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28"><div className="grid items-end gap-8 lg:grid-cols-[.8fr_1.2fr]"><div><p className="text-xs font-bold uppercase tracking-[.22em]" style={{ color: gold }}>CIOSP 2027 com a BSBTUR</p><h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Conheça o contexto.<br />Receba a proposta quando estiver pronta.</h2></div><p className="max-w-2xl text-lg leading-relaxed text-white/52 lg:justify-self-end">A experiência comercial está em preparação. A BSBTUR publicará apenas os itens, condições e disponibilidade que estiverem confirmados para contratação.</p></div><div className="mt-12 grid gap-4 lg:grid-cols-12 lg:grid-rows-2">{gallery.map(([src, label, copy], i) => <figure key={src} className={`group relative overflow-hidden rounded-[2rem] border border-white/10 bg-black ${i === 0 ? "min-h-[500px] lg:col-span-7 lg:row-span-2" : "min-h-[240px] lg:col-span-5"}`}><img src={src} alt={label} className="absolute inset-0 h-full w-full object-cover opacity-82 transition duration-700 group-hover:scale-[1.035]" loading={i === 0 ? "eager" : "lazy"} /><div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" /><figcaption className="absolute bottom-0 p-7"><p className="text-xs uppercase tracking-[.2em]" style={{ color: gold }}>{label}</p><p className={`${i === 0 ? "text-2xl" : "text-lg"} mt-2 max-w-md font-semibold text-white`}>{copy}</p></figcaption></figure>)}</div><p className="mt-4 text-xs text-white/35">Imagens usadas como contexto do evento. Elas não representam confirmação de fornecedores, serviços ou itens do pacote.</p></div></section>

        <section className="border-y border-[#D6B56D]/15 bg-[#050505]"><div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">{salesQaMode ? <><p className="text-xs font-bold uppercase tracking-[.22em]" style={{ color: gold }}>QA interno · composição em planejamento</p><h2 className="mt-4 max-w-3xl text-4xl font-semibold sm:text-5xl">Itens abaixo não estão publicados como oferta.</h2><div className="mt-12 grid gap-px overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">{planningInclusions.map(([Icon, title, description]) => <article key={title} className="bg-[#090909] p-8"><span className="grid size-11 place-items-center rounded-full border border-[#D6B56D]/25 bg-[#D6B56D]/5" style={{ color: gold }}><Icon className="size-5" aria-hidden="true" /></span><h3 className="mt-6 text-xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-relaxed text-white/45">{description}</p></article>)}</div><div className="mt-6 flex gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-sm text-white/55"><UtensilsCrossed className="size-5 shrink-0 text-amber-300" aria-hidden="true" />Planejamento QA sujeito a alteração. Não utilizar estes itens como promessa comercial pública.</div></> : <><p className="text-xs font-bold uppercase tracking-[.22em]" style={{ color: gold }}>Composição do pacote</p><h2 className="mt-4 max-w-3xl text-4xl font-semibold sm:text-5xl">A confirmar antes da abertura das vendas.</h2><div className="mt-8 rounded-[2rem] border border-[#D6B56D]/20 bg-[#D6B56D]/5 p-7"><p className="text-lg font-semibold text-[#F5E7C5]">Composição final do pacote em preparação.</p><p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/55">Itens incluídos, condições, fornecedores, forma de pagamento e disponibilidade serão confirmados antes da abertura das vendas. Cadastre seu interesse para receber as informações aprovadas quando estiverem disponíveis.</p></div></>}</div></section>

        <section id={targetId} className="bg-[#080808]"><div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[.85fr_1.15fr] lg:px-8 lg:py-28"><div><p className="text-xs font-bold uppercase tracking-[.22em]" style={{ color: gold }}>{salesQaMode ? "QA comercial" : "Acesso antecipado"}</p><h2 className="mt-4 text-4xl font-semibold sm:text-5xl">{salesQaMode ? <>Checkout preparado.<br />Vendas ainda fechadas.</> : <>Entre primeiro.<br />Decida depois.</>}</h2><p className="mt-5 max-w-xl text-lg leading-relaxed text-white/52">{salesQaMode ? "Este modo existe para validar a experiência comercial sem abrir o produto ao público. O backend continua fail-closed enquanto sales_public=false." : "Cadastre seu interesse para receber as condições comerciais antes da abertura ampla. Nesta etapa não há pagamento, reserva de vaga nem compromisso de compra."}</p><div className="mt-9 rounded-2xl border border-[#D6B56D]/20 bg-[#D6B56D]/5 p-5 text-sm text-white/55"><strong className="text-[#E4CA91]">CIOSP 2027 · BSBTUR</strong><br />{salesQaMode ? "QA interno · planejamento comercial não publicado" : "Pré-lançamento · condições e disponibilidade a confirmar"}</div></div><div className="rounded-[2rem] border border-[#D6B56D]/28 bg-[#111]/92 p-6 shadow-2xl sm:p-8">{form}</div></div></section>
      </main>
      <footer className="border-t border-white/10 bg-black"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between lg:px-8"><BsbTurSignature /><span>CIOSP 2027 · {salesQaMode ? "QA comercial · planejamento não publicado · vendas fechadas" : "Pré-lançamento · condições a confirmar"}</span></div></footer>
    </div>
  );
}

