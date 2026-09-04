import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/termos-ciosp-2027")({
  head: () => ({ meta: [
    { title: "Termos Comerciais CIOSP 2027 — BSBTUR" },
    { name: "description", content: "Termos comerciais e política de cancelamento da CIOSP Experience 2027 da BSBTUR." },
    { name: "robots", content: "noindex,nofollow" },
  ] }),
  component: TermsPage,
});

function TermsPage() {
  return <main className="min-h-screen bg-[#070706] px-5 py-10 text-white sm:px-8 sm:py-14">
    <section className="mx-auto max-w-3xl">
      <a href="/ciosp-2027/reserva" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#E4CA91] underline underline-offset-4"><ArrowLeft className="size-4"/>Voltar para a reserva</a>
      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl sm:p-8">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-1 size-6 shrink-0 text-[#D6B56D]"/><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D6B56D]">Versão comercial ciops-2027-v1</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Termos Comerciais e Política de Cancelamento</h1><p className="mt-3 text-sm leading-6 text-white/55">CIOSP Experience 2027 — BSBTUR · Brasília → São Paulo · viagem planejada de 25 a 31 de janeiro de 2027.</p></div></div>
        <div className="mt-8 space-y-7 text-sm leading-7 text-white/70">
          <section><h2 className="text-lg font-semibold text-white">1. Preço e pagamento</h2><p className="mt-2">Valor por passageiro em acomodação dupla: <strong className="text-white">R$ 12.490</strong>. Condição aprovada: <strong className="text-white">R$ 3.490 na contratação</strong>, mais três parcelas de <strong className="text-white">R$ 3.000</strong>, com vencimentos em 10/10/2026, 10/11/2026 e 10/12/2026. Em contratação após algum vencimento, valores vencidos e ainda não pagos poderão ser exigidos junto com a entrada.</p></section>
          <section><h2 className="text-lg font-semibold text-white">2. Escopo da experiência</h2><p className="mt-2">A oferta é estruturada como experiência acadêmica e turística vinculada ao CIOSP 2027. Fornecedores, horários, estabelecimentos, voos, hospedagem, transportes e demais detalhes operacionais permanecem sujeitos à contratação, disponibilidade e confirmação final. Informações ainda não confirmadas não constituem promessa de fornecedor específico.</p></section>
          <section><h2 className="text-lg font-semibold text-white">3. Reserva e confirmação</h2><p className="mt-2">A geração de pedido ou de cobrança Pix não significa, isoladamente, pagamento confirmado. A confirmação depende da conciliação do pagamento pelo COBS e do registro correspondente no pedido e na reserva.</p></section>
          <section><h2 className="text-lg font-semibold text-white">4. Cancelamento pelo cliente</h2><p className="mt-2">Pedidos de cancelamento serão analisados conforme a legislação aplicável, os valores efetivamente pagos, os compromissos já assumidos com fornecedores e as condições contratuais informadas ao cliente. Não existe regra automática de perda integral da entrada. Quando cabível, serão observados direitos legais de arrependimento e restituição.</p></section>
          <section><h2 className="text-lg font-semibold text-white">5. Alterações e inviabilidade</h2><p className="mt-2">Se houver necessidade justificada de alteração operacional, a BSBTUR deverá informar o cliente e preservar, sempre que possível, a finalidade principal da experiência. Se a própria BSBTUR não puder prestar a viagem contratada, não será aplicada penalidade ao cliente por esse motivo, sem prejuízo das soluções e restituições legalmente cabíveis.</p></section>
          <section><h2 className="text-lg font-semibold text-white">6. Dados e aceite</h2><p className="mt-2">Ao marcar a caixa de aceite no checkout, o cliente declara ter acesso prévio a estes termos e ao Aviso de Privacidade. O COBS registra a versão dos termos, a versão da política de cancelamento e a data/hora do aceite vinculadas ao pedido.</p></section>
          <section><h2 className="text-lg font-semibold text-white">7. Versões</h2><p className="mt-2">Termos comerciais: <strong className="text-white">ciosp-2027-v1</strong>. Política de cancelamento: <strong className="text-white">ciosp-2027-cancellation-v1</strong>. Alterações materiais futuras exigirão nova versão e novo aceite quando aplicável.</p></section>
        </div>
        <p className="mt-8 border-t border-white/10 pt-6 text-xs leading-5 text-white/40">Este documento organiza as condições comerciais aprovadas para o fluxo digital. A contratação continua sujeita às informações obrigatórias do pacote e à legislação aplicável.</p>
      </div>
    </section>
  </main>;
}