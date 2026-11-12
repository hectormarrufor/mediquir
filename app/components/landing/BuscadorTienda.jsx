'use client';

import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Combobox, useCombobox } from '@mantine/core';
import { IconArrowRight, IconSearch, IconX } from '@tabler/icons-react';
import { buscarProductos } from '@/app/helpers/busquedaProductos';
import { useTienda } from './TiendaContext';
import { enStock, estadoStock, formatearPrecio, getMainImage, getPricing } from './productUtils';
import classes from './landing.module.css';

const MAX_SUGERENCIAS = 6;

// Buscador principal de la tienda: mientras se escribe muestra los productos que coinciden (foto, marca, existencia y precio).
// Tocar uno abre su vista rápida; Enter o «Ver los N resultados» lleva al catálogo con esa búsqueda aplicada.
// Usa el mismo buscador tolerante del sistema (tildes, plurales y errores de tipeo) sobre el catálogo ya descargado.
export default function BuscadorTienda({ valor = '', productos, onBuscar, placeholder = 'Busca guantes, jeringas, catéteres…' }) {
    const { abrirDetalle } = useTienda();
    const inputRef = useRef(null);
    const [texto, setTexto] = useState(valor);
    useEffect(() => { setTexto(valor || ''); }, [valor]);

    const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });

    // La lista se calcula con el texto "diferido": escribir nunca se traba aunque el teléfono sea lento
    const consulta = useDeferredValue(texto).trim();
    const resultados = useMemo(
        () => (consulta.length >= 2 && productos?.length ? buscarProductos(productos, consulta, { desempate: enStock }) : []),
        [productos, consulta]
    );
    const visibles = resultados.slice(0, MAX_SUGERENCIAS);
    const hayConsulta = consulta.length >= 2 && Boolean(productos?.length);

    const buscar = () => {
        const q = texto.trim();
        if (!q) return;
        combobox.closeDropdown();
        inputRef.current?.blur();
        onBuscar(q);
    };

    const elegir = (clave) => {
        combobox.closeDropdown();
        if (clave === '__todos') { buscar(); return; }
        const producto = visibles.find((p) => String(p.id) === clave);
        if (producto) { inputRef.current?.blur(); abrirDetalle(producto); }
    };

    return (
        <Combobox store={combobox} onOptionSubmit={elegir} offset={10} position="bottom-start" middlewares={{ flip: false, shift: false }} transitionProps={{ transition: 'pop-top-left', duration: 160 }}>
            <Combobox.DropdownTarget>
                <form className={classes.buscador} role="search" onSubmit={(e) => { e.preventDefault(); buscar(); }}>
                    <IconSearch className={classes.buscadorIcono} size={22} stroke={1.8} aria-hidden="true" />
                    <Combobox.EventsTarget>
                        <input
                            ref={inputRef}
                            className={classes.buscadorInput}
                            type="search"
                            enterKeyHint="search"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            maxLength={100}
                            value={texto}
                            placeholder={placeholder}
                            aria-label="Buscar productos en la tienda"
                            onChange={(e) => { setTexto(e.currentTarget.value); combobox.openDropdown(); combobox.resetSelectedOption(); }}
                            onFocus={() => combobox.openDropdown()}
                            onBlur={() => combobox.closeDropdown()}
                        />
                    </Combobox.EventsTarget>
                    {texto && (
                        <button
                            type="button" className={classes.buscadorBorrar} aria-label="Borrar lo escrito"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { setTexto(''); inputRef.current?.focus(); }}
                        >
                            <IconX size={18} stroke={2} />
                        </button>
                    )}
                    <button type="submit" className={classes.buscadorBtn} aria-label="Buscar">
                        <IconSearch size={20} stroke={2.2} aria-hidden="true" />
                        <span>Buscar</span>
                    </button>
                </form>
            </Combobox.DropdownTarget>

            <Combobox.Dropdown className={classes.sugerencias} hidden={!hayConsulta}>
                <Combobox.Options mah="min(430px, 52vh)" style={{ overflowY: 'auto' }}>
                    {visibles.length > 0 ? (
                        <>
                            <div className={classes.sugTitulo}>Productos</div>
                            {visibles.map((p) => {
                                const { precioFinal } = getPricing(p);
                                const stock = estadoStock(p);
                                return (
                                    <Combobox.Option key={p.id} value={String(p.id)} className={classes.sug}>
                                        <span className={classes.sugFoto}><img src={getMainImage(p)} alt="" loading="lazy" decoding="async" /></span>
                                        <span className={classes.sugTexto}>
                                            <span className={classes.sugNombre}>{p.nombre}</span>
                                            <span className={classes.sugMeta}>{[p.marca?.nombre, stock.texto].filter(Boolean).join(' · ')}</span>
                                        </span>
                                        <span className={classes.sugPrecio}>${formatearPrecio(precioFinal)}</span>
                                    </Combobox.Option>
                                );
                            })}
                            <Combobox.Option value="__todos" className={classes.sugTodos}>
                                <span>{resultados.length === 1 ? 'Ver el resultado en el catálogo' : `Ver los ${resultados.length} resultados`}</span>
                                <IconArrowRight size={18} stroke={2} aria-hidden="true" />
                            </Combobox.Option>
                        </>
                    ) : (
                        <div className={classes.sugVacio}>No encontramos «{consulta}». Prueba con otra palabra o escríbenos por WhatsApp.</div>
                    )}
                </Combobox.Options>
            </Combobox.Dropdown>
        </Combobox>
    );
}
