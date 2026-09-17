# Provider-call checkpoint

The action that first sends an HTTP request to Mercado Pago using LIVE credentials is the money-moving boundary. It must not be triggered by migration, deploy, CI, page load, scheduler or automatic smoke test. It requires a deliberate post-deploy invocation after explicit approval for the BRL 1.00 charge.
