// app/providers/ReactQueryProvider.tsx  (o lib/ReactQueryProvider.tsx)
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// import { ReactQueryDevtools } from "@tanstack/react-query-devtools"; // opcional, pero muy útil
import { useState } from "react";

export default function ReactQueryProvider({ children }) {
  // Crea el client una sola vez por montaje (evita recrearlo en cada render)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Configuraciones útiles para tu caso
            staleTime: 1000 * 60 * 5, // 5 minutos
            gcTime: 1000 * 60 * 30,   // 30 minutos
            retry: 1,                 // reintenta 1 vez si falla
            refetchOnWindowFocus: false, // no refetch al volver a la pestaña (útil en móvil)
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Opcional: activa devtools solo en desarrollo */}
      {/* {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />} */}
    </QueryClientProvider>
  );
}