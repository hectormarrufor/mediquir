'use client';

// Cómo se llegó al «sin IVA» de los abonos de una factura: marcas visibles de la retención de IVA y de los renglones exentos, y la nota que lo explica.
import React from 'react';
import { Badge, Text } from '@mantine/core';
import { explicarSinIva } from './comisiones';
import { dolares } from './utilidades';

// Marcas junto al número de la factura: «Ret. IVA» si el cliente ya retuvo, «Exento» si tiene renglones sin IVA
export function MarcasFactura({ l, size = 'xs' }) {
    if (!l?.ventaId) return null;
    const retenido = Number(l.retenidoUsd) || 0;
    const exento = Number(l.exentoUsd) || 0;
    if (retenido < 0.005 && exento < 0.005) return null;
    return (
        <>
            {retenido >= 0.005 && <Badge size={size} variant="filled" color="grape" style={{ flexShrink: 0, textTransform: 'none' }} title={`El cliente retuvo ${dolares(retenido)} de IVA (75 %): no lo paga en dinero`}>Ret. IVA {dolares(retenido)}</Badge>}
            {exento >= 0.005 && <Badge size={size} variant="light" color="yellow" style={{ flexShrink: 0, textTransform: 'none' }} title={`Tiene ${dolares(exento)} en renglones exentos (sin IVA)`}>Exento {dolares(exento)}</Badge>}
        </>
    );
}

// La explicación en palabras (null si la factura no tiene con qué explicarse)
export function textoSinIva(pa) {
    const e = explicarSinIva(pa);
    if (!e) return null;
    const pct = (e.razon * 100).toLocaleString('es-VE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const partes = [`Sin IVA de cada abono = abono × ${pct} % (sin IVA ${dolares(e.base)} ÷ lo que el cliente paga en dinero ${dolares(e.aCobrar)}).`];
    if (e.retenido >= 0.005) partes.push(`El cliente retuvo ${dolares(e.retenido)} de IVA (75 %): no lo paga en dinero, por eso se divide entre ${dolares(e.aCobrar)} y no entre ${dolares(e.monto)}.`);
    if (e.exento >= 0.005) partes.push(`Tiene ${dolares(e.exento)} en renglones exentos (sin IVA): el IVA de la factura es solo ${dolares(e.iva)}, no el 16 % del total.`);
    if (e.retenido < 0.005 && e.exento < 0.005) partes.push(`La diferencia con el monto (${dolares(e.iva)}) es el IVA de la factura.`);
    partes.push(`Tope: entre todos los abonos el sin IVA nunca pasa de ${dolares(e.base)}.`);
    return partes.join(' ');
}

export default function NotaProrrateo({ pa, fz = 11 }) {
    const t = textoSinIva(pa);
    if (!t) return null;
    return <Text fz={fz} c="#5c6675" lh={1.35}>{t}</Text>;
}
