import { type FormEvent, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/ciosp-2027_/reserva")({
  head: () => ({ meta: [{ title: "Reserva CIOSP 2027 — BSBTUR" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: CiospReservationPage,
});

type Checkout = { order_id: string; checkout_token: string };
type Pix = { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
type Status = { status: string; paid_minor: number; outstanding_minor: number; next_amount_minor: number; obligations: Array<{ installment_number: number; amount_minor: number; outstanding_minor: number; due_date?: string }> };
const storageKey = "ciosp-checkout-v1";
const money = (amount: number) => (amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
async function errorCode(error: unknown) {
  try { return (await (error as { context: Response }).context.clone().json())?.error as string; } catch { return "unavailable"; }
}
function remember(value: Checkout) { try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* The in-memory session remains usable. */ } }

function CiospReservationPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [orderToResume, setOrderToResume] = useState("");
  const [pix, setPix] = useState<Pix | null>(null);
  const [pixAmount, setPixAmount] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const idem = useRef("");
  const pending = useRef(false);
  const paidBeforePix = useRef(0);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as Checkout | null;
      if (saved && typeof saved.order_id === "string" && /^[0-9a-f]{64}$/i.test(saved.checkout_token)) { setCheckout(saved); setOrderToResume(saved.order_id); }
      idem.current = sessionStorage.getItem("ciosp-checkout-request") ?? crypto.randomUUID();
      sessionStorage.setItem("ciosp-checkout-request", idem.current);
    } catch { idem.current = crypto.randomUUID(); }
  }, []);

  useEffect(() => {
    if (!checkout) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      const result = await supabase.functions.invoke("ciosp-checkout-status", { headers: { "x-checkout-token": checkout!.checkout_token }, body: { order_id: checkout!.order_id } });
      if (stopped) return;
      if (result.error) {
        setError("Não foi possível atualizar o pagamento. Se a sessão expirou, entre na conta vinculada à reserva e use Retomar pedido. Não gere outro pedido.");
        return;
      }
      setStatus(result.data as Status);
      if (Number(result.data?.paid_minor) > paidBeforePix.current) setPix(null);
      if (["submitted", "confirmed"].includes(result.data?.status) && result.data?.outstanding_minor > 0) timer = setTimeout(refresh, 10000);
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [checkout]);

  async function generatePix(current: Checkout) {
    paidBeforePix.current = status?.paid_minor ?? 0;
    setCopied(false);
    const result = await supabase.functions.invoke("ciosp-public-create-pix", { body: current });
    if (result.error) throw result.error;
    setPix((result.data?.pix ?? null) as Pix | null);
    setPixAmount(Number(result.data?.amount_minor ?? 0));
    // Payment approval is read from the canonical status endpoint, never inferred from a QR code.
    setCheckout({ ...current });
  }

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await action(); } catch (cause) {
      const code = await errorCode(cause);
      setError(code === "sales_not_open" ? "As vendas ainda estão em validação. A abertura será informada pela BSBTUR." : ["qa_auth_required", "qa_invalid_session", "qa_forbidden", "checkout_access_denied", "checkout_resume_requires_authorization", "checkout_session_expired", "checkout_session_not_active"].includes(code) ? "Entre na conta vinculada ao pedido para continuar. Para testes internos, use uma conta de equipe autorizada. Se ainda não recebeu seu acesso, solicite-o à BSBTUR." : "Não foi possível concluir esta etapa. Preserve o número do pedido e tente retomá-lo. Um Pix gerado não comprova pagamento.");
    } finally { pending.current = false; setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!consent) return;
    await run(async () => {
      if (checkout) { await generatePix(checkout); return; }
      if (!idem.current) idem.current = crypto.randomUUID();
      const headers: Record<string, string> = new URLSearchParams(window.location.search).get("sales_qa") === "1" ? { "x-ciosp-qa": "1" } : {};
      const result = await supabase.functions.invoke("ciosp-public-checkout", { headers, body: { full_name: name, email, phone, idempotency_key: idem.current, terms_accepted: true, commercial_terms_version: "ciosp-2027-v1", cancellation_policy_version: "ciosp-2027-cancellation-v1" } });
      if (result.error) throw result.error;
      if (!result.data?.order_id || !result.data?.checkout_token) throw new Error("Invalid checkout response");
      const current = { order_id: result.data.order_id as string, checkout_token: result.data.checkout_token as string };
      remember(current); setCheckout(current); setOrderToResume(current.order_id);
      await generatePix(current);
    });
  }

  async function resume() {
    await run(async () => {
      const result = await supabase.functions.invoke("ciosp-checkout-status", { body: { order_id: orderToResume.trim(), resume: true } });
      if (result.error) throw result.error;
      if (!result.data?.checkout_token) throw new Error("Missing session");
      const current = { order_id: orderToResume.trim(), checkout_token: result.data.checkout_token as string };
      remember(current); setCheckout(current); setStatus(result.data as Status); setPix(null);
    });
  }

  return <main className="min-h-screen bg-[#070706] px-5 py-10 text-white"><section className="mx-auto max-w-xl">
    <a href="/ciosp-2027" className="text-[#E4CA91] underline">Voltar para CIOSP 2027</a>
    <div className="mt-8 space-y-6 rounded-3xl border border-white/10 p-6 sm:p-8">
      <h1 className="text-3xl font-semibold">CIOSP Experience 2027</h1>
      <p>R$ 12.490 por passageiro em acomodação dupla. Entrada de R$ 3.490 + 3 parcelas de R$ 3.000 em 10/10, 10/11 e 10/12/2026. Em compra após vencimentos, parcelas vencidas somam-se à entrada.</p>
      {error && <p role="alert" className="rounded-xl border border-amber-500/40 p-4 text-amber-200">{error}</p>}
      {status && <section aria-live="polite" className="space-y-3 rounded-xl border border-white/15 p-4">
        <h2 className="text-xl font-semibold">{status.status === "confirmed" ? "Reserva confirmada" : status.status === "cancelled" ? "Pedido cancelado" : "Acompanhamento do pedido"}</h2>
        <p>Recebido: {money(status.paid_minor)} · Saldo: {money(status.outstanding_minor)}</p>
        <ul className="space-y-2">{status.obligations.map(item => <li key={item.installment_number}>Cobrança {item.installment_number}/4 · {item.due_date ? item.due_date.split("-").reverse().join("/") : "Na contratação"} · Restante: {money(item.outstanding_minor)}</li>)}</ul>
        {status.status === "confirmed" && <a href="/my" className="inline-block min-h-11 text-[#E4CA91] underline">Acessar minhas viagens</a>}
      </section>}
      {checkout ? <section className="space-y-4">
        <p className="break-all text-sm">Pedido: {checkout.order_id}</p>
        {pix && <div className="space-y-4"><h2 className="text-xl">Pix gerado: {money(pixAmount)}</h2><p>Aguarde a confirmação do pagamento no acompanhamento acima.</p>{pix.qr_code_base64 && <img src={`data:image/png;base64,${pix.qr_code_base64}`} alt="QR Code Pix" className="mx-auto w-full max-w-[280px] rounded-xl bg-white p-3" />}{pix.qr_code && <Button type="button" onClick={() => { void navigator.clipboard.writeText(pix.qr_code!).then(() => setCopied(true)).catch(() => setError("Não foi possível copiar. Use o QR Code.")); }}><Copy className="mr-2 size-4" />{copied ? "Pix copiado" : "Copiar Pix"}</Button>}</div>}
        {(!status || status.outstanding_minor > 0) && <Button type="button" disabled={busy} onClick={() => void run(() => generatePix(checkout))}> {busy ? "Consultando…" : "Gerar ou recuperar cobrança"}</Button>}
        {status && status.next_amount_minor > 0 && <p>Próxima cobrança: {money(status.next_amount_minor)}. Após uma sessão expirada ou consumida, retome o pedido pela sua conta.</p>}
      </section> : <form onSubmit={submit} className="space-y-4">
        <label className="block">Nome completo<Input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="block">E-mail<Input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="block">WhatsApp<Input required autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} /></label>
        <label className="flex gap-3"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Li e aceito os <a href="/termos-ciosp-2027" target="_blank" rel="noreferrer" className="text-[#E4CA91] underline">Termos Comerciais e Política de Cancelamento</a>.</span></label>
        <a href="/privacidade-ciosp-2027" className="block text-[#E4CA91] underline">Aviso de Privacidade</a>
        <Button disabled={busy || !consent} type="submit">{busy ? <><Loader2 className="mr-2 size-4 animate-spin" />Preparando…</> : "Gerar reserva e Pix"}</Button>
      </form>}
      <section className="space-y-3 border-t border-white/15 pt-5"><h2 className="text-xl font-semibold">Já tenho um pedido</h2><p>Use a conta vinculada à reserva. O número do pedido não concede acesso sozinho.</p><a href="/auth" className="inline-block min-h-11 text-[#E4CA91] underline">Entrar na minha conta</a><label className="block">Número do pedido<Input value={orderToResume} onChange={e => setOrderToResume(e.target.value)} /></label><Button type="button" disabled={busy || !orderToResume.trim()} onClick={() => void resume()}>Retomar pedido</Button></section>
    </div>
  </section></main>;
}
