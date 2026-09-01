# Assistant Reservation Context V1 — QA

Expected authenticated traveler question:

`Minha reserva para a viagem está confirmada?`

Expected facts available to the Router for the QA traveler:

- reservation.status = `confirmed`
- reservation.order_status = `confirmed`
- reservation.quantity = `1`
- reservation.package_name = `Caravana Completa CIOSP 2027`

The reply must not infer payment status, hotel confirmation, price, or schedule from these reservation facts.
