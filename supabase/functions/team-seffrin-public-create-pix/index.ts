import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const KEYS=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}");
const SECRET_KEY=KEYS.default;
const MP_ENV=Deno.env.get("MERCADO_PAGO_ENVIRONMENT")??"test";
const MP_TEST_TOKEN=Deno.env.get("MERCADO_PAGO_TEST_ACCESS_TOKEN");
const MP_PROD_TOKEN=Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
const CODE="TEAM-SEFFRIN-BSB-20270416";
const cors={"access-control-allow-origin":"*","access-control-allow-headers":"content-type, x-client-info, apikey, authorization","access-control-allow-methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");
async function sha256(v:string){return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)))}
function mapStatus(s?:string,d?:string){if(s==="approved"||(s==="processed"&&d==="accredited"))return"approved";if(s==="processed"||s==="processing")return"processing";if(s==="cancelled")return"cancelled";if(s==="expired")return"expired";if(s==="refunded")return"refunded";if(s==="rejected")return"rejected";return"pending"}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  if(!SECRET_KEY)return json({error:"server_not_configured"},500);
  if(!["test","production"].includes(MP_ENV))return json({error:"mercado_pago_environment_invalid"},500);

  let input:{order_id?:string;checkout_token?:string;payer_email?:string};
  try{input=await req.json()}catch{return json({error:"invalid_json"},400)}
  const orderId=(input.order_id??"").trim();
  const token=(input.checkout_token??"").trim();
  const email=(input.payer_email??"").trim().toLowerCase();
  if(!/^[0-9a-f-]{36}$/i.test(orderId))return json({error:"invalid_order_id"},400);
  if(!/^[0-9a-f]{64}$/i.test(token))return json({error:"invalid_checkout_token"},400);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:"valid_payer_email_required"},400);

  const db=createClient(SUPABASE_URL,SECRET_KEY,{auth:{persistSession:false}});
  const hash=await sha256(token);
  const nowIso=new Date().toISOString();

  const sessionResult=await db.from("public_checkout_sessions").select("id,tenant_id,order_id,status,expires_at").eq("order_id",orderId).eq("token_hash",hash).maybeSingle();
  if(sessionResult.error)return json({error:"checkout_session_lookup_failed"},500);
  const session=sessionResult.data;
  if(!session)return json({error:"invalid_checkout_session"},403);
  if(session.status!=="active")return json({error:"checkout_session_not_active"},409);
  if(new Date(session.expires_at).getTime()<=Date.now()){
    await db.from("public_checkout_sessions").update({status:"expired",updated_at:nowIso}).eq("id",session.id);
    return json({error:"checkout_session_expired"},409);
  }

  const orderResult=await db.from("orders").select("id,tenant_id,operation_id,status,currency,grand_total_minor,metadata").eq("id",orderId).eq("tenant_id",session.tenant_id).maybeSingle();
  if(orderResult.error)return json({error:"order_lookup_failed"},500);
  const order=orderResult.data;
  if(!order)return json({error:"order_not_found"},404);
  if(!["submitted","confirmed"].includes(order.status))return json({error:"order_not_payable",status:order.status},409);
  if(order.currency!=="BRL")return json({error:"unsupported_currency"},409);

  const opResult=await db.from("operations").select("id,code,archived_at").eq("id",order.operation_id).eq("tenant_id",order.tenant_id).maybeSingle();
  const op=opResult.data;
  if(!op||op.code!==CODE||op.archived_at)return json({error:"order_operation_mismatch"},409);

  const cfgResult=await db.from("operation_commercial_configs").select("status,sales_public,commercial_terms_version,cancellation_policy_version,entry_minor,balance_minor").eq("operation_id",op.id).eq("tenant_id",order.tenant_id).maybeSingle();
  if(cfgResult.error)return json({error:"commercial_config_lookup_failed"},500);
  const cfg=cfgResult.data;
  if(!cfg||cfg.status!=="active")return json({error:"checkout_not_configured"},409);

  const om=(order.metadata??{}) as Record<string,unknown>;
  const qa=om.qa_public_checkout===true;
  let paymentEnv=MP_ENV;
  let mpToken=MP_ENV==="test"?MP_TEST_TOKEN:MP_PROD_TOKEN;
  if(qa){paymentEnv="test";mpToken=MP_TEST_TOKEN;}
  if(!qa){
    if(cfg.sales_public!==true)return json({error:"sales_not_open"},409);
    if(cfg.cancellation_policy_version==="pending-legal-review")return json({error:"legal_release_not_ready"},409);
  }
  if(!mpToken)return json({error:paymentEnv==="test"?"mercado_pago_test_not_configured":"mercado_pago_not_configured"},500);

  const total=Number(order.grand_total_minor??0);
  const entry=Number(cfg.entry_minor??0);
  if(total!==999700||entry!==199700||Number(cfg.balance_minor)!==800000)return json({error:"commercial_amounts_not_configured"},409);

  const factsResult=await db.from("financial_facts").select("fact_type,amount_minor").eq("order_id",order.id);
  if(factsResult.error)return json({error:"financial_facts_lookup_failed"},500);
  let paid=0;
  for(const fact of factsResult.data??[]){
    const amount=Number(fact.amount_minor??0);
    if(fact.fact_type==="PAYMENT_RECORDED")paid+=amount;
    else if(fact.fact_type==="PAYMENT_REVERSED"||fact.fact_type==="REFUND_RECORDED")paid-=amount;
  }
  paid=Math.max(paid,0);
  if(paid>=entry)return json({error:"entry_already_paid",paid_minor:paid,balance_minor:Math.max(total-paid,0)},409);
  let amount=Math.min(entry-paid,total-paid);
  if(amount<=0)return json({error:"invalid_charge_amount"},409);

  const reservationResult=await db.rpc("ensure_order_reservation_for_payment",{_order_id:order.id});
  if(reservationResult.error)return json({error:"reservation_prepare_failed",details:reservationResult.error.message},500);
  const reservationId=reservationResult.data?.reservation_id??null;

  const chargeLookup=await db.from("payment_charges").select("*").eq("order_id",order.id).eq("provider","mercado_pago").eq("installment_number",1).in("status",["draft","pending","processing"]).order("created_at",{ascending:false}).limit(20);
  if(chargeLookup.error)return json({error:"charge_lookup_failed"},500);
  let charge=(chargeLookup.data??[]).find((candidate:any)=>candidate?.metadata?.environment===paymentEnv&&candidate?.metadata?.commercial_terms_version===cfg.commercial_terms_version)??null;

  if(!charge){
    const ref="cobs_ts_"+String(order.id).replaceAll("-","")+"_i1_"+Date.now();
    const created=await db.from("payment_charges").insert({
      tenant_id:order.tenant_id,order_id:order.id,reservation_id:reservationId,provider:"mercado_pago",status:"draft",currency:"BRL",
      amount_minor:amount,installment_number:1,installment_count:2,due_at:null,external_reference:ref,description:"Team Seffrin Brasília 2027 — entrada",
      metadata:{environment:paymentEnv,source:"team_seffrin_public_checkout",settlement_authority:"webhook",commercial_payment_stage:"entry",commercial_terms_version:cfg.commercial_terms_version,paid_before_minor:paid}
    }).select("*").single();
    if(created.error)return json({error:"charge_create_failed",details:created.error.message},500);
    charge=created.data;
  }

  amount=Number(charge.amount_minor);
  const attemptLookup=await db.from("payment_attempts").select("*").eq("charge_id",charge.id).eq("provider","mercado_pago").eq("method","pix").in("status",["created","pending","processing"]).order("created_at",{ascending:false}).limit(20);
  if(attemptLookup.error)return json({error:"attempt_lookup_failed"},500);
  let attempt=(attemptLookup.data??[]).find((candidate:any)=>candidate?.metadata?.environment===paymentEnv)??null;
  if(attempt?.provider_order_id&&(attempt.pix_qr_code||attempt.pix_ticket_url)){
    return json({order_id:order.id,charge_id:charge.id,attempt_id:attempt.id,amount_minor:amount,stage:"entry",status:attempt.status,pix:{qr_code:attempt.pix_qr_code,qr_code_base64:attempt.pix_qr_code_base64,ticket_url:attempt.pix_ticket_url},reused:true,environment:paymentEnv});
  }

  if(!attempt){
    const idempotencyKey=crypto.randomUUID();
    const value=(amount/100).toFixed(2);
    const payer=paymentEnv==="test"?{email:"test_user_br@testuser.com",first_name:"APRO"}:{email};
    const requestSnapshot={type:"online",total_amount:value,external_reference:charge.external_reference,processing_mode:"automatic",transactions:{payments:[{amount:value,payment_method:{id:"pix",type:"bank_transfer"}}]},payer};
    const created=await db.from("payment_attempts").insert({tenant_id:order.tenant_id,charge_id:charge.id,provider:"mercado_pago",method:"pix",status:"created",amount_minor:amount,idempotency_key:idempotencyKey,request_snapshot:requestSnapshot,metadata:{environment:paymentEnv,source:"team_seffrin_public_checkout",settlement_authority:"webhook",installment_number:1}}).select("*").single();
    if(created.error)return json({error:"attempt_create_failed",details:created.error.message},500);
    attempt=created.data;
  }

  let providerResponse:Response;
  try{
    providerResponse=await fetch("https://api.mercadopago.com/v1/orders",{method:"POST",headers:{accept:"application/json","content-type":"application/json",authorization:"Bearer "+mpToken,"x-idempotency-key":attempt.idempotency_key},body:JSON.stringify(attempt.request_snapshot)});
  }catch{return json({error:"mercado_pago_network_error",attempt_id:attempt.id},502)}

  const provider=await providerResponse.json().catch(()=>({}));
  if(!providerResponse.ok){
    await db.from("payment_attempts").update({status:"rejected",provider_status:"request_error",response_snapshot:provider}).eq("id",attempt.id);
    return json({error:"mercado_pago_error",status:providerResponse.status,attempt_id:attempt.id},502);
  }

  const payment=provider?.transactions?.payments?.[0]??{};
  const method=payment?.payment_method??{};
  const providerStatus=payment?.status??provider?.status??null;
  const providerDetail=payment?.status_detail??provider?.status_detail??null;
  const attemptStatus=mapStatus(providerStatus,providerDetail);
  const completedAt=new Date().toISOString();
  await db.from("payment_attempts").update({status:attemptStatus,provider_order_id:provider?.id??null,provider_payment_id:payment?.id??null,provider_status:providerStatus,provider_status_detail:providerDetail,pix_qr_code:method?.qr_code??null,pix_qr_code_base64:method?.qr_code_base64??null,pix_ticket_url:method?.ticket_url??null,response_snapshot:provider,...(attemptStatus==="approved"?{approved_at:completedAt}:{})}).eq("id",attempt.id);
  const chargeStatus=attemptStatus==="approved"||attemptStatus==="processing"?"processing":"pending";
  await db.from("payment_charges").update({status:chargeStatus,provider_order_id:provider?.id??null}).eq("id",charge.id);

  return json({order_id:order.id,charge_id:charge.id,attempt_id:attempt.id,amount_minor:amount,stage:"entry",status:attemptStatus,pix:{qr_code:method?.qr_code??null,qr_code_base64:method?.qr_code_base64??null,ticket_url:method?.ticket_url??null},reused:false,environment:paymentEnv,confirmed:false,awaiting_webhook:attemptStatus==="approved"},201);
});