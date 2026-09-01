# Idempotency contract

Caller supplies a stable key tied to the canonical operational fact/event. The publisher searches the same tenant+operation+key before creating a message. Replay returns the existing message and delivery summary instead of creating another message.