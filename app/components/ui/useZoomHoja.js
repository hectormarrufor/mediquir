'use client';

import { useEffect, useState } from 'react';

// Zoom para que una hoja impresa de `anchoPx` (carta = 816 px, media carta horizontal = 768 px) quepa en el ancho de la pantalla.
// En la computadora queda en 1; en el teléfono se achica sin desplazarse de lado. Al imprimir la hoja debe anularlo (zoom: 1).
export function useZoomHoja(anchoPx, margen = 16) {
    const [zoom, setZoom] = useState(1);
    useEffect(() => {
        const ajustar = () => setZoom(Math.min(1, Math.max(0.3, (window.innerWidth - margen) / anchoPx)));
        ajustar();
        window.addEventListener('resize', ajustar);
        return () => window.removeEventListener('resize', ajustar);
    }, [anchoPx, margen]);
    return zoom;
}
