import { createFileRoute, Outlet } from "@tanstack/react-router";

/** COBS OS · W10 — Traveler Portal subtree. Participant surfaces only. */
export const Route = createFileRoute("/_authenticated/my")({
  component: () => <Outlet />,
});
