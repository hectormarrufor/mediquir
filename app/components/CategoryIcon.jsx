import React from 'react';
import { ThemeIcon, Text } from '@mantine/core';
import {
    IconVaccine,
    IconFirstAidKit,
    IconWheelchair,
    IconPill,
    IconBoxMultiple
} from '@tabler/icons-react';
import IconUtero from './icons/IconUtero'; // aparato reproductor femenino (Tabler no trae uno)

// Diccionario de iconos por categoría. Las claves van en minúsculas y SIN acentos
// (el nombre de la categoría se normaliza igual, así "Ginecología" y "Ginecologia" coinciden).
const iconMap = {
    'ortopedia': IconWheelchair,
    'descartables': IconVaccine,
    'insumos medicos': IconFirstAidKit,
    'productos farmaceuticos': IconPill,
    'ginecologia': IconUtero,
    'miscelaneo': IconBoxMultiple,
};

const normalizar = (nombre) =>
    nombre.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function CategoryIcon({ categoryName, size = 40, color = 'blue', variant = 'light', ...props }) {
    if (!categoryName) return null;

    const normalizedName = normalizar(categoryName);
    const IconComponent = iconMap[normalizedName];

    // Sin fondo (variant="transparent") el icono puede ocupar más espacio dentro del contenedor
    const ratio = variant === 'transparent' ? 0.85 : 0.6;

    if (IconComponent) {
        return (
            <ThemeIcon size={size} radius="md" color={color} variant={variant} {...props}>
                <IconComponent size={size * ratio} stroke={1.5} />
            </ThemeIcon>
        );
    }

    // Fallback: iniciales del nombre. Ej: "Cuidado Personal" -> "CP"
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
