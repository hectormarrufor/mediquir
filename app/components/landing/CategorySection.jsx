'use client';

import React, { useMemo } from 'react';
import { IconArrowRight, IconArrowUpRight } from '@tabler/icons-react';
import { iconoDeCategoria } from '../CategoryIcon';
import Pulso from './Pulso';
import { useCatalogo, useCategorias } from './useCatalogo';
import { nombreCategoria } from './productUtils';
import classes from './landing.module.css';

const iniciales = (nombre) => nombre.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

// Especialidades: una ficha por categoría, ordenadas de la que más productos tiene a la que menos.
// En el teléfono son dos filas que se deslizan de lado; en escritorio, una cuadrícula completa. Todo por CSS.
export default function CategorySection({ selectedCategory, onSelectCategory, onVerTodo }) {
    const { data: categorias, isLoading } = useCategorias();
    const { data: productos } = useCatalogo();

    const lista = useMemo(() => {
        const cuenta = new Map();
        (productos || []).forEach((p) => {
            const id = p.categoriaId ?? p.categoria?.id;
            if (id != null) cuenta.set(id, (cuenta.get(id) || 0) + 1);
        });
        return (categorias || [])
            .map((cat) => ({ ...cat, total: cuenta.get(cat.id) || 0, etiqueta: nombreCategoria(cat.nombre) }))
            // Mientras llega el catálogo se muestran todas; después, solo las que tienen productos
            .filter((cat) => !productos || cat.total > 0)
            .sort((a, b) => (b.total - a.total) || a.etiqueta.localeCompare(b.etiqueta, 'es'));
    }, [categorias, productos]);

    return (
        <section id="especialidades" className={classes.especialidades} aria-labelledby="titulo-especialidades">
            <div className={classes.wrap}>
                <header className={classes.seccionCab}>
                    <div>
                        <p className={classes.eyebrow}><Pulso /> Especialidades</p>
                        <h2 id="titulo-especialidades" className={classes.h2}>Compra por especialidad</h2>
                    </div>
                    <button type="button" className={classes.verTodo} onClick={onVerTodo}>
                        Ver todo el catálogo <IconArrowRight size={18} stroke={2} aria-hidden="true" />
                    </button>
                </header>

                <div className={classes.catGrid}>
                    {isLoading
                        ? Array.from({ length: 8 }).map((_, i) => <div key={i} className={`${classes.skel} ${classes.catSkel}`} />)
                        : lista.map((cat) => {
                            const seleccionada = selectedCategory?.id === cat.id;
                            const Icono = iconoDeCategoria(cat.nombre);
                            return (
                                <button
                                    key={cat.id} type="button" className={classes.cat}
                                    data-selected={seleccionada || undefined} aria-pressed={seleccionada}
                                    onClick={() => onSelectCategory(seleccionada ? null : cat)}
                                >
                                    <span className={classes.catIcono}>
                                        {Icono ? <Icono size={26} stroke={1.6} aria-hidden="true" /> : <span className={classes.catIniciales}>{iniciales(cat.etiqueta)}</span>}
                                    </span>
                                    <span>
                                        <span className={classes.catNombre}>{cat.etiqueta}</span>
                                        {cat.total > 0 && <span className={classes.catCuenta}>{cat.total} {cat.total === 1 ? 'producto' : 'productos'}</span>}
                                    </span>
                                    <IconArrowUpRight className={classes.catFlecha} size={18} stroke={2} aria-hidden="true" />
                                </button>
                            );
                        })}
                </div>
            </div>
        </section>
    );
}
