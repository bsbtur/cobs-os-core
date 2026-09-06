# Idempotency

Application lookup remains the fast path. Database partial uniqueness is the authority for concurrency. If simultaneous requests race, PostgreSQL `23505` is recovered by reading and returning the already-created live contract as an idempotent success.
