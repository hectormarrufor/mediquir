'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const numero = (v, def) => {
    const n = parseInt(v, 10);
    return Number.isInteger(n) && n > 0 ? n : def;
};

// Todo el estado de la lista (página, filtros, orden) vive en la URL: se puede compartir un enlace,
// el botón "atrás" del navegador funciona y al recargar no se pierde nada.
export function useInventarioParams() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const params = useMemo(() => {
        const g = (k) => searchParams.get(k) || '';
        return {
            page: numero(g('page'), 1),
            pageSize: numero(g('pageSize'), 50),
            q: g('q'),
            categoriaId: g('categoriaId'),
            marcaId: g('marcaId'),
            grupoId: g('grupoId'),
            tagId: g('tagId'),
            oferta: g('oferta'),
            stock: g('stock'),
            sort: g('sort') || 'updatedAt',
            dir: g('dir') === 'asc' ? 'asc' : 'desc',
        };
    }, [searchParams]);

    // cambios: { clave: valor }. Un valor vacío quita el parámetro. Cambiar un filtro vuelve a la página 1.
    const setParams = useCallback((cambios, { resetPage = true } = {}) => {
        const next = new URLSearchParams(searchParams.toString());
        Object.entries(cambios).forEach(([k, v]) => {
            if (v === null || v === undefined || v === '' || v === false) next.delete(k);
            else next.set(k, String(v));
        });
        if (resetPage && !('page' in cambios)) next.delete('page');
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [searchParams, router, pathname]);

    const hayFiltros = Boolean(params.q || params.categoriaId || params.marcaId || params.grupoId || params.tagId || params.oferta || params.stock);

    const limpiarFiltros = useCallback(() => {
        const next = new URLSearchParams();
        ['pageSize', 'sort', 'dir'].forEach((k) => searchParams.get(k) && next.set(k, searchParams.get(k)));
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [searchParams, router, pathname]);

    return { params, setParams, hayFiltros, limpiarFiltros };
}

// Convierte los parámetros en query string para la API
export const aQueryString = (params) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) qs.set(k, String(v)); });
    return qs.toString();
};
