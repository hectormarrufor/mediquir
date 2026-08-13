import React from 'react';
import { ThemeIcon, Text } from '@mantine/core';
import { 
    IconVaccine, 
    IconFirstAidKit, 
    IconWheelchair
} from '@tabler/icons-react';

// 1. Nuestro diccionario de iconos exactos
const iconMap = {
    'ortopedia': IconWheelchair,
    'descartables': IconVaccine,
    'insumos medicos': IconFirstAidKit,
};

export default function CategoryIcon({ categoryName, size = 40, color = 'blue', variant = 'light', ...props }) {
    if (!categoryName) return null;

    // Normalizamos el nombre para evitar problemas con mayúsculas/minúsculas o espacios extra
    const normalizedName = categoryName.trim().toLowerCase();
    
    // Buscamos si existe el componente en el diccionario
    const IconComponent = iconMap[normalizedName];

    if (IconComponent) {
        // Si existe, renderizamos el icono de Tabler dentro de un ThemeIcon para mantener el fondo y la forma
        return (
            <ThemeIcon size={size} radius="md" color={color} variant={variant} {...props}>
                <IconComponent size={size * 0.6} stroke={1.5} />
            </ThemeIcon>
        );
    }

    // 🔥 FALLBACK INTELIGENTE: Si no existe, calculamos las iniciales 🔥
    // Ej: "Cuidado Personal" -> "CP", "Sillas" -> "S"
    const initials = normalizedName
        .split(' ')
        .map(word => word[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();

    return (
        <ThemeIcon size={size} radius="md" color={color} variant={variant} {...props}>
            <Text fw={700} size={`${size * 0.35}px`} style={{ lineHeight: 1 }}>
                {initials}
            </Text>
        </ThemeIcon>
    );
}