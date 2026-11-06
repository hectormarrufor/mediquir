import React from 'react';

// Collarín cervical: cabeza apoyada sobre la banda que sostiene el cuello, con los hombros debajo.
// Mismo contrato que los iconos de Tabler (size, stroke, color = currentColor) para usarse en ThemeIcon.
export default function IconCollarin({ size = 24, stroke = 1.5, color = 'currentColor', ...props }) {
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
            {/* Cabeza */}
            <circle cx="12" cy="5" r="2.7" />
            {/* Banda del collarín */}
            <path d="M8 10.2h8l1.2 4.6c0 .9-2.3 1.6-5.2 1.6s-5.2-.7-5.2-1.6z" />
            {/* Tira de velcro */}
            <path d="M9.2 13h5.6" />
            {/* Hombros */}
            <path d="M3.5 21c.5-2.5 2.8-4 5-4.3M20.5 21c-.5-2.5-2.8-4-5-4.3" />
        </svg>
    );
}
