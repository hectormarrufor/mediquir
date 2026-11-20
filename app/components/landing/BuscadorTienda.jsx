'use client';

import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Combobox, useCombobox } from '@mantine/core';
import { IconArrowRight, IconSearch, IconX } from '@tabler/icons-react';
import { buscarProductos } from '@/app/helpers/busquedaProductos';
import { aBolivares, calcularFactura } from '@/app/constants/facturacion';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { useTienda } from './TiendaContext';
import { enStock, estadoStock, formatearBs, formatearPrecio, getMainImage, getPricing } from './productUtils';
import classes from './landing.module.css';

const MAX_SUGERENCIAS = 6;

// Buscador principal de la tienda: mientras se escribe muestra los productos que coinciden (foto, marca, existencia y precio en $ y Bs).
// Tocar uno abre la página del producto; Enter o «Ver los N resultados» lleva al catálogo con esa búsqueda aplicada.
// Usa el mismo buscador tolerante del sistema (tildes, plurales y errores de tipeo) sobre el catálogo ya descargado.
export default function BuscadorTienda({ valor = '', productos, onBuscar, placeholder = 'Busca guantes, jeringas, catéteres…' }) {
    const { abrirDetalle } = useTienda();
    const { tasa } = useTasaBcv();
    const inputRef = useRef(null);
    const [texto, setTexto] = useState(valor);
    useEffect(() => { setTexto(valor || ''); }, [valor]);

    const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });

    // La lista se calcula con el texto "diferido": escribir nunca se traba aunque el teléfono sea lento
    const consulta = useDeferredValue(texto).trim();
    const resultados = useMemo(
        () => (consulta.length >= 2 && productos?.length ? buscarProductos(productos, consulta, { desempate: enStock, estricto: true }) : []),
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
                    <IconSearch className={classes.buscadorIcono} size={21} stroke={1.9} aria-hidden="true" />
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
                        <IconSearch size={19} stroke={2.2} aria-hidden="true" />
                        <span>Buscar</span>
                    </button>
                </form>
            </Combobox.DropdownTarget>

            <Combobox.Dropdown className={classes.sugerencias} hidden={!hayConsulta}>
                <Combobox.Options mah="min(440px, 54vh)" style={{ overflowY: 'auto' }}>
                    {visibles.length > 0 ? (
                        <>
                            <div className={classes.sugTitulo}>Productos sugeridos</div>
                            {visibles.map((p) => {
                                const { precioFinal } = getPricing(p);
                                const stock = estadoStock(p);
                                const iva = Number(p?.porcentajeIva) || 0;
                                const { montoIva, subtotal } = calcularFactura({ renglones: [{ precioUnitario: precioFinal, cantidad: 1, aplicaIva: iva > 0, porcentajeIva: iva }] });
                                const totalUsd = Math.round((subtotal + montoIva) * 100) / 100;
                                return (
                                    <Combobox.Option key={p.id} value={String(p.id)} className={classes.sug}>
                                        <span className={classes.sugFoto}><img src={getMainImage(p)} alt="" loading="lazy" decoding="async" /></span>
                                        <span className={classes.sugTexto}>
                                            <span className={classes.sugNombre}>{p.nombre}</span>
                                            <span className={classes.sugMeta}>
                                                <span className={classes.sugDot} data-estado={stock.clave} aria-hidden="true" />
                                                {[p.marca?.nombre, stock.texto].filter(Boolean).join(' · ')}
                                            </span>
                                        </span>
                                        <span className={classes.sugPrecios}>
                                            <span className={classes.sugPrecio}>${formatearPrecio(precioFinal)}</span>
                                            {tasa && <span className={classes.sugBs}>Bs {formatearBs(aBolivares(totalUsd, tasa))}</span>}
                                        </span>
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
