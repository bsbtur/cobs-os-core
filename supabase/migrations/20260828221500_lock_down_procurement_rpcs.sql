revoke execute on function public.create_operation_quote(uuid,text,text,text,bigint,date,text,text) from public, anon;
revoke execute on function public.select_operation_quote(uuid) from public, anon;
revoke execute on function public.update_operation_quote(uuid,text,text,text,bigint,date,text,text) from public, anon;
revoke execute on function public.delete_operation_quote(uuid) from public, anon;
revoke execute on function public.add_quote_payment_installment(uuid,date,bigint,text) from public, anon;
revoke execute on function public.contract_operation_quote(uuid,text,text) from public, anon;
revoke execute on function public.mark_quote_payment_paid(uuid,timestamptz) from public, anon;
revoke execute on function public.add_supplier_document(uuid,text,text,text,date,date,text) from public, anon;
revoke execute on function public.set_supplier_document_status(uuid,text) from public, anon;

grant execute on function public.create_operation_quote(uuid,text,text,text,bigint,date,text,text) to authenticated;
grant execute on function public.select_operation_quote(uuid) to authenticated;
grant execute on function public.update_operation_quote(uuid,text,text,text,bigint,date,text,text) to authenticated;
grant execute on function public.delete_operation_quote(uuid) to authenticated;
grant execute on function public.add_quote_payment_installment(uuid,date,bigint,text) to authenticated;
grant execute on function public.contract_operation_quote(uuid,text,text) to authenticated;
grant execute on function public.mark_quote_payment_paid(uuid,timestamptz) to authenticated;
grant execute on function public.add_supplier_document(uuid,text,text,text,date,date,text) to authenticated;
grant execute on function public.set_supplier_document_status(uuid,text) to authenticated;
