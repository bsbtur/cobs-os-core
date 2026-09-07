import { FormEvent, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Landmark,
  MapPinned,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/city-tour-validacao")({
  head: () => ({
    meta: [
      { title: "City Tour Brasília — Validação R$ 1 | BSBTUR" },
      {
        name: "description",
        content:
          "Página de validação do Golden Path BSBTUR: City Tour Brasília por R$ 1,00 em ambiente TEST, sem cobrança de produção.",
      },
      { property: "og:title", content: "City Tour Brasília — Validação R$ 1 | BSBTUR" },
      {
        property: "og:description",
        content: "Uma experiência curta em Brasília usada para validar o fluxo completo do COBS em ambiente TEST.",
      },
    ],
  }),
  component: CityTourValidationLanding,
});

const gold = "#D6B56D";

const inclusions = [
  [Landmark, "Brasília monumental", "Uma experiência curta para representar um produto turístico real."],
  [MapPinned, "Operação City Tour QA", "Produto conectado à operação de validação já cadastrada no STAGING."],
  [ShieldCheck, "Ambiente TEST", "Nenhuma cobrança Mercado Pago de produção é iniciada nesta página."],
  [BadgeCheck, "Golden Path", "Base para validar pedido, reserva, pagamento TEST, viajante e contrato."],
] as const;

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-full border text-sm font-bold" style={{ borderColor: gold, color: gold }}>
        B
      </span>
      <span>
        <span className="block text-base font-semibold tracking-[0.18em] text-white">BSBTUR</span>
        <span className="block text-[9px] uppercase tracking-[0.28em] text-white/45">Turismo & Experiências</span>
      </span>
    </div>
  );
}

function CityTourValidationLanding() {
  const [submitted, setSubmitted] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  function submitInterest(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Brand />
          <div className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">
            QA · TEST
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(214,181,109,.16),transparent_38%),radial-gradient(circle_at_90%_30%,rgba(255,255,255,.06),transparent_30%)]" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-[1.25fr_.75fr] lg:py-28">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-4 py-2 text-xs uppercase tracking-[.2em] text-white/60">
                <Sparkles className="size-4" style={{ color: gold }} /> Golden Path COBS
              </div>
              <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-.04em] md:text-7xl">
                Viva um City Tour em Brasília e ajude a validar a experiência digital da BSBTUR.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/55">
                Esta é uma oferta controlada de teste. O produto está cadastrado no STAGING por <strong className="text-white">R$ 1,00 por viajante</strong> para validarmos o fluxo do interesse ao contrato sem tocar em cobranças de produção.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#validacao">
                  <Button className="h-12 rounded-full px-6 text-black" style={{ backgroundColor: gold }}>
                    Quero participar da validação <ArrowRight className="ml-2 size-4" />
                  </Button>
                </a>
                <span className="inline-flex h-12 items-center rounded-full border border-white/10 px-5 text-sm text-white/55">
                  Produto TEST · R$ 1,00
                </span>
              </div>
            </div>

            <aside className="rounded-[2rem] border border-white/10 bg-white/[.04] p-7 shadow-2xl shadow-black/30">
              <p className="text-xs font-semibold uppercase tracking-[.22em]" style={{ color: gold }}>Oferta de validação</p>
              <p className="mt-4 text-5xl font-semibold">R$ 1,00</p>
              <p className="mt-1 text-sm text-white/45">por viajante · somente TEST</p>
              <div className="mt-7 space-y-3 text-sm text-white/65">
                {["Produto turístico real de QA", "Até 2 viajantes para o primeiro ciclo", "Fluxo preparado para contrato", "Sem Mercado Pago production"].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: gold }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[.22em]" style={{ color: gold }}>O que estamos validando</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-.03em] md:text-5xl">Uma venda pequena para testar uma operação grande.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {inclusions.map(([Icon, title, description]) => (
              <article key={title} className="rounded-3xl border border-white/10 bg-white/[.03] p-6">
                <Icon className="size-6" style={{ color: gold }} />
                <h3 className="mt-5 text-xl font-semibold">{title}</h3>
                <p className="mt-2 leading-7 text-white/50">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="validacao" className="border-y border-white/10 bg-white/[.025]">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[.85fr_1.15fr]">
            <div>
              <Users className="size-8" style={{ color: gold }} />
              <h2 className="mt-5 text-4xl font-semibold tracking-[-.03em]">Primeiro ciclo: dois viajantes.</h2>
              <p className="mt-4 leading-7 text-white/50">
                Nesta etapa, o formulário registra apenas a intenção local na interface. O checkout TEST será conectado ao Golden Path depois do gate técnico do endpoint genérico. Nenhum Pix ou pedido é criado por este formulário.
              </p>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-black/40 p-6 md:p-8">
              {submitted ? (
                <div role="status" className="py-8 text-center">
                  <CheckCircle2 className="mx-auto size-10" style={{ color: gold }} />
                  <h3 className="mt-4 text-2xl font-semibold">Pronto para o próximo gate.</h3>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/50">
                    Dados preenchidos na página de vendas. Nenhuma transação foi criada. A próxima etapa é conectar este CTA ao checkout TEST do City Tour.
                  </p>
                </div>
              ) : (
                <form onSubmit={submitInterest} className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.2em]" style={{ color: gold }}>Participar por R$ 1,00</p>
                    <h3 className="mt-2 text-2xl font-semibold">Dados do viajante</h3>
                  </div>
                  <label className="block space-y-1.5 text-sm text-white/65">
                    Nome completo
                    <Input required minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} className="border-white/15 bg-black/50 text-white" />
                  </label>
                  <label className="block space-y-1.5 text-sm text-white/65">
                    E-mail
                    <Input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="border-white/15 bg-black/50 text-white" />
                  </label>
                  <label className="block space-y-1.5 text-sm text-white/65">
                    WhatsApp
                    <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(61) 99999-9999" className="border-white/15 bg-black/50 text-white" />
                  </label>
                  <Button type="submit" className="h-12 w-full rounded-full text-black" style={{ backgroundColor: gold }}>
                    Continuar validação <ArrowRight className="ml-2 size-4" />
                  </Button>
                  <p className="text-center text-xs leading-5 text-white/35">Ambiente TEST. Esta versão da página não cria pedido, cobrança ou contrato.</p>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-xs text-white/35 md:flex-row md:items-center md:justify-between">
        <Brand />
        <p>BSBTUR · City Tour Brasília · Página de validação COBS</p>
      </footer>
    </div>
  );
}
