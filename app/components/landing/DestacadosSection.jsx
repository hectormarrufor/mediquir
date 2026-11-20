'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
    IconChevronLeft, IconChevronRight, IconFlame, IconPlus, IconShoppingBag, IconSparkles, IconTag,
} from '@tabler/icons-react';
import { aBolivares, calcularFactura } from '@/app/constants/facturacion';
import { rutaProducto } from '@/app/lib/seo';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { useCart } from './CartContext';
import Pulso from './Pulso';
import { useTienda } from './TiendaContext';
import { useCatalogo } from './useCatalogo';
import {
    enStock, estadoStock, formatearBs, formatearPrecio, getPricing, getProductImages, sufijoUnidad,
} from './productUtils';
import classes from './landing.module.css';

const LIMITE = 12;

function precioTotalUnidad(product, precioFinal) {
    const porcentajeIva = Number(product?.porcentajeIva) || 0;
    const { montoIva, subtotal } = calcularFactura({
        renglones: [{ precioUnitario: precioFinal, cantidad: 1, aplicaIva: porcentajeIva > 0, porcentajeIva }],
    });
    return Math.round((subtotal + montoIva) * 100) / 100;
}

// Vitrina horizontal curada (Más pedidos, Ofertas y Recién llegados): da descubrimiento inmediato con fotos reales antes del catálogo completo.
export default function DestacadosSection() {
    const { data: productos, isLoading } = useCatalogo();
    const { tasa } = useTasaBcv();
    const { unidadesEnCarrito } = useCart();
    const { abrirDetalle, pedirCantidad } = useTienda();
    const [tab, setTab] = useState('vendidos');
    const pistaRef = useRef(null);

    const grupos = useMemo(() => {
        const disponibles = (productos || []).filter((p) => enStock(p));
        const conFotoPrimero = (a, b) => Number(Boolean(b.imagen || b.grupoEquivalencia?.imagen)) - Number(Boolean(a.imagen || a.grupoEquivalencia?.imagen));

        const vendidos = [...disponibles]
            .sort((a, b) => conFotoPrimero(a, b) || ((b.nroVentas || 0) - (a.nroVentas || 0)))
            .slice(0, LIMITE);

        const ofertas = disponibles
            .filter((p) => getPricing(p).hasDiscount)
            .sort((a, b) => (getPricing(b).porcentajeAhorro - getPricing(a).porcentajeAhorro) || conFotoPrimero(a, b))
            .slice(0, LIMITE);

        const recientes = [...disponibles]
            .sort((a, b) => conFotoPrimero(a, b) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
            .slice(0, LIMITE);

        return { vendidos, ofertas, recientes };
    }, [productos]);

    const pestanas = useMemo(() => {
        const base = [{ id: 'vendidos', label: 'Más pedidos', icono: IconFlame }];
        if (grupos.ofertas.length > 0) base.push({ id: 'ofertas', label: 'Ofertas', icono: IconTag, cuenta: grupos.ofertas.length });
        base.push({ id: 'recientes', label: 'Recién llegados', icono: IconSparkles });
        return base;
    }, [grupos.ofertas.length]);

    const tabActiva = pestanas.some((p) => p.id === tab) ? tab : 'vendidos';
    const items = grupos[tabActiva] || [];

    const desplazar = (dir) => {
        const el = pistaRef.current;
        if (!el) return;
        const paso = Math.max(260, Math.round(el.clientWidth * 0.78));
        el.scrollBy({ left: dir * paso, behavior: 'smooth' });
    };

    const cambiarTab = (id) => {
        setTab(id);
        pistaRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
    };

    if (!isLoading && items.length === 0) return null;

    return (
        <section className={classes.vitrina} aria-labelledby="titulo-vitrina">
            <div className={classes.wrap}>
                <header className={classes.vitrinaCab}>
                    <div>
                        <p className={classes.eyebrow}><Pulso /> Selección rápida</p>
                        <h2 id="titulo-vitrina" className={classes.h2}>Lo más pedido <em>en la tienda</em></h2>
                    </div>

                    <div className={classes.vitrinaControles}>
                        <div className={classes.vitrinaTabs} role="tablist" aria-label="Colecciones destacadas">
                            {pestanas.map((p) => {
                                const activa = tabActiva === p.id;
                                const Icono = p.icono;
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={activa}
                                        className={classes.vitrinaTab}
                                        data-activo={activa || undefined}
                                        onClick={() => cambiarTab(p.id)}
                                    >
                                        <Icono size={15} stroke={2} aria-hidden="true" />
                                        <span>{p.label}</span>
                                        {p.cuenta ? <small>{p.cuenta}</small> : null}
                                    </button>
                                );
                            })}
                        </div>

                        <div className={classes.vitrinaFlechas} aria-hidden="true">
                            <button type="button" className={classes.flechaBtn} onClick={() => desplazar(-1)} aria-label="Ver anteriores">
                                <IconChevronLeft size={19} stroke={2.1} />
                            </button>
                            <button type="button" className={classes.flechaBtn} onClick={() => desplazar(1)} aria-label="Ver siguientes">
                                <IconChevronRight size={19} stroke={2.1} />
                            </button>
                        </div>
                    </div>
                </header>

                <div ref={pistaRef} className={classes.vitrinaPista}>
                    {isLoading
                        ? Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className={classes.vitrinaSkel}>
                                <div className={classes.skel} />
                                <div className={classes.skel} style={{ width: '48%' }} />
                                <div className={classes.skel} style={{ width: '82%' }} />
                                <div className={classes.skel} style={{ width: '58%', height: 18 }} />
                            </div>
                        ))
                        : items.map((product) => {
                            const foto = getProductImages(product)[0];
                            const { stock, precioBase, porcentajeAhorro, hasDiscount, precioFinal } = getPricing(product);
                            const estado = estadoStock(product);
                            const totalUnidad = precioTotalUnidad(product, precioFinal);
                            const enCarrito = unidadesEnCarrito(product.id);
                            const puedeAgregar = enCarrito < stock;

                            const abrir = (e) => {
                                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                                e.preventDefault();
                                abrirDetalle(product);
                            };

                            return (
                                <article key={product.id} className={classes.vCard}>
                                    <div className={classes.vCardFoto} data-sin-foto={foto.isPlaceholder || undefined}>
                                        <img src={foto.src} alt="" loading="lazy" decoding="async" />
                                        <div className={classes.cardEtiquetas}>
                                            {hasDiscount && <span className={`${classes.etiqueta} ${classes.etiquetaOferta}`}>-{porcentajeAhorro}%</span>}
                                            {enCarrito > 0 && (
                                                <span className={`${classes.etiqueta} ${classes.etiquetaCarrito}`} aria-label={`${enCarrito} en tu carrito`}>
                                                    <IconShoppingBag size={12} stroke={2.2} aria-hidden="true" /> {enCarrito}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className={classes.vCardBody}>
                                        <div className={classes.vCardMeta}>
                                            <span className={classes.cardMarca}>{product.marca?.nombre || 'Genérico'}</span>
                                            <span className={classes.vCardDot} data-estado={estado.clave} title={estado.texto} />
                                        </div>

                                        <h3 className={classes.vCardNombre}>
                                            <a href={rutaProducto(product)} onClick={abrir} title={product.nombre}>{product.nombre}</a>
                                        </h3>

                                        <div className={classes.vCardPie}>
                                            <div className={classes.vCardPrecio}>
                                                {hasDiscount && <span className={classes.precioAntes}>Ref ${formatearPrecio(precioBase)}</span>}
                                                <span className={classes.vCardRef} data-oferta={hasDiscount || undefined}>
                                                    ${formatearPrecio(precioFinal)} <small>{sufijoUnidad(product)}</small>
                                                </span>
                                                <span className={classes.vCardBs}>{tasa ? `Bs ${formatearBs(aBolivares(totalUnidad, tasa))}` : '\u00A0'}</span>
                                            </div>

                                            <button
                                                type="button"
                                                className={classes.vCardAdd}
                                                disabled={!puedeAgregar}
                                                onClick={() => pedirCantidad(product, 'UNIDAD')}
                                                aria-label={`Agregar ${product.nombre} al carrito`}
                                                title={puedeAgregar ? 'Agregar al carrito' : 'Máximo en tu carrito'}
                                            >
                                                <IconPlus size={18} stroke={2.4} aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                </div>
            </div>
        </section>
    );
}
