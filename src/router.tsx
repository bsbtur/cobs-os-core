import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { observeError } from "./lib/observability";

export const getRouter = () => {
  // M4 observability: every backend read/command failure crosses one of these two
  // caches, so this is the single sanitized choke point for backend failure signals.
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        observeError(error, { action: `query:${String(query.queryKey?.[0] ?? "unknown")}` });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        observeError(error, {
          action: `command:${String(mutation.options.mutationKey?.[0] ?? "unknown")}`,
        });
      },
    }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
