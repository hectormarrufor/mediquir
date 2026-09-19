import { useEffect, useState } from 'react';
import { IconHome, IconCategory2, IconShoppingBag, IconPhone } from '@tabler/icons-react';

// Enlaces del sitio público. `target` es el id de la sección de la landing a la que se desplaza.
export const PUBLIC_LINKS = [
    { key: 'inicio', label: 'Inicio', icon: IconHome, target: null },
    { key: 'especialidades', label: 'Especialidades', icon: IconCategory2, target: 'especialidades' },
    { key: 'catalogo', label: 'Catálogo', icon: IconShoppingBag, target: 'productos-section' },
    { key: 'contacto', label: 'Contacto', icon: IconPhone, target: 'contacto' },
];

export const SPY_IDS = PUBLIC_LINKS.map((l) => l.target).filter(Boolean);

// Desplaza a la sección si ya estamos en la landing; si no, navega a "/#seccion".
export function goToLink(router, pathname, link) {
    if (pathname === '/') {
        if (!link.target) window.scrollTo({ top: 0, behavior: 'smooth' });
        else document.getElementById(link.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        router.push(link.target ? `/#${link.target}` : '/');
    }
}

// Devuelve el id de la sección visible (o null si estamos arriba del todo).
export function useScrollSpy(ids, enabled) {
    const [active, setActive] = useState(null);

    useEffect(() => {
        if (!enabled) {
            setActive(null);
            return undefined;
        }
        const elements = ids.map((id) => document.getElementById(id)).filter(Boolean);
        if (elements.length === 0) return undefined;

        const observer = new IntersectionObserver(
            (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
            { rootMargin: '-35% 0px -55% 0px' }
        );
        elements.forEach((el) => observer.observe(el));

        const onScroll = () => { if (window.scrollY < 120) setActive(null); };
        window.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            observer.disconnect();
            window.removeEventListener('scroll', onScroll);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, ids.join('|')]);

    return active;
}
