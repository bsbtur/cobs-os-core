# Router context

The portal feature consumes the existing Assistant Router indirectly through the automation outbox. It must not call the n8n webhook directly and must not duplicate Router prompt policy in frontend code.
