import classes from './landing.module.css';

// El latido del logo de Mediquir, en pequeño: acompaña los rótulos de cada sección.
export default function Pulso({ className = classes.pulso }) {
    return (
        <svg className={className} viewBox="0 0 26 12" fill="none" aria-hidden="true">
            <path d="M0 7h7l2-2 2 2h1.5l2-6.5 3 10 2-3.5H26" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// Trazo de electrocardiograma a todo lo ancho (encabezado y llamado final). Vuelve siempre a la línea base.
const COMPLEJO = 'l14 -9 l12 9 h14 l7 9 l11 -92 l12 118 l9 -35 h20 l16 -18 l18 18';
export const TRAZA_ECG = `M0 120 H250 ${COMPLEJO} H800 ${COMPLEJO} H1180 ${COMPLEJO} H1440`;
