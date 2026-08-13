import React from 'react';
import { Text } from '@mantine/core';

export default function PrecioVisual({ valor, simbolo = '$', size = 'md', fw = 700, c = 'inherit' }) {
    const numero = Number(valor);
    if (isNaN(numero)) return <Text component="span" size={size} fw={fw} c={c}>{simbolo} 0.000</Text>;

    // Formateamos a 3 decimales estrictos y separamos la parte entera de la decimal
    const [entero, decimales] = numero.toFixed(3).split('.');
    
    // Opcional: agregamos separador de miles a la parte entera (ej: 1,250)
    const enteroConMiles = Number(entero).toLocaleString('en-US');

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