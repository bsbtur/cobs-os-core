import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidade-ciosp-2027")({
  head: () => ({
    meta: [
      { title: "Aviso de Privacidade — CIOSP 2027 | BSBTUR" },
      {
        name: "description",
        content:
          "Aviso de privacidade aplicável ao cadastro de interesse na Caravana CIOSP 2027 da BSBTUR.",
      },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: PrivacyNoticePage,
});

function PrivacyNoticePage() {
  return (
    <main className="min-h-screen bg-[#070707] px-5 py-12 text-[#F5F1E8] sm:py-16">
      <article className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl sm:p-10">
        <a
          href="/ciosp-2027"
          className="inline-flex min-h-11 items-center rounded-full border border-[#D6B56D]/35 px-4 py-2 text-sm font-semibold text-[#E4CA91] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6B56D]"
        >
          Voltar para CIOSP 2027
        </a>

        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.2em] text-[#D6B56D]">BSBTUR</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Aviso de Privacidade — interesse CIOSP 2027</h1>
        <p className="mt-4 text-sm leading-relaxed text-white/55">Atualizado em 03/09/2026.</p>

        <div className="mt-8 space-y-6 text-base leading-7 text-white/75">
          <p>
            Ao enviar o formulário de interesse, seus dados de identificação e contato, como nome, e-mail e telefone/WhatsApp, serão utilizados pela BSBTUR para registrar seu interesse na Caravana CIOSP 2027, responder ao seu contato e enviar informações relacionadas a esta experiência comercial.
          </p>
          <p>
            O envio do formulário não cria reserva, não garante vaga e não representa pagamento ou contratação.
          </p>
          <p>
            Os dados devem ser acessados somente por pessoas e prestadores necessários ao atendimento e à operação dos sistemas utilizados pela BSBTUR, observadas as finalidades informadas e os controles aplicáveis.
          </p>
          <p>
            Você pode solicitar a interrupção de contatos comerciais e exercer seus direitos relacionados aos seus dados pessoais pelos canais oficiais da BSBTUR indicados no COBS/BSBTUR.
          </p>
        </div>

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-lg font-semibold">Sobre este cadastro</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            O cadastro é uma manifestação de interesse em pré-lançamento. As condições comerciais, disponibilidade e eventual contratação serão apresentadas separadamente quando estiverem aprovadas para publicação.
          </p>
        </section>

        <p className="mt-10 text-xs leading-5 text-white/40">
          Este aviso se aplica ao formulário público de interesse da experiência CIOSP 2027 e não altera a condição de vendas públicas do COBS.
        </p>
      </article>
    </main>
  );
}
