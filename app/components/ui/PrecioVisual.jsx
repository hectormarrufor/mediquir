import React from 'react';
import { Text } from '@mantine/core';
import { formatoExacto } from '@/app/helpers/sinRedondeo';

// exacto: muestra el número con TODOS sus decimales (al menos 2), sin redondear; si no, a 3 decimales
export default function PrecioVisual({ valor, simbolo = '$', size = 'md', fw = 700, c = 'inherit', exacto = false }) {
    const numero = Number(valor);
    if (isNaN(numero)) return <Text component="span" size={size} fw={fw} c={c}>{simbolo} 0.000</Text>;

    // Separamos la parte entera (con separador de miles, ej: 1,250) de la decimal
    const [enteroConMiles, decimales] = exacto
        ? formatoExacto(numero).split('.')
        : (([e, d]) => [Number(e).toLocaleString('en-US'), d])(numero.toFixed(3).split('.'));

    return (
        <Text component="span" size={size} fw={fw} c={c} style={{ display: 'inline-flex', alignItems: 'baseline' }}>
            <span style={{ marginRight: 2 }}>{simbolo}</span>
            <span>{enteroConMiles}.</span>
            <sup style={{ fontSize: '0.6em', fontWeight: 600, marginLeft: '1px' }}>
                {decimales}
            </sup>
        </Text>
    );
}