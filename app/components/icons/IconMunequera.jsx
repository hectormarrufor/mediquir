import React from 'react';

// Muñequera: mano saliendo de una banda ancha con hueco para el pulgar y tiras de velcro.
// Mismo contrato que los iconos de Tabler (size, stroke, color = currentColor) para usarse en ThemeIcon.
export default function IconMunequera({ size = 24, stroke = 1.5, color = 'currentColor', ...props }) {
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
            {/* Dedos */}
            <path d="M8 8.5V4.2M10.7 8.5V3M13.3 8.5V3M16 8.5V4.2" />
            {/* Banda de la muñequera */}
            <path d="M6.5 8.5h11l.8 11h-12.6z" />
            {/* Hueco del pulgar */}
            <ellipse cx="14.8" cy="12.2" rx="1.5" ry="1" />
            {/* Tira de velcro */}
            <path d="M6.2 16.3h11.6" />
        </svg>
    );
}
