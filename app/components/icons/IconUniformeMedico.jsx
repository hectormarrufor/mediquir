import React from 'react';

// Uniforme médico (filipina quirúrgica con cuello en V y cruz médica en el pecho).
// Mismo contrato que los iconos de Tabler (size, stroke, color = currentColor) para usarse en ThemeIcon y la portada.
export default function IconUniformeMedico({ size = 24, stroke = 1.5, color = 'currentColor', ...props }) {
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
            {/* Filipina quirúrgica con cuello en V y mangas cortas */}
            <path d="M9 4l3 4.2l3 -4.2l5 2.5l-1.8 4.3l-1.7 -.8v9.5a1 1 0 0 1 -1 1h-7a1 1 0 0 1 -1 -1v-9.5l-1.7 .8l-1.8 -4.3z" />
            {/* Cruz médica en el pecho */}
            <path d="M12 12.2v4" />
            <path d="M10 14.2h4" />
        </svg>
    );
}
