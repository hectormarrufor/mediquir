// hooks/useCatalogOptions.js
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function useCatalogOptions(catalogo, tipo) {
  const queryClient = useQueryClient();
  
  // React Query usa esta llave para saber si ya buscó esta data antes
  const queryKey = ['catalogo', catalogo, tipo];

  const { data: options = [], isLoading: loading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!catalogo) return [];
      const res = await fetch(`/api/inventario/catalogo/${catalogo}${tipo ? `?tipo=${tipo}` : ''}`);
      if (!res.ok) throw new Error("Error fetching catalog options");
      const data = await res.json();
      return Array.isArray(data.data) ? data.data : [];
    },
    // 🔥 MAGIA: Los catálogos casi nunca cambian. Los guardamos en RAM por 30 minutos.
    staleTime: 1000 * 60 * 30, 
    enabled: !!catalogo
  });

  // Simulamos el comportamiento del "setOptions" original para que tu 
  // componente no se rompa al intentar añadir un item nuevo al vuelo
  const setOptionsProxy = (updater) => {
    queryClient.setQueryData(queryKey, updater);
  };

  return { options, loading, setOptions: setOptionsProxy };
}