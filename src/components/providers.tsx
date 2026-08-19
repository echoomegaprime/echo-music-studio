import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 8_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  const [toastReady, setToastReady] = useState(false);
  useEffect(() => setToastReady(true), []);
  return (
    <QueryClientProvider client={client}>
      {children}
      {toastReady ? (
        <Toaster
          theme="dark"
          position="bottom-center"
          toastOptions={{
            className: "!bg-surface !text-fg !border !border-border !font-sans",
          }}
        />
      ) : null}
    </QueryClientProvider>
  );
}
