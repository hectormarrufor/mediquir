'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

// «Atrás» como en el explorador de archivos de Windows: regresa a la pantalla de donde vengo (el historial), no a la «carpeta de arriba».
// `respaldo` es solo para cuando no hay historial (se abrió la pantalla directo desde un enlace o pestaña nueva): ahí sí va a la pantalla superior.
export function useVolver(respaldo = '/superuser') {
    const router = useRouter();
    return useCallback(() => {
        if (typeof window !== 'undefined' && window.history.length > 1) router.back();
        else router.push(respaldo);
    }, [router, respaldo]);
}
