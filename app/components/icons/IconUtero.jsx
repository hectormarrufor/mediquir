import React from 'react';

// Aparato reproductor femenino: útero, cuello uterino, trompas de Falopio y ovarios.
// Mismo contrato que los iconos de Tabler (size, stroke, color = currentColor) para usarse en ThemeIcon.
export default function IconUtero({ size = 24, stroke = 1.5, color = 'currentColor', ...props }) {
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
            {/* Útero (piriforme: ancho en el fondo, estrecho hacia el cuello) */}
            <path d="M7.4 10.6c1.4-1.5 3.1-1.9 4.6-1.9s3.2.4 4.6 1.9l-2.6 6.4c-.5 1.2-1.3 1.9-2 1.9s-1.5-.7-2-1.9z" />
            {/* Cuello uterino */}
            <path d="M11.2 18.7v2.5M12.8 18.7v2.5" />
            {/* Trompas de Falopio */}
            <path d="M7.4 10.6C5.3 10.3 3.9 8.9 3.6 6.9M16.6 10.6c2.1-.3 3.5-1.7 3.8-3.7" />
            {/* Ovarios */}
            <circle cx="3.5" cy="5.4" r="1.6" />
            <circle cx="20.5" cy="5.4" r="1.6" />
        </svg>
    );
}
