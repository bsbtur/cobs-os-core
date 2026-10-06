import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const P=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")??"{}");
const S=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}");
const publishableKey=P.default;
const secretKey=S.default;
const CODE="TEAM-SEFFRIN-BSB-20270416";
const cors={"access-control-allow-origin":"*","access-control-allow-headers":"authorization, content-type, x-client-info, apikey, x-team-seffrin-qa, x-team-seffrin-qa-ts, x-team-seffrin-qa-signature","access-control-allow-methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json; charset=utf-8"}});
const hex=(buffer:ArrayBuffer)=>[...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,"0")).join("");
const sha256=async(value:string)=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
const QA_PUBLIC_KEY_SPKI_B64="MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE0pVsgjDyKSsGOjuaaQH0r9/P9ycykh5XaomY7aVdiPefg/NzVlvhkJKlDp5w58v6ZxDAY0+lO+BLJN5+7dMcNA==";
const b64Bytes=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const verifySignedPreview=async(raw:string,ts:string|null,signature:string|null)=>{
  if(!ts||!signature)return false;
  const stamp=Number(ts);
  if(!Number.isFinite(stamp)||Math.abs(Date.now()-stamp)>5*60*1000)return false;
  try{
    const key=await crypto.subtle.importKey("spki",b64Bytes(QA_PUBLIC_KEY_SPKI_B64),{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
    return await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,b64Bytes(signature),new TextEncoder().encode(ts+"."+raw));
  }catch{return false}
};
const normalizePhone=(value?:string)=>{
  if(!value)return null;
  const raw=value.trim();
  const digits=raw.replace(/\D/g,"");
  if(!raw)return null;
  if(raw.startsWith("+")&&digits.length>=8&&digits.length<=15)return "+"+digits;
  if(digits.length===10||digits.length===11)return "+55"+digits;
  return raw;
};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  if(!secretKey)return json({error:"server_not_configured"},500);

  let rawBody="";
  let body:any;
  try{
    rawBody=await req.text();
    body=JSON.parse(rawBody);
  }catch{return json({error:"invalid_json"},400)}

  const fullName=String(body.full_name??"").trim();
  const email=String(body.email??"").trim().toLowerCase();
  const phone=normalizePhone(body.phone);
  const idempotencyKey=String(body.idempotency_key??crypto.randomUUID()).trim();

  if(fullName.length<2||fullName.length>120)return json({error:"invalid_full_name"},400);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return json({error:"invalid_email"},400);
  if(phone&&!/^\+[1-9][0-9]{7,14}$/.test(phone))return json({error:"invalid_phone"},400);
  if(idempotencyKey.length<16||idempotencyKey.length>120)return json({error:"invalid_idempotency_key"},400);
  if(body.terms_accepted!==true)return json({error:"terms_acceptance_required"},400);

  const admin=createClient(SUPABASE_URL,secretKey,{auth:{persistSession:false}});
  const {data:op,error:opError}=await admin.from("operations").select("id,tenant_id,code,status,archived_at").eq("code",CODE).is("archived_at",null).maybeSingle();
  if(opError)return json({error:"operation_lookup_failed"},500);
  if(!op)return json({error:"operation_not_found"},404);

  const {data:cfg,error:cfgError}=await admin.from("operation_commercial_configs").select("operation_id,tenant_id,offering_id,status,sales_public,commercial_terms_version,cancellation_policy_version,entry_minor,balance_minor,balance_card_installments_max,card_installment_fees_paid_by_customer").eq("operation_id",op.id).eq("tenant_id",op.tenant_id).maybeSingle();
  if(cfgError)return json({error:"commercial_config_lookup_failed"},500);
  if(!cfg||cfg.status!=="active")return json({error:"checkout_not_configured"},409);

  if(body.commercial_terms_version!==cfg.commercial_terms_version)return json({error:"commercial_terms_version_mismatch",expected:cfg.commercial_terms_version},409);
  if(body.cancellation_policy_version!==cfg.cancellation_policy_version)return json({error:"cancellation_policy_version_mismatch",expected:cfg.cancellation_policy_version},409);

  let allowClosed=false;
  let qaMode=false;

  if(cfg.sales_public!==true){
    const qaHeader=req.headers.get("x-team-seffrin-qa");
    if(qaHeader==="signed-preview"){
      const valid=await verifySignedPreview(rawBody,req.headers.get("x-team-seffrin-qa-ts"),req.headers.get("x-team-seffrin-qa-signature"));
      if(!valid)return json({error:"qa_signed_preview_forbidden"},403);
      allowClosed=true;
      qaMode=true;
    }else{
      if(qaHeader!=="1")return json({error:"sales_not_open"},409);
      if(!publishableKey)return json({error:"qa_auth_not_configured"},500);
      const authHeader=req.headers.get("authorization");
      if(!authHeader)return json({error:"qa_preview_not_allowed"},403);
      const userClient=createClient(SUPABASE_URL,publishableKey,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false}});
      const {data:authData,error:authError}=await userClient.auth.getUser();
      if(authError||!authData.user)return json({error:"qa_invalid_session"},401);
      const {data:membership,error:membershipError}=await admin.from("memberships").select("role,status").eq("tenant_id",op.tenant_id).eq("profile_id",authData.user.id).eq("status","active").maybeSingle();
      if(membershipError)return json({error:"qa_membership_check_failed"},500);
      if(!membership||!["owner","admin","operations_agent"].includes(membership.role))return json({error:"qa_forbidden"},403);
      allowClosed=true;
      qaMode=true;
    }
  }

  const tokenBytes=crypto.getRandomValues(new Uint8Array(32));
  const checkoutToken=[...tokenBytes].map(x=>x.toString(16).padStart(2,"0")).join("");
  const tokenHash=await sha256(checkoutToken);

  const {data,error}=await admin.rpc("create_public_checkout_order_v2",{
    _operation_code:CODE,
    _full_name:fullName,
    _email:email,
    _phone_e164:phone,
    _checkout_token_hash:tokenHash,
    _idempotency_key:idempotencyKey,
    _allow_closed:allowClosed
  });
  if(error)return json({error:"checkout_order_failed",details:error.message},409);

  return json({
    ...data,
    checkout_token:checkoutToken,
    payer_email:email,
    checkout_key:"team_seffrin_2027",
    qa_mode:qaMode,
    commercial_acceptance:{
      commercial_terms_version:cfg.commercial_terms_version,
      cancellation_policy_version:cfg.cancellation_policy_version,
      accepted_at:new Date().toISOString()
    },
    payment_plan:{
      entry_minor:Number(cfg.entry_minor),
      balance_minor:Number(cfg.balance_minor),
      balance_card_installments_max:Number(cfg.balance_card_installments_max),
      card_installment_fees_paid_by_customer:cfg.card_installment_fees_paid_by_customer===true
    }
  },data?.reused===true?200:201);
});