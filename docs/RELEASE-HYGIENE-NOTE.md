# COBS OS — Release hygiene note

Environment-specific configuration must not be committed in `.env` files. Use `.env.example` for variable names/placeholders and configure real values in the deployment environment.

Public/publishable client configuration is not treated as a secret, but keeping environment-specific values outside version control reduces configuration drift and avoids normalizing unsafe secret-handling practices.
