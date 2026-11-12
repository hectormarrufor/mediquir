'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Drawer, MantineThemeProvider } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconBox, IconBrandWhatsapp, IconCheck, IconMinus, IconPackage, IconPlus, IconShoppingBag, IconTrash } from '@tabler/icons-react';

import HeroSection from './components/landing/HeroSection';
import InfoEnvios from './components/landing/InfoEnvios';
import MarcasCinta from './components/landing/MarcasCinta';
import CategorySection from './components/landing/CategorySection';
import CatalogoSection from './components/landing/CatalogoSection';
import FooterSection from './components/landing/FooterSection';
import ProductDetail from './components/landing/ProductDetail';
import CantidadProductoModal from './components/ui/CantidadProductoModal';
import { useCart } from './components/landing/CartContext';
import { TiendaProvider } from './components/landing/TiendaContext';
import { temaTienda } from './components/landing/temaTienda';
import CheckoutProcess from './CheckoutProcess';
import {
    PLACEHOLDER_IMG, enlaceWhatsApp, formatearBs, formatearPrecio, getMainImage, getPricing, presentacionesTienda,
} from './components/landing/productUtils';
import { aBolivares, montoRenglon } from '@/app/constants/facturacion';
import { SITIO } from '@/app/lib/seo';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { fuenteTienda } from './fonts/tienda';
import classes from './components/landing/landing.module.css';

// Mientras la portada está abierta, Mantine (encabezado, modales, cajones, avisos) usa la tipografía de la tienda y el azul de la
// marca como color principal (en el sistema es el mostaza): los botones sin color propio, el foco de los campos y los pasos del pago
// leen estas variables CSS. Va como <style> dentro de la propia página: ya viene en el HTML del servidor (no hay salto al cargar)
// y desaparece sola al salir de la portada, así que el panel del personal no cambia.
const FUENTE = fuenteTienda.style.fontFamily;
const VARIABLES_TIENDA = `body{--mantine-font-family:${FUENTE};--mantine-font-family-headings:${FUENTE};`
    + '--mantine-primary-color-filled:var(--mantine-color-brand-filled);--mantine-primary-color-filled-hover:var(--mantine-color-brand-filled-hover);'
    + '--mantine-primary-color-light:var(--mantine-color-brand-light);--mantine-primary-color-light-hover:var(--mantine-color-brand-light-hover);'
    + '--mantine-primary-color-light-color:var(--mantine-color-brand-light-color);--mantine-primary-color-contrast:#fff;'
    + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `--mantine-primary-color-${n}:var(--mantine-color-brand-${n});`).join('')
    + '}';

