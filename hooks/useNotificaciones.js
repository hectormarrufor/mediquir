'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

const KEY = ['notificaciones'];
const KEY_CONTEO = [...KEY, 'conteo'];
const KEY_LISTA = [...KEY, 'lista'];

async function getJson(url, options) {
    const res = await fetch(url, options);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.error || 'Error de red');
    return json;
}

// Contador de no leídas: una consulta barata que se refresca cada minuto (solo con la pestaña visible)
export function useUnreadCount() {
    const { isAuthenticated } = useAuth();
    return useQuery({
        queryKey: KEY_CONTEO,
        enabled: Boolean(isAuthenticated),
        staleTime: 30_000,
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
        queryFn: async () => (await getJson('/api/notificaciones?soloConteo=1')).unreadCount,
    });
}

// Lista paginada por cursor: cada página trae `limit` notificaciones y el id desde el que continuar
export function useNotificacionesLista({ filtro = 'todas', enabled = true, limit = 15 } = {}) {
    return useInfiniteQuery({
        queryKey: [...KEY_LISTA, filtro],
        enabled,
        staleTime: 15_000,
        initialPageParam: null,
        queryFn: ({ pageParam }) => {
            const params = new URLSearchParams({ limit: String(limit) });
            if (filtro === 'no-leidas') params.set('filtro', 'no-leidas');
            if (pageParam) params.set('cursor', String(pageParam));
            return getJson(`/api/notificaciones?${params}`);
        },
        getNextPageParam: (ultima) => ultima.nextCursor ?? undefined,
    });
}

// Aplana las páginas en un solo arreglo
export const aplanar = (data) => data?.pages.flatMap((p) => p.data) ?? [];

// Marca como leídas (o no leídas) una lista de ids, o todas. Actualiza la UI al instante.
export function useMarcarLeidas() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ ids, todas, leida = true }) =>
            getJson('/api/notificaciones/leer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, todas, leida }),
            }),

        onMutate: async ({ ids = [], todas, leida = true }) => {
            await queryClient.cancelQueries({ queryKey: KEY });
            const previas = queryClient.getQueriesData({ queryKey: KEY_LISTA });

            queryClient.setQueriesData({ queryKey: KEY_LISTA }, (old) => old && ({
                ...old,
                pages: old.pages.map((p) => ({
                    ...p,
                    data: p.data.map((n) => (todas || ids.includes(n.id) ? { ...n, leida } : n)),
                })),
            }));

            if (todas && leida) queryClient.setQueryData(KEY_CONTEO, 0);
            return { previas };
        },

        onError: (_err, _vars, contexto) => {
            contexto?.previas.forEach(([key, data]) => queryClient.setQueryData(key, data));
        },

        onSuccess: (respuesta) => queryClient.setQueryData(KEY_CONTEO, respuesta.unreadCount),
        // La lista "todas" ya quedó correcta con la actualización optimista; solo "sin leer" necesita refrescarse
        onSettled: () => queryClient.invalidateQueries({ queryKey: [...KEY_LISTA, 'no-leidas'] }),
    });
}

// Tras borrar una notificación (admin) refresca lista y contador
export function useInvalidarNotificaciones() {
    const queryClient = useQueryClient();
    return () => queryClient.invalidateQueries({ queryKey: KEY });
}
