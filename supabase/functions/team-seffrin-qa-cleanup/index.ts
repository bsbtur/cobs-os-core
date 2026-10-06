import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const S=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}");
const secretKey=S.default;
const cors={"access-control-allow-origin":"*","access-control-allow-headers":"content-type, x-client-info, apikey, authorization","access-control-allow-methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");
const sha256=async(v:string)=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)));

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  if(!secretKey||!SUPABASE_URL.includes("nktohbqmcpgonlizzcka"))return json({error:"qa_cleanup_not_available"},403);

  let body:any;
  try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const orderId=String(body.order_id??"").trim();
  const checkoutToken=String(body.checkout_token??"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(orderId)||checkoutToken.length!==64)return json({error:"invalid_request"},400);

  const db=createClient(SUPABASE_URL,secretKey,{auth:{persistSession:false}});
  const tokenHash=await sha256(checkoutToken);
  const {data:session,error:sessionError}=await db.from("public_checkout_sessions")
    .select("id,order_id,status,expires_at")
    .eq("order_id",orderId).eq("token_hash",tokenHash).maybeSingle();
  if(sessionError)return json({error:"session_lookup_failed"},500);
  if(!session)return json({error:"checkout_session_invalid"},403);

  const {data,error}=await db.rpc("cleanup_team_seffrin_qa_order",{_order_id:orderId});
  if(error){
    const msg=String(error.message||"");
    if(msg.includes("recorded financial facts"))return json({error:"qa_cleanup_financial_facts_exist"},409);
    return json({error:"qa_cleanup_failed",details:msg},409);
  }
  return json({ok:true,...data},200);
});
