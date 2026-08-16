import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isOperationClosed, operationEmptyBody } from "./operation-lock";
const read=(p:string)=>readFileSync(p,"utf8");
describe("PILOT-03 post-completion hardening",()=>{
 test("closed lifecycle",()=>{expect(isOperationClosed("completed")).toBe(true);expect(isOperationClosed("cancelled")).toBe(true);expect(isOperationClosed("active")).toBe(false)});
 test("lifecycle-aware empty copy",()=>{expect(operationEmptyBody(true,"pt-BR","Histórico","Historical","Criar")).toBe("Histórico");expect(operationEmptyBody(false,"pt-BR","Histórico","Historical","Criar")).toBe("Criar")});
 test("schedule controls are closed-gated",()=>{const s=read("src/routes/_authenticated/operations.$operationId.schedule.tsx");expect(s).toContain("!operationClosed && own && assignment.status");expect(s).toContain("!operationClosed && canManage &&")});
 test("server guard covers staff assignment updates",()=>{const s=read("supabase/migrations/20260815211500_px12_7_closed_operation_read_only_guards.sql");expect(s).toContain("trg_closed_op_staff_assignments");expect(s).toContain("before insert or update or delete on public.operation_staff_assignments");expect(s).toContain("assert_operation_not_closed")});
 test("live attention stops for closed operation",()=>{const s=read("src/components/operations/operation-attention-center.tsx");expect(s).toContain("operation.isSuccess && !operationClosed");expect(s).toContain("if (!isLive || operationClosed) return null")});
 test("historical modules use shared empty copy",()=>{for(const p of ["src/routes/_authenticated/operations.$operationId.mobility.tsx","src/routes/_authenticated/operations.$operationId.hospitality.tsx","src/routes/_authenticated/operations.$operationId.events.tsx","src/routes/_authenticated/operations.$operationId.communication.tsx"])expect(read(p)).toContain("operationEmptyBody(")});
});
