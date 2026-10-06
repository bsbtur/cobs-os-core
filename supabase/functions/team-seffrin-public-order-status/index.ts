import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const KEYS=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}");
const secretKey=KEYS.default;
const MP_ENV=(Deno.env.get("MERCADO_PAGO_ENVIRONMENT")??"test").trim().toLowerCase();
const CODE="TEAM-SEFFRIN-BSB-20270416";
const cors={"access-control-allow-origin":"*","access-control-allow-headers":"content-type, x-client-info, apikey, authorization","access-control-allow-methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const hex=(b:ArrayBuffer)=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function sha256(v:string){return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)))}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  if(!secretKey)return json({error:"server_not_configured"},500);
  let body:{order_id?:string;checkout_token?:string};
  try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const orderId=(body.order_id??"").trim();
  const token=(body.checkout_token??"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(orderId)||!/^[0-9a-f]{64}$/i.test(token))return json({error:"invalid_resume_proof"},400);

  const db=createClient(SUPABASE_URL,secretKey,{auth:{persistSession:false}});
  const hash=await sha256(token);
  const {data:session,error:sessionError}=await db.from("public_checkout_sessions").select("id,tenant_id,order_id,status,expires_at").eq("order_id",orderId).eq("token_hash",hash).maybeSingle();
  if(sessionError)return json({error:"resume_session_lookup_failed"},500);
  if(!session)return json({error:"invalid_resume_proof"},403);
  if(!["active","consumed"].includes(session.status))return json({error:"resume_session_not_readable",status:session.status},409);
  if(new Date(session.expires_at).getTime()<=Date.now())return json({error:"resume_session_expired"},409);

  const {data:order,error:orderError}=await db.from("orders").select("id,tenant_id,operation_id,status,currency,grand_total_minor,metadata").eq("id",orderId).eq("tenant_id",session.tenant_id).maybeSingle();
  if(orderError)return json({error:"resume_order_lookup_failed"},500);
  if(!order)return json({error:"order_not_found"},404);

  const {data:op}=await db.from("operations").select("id,code").eq("id",order.operation_id).eq("tenant_id",order.tenant_id).maybeSingle();
  if(!op||op.code!==CODE)return json({error:"order_operation_mismatch"},409);

  const meta=(order.metadata??{}) as Record<string,unknown>;
  const qa=meta.qa_public_checkout===true;
  const paymentEnvironment=qa?"test":MP_ENV;

  const {data:charges,error:chargeError}=await db.from("payment_charges").select("id,status,amount_minor,installment_number,installment_count,due_at,metadata").eq("order_id",orderId).eq("tenant_id",session.tenant_id).eq("provider","mercado_pago").order("installment_number",{ascending:true});
  if(chargeError)return json({error:"resume_charges_lookup_failed"},500);
  const relevantCharges=(charges??[]).filter((charge:any)=>charge?.metadata?.environment===paymentEnvironment);

  const {data:facts,error:factsError}=await db.from("financial_facts").select("fact_type,amount_minor,occurred_at,reason").eq("tenant_id",session.tenant_id).eq("order_id",orderId).order("occurred_at",{ascending:true});
  if(factsError)return json({error:"resume_facts_lookup_failed"},500);

  let received=0;
  for(const fact of facts??[]){
    const amount=Number(fact.amount_minor??0);
    if(fact.fact_type==="PAYMENT_RECORDED")received+=amount;
    if(fact.fact_type==="PAYMENT_REVERSED"||fact.fact_type==="REFUND_RECORDED")received-=amount;
  }
  received=Math.max(received,0);

  const total=Number(order.grand_total_minor??0);
  const entry=Number(meta.entry_minor??0);
  const outstanding=Math.max(total-received,0);
  const entryPaid=entry>0&&received>=entry;
  const paidInFull=total>0&&received>=total;
  const next=relevantCharges.find((charge:any)=>!["paid","cancelled","refunded"].includes(charge.status));

  return json({
    order_id:order.id,
    order_status:order.status,
    currency:order.currency,
    lot_number:Number(meta.commercial_lot_number??1),
    lot_label:meta.commercial_lot_label??null,
    total_minor:total,
    entry_minor:entry,
    received_minor:received,
    balance_minor:outstanding,
    entry_status:entryPaid?"paid":next?.installment_number===1?next.status:"awaiting_payment",
    balance_status:paidInFull?"paid":entryPaid?"available":"locked_until_entry",
    payment_status:paidInFull?"paid":next?.status??(entryPaid?"entry_paid":"awaiting_payment"),
    payment_environment:paymentEnvironment,
    checkout_session_status:session.status,
    max_card_installments:Number(meta.balance_card_installments_max??12),
    charges:relevantCharges.map((charge:any)=>({
      id:charge.id,
      installment_number:charge.installment_number,
      installment_count:charge.installment_count,
      amount_minor:Number(charge.amount_minor),
      due_at:charge.due_at,
      status:charge.status
    }))
  });
});