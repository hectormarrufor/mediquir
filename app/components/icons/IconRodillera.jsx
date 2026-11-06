import React from 'react';

// Rodillera: pierna con la banda de la rodilla, el hueco de la rótula y tiras de velcro.
// Mismo contrato que los iconos de Tabler (size, stroke, color = currentColor) para usarse en ThemeIcon.
export default function IconRodillera({ size = 24, stroke = 1.5, color = 'currentColor', ...props }) {
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
            {/* Muslo y pierna */}
            <path d="M8.6 2.5l-.4 5M15.4 2.5l.4 5M8.2 16.5l.2 5M15.8 16.5l-.2 5" />
            {/* Banda de la rodillera */}
            <path d="M7.6 7.5h8.8l.8 9H6.8z" />
            {/* Hueco de la rótula */}
            <circle cx="12" cy="12" r="2.1" />
            {/* Tiras de velcro */}
            <path d="M7.3 10h1.6M15.1 10h1.6M7.1 14.4h1.6M15.3 14.4h1.6" />
        </svg>
    );
}
