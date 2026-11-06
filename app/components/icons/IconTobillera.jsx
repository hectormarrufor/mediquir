import React from 'react';

// Tobillera: pierna y pie con la banda de soporte y la correa cruzada sobre el tobillo.
// Mismo contrato que los iconos de Tabler (size, stroke, color = currentColor) para usarse en ThemeIcon.
export default function IconTobillera({ size = 24, stroke = 1.5, color = 'currentColor', ...props }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            {...props}
        >
            {/* Pierna */}
            <path d="M9 3v5.5M14.5 3v5.5" />
            {/* Banda del tobillo */}
            <path d="M8.3 8.5h6.9l.3 6H8z" />
            {/* Correa cruzada */}
            <path d="M8.2 11.2l7.1 1.8" />
            {/* Pie */}
            <path d="M8 14.5l-2.8 3c-.9.9-.6 2.5.9 2.5H18c1.2 0 2-.8 2-1.8 0-1.2-1-1.8-2-2.2l-2.5-1.3" />
        </svg>
    );
}
