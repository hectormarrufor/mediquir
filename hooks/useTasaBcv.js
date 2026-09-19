'use client';

import { useQuery } from '@tanstack/react-query';

// Tasa BCV del momento (Bs por dólar). Se consulta a /api/bcv, que devuelve la de hoy o la busca si aún no está guardada.
// React Query la comparte entre todos los componentes de la página (una sola petición) y la refresca cada 10 minutos.
export function useTasaBcv() {
    const { data, isLoading, isError } = useQuery({
        queryKey: ['tasa-bcv'],
        queryFn: async () => {
            const res = await fetch('/api/bcv');
            if (!res.ok) throw new Error('No se pudo obtener la tasa BCV');
            const json = await res.json();
            const tasa = Number(json.precio);
            if (!(tasa > 0)) throw new Error('Tasa BCV inválida');
            return tasa;
        },
        staleTime: 10 * 60 * 1000,
        refetchInterval: 10 * 60 * 1000,
        retry: 2,
    });
    return { tasa: data ?? null, cargando: isLoading, error: isError };
}