export default function LandingMediquir({ seo = null }) {
    const { tasa: bcv } = useTasaBcv();
    const isMobile = useMediaQuery('(max-width: 48em)', true);
    const [cartOpened, setCartOpened] = useState(false);
    const [showCheckout, setShowCheckout] = useState(false);
    const {
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        subtotal,
        totalImpuestos,
        ivaDetalle,
        totalItems,
        isLoaded,
        isVerifying,
        verifyStockBeforeCheckout,
        unidadesEnCarrito,
    } = useCart();

    // --- FILTROS DE LA TIENDA (los comparten el buscador del encabezado, las especialidades y el catálogo) ---
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(null);

    // Enlaces desde Google o desde una ficha de producto: /?buscar=jeringa muestra esa búsqueda en la tienda
    useEffect(() => {
        const q = new URLSearchParams(window.location.search).get('buscar');
        if (q) setSearchQuery(q.slice(0, 100));
    }, []);

    const scrollToProducts = useCallback(() => {
        document.getElementById('productos-section')?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    // Búsqueda desde el encabezado: es global, así que suelta la especialidad
    const handleSearch = (query) => {
        setSearchQuery(query);
        setSelectedCategory(null);
        scrollToProducts();
    };

    // Elegir una especialidad en su sección: empieza de cero en esa especialidad y baja al catálogo
    const handleSelectCategory = (category) => {
        setSelectedCategory(category);
        setSearchQuery('');
        scrollToProducts();
    };

    const handleClearFilters = () => {
        setSearchQuery('');
        setSelectedCategory(null);
    };

    // --- VISTA RÁPIDA Y «¿CUÁNTO VAS A AGREGAR?»: una sola de cada una para toda la página ---
    const [detalle, setDetalle] = useState({ product: null, opened: false });
    const [pregunta, setPregunta] = useState(null); // { product, clave }: producto y presentación con que se abre la pregunta
    const abrirDetalle = useCallback((product) => setDetalle({ product, opened: true }), []);
    const pedirCantidad = useCallback((product, clave = 'UNIDAD') => setPregunta({ product, clave }), []);
    const tienda = useMemo(() => ({ abrirDetalle, pedirCantidad }), [abrirDetalle, pedirCantidad]);

    const confirmarCantidad = (clave, n) => {
        const { product } = pregunta;
        addToCart(product, n, getPricing(product).precioFinal, clave);
        const pres = presentacionesTienda(product).find((p) => p.clave === clave);
        notifications.show({ message: `${n} ${n === 1 ? pres.singular : pres.plural} de ${product.nombre} añadido al carrito`, color: 'teal', icon: <IconCheck size={16} />, autoClose: 2200, position: 'top-center' });
    };

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

    const cerrarCarrito = () => {
        setCartOpened(false);
        setShowCheckout(false); // Resetea al cerrar
    };

    const totalConIva = subtotal + totalImpuestos;
    const stockPregunta = pregunta ? Number(pregunta.product.stockAlmacen) || 0 : 0;

    return (
        <MantineThemeProvider theme={temaTienda}>
            <TiendaProvider value={tienda}>
                <div className={`${classes.tienda} ${fuenteTienda.className}`}>
                    <style dangerouslySetInnerHTML={{ __html: VARIABLES_TIENDA }} />

                    <HeroSection searchQuery={searchQuery} onSearch={handleSearch} />

                    <InfoEnvios />

                    <MarcasCinta />

                    <CategorySection
                        selectedCategory={selectedCategory}
                        onSelectCategory={handleSelectCategory}
                        onVerTodo={() => { handleClearFilters(); scrollToProducts(); }}
                    />

                    <CatalogoSection
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        selectedCategory={selectedCategory}
                        onSelectCategory={setSelectedCategory}
                        onClearFilters={handleClearFilters}
                    />

                    {seo}

                    <FooterSection />

                    {/* BOTONES FLOTANTES: WhatsApp y carrito (en el teléfono, con productos, el carrito es una barra con el total) */}
                    <div className={classes.flotantes}>
                        <a
                            className={classes.wa} target="_blank" rel="noopener noreferrer" aria-label="Escríbenos por WhatsApp" title="¿Necesitas ayuda? Escríbenos"
                            href={enlaceWhatsApp(SITIO.whatsapp, 'Hola, necesito ayuda con un pedido en la tienda en línea.')}
                        >
                            <IconBrandWhatsapp size={27} stroke={1.8} aria-hidden="true" />
                        </a>

                        {isLoaded && (
                            <button
                                type="button" className={classes.carritoBtn} onClick={() => setCartOpened(true)}
                                data-lleno={totalItems > 0 || undefined} data-salto={salto || undefined}
                                aria-label={totalItems > 0 ? `Abrir carrito: ${totalItems} en total` : 'Abrir carrito'}
                            >
                                <span className={classes.carritoIcono}>
                                    <IconShoppingBag size={25} stroke={1.8} aria-hidden="true" />
                                    {totalItems > 0 && <span className={classes.carritoNum}>{totalItems}</span>}
                                </span>
                                {totalItems > 0 && (
                                    <span className={classes.carritoTexto}>
                                        <span>Ver carrito</span>
                                        <span className={classes.carritoTotal}>
                                            Ref ${totalConIva.toFixed(2)}
                                            {bcv && <small>Bs {formatearBs(aBolivares(totalConIva, bcv))}</small>}
                                        </span>
                                    </span>
                                )}
                            </button>
                        )}
                    </div>

                    <ProductDetail product={detalle.product} opened={detalle.opened} onClose={() => setDetalle((d) => ({ ...d, opened: false }))} isMobile={isMobile} />

                    {pregunta && (
                        <CantidadProductoModal
                            opened onClose={() => setPregunta(null)} nombre={pregunta.product.nombre}
                            presentaciones={presentacionesTienda(pregunta.product)} claveInicial={pregunta.clave}
                            maxUnidades={Math.max(0, stockPregunta - unidadesEnCarrito(pregunta.product.id))} onConfirmar={confirmarCantidad}
                        />
                    )}

                    <Drawer
                        opened={cartOpened}
                        onClose={cerrarCarrito}
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
                                <button type="button" className={`${classes.btn} ${classes.btnOscuro}`} onClick={() => { cerrarCarrito(); scrollToProducts(); }}>
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
                                                    {exceedsStock && <span className={classes.renglonAviso}>Solo quedan {stockDisponible} disponibles</span>}

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
                </div>
            </TiendaProvider>
        </MantineThemeProvider>
    );
}
