'use client';

import React, { memo } from 'react';
import { IconBrandWhatsapp, IconEye, IconPackage, IconPlus, IconShoppingBag } from '@tabler/icons-react';
import { useCart } from './CartContext';
import { useTienda } from './TiendaContext';
import {
    enlaceWhatsApp, estadoStock, formatearBs, formatearPrecio, getPricing, getProductImages, presentacionesTienda, sufijoUnidad,
} from './productUtils';
import { aBolivares, calcularFactura, montoRenglon } from '@/app/constants/facturacion';
import { SITIO, rutaProducto } from '@/app/lib/seo';
import classes from './landing.module.css';

// Tarjeta del catálogo. Sus seis partes (foto, marca, nombre, precio, caja y botón) van siempre en ese orden y siempre presentes,
// porque comparten las filas de la cuadrícula (subgrid): así en una fila todos los precios y botones quedan a la misma altura.
// Toda la tarjeta abre la vista rápida (el enlace del nombre la cubre entera); los botones quedan por encima.
function ProductCard({ product, tasa }) {
    const { unidadesEnCarrito } = useCart();
    const { abrirDetalle, pedirCantidad } = useTienda();

    const foto = getProductImages(product)[0];
    const { stock, precioBase, porcentajeAhorro, hasDiscount, precioFinal, isOutOfStock } = getPricing(product);
    const estado = estadoStock(product);
    const porcentajeIva = Number(product?.porcentajeIva) || 0;
    // Mismo cálculo que el carrito: IVA y total de una unidad
    const { montoIva, subtotal: baseUnidad } = calcularFactura({ renglones: [{ precioUnitario: precioFinal, cantidad: 1, aplicaIva: porcentajeIva > 0, porcentajeIva }] });
    const totalUnidad = Math.round((baseUnidad + montoIva) * 100) / 100;
    const enCarrito = unidadesEnCarrito(product.id);
    const puedeAgregar = !isOutOfStock && enCarrito < stock;
    const caja = presentacionesTienda(product).find((p) => p.clave === 'CAJA') || null;
    const puedeCaja = Boolean(caja) && !isOutOfStock && enCarrito + caja.unidades <= stock;

    // Clic normal: vista rápida. Con Ctrl/Cmd o botón central el enlace abre la ficha completa en otra pestaña, como cualquier enlace.
    const abrir = (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        abrirDetalle(product);
    };

    return (
        <article className={classes.card} data-agotado={isOutOfStock || undefined}>
            <div className={classes.cardFoto} data-sin-foto={foto.isPlaceholder || undefined}>
                <img src={foto.src} alt="" loading="lazy" decoding="async" />
                <div className={classes.cardEtiquetas}>
                    {hasDiscount && <span className={`${classes.etiqueta} ${classes.etiquetaOferta}`}>-{porcentajeAhorro}%</span>}
                    {enCarrito > 0 && (
                        <span className={`${classes.etiqueta} ${classes.etiquetaCarrito}`} role="img" aria-label={`${enCarrito} en tu carrito`} title="Unidades en tu carrito">
                            <IconShoppingBag size={13} stroke={2.2} aria-hidden="true" /> {enCarrito}
                        </span>
                    )}
                </div>
                <span className={classes.cardVista} aria-hidden="true"><IconEye size={15} stroke={2} /> Vista rápida</span>
            </div>

            <div className={classes.cardMeta}>
                <span className={classes.cardMarca}>{product.marca?.nombre || 'Genérico'}</span>
                <span className={classes.cardStock} data-estado={estado.clave}>{estado.texto}</span>
            </div>

            <h3 className={classes.cardNombre}>
                <a href={rutaProducto(product)} onClick={abrir} title={product.nombre}>{product.nombre}</a>
            </h3>

            <div className={classes.cardPrecio}>
                {hasDiscount && <span className={classes.precioAntes}>Ref ${formatearPrecio(precioBase)}</span>}
                <span className={classes.precioRef} data-oferta={hasDiscount || undefined}>
                    Ref ${formatearPrecio(precioFinal)} <small>{sufijoUnidad(product)}</small>
                </span>
                <span className={classes.precioIva}>
                    {porcentajeIva > 0 ? <>+ IVA {porcentajeIva}% · Total <b>${formatearPrecio(totalUnidad)}</b></> : 'Exento de IVA'}
                </span>
                <span className={classes.precioBs}>{tasa ? `Bs ${formatearBs(aBolivares(totalUnidad, tasa))}` : ' '}</span>
            </div>

            <div className={classes.cardCaja}>
                {caja && (
                    <button
                        type="button" className={classes.cajaBtn} disabled={!puedeCaja}
                        onClick={() => pedirCantidad(product, 'CAJA')}
                        aria-label={`Añadir ${caja.etiqueta} de ${product.nombre} al carrito`}
                    >
                        <span><IconPackage size={15} stroke={1.9} aria-hidden="true" /> {caja.etiqueta}</span>
                        <b>${formatearPrecio(montoRenglon(precioFinal, caja.unidades))}</b>
                    </button>
                )}
            </div>

            <div className={classes.cardAccion}>
                {isOutOfStock ? (
                    <a
                        className={classes.agregar} data-variante="consultar" target="_blank" rel="noopener noreferrer"
                        href={enlaceWhatsApp(SITIO.whatsapp, `Hola, quisiera saber cuándo tendrán disponible: ${product.nombre}`)}
                    >
                        <IconBrandWhatsapp size={17} stroke={1.9} aria-hidden="true" /> Consultar
                    </a>
                ) : (
                    <button
                        type="button" className={classes.agregar} disabled={!puedeAgregar}
                        onClick={() => pedirCantidad(product, 'UNIDAD')}
                        aria-label={`Añadir ${product.nombre} al carrito`}
                    >
                        {puedeAgregar ? <><IconPlus size={17} stroke={2.4} aria-hidden="true" /> Agregar</> : 'Máximo en tu carrito'}
                    </button>
                )}
            </div>
        </article>
    );
}

export default memo(ProductCard);
