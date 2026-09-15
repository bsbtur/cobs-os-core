// Frontend lock for CIOSP 2027 public sales. Default: CLOSED.
// Only the exact value "true" opens the public reservation UI; a missing or
// different value means closed (fail-closed).
// This flag never overrides the backend: `sales_public` remains the sovereign
// gate and the checkout/Pix functions must keep rejecting when sales are closed.
export const CIOSP_PUBLIC_SALES_OPEN = import.meta.env.VITE_CIOSP_PUBLIC_SALES_OPEN === "true";
