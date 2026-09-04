import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as policy from "../supabase/functions/_shared/ciosp-payment-policy.ts";

async function handler(file: string, environment: string | undefined, db: unknown) {
  const source=readFileSync(new URL(`../supabase/functions/${file}/index.ts`,import.meta.url),"utf8").replace(/^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?\s*$/gm,"");
  const runtime=globalThis as typeof globalThis & {Bun?: {Transpiler: new (options: {loader: string}) => {transformSync: (source: string) => string}}};
  const javascript=runtime.Bun ? new runtime.Bun.Transpiler({loader:"ts"}).transformSync(source) : (await import("node:module")).stripTypeScriptTypes(source);
  let result: (req: Request) => Promise<Response>;
  const env: Record<string,string|undefined>={SUPABASE_URL:"https://example.invalid",SUPABASE_SECRET_KEYS:'{"default":"test-secret"}',SUPABASE_PUBLISHABLE_KEYS:'{"default":"public-test"}',MERCADO_PAGO_ENVIRONMENT:environment};
  new Function("Deno","createClient",...Object.keys(policy),javascript)({env:{get:(key:string)=>env[key]},serve:(fn:typeof result)=>{result=fn;}},()=>db,...Object.values(policy));
  return result!;
}

function database(rows: Record<string,unknown>, user: unknown = null) {
  return {auth:{getUser:async()=>({data:{user},error:null})},from:(table:string)=>{
    const builder: Record<string,unknown>={};
    for(const method of ["select","eq","is","limit","order","in"])builder[method]=()=>builder;
    builder.maybeSingle=async()=>({data:rows[table]??null,error:null});
    builder.update=()=>{throw new Error("Unauthorized mutation");};
    builder.insert=()=>{throw new Error("Unauthorized mutation");};
    return builder;
  }};
}

test("forged preview header/name/email cannot bypass staff authentication",async()=>{
  const db=database({operations:{id:"op",tenant_id:"tenant",offering_id:"off"},offerings:{id:"off",status:"active",metadata:{sales_public:false}}});
  const run=await handler("ciosp-public-checkout","test",db);
  const response=await run(new Request("https://example.invalid",{method:"POST",headers:{"content-type":"application/json","x-ciosp-qa":"1",referer:"https://cobs-os-fake-contatobsbtur-7062s-projects.vercel.app/ciosp-2027/reserva?sales_qa=1"},body:JSON.stringify({full_name:"Person QA",email:"person@example.com.br",idempotency_key:"test-idempotency-key",terms_accepted:true,commercial_terms_version:"ciosp-2027-v1",cancellation_policy_version:"ciosp-2027-cancellation-v1"})}));
  assert.equal(response.status,401);
  assert.equal((await response.json()).error,"qa_auth_required");
});

test("public checkout in test environment still requires QA authorization when sales flag is true",async()=>{
  const db=database({operations:{id:"op",tenant_id:"tenant",offering_id:"off"},offerings:{id:"off",status:"active",metadata:{sales_public:true}}});
  const run=await handler("ciosp-public-checkout","test",db);
  const response=await run(new Request("https://example.invalid",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({full_name:"Person",email:"person@example.com",idempotency_key:"test-idempotency-key",terms_accepted:true,commercial_terms_version:"ciosp-2027-v1",cancellation_policy_version:"ciosp-2027-cancellation-v1"})}));
  assert.equal(response.status,409);
});

test("missing environment fails before any provider request",async()=>{
  const run=await handler("ciosp-public-create-pix",undefined,{});
  const response=await run(new Request("https://example.invalid",{method:"POST",body:"{}"}));
  assert.equal(response.status,500);
  assert.equal((await response.json()).error,"mercado_pago_environment_invalid");
});

test("knowing an order ID cannot read status or renew its token",async()=>{
  const id="11111111-1111-4111-8111-111111111111";
  const db=database({orders:{id,tenant_id:"tenant",buyer_person_id:"buyer"},public_checkout_sessions:{id:"session",status:"expired",expires_at:"2020-01-01",token_hash:"unknown"},people:{profile_id:"correct-user"}},{id:"wrong-user"});
  const run=await handler("ciosp-checkout-status","production",db);
  for(const resume of [false,true]){
    const response=await run(new Request("https://example.invalid",{method:"POST",headers:{authorization:"Bearer wrong-session"},body:JSON.stringify({order_id:id,resume})}));
    assert.equal(response.status,403);
  }
});
