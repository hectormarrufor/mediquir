'use client';

import React, { useState } from 'react';
import { Drawer, Modal } from '@mantine/core';
import { IconBrandWhatsapp, IconCheck, IconMinus, IconPlus, IconShoppingBagPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import Link from 'next/link';
import ImageCarousel from './ImageCarousel';
import { SITIO, rutaProducto } from '@/app/lib/seo';
import { useCart } from './CartContext';
import {
    enlaceWhatsApp, estadoStock, formatearBs, formatearPrecio, getPresentacionLabel, getPricing, getProductImages, nombreCategoria,
    presentacionesTienda,
} from './productUtils';
import { aBolivares, calcularFactura, montoRenglon } from '@/app/constants/facturacion';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import classes from './landing.module.css';

function DetailBody({ product, onClose, isMobile }) {
    const [quantity, setQuantity] = useState(1);
    const { addToCart, unidadesEnCarrito } = useCart();
    const opciones = presentacionesTienda(product);
    const [clave, setClave] = useState('UNIDAD');
    const pres = opciones.find((o) => o.clave === clave) || opciones[0];

    const { stock, precioBase, porcentajeAhorro, hasDiscount, precioFinal, isOutOfStock } = getPricing(product);
    const estado = estadoStock(product);
    const { tasa } = useTasaBcv();
    const porcentajeIva = Number(product?.porcentajeIva) || 0;
    const enCarrito = unidadesEnCarrito(product.id);
    // Cuántas de la presentación elegida caben todavía (el stock está en unidades)
    const disponible = Math.floor(Math.max(0, stock - enCarrito) / pres.unidades);
    const precioPres = pres.unidades > 1 ? montoRenglon(precioFinal, pres.unidades) : precioFinal;

    // IVA y total de la presentación elegida (mismo cálculo que el carrito)
    const { montoIva: ivaPres, subtotal: basePres } = calcularFactura({ renglones: [{ precioUnitario: precioFinal, cantidad: pres.unidades, aplicaIva: porcentajeIva > 0, porcentajeIva }] });
    const totalPres = Math.round((basePres + ivaPres) * 100) / 100;

    const handleAdd = () => {
        addToCart(product, quantity, precioFinal, pres.clave);
        notifications.show({
            message: `${quantity} × ${pres.unidades > 1 ? pres.etiqueta + ' de ' : ''}${product.nombre} añadido al carrito`,
            color: 'teal',
            icon: <IconCheck size={16} />,
            autoClose: 2500,
            position: 'top-center',
        });
        onClose();
    };

    return (
        <div className={classes.detalle}>
            <div className={classes.detalleFoto}>
                <ImageCarousel
                    images={getProductImages(product)}
                    alt={product.nombre}
                    height={isMobile ? 230 : 380}
                    withControls={!isMobile}
                    padding={18}
                />
            </div>

            <div className={classes.detalleInfo}>
                <div className={classes.detalleMeta}>
                    <span className={classes.detalleMarca}>{product.marca?.nombre || 'Genérico'}</span>
                    {product.categoria?.nombre && <span className={classes.detalleCategoria}>{nombreCategoria(product.categoria.nombre)}</span>}
                    <span className={classes.estadoStock} data-estado={estado.clave}>{estado.texto}</span>
                </div>

                <h2 className={classes.detalleNombre}>{product.nombre}</h2>

                {opciones.length > 1 && (
                    <div className={classes.segmento} role="group" aria-label="¿Cómo la quieres?">
                        {opciones.map((o) => (
                            <button key={o.clave} type="button" data-activo={o.clave === pres.clave || undefined} aria-pressed={o.clave === pres.clave} onClick={() => { setClave(o.clave); setQuantity(1); }}>
                                {o.etiqueta}
                            </button>
                        ))}
                    </div>
                )}

                <div className={classes.detallePrecio}>
                    <div className={classes.detalleRef} data-oferta={(hasDiscount && pres.unidades === 1) || undefined}>
                        Ref ${formatearPrecio(precioPres)}
                        <small>
                            {pres.unidades > 1
                                ? `por ${pres.singular} · Ref $${formatearPrecio(precioFinal)} c/u`
                                : hasDiscount ? <><s>${formatearPrecio(precioBase)}</s> · ahorras {porcentajeAhorro}%</> : `por ${getPresentacionLabel(product).toLowerCase()}`}
                        </small>
                    </div>
                    <div className={classes.detalleLinea}>
                        <span>{porcentajeIva > 0 ? `IVA (${porcentajeIva}%)` : 'IVA'}</span>
                        <b>{porcentajeIva > 0 ? `$${formatearPrecio(ivaPres)}` : 'Exento'}</b>
                    </div>
                    <div className={classes.detalleLinea} data-fuerte>
                        <span>Total</span>
                        <b>Ref ${formatearPrecio(totalPres)}</b>
                    </div>
                    {tasa && (
                        <div className={classes.detalleLinea}>
                            <span>En bolívares · tasa BCV {formatearBs(tasa)}</span>
                            <b>Bs {formatearBs(aBolivares(totalPres, tasa))}</b>
                        </div>
                    )}
                </div>

                {isOutOfStock ? (
                    <>
                        <p className={classes.detalleAviso} data-tono="gris">Producto temporalmente agotado. Escríbenos y te avisamos cuando llegue.</p>
                        <a
                            className={`${classes.btn} ${classes.btnWa} ${classes.btnAncho}`} target="_blank" rel="noopener noreferrer"
                            href={enlaceWhatsApp(SITIO.whatsapp, `Hola, quisiera saber cuándo tendrán disponible: ${product.nombre}`)}
                        >
                            <IconBrandWhatsapp size={19} stroke={1.9} aria-hidden="true" /> Consultar por WhatsApp
                        </a>
                    </>
                ) : disponible <= 0 ? (
                    <p className={classes.detalleAviso}>
                        {enCarrito > 0 ? 'Ya tienes en tu carrito todo lo disponible.' : `Por ahora no tenemos suficiente para una ${pres.singular}.`}
                    </p>
                ) : (
                    <>
                        <div className={classes.cantidadFila}>
                            <span>
                                Cantidad
                                {pres.unidades > 1 && <small>{quantity * pres.unidades} unidades en total</small>}
                            </span>
                            <div className={classes.contador}>
                                <button type="button" aria-label="Menos" disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                                    <IconMinus size={17} stroke={2.2} />
                                </button>
                                <output aria-live="polite">{quantity}</output>
                                <button type="button" aria-label="Más" disabled={quantity >= disponible} onClick={() => setQuantity((q) => Math.min(disponible, q + 1))}>
                                    <IconPlus size={17} stroke={2.2} />
                                </button>
                            </div>
                        </div>

                        <button type="button" className={`${classes.btn} ${classes.btnAzul} ${classes.btnAncho}`} style={{ minHeight: 52, fontSize: 16 }} onClick={handleAdd}>
                            <IconShoppingBagPlus size={20} stroke={1.9} aria-hidden="true" />
                            Agregar · ${formatearPrecio(montoRenglon(precioFinal, pres.unidades * quantity))}
                        </button>
                    </>
                )}

                <Link href={rutaProducto(product)} className={classes.detalleFicha}>Ver la ficha completa del producto</Link>
            </div>
        </div>
    );
}

// Vista rápida del producto: modal en escritorio y cajón inferior en el teléfono. Hay una sola para toda la portada.
// El `key` reinicia cantidad y presentación cada vez que se abre con otro producto.
export default function ProductDetail({ product, opened, onClose, isMobile }) {
    if (!product) return null;
    const body = <DetailBody key={product.id} product={product} onClose={onClose} isMobile={isMobile} />;

    if (isMobile) {
        return (
            <Drawer
                opened={opened} onClose={onClose} position="bottom" size="92%" padding="md"
                title="Detalle del producto"
                styles={{ content: { height: 'auto', maxHeight: '92dvh', borderRadius: '24px 24px 0 0' } }}
            >
                {body}
            </Drawer>
        );
    }

    return (
        <Modal opened={opened} onClose={onClose} size={920} centered padding="xl" title="Detalle del producto">
            {body}
        </Modal>
    );
}
