import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { paymentEnvironment, orderEnvironmentMatches, paymentPlan } from "../_shared/ciosp-payment-policy.ts";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type,apikey,x-client-info,x-checkout-token", "access-control-allow-methods": "POST,OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
const hash = async (token: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))].map(x => x.toString(16).padStart(2,"0")).join("");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
  if (req.method !== "POST") return json({error:"method_not_allowed"},405);
  const environment=paymentEnvironment(Deno.env.get("MERCADO_PAGO_ENVIRONMENT"));
  const key=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}").default;
  if(!key || !environment)return json({error:"server_not_configured"},500);
  let input: {order_id?: unknown; resume?: unknown};
  try{input=await req.json();}catch{return json({error:"invalid_json"},400);}
  if(!input || typeof input.order_id!=="string" || !/^[0-9a-f-]{36}$/i.test(input.order_id))return json({error:"invalid_order_id"},400);
  const db=createClient(Deno.env.get("SUPABASE_URL")!,key,{auth:{persistSession:false}});
  const {data:order,error:oe}=await db.from("orders").select("id,tenant_id,operation_id,buyer_person_id,status,grand_total_minor,currency,metadata").eq("id",input.order_id).maybeSingle();
  if(oe)return json({error:"status_unavailable"},500);
  // Do not reveal whether an order exists until possession/ownership is proven.
  if(!order)return json({error:"checkout_access_denied"},403);
  const {data:session,error:se}=await db.from("public_checkout_sessions").select("id,status,token_hash,expires_at").eq("order_id",order.id).eq("tenant_id",order.tenant_id).maybeSingle();
  if(se)return json({error:"status_unavailable"},500);
  if(!session || session.status==="revoked")return json({error:"checkout_access_denied"},403);
  const token=req.headers.get("x-checkout-token")??"";
  const tokenValid=/^[0-9a-f]{64}$/i.test(token) && ["active","consumed"].includes(session.status) && new Date(session.expires_at).getTime()>Date.now() && await hash(token)===session.token_hash;
  let owner=false;
  if(!tokenValid || input.resume===true){
    const bearer=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
    if(bearer){
      const {data:auth,error:ae}=await db.auth.getUser(bearer);
      if(!ae && auth.user){
        const {data:person,error:pe}=await db.from("people").select("profile_id").eq("id",order.buyer_person_id).eq("tenant_id",order.tenant_id).maybeSingle();
        if(pe)return json({error:"status_unavailable"},500);
        owner=person?.profile_id===auth.user.id;
        if(environment==="test" && order.metadata?.qa_public_checkout===true){
          const {data:member,error:me}=await db.from("memberships").select("role").eq("tenant_id",order.tenant_id).eq("profile_id",auth.user.id).eq("status","active").maybeSingle();
          if(me)return json({error:"status_unavailable"},500);
          owner=Boolean(member && ["owner","admin","operations_agent"].includes(member.role));
        }
      }
    }
  }
  if(input.resume===true ? !owner : !tokenValid && !owner)return json({error:"checkout_access_denied"},403);
  if(!orderEnvironmentMatches(order.metadata??{},environment))return json({error:"order_environment_mismatch"},409);
  const {data:operation,error:opError}=await db.from("operations").select("code").eq("id",order.operation_id).eq("tenant_id",order.tenant_id).maybeSingle();
  if(opError)return json({error:"status_unavailable"},500);
  if(operation?.code!=="CIOSP-SP-2027")return json({error:"checkout_access_denied"},403);
  const {data:facts,error:fe}=await db.from("financial_facts").select("fact_type,amount_minor").eq("tenant_id",order.tenant_id).eq("order_id",order.id);
  if(fe)return json({error:"status_unavailable"},500);
  const paid=Math.max(0,(facts??[]).reduce((sum,f)=>sum+(f.fact_type==="PAYMENT_RECORDED"?Number(f.amount_minor):["PAYMENT_REVERSED","REFUND_RECORDED"].includes(f.fact_type)?-Number(f.amount_minor):0),0));
  let plan;
  try{plan=paymentPlan(order.metadata?.commercial_snapshot?.payment_schedule_v1,Number(order.grand_total_minor),paid);}catch{return json({error:"payment_schedule_invalid"},409);}
  let renewed: string | undefined;
  if(input.resume===true){
    if(!["submitted","confirmed"].includes(order.status) || !plan.next)return json({error:"order_not_payable"},409);
    renewed=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,"0")).join("");
    const {data:updated,error:ue}=await db.from("public_checkout_sessions").update({token_hash:await hash(renewed),status:"active",expires_at:new Date(Date.now()+7200000).toISOString()}).eq("id",session.id).eq("token_hash",session.token_hash).neq("status","revoked").select("id").maybeSingle();
    if(ue || !updated)return json({error:"checkout_session_changed"},409);
  }
  return json({order_id:order.id,status:order.status,currency:order.currency,total_minor:Number(order.grand_total_minor),paid_minor:paid,outstanding_minor:Math.max(0,Number(order.grand_total_minor)-paid),obligations:plan.obligations,next_amount_minor:plan.amount_minor,checkout_token:renewed});
});
