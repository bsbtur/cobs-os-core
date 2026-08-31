# Usage limits

Daily per-user question limits are intentionally not implemented in this frontend increment. Enforce future limits server-side in `assistant_submit_message` or an equivalent authoritative policy; never rely on a browser-only counter.
