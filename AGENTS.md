<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Keep the official Lovable Vite adapter so deployment output and preview integration remain compatible.
- Put supplemental SQL-derived client typings in `compat-client.ts`, reusing the generated client; never edit generated files or treat typings as proof of backend deployment.
- Keep operation Leads in its own route and board with a pure pipeline module; scope reads by tenant/user/operation and keep all mutations inside the pipeline RPC to avoid coupling to roster or payments.
