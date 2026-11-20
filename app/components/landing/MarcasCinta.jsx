'use client';

import React, { useMemo } from 'react';
import { useCatalogo } from './useCatalogo';
import { enStock } from './productUtils';
import classes from './landing.module.css';

// No son marcas: así se cargan los productos sin marca definida
const NO_SON_MARCA = new Set(['GENERICA', 'GENERICO', 'IMPORTADO', 'NACIONAL', 'SIN MARCA']);
const MAXIMO = 22;

// Cinta interactiva con las marcas que más productos tienen hoy en existencia.
// Tocar una marca filtra directamente el catálogo por ella.
export default function MarcasCinta({ marcaActiva = '', onSelectMarca }) {
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

    const renderItem = (m, key, oculto) => (
        <li key={key} aria-hidden={oculto || undefined}>
            <button
                type="button"
                tabIndex={oculto ? -1 : undefined}
                className={classes.marcaPill}
                data-activa={marcaActiva === m || undefined}
                onClick={() => onSelectMarca?.(m)}
            >
                {m}
            </button>
        </li>
    );

    return (
        <div className={`${classes.wrap} ${classes.marcas}`}>
            <span className={classes.marcasTitulo}>Marcas que distribuimos</span>
            <div className={classes.marcasCinta}>
                {/* La lista va dos veces seguidas para que la cinta gire sin corte; la copia no se lee en voz alta */}
                <ul className={classes.marcasPista}>
                    {marcas.map((m) => renderItem(m, m, false))}
                    {marcas.map((m) => renderItem(m, `copia-${m}`, true))}
                </ul>
            </div>
        </div>
    );
}
