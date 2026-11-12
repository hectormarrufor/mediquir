'use client';

import { useQuery } from '@tanstack/react-query';

// Catálogo público y categorías de la tienda. Todas las secciones de la portada usan estos dos hooks:
// React Query comparte la respuesta entre ellas, así que cada uno es UNA sola petición por visita.
export function useCatalogo() {
    return useQuery({
        queryKey: ['productos-landing'],
        staleTime: 60_000,
        queryFn: async () => {
            const res = await fetch('/api/productos');
            if (!res.ok) throw new Error('Error al cargar productos');
            return res.json();
        },
    });
}

export function useCategorias() {
    return useQuery({
        queryKey: ['categorias-landing'],
        staleTime: 5 * 60_000,
        queryFn: async () => {
            const res = await fetch('/api/categorias');
            if (!res.ok) throw new Error('Error al cargar categorías');
            return res.json();
        },
    });
}
