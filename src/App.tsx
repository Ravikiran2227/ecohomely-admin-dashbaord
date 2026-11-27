import type { ApiClient } from "@/api/types";
import { SessionProvider } from "@/auth/session";
import { ErrorBoundary } from "@/pages/ErrorPages";
import { AppRoutes } from "@/routes";

/** Router-agnostic root: main.tsx supplies BrowserRouter, tests supply MemoryRouter. */
export function App({ api }: { api: ApiClient }) {
  return (
    <ErrorBoundary>
      <SessionProvider api={api}>
        <AppRoutes />
      </SessionProvider>
    </ErrorBoundary>
  );
}
