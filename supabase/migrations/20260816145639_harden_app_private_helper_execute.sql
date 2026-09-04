revoke execute on function app_private.assert_operation_not_closed(uuid) from public, anon, authenticated;
revoke execute on function app_private.blueprint_checksum(uuid) from public, anon, authenticated;
revoke execute on function app_private.blueprint_require_role(uuid, text[]) from public, anon, authenticated;
revoke execute on function app_private.blueprint_version_ctx(uuid, text[]) from public, anon, authenticated;
revoke execute on function app_private.guard_closed_operation_child() from public, anon, authenticated;
revoke execute on function app_private.guard_closed_operation_role_assignment() from public, anon, authenticated;