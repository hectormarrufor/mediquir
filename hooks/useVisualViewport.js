'use client';

import { useEffect, useState } from 'react';

// Área realmente visible de la pantalla. Cuando sale el teclado en Android/iOS el área visible se encoge
// (en iOS además la página se desplaza), así que un modal centrado con `centered` queda tapado.
// Devuelve { height, top } para fijar el contenedor del modal a esa área; null si no aplica (escritorio o sin soporte).
export default function useVisualViewport(activo = true) {
    const [vv, setVv] = useState(null);
    useEffect(() => {
        if (!activo || typeof window === 'undefined' || !window.visualViewport) { setVv(null); return undefined; }
        const v = window.visualViewport;
        const actualizar = () => {
            // Solo hay que ajustar cuando el teclado achica el área; sin teclado se deja el comportamiento normal
            const conTeclado = window.innerHeight - v.height > 100;
            setVv(conTeclado ? { height: v.height, top: v.offsetTop } : null);
        };
        actualizar();
        v.addEventListener('resize', actualizar);
        v.addEventListener('scroll', actualizar);
        return () => { v.removeEventListener('resize', actualizar); v.removeEventListener('scroll', actualizar); };
    }, [activo]);
    return vv;
}
