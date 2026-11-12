'use client';

import React, { useMemo } from 'react';
import { useCatalogo } from './useCatalogo';
import { enStock } from './productUtils';
import classes from './landing.module.css';

// No son marcas: así se cargan los productos sin marca definida
const NO_SON_MARCA = new Set(['GENERICA', 'GENERICO', 'IMPORTADO', 'NACIONAL', 'SIN MARCA']);
const MAXIMO = 22;

// Cinta con las marcas que más productos tienen hoy en existencia. Sale del catálogo: no hay lista que mantener a mano.
export default function MarcasCinta() {
    const { data: productos } = useCatalogo();

    const marcas = useMemo(() => {
        const cuenta = new Map();
        (productos || []).forEach((p) => {
            const nombre = p.marca?.nombre?.trim();
            if (!nombre || !enStock(p) || NO_SON_MARCA.has(nombre.toUpperCase())) return;
            cuenta.set(nombre, (cuenta.get(nombre) || 0) + 1);
        });
        return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAXIMO).map(([nombre]) => nombre);
    }, [productos]);

    if (marcas.length < 6) return null;

    return (
        <div className={`${classes.wrap} ${classes.marcas}`}>
            <span className={classes.marcasTitulo}>Marcas que distribuimos</span>
            <div className={classes.marcasCinta}>
                {/* La lista va dos veces seguidas para que la cinta gire sin corte; la copia no se lee en voz alta */}
                <ul className={classes.marcasPista}>
                    {marcas.map((m) => <li key={m}>{m}</li>)}
                    {marcas.map((m) => <li key={`copia-${m}`} aria-hidden="true">{m}</li>)}
                </ul>
            </div>
        </div>
    );
}
