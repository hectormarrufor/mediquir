'use client';

import { useEffect } from 'react';

// Se usa UNA sola vez (en ClientLayout). Cuando el teclado de Android/iOS achica el área visible, marca <html data-teclado>
// y publica --vv-height / --vv-top; global.css con eso centra todos los modales en el área visible, sin tocar cada uno.
export default function useVisualViewport() {
    useEffect(() => {
        const v = typeof window !== 'undefined' ? window.visualViewport : null;
        if (!v) return undefined;
        const root = document.documentElement;
        const actualizar = () => {
            if (window.innerHeight - v.height > 100) {
                root.setAttribute('data-teclado', '');
                root.style.setProperty('--vv-height', `${v.height}px`);
                root.style.setProperty('--vv-top', `${v.offsetTop}px`);
            } else {
                root.removeAttribute('data-teclado');
            }
        };
        actualizar();
        v.addEventListener('resize', actualizar);
        v.addEventListener('scroll', actualizar);
        return () => { v.removeEventListener('resize', actualizar); v.removeEventListener('scroll', actualizar); actualizar(); };
    }, []);
}
