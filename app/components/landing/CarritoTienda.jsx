'use client';

// Carrito de la tienda (cajón lateral con el pago) y botones flotantes (WhatsApp y carrito).
// Los comparten la portada y la página de cada producto, para que el carrito se vea y se use igual en las dos.
import React, { useEffect, useRef, useState } from 'react';
import { Drawer } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowRight, IconBox, IconBrandWhatsapp, IconMinus, IconPackage, IconPlus, IconShoppingBag, IconTrash } from '@tabler/icons-react';
import { useCart } from './CartContext';
import CheckoutProcess from '@/app/CheckoutProcess';
import { PLACEHOLDER_IMG, enlaceWhatsApp, formatearBs, formatearPrecio, getMainImage } from './productUtils';
import { aBolivares, montoRenglon } from '@/app/constants/facturacion';
import { SITIO } from '@/app/lib/seo';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import classes from './landing.module.css';

export function CarritoDrawer({ opened, onClose, onVerCatalogo }) {
    const { tasa: bcv } = useTasaBcv();
    const [showCheckout, setShowCheckout] = useState(false);
    const {
        cart, removeFromCart, updateQuantity, subtotal, totalImpuestos, ivaDetalle, totalItems, isVerifying, verifyStockBeforeCheckout, unidadesEnCarrito,
    } = useCart();

    // Verificar si hay algún item sin stock en el carrito para bloquear la orden
    const hasInvalidItems = cart.some((item) => {
        const stock = Number(item.product.stockAlmacen || 0);
        return stock <= 0 || unidadesEnCarrito(item.product.id) > stock;
    });

    const handleProceedToCheckout = async () => {
        const verification = await verifyStockBeforeCheckout();

        if (!verification.success) {
            notifications.show(verification.reason === 'STOCK_CHANGED'
                ? { title: 'El inventario cambió', message: 'Actualizamos tu carrito con la disponibilidad real. Revísalo antes de continuar.', color: 'orange', autoClose: 7000, position: 'top-center' }
                : { title: 'No pudimos verificar el inventario', message: 'Revisa tu conexión e inténtalo de nuevo.', color: 'red', autoClose: 6000, position: 'top-center' });
            return;
        }

        // Si el stock está OK, abrimos la vista de checkout en el Drawer
        setShowCheckout(true);
    };

    const cerrar = () => {
        setShowCheckout(false); // Resetea al cerrar
        onClose();
    };

    const totalConIva = subtotal + totalImpuestos;

    return (
        <Drawer
            opened={opened}
            onClose={cerrar}
            position="right"
            title={showCheckout ? 'Finalizar compra' : totalItems > 0 ? `Tu carrito (${totalItems})` : 'Tu carrito'}
            padding="md"
            size="md"
            styles={{ content: { display: 'flex', flexDirection: 'column' }, body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } }}
        >
            {showCheckout ? (
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', margin: '0 -16px', padding: '0 16px 16px' }}>
                    <CheckoutProcess
                        tasaBcv={bcv}
                        onCancel={() => setShowCheckout(false)}
                        onSuccess={() => {
                            // Aquí puedes vaciar el carrito local si lo deseas
                        }}
                    />
                </div>
            ) : cart.length === 0 ? (
                <div className={classes.cestaVacia}>
                    <span className={classes.vacioIcono}><IconShoppingBag size={28} stroke={1.6} aria-hidden="true" /></span>
                    <h3>Tu carrito está vacío</h3>
                    <p>Agrega productos del catálogo y aparecerán aquí, listos para pagar.</p>
                    <button type="button" className={`${classes.btn} ${classes.btnOscuro}`} onClick={() => { cerrar(); onVerCatalogo?.(); }}>
                        Ver el catálogo
                    </button>
                </div>
            ) : (
                <div className={classes.cesta} style={{ flex: 1 }}>
                    <ul className={classes.cestaLista} style={{ listStyle: 'none', marginBlock: 0 }}>
                        {cart.map((item) => {
                            const stockDisponible = Number(item.product.stockAlmacen || 0);
                            const isOut = stockDisponible <= 0;
                            const exceedsStock = unidadesEnCarrito(item.product.id) > stockDisponible && !isOut;
                            const presClave = item.presentacion || 'UNIDAD';
                            const porPres = item.unidadesPorPres || 1;
                            const iva = Number(item.product.porcentajeIva) || 0;

                            return (
                                <li key={`${item.product.id}:${presClave}`} className={classes.renglon} data-agotado={isOut || undefined}>
                                    <span className={classes.renglonFoto}>
                                        <img src={getMainImage(item.product)} alt="" loading="lazy" onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMG; }} />
                                    </span>
                                    <div style={{ minWidth: 0 }}>
                                        <span className={classes.renglonNombre}>{item.product.nombre}</span>
                                        {presClave !== 'UNIDAD'
                                            ? <span className={classes.renglonPres} data-caja><IconPackage size={12} aria-hidden="true" /> {item.presentacionEtiqueta} · {item.quantity} und en total</span>
                                            : <span className={classes.renglonPres}><IconBox size={12} aria-hidden="true" /> Por unidad</span>}
                                        <span className={classes.renglonDato}>
                                            Ref ${formatearPrecio(item.precioFinal)} c/u{bcv ? ` · Bs ${formatearBs(aBolivares(item.precioFinal, bcv))}` : ''}
                                        </span>
                                        <span className={classes.renglonDato} style={{ marginTop: 1 }}>{iva > 0 ? `+ IVA ${iva}%` : 'Exento de IVA'}</span>

                                        {isOut && <span className={classes.renglonAviso} data-tono="rojo">Agotado en almacén</span>}
                                        {exceedsStock && <span className={classes.renglonAviso}>Esa cantidad supera lo disponible ahora: redúcela</span>}

                                        {!isOut && (
                                            <div className={classes.renglonPie}>
                                                <div className={`${classes.contador} ${classes.contadorChico}`}>
                                                    <button type="button" aria-label="Menos" disabled={item.cantidadPres <= 1} onClick={() => updateQuantity(item.product.id, item.cantidadPres - 1, presClave)}>
                                                        <IconMinus size={15} stroke={2.2} />
                                                    </button>
                                                    <output>{item.cantidadPres}</output>
                                                    <button
                                                        type="button" aria-label="Más"
                                                        disabled={unidadesEnCarrito(item.product.id) + porPres > stockDisponible}
                                                        onClick={() => updateQuantity(item.product.id, item.cantidadPres + 1, presClave)}
                                                    >
                                                        <IconPlus size={15} stroke={2.2} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className={classes.renglonLado}>
                                        <button type="button" className={classes.renglonQuitar} aria-label={`Quitar ${item.product.nombre} del carrito`} onClick={() => removeFromCart(item.product.id, presClave)}>
                                            <IconTrash size={18} stroke={1.8} />
                                        </button>
                                        {!isOut && <span className={classes.renglonTotal}>${formatearPrecio(montoRenglon(item.precioFinal, item.quantity))}</span>}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>

                    <div className={classes.cestaResumen}>
                        <div className={classes.cestaLinea}>
                            <span>Subtotal</span>
                            <b>Ref ${subtotal.toFixed(2)}</b>
                        </div>
                        {ivaDetalle.map((d) => (
                            <div key={d.alicuota} className={classes.cestaLinea}>
                                <span>IVA ({d.alicuota}%) sobre ${formatearPrecio(d.base)}</span>
                                <b>Ref ${formatearPrecio(d.iva)}</b>
                            </div>
                        ))}
                        <div className={classes.cestaLinea} data-total>
                            <span>Total con IVA</span>
                            <b>Ref ${totalConIva.toFixed(2)}</b>
                        </div>
                        {bcv && <span className={classes.cestaBs}>Bs {formatearBs(aBolivares(totalConIva, bcv))}</span>}
                        <p className={classes.cestaNota}>El delivery, si lo eliges, se calcula al pagar y no lleva IVA.</p>
                        <button
                            type="button" className={`${classes.btn} ${classes.btnAzul} ${classes.btnAncho}`} style={{ minHeight: 52, fontSize: 16 }}
                            disabled={hasInvalidItems || isVerifying} onClick={handleProceedToCheckout}
                        >
                            {isVerifying ? 'Verificando inventario…' : hasInvalidItems ? 'Ajusta los productos sin stock' : 'Continuar al pago'}
                        </button>
                    </div>
                </div>
            )}
        </Drawer>
    );
}

// Botones flotantes: WhatsApp y carrito (en el teléfono, con productos, el carrito es una barra con el total)
export function FlotantesTienda({ onAbrirCarrito }) {
    const { tasa: bcv } = useTasaBcv();
    const { subtotal, totalImpuestos, totalItems, isLoaded } = useCart();
    const totalConIva = subtotal + totalImpuestos;

    // El botón del carrito da un pequeño salto cada vez que entra algo
    const [salto, setSalto] = useState(false);
    const itemsPrevios = useRef(null);
    useEffect(() => {
        if (!isLoaded) return undefined;
        const antes = itemsPrevios.current;
        itemsPrevios.current = totalItems;
        if (antes === null || totalItems <= antes) return undefined;
        setSalto(true);
        const fin = setTimeout(() => setSalto(false), 520);
        return () => clearTimeout(fin);
    }, [totalItems, isLoaded]);

    return (
        <div className={classes.flotantes}>
            <a
                className={classes.wa} target="_blank" rel="noopener noreferrer" aria-label="Escríbenos por WhatsApp" title="¿Necesitas ayuda? Escríbenos"
                href={enlaceWhatsApp(SITIO.whatsapp, 'Hola, necesito ayuda con un pedido en la tienda en línea.')}
            >
                <IconBrandWhatsapp size={27} stroke={1.8} aria-hidden="true" />
            </a>

            {isLoaded && (
                <button
                    type="button" className={classes.carritoBtn} onClick={onAbrirCarrito}
                    data-lleno={totalItems > 0 || undefined} data-salto={salto || undefined}
                    aria-label={totalItems > 0 ? `Abrir carrito: ${totalItems} en total` : 'Abrir carrito'}
                >
                    <span className={classes.carritoIcono}>
                        <IconShoppingBag size={25} stroke={1.8} aria-hidden="true" />
                        {totalItems > 0 && <span className={classes.carritoNum}>{totalItems}</span>}
                    </span>
                    {totalItems > 0 && (
                        <span className={classes.carritoTexto}>
                            <span className={classes.carritoAccion}>Ver carrito <IconArrowRight size={15} stroke={2.3} aria-hidden="true" /></span>
                            <span className={classes.carritoTotal}>
                                Ref ${totalConIva.toFixed(2)}
                                {bcv && <small>Bs {formatearBs(aBolivares(totalConIva, bcv))}</small>}
                            </span>
                        </span>
                    )}
                </button>
            )}
        </div>
    );
}
