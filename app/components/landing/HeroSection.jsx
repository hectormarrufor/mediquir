'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    IconArrowDown, IconBrandWhatsapp, IconChevronLeft, IconChevronRight, IconFlame, IconMapPin, IconPlus, IconTruckDelivery,
} from '@tabler/icons-react';
import { ahoraCaracas, avisoDespacho } from '@/app/constants/horario';
import { aBolivares, calcularFactura } from '@/app/constants/facturacion';
import { SITIO } from '@/app/lib/seo';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import BuscadorTienda from './BuscadorTienda';
import { TRAZA_ECG } from './Pulso';
import { useTienda } from './TiendaContext';
import { useCart } from './CartContext';
import { useCatalogo } from './useCatalogo';
import { enStock, enlaceWhatsApp, formatearBs, formatearPrecio, getMainImage, getPricing } from './productUtils';
import classes from './landing.module.css';

// Fotos reales de la tienda (versiones livianas): solo se usan si el video no puede reproducirse
const FOTOS = [2, 4].map((n) => `/tenants/mediquir/hero-${n}-lg.jpg`);
const POPULARES = ['Guantes', 'Jeringas', 'Catéter', 'Mascarillas', 'Gasas', 'Alcohol', 'Fajas', 'Bisturí'];
const MILES = new Intl.NumberFormat('es-VE');

// ¿Sale hoy el pedido? Mismo horario de despacho que usa el pago (app/constants/horario.js)
function estadoDespacho() {
    const aviso = avisoDespacho();
    if (aviso) return { tono: 'ambar', texto: <>Pide ahora y <b>sale {aviso.cuando}</b></> };
    return { tono: 'verde', texto: <><b>Despachamos hoy</b> · hasta las {ahoraCaracas().dia === 6 ? '12:30' : '4:30'} p. m.</> };
}

// Cuenta desde cero hasta el valor cuando ya se conoce (una sola vez)
function useConteo(valor) {
    const [n, setN] = useState(0);
    useEffect(() => {
        if (!valor) return undefined;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(valor); return undefined; }
        let cuadro;
        const inicio = performance.now();
        const paso = (ahora) => {
            const t = Math.min(1, (ahora - inicio) / 1100);
            setN(Math.round(valor * (1 - (1 - t) ** 3)));
            if (t < 1) cuadro = requestAnimationFrame(paso);
        };
        cuadro = requestAnimationFrame(paso);
        return () => cancelAnimationFrame(cuadro);
    }, [valor]);
    return n;
}

function Cifra({ valor, mas, etiqueta }) {
    const n = useConteo(valor);
    return (
        <div className={classes.cifra}>
            <dt>{etiqueta}</dt>
            <dd>{valor ? `${mas ? '+' : ''}${MILES.format(n)}` : '—'}</dd>
        </div>
    );
}

export default function HeroSection({ searchQuery, onSearch, onVerCatalogo }) {
    const { data: productos } = useCatalogo();
    const { tasa } = useTasaBcv();
    const { abrirDetalle, pedirCantidad } = useTienda();
    const { unidadesEnCarrito } = useCart();
    const videoRef = useRef(null);
    const [sinVideo, setSinVideo] = useState(false);
    const [foto, setFoto] = useState(0);
    const [despacho, setDespacho] = useState(null); // depende de la hora: se calcula ya en el navegador
    const [turno, setTurno] = useState(0);
    const [pausado, setPausado] = useState(false);

    useEffect(() => {
        setDespacho(estadoDespacho());
        const reloj = setInterval(() => setDespacho(estadoDespacho()), 60_000);
        return () => clearInterval(reloj);
    }, []);

    // El video solo corre mientras se ve (ahorra batería y datos) y no arranca si el sistema pide menos movimiento
    useEffect(() => {
        const video = videoRef.current;
        if (!video || sinVideo) return undefined;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { video.pause(); return undefined; }
        const observador = new IntersectionObserver(([entrada]) => {
            if (entrada.isIntersecting) video.play().catch(() => {});
            else video.pause();
        }, { threshold: 0.15 });
        observador.observe(video);
        return () => observador.disconnect();
    }, [sinVideo]);

    useEffect(() => {
        if (!sinVideo) return undefined;
        const timer = setInterval(() => setFoto((i) => (i + 1) % FOTOS.length), 6000);
        return () => clearInterval(timer);
    }, [sinVideo]);

    const cifras = useMemo(() => {
        const lista = productos || [];
        return {
            productos: Math.floor(lista.length / 100) * 100,
            marcas: Math.floor(new Set(lista.map((p) => p.marca?.nombre).filter(Boolean)).size / 10) * 10,
            especialidades: new Set(lista.map((p) => p.categoria?.id ?? p.categoriaId).filter(Boolean)).size,
        };
    }, [productos]);

    // Los más pedidos que hay en existencia y tienen foto: rotan en la vitrina flotante de vidrio
    const destacados = useMemo(
        () => (productos || [])
            .filter((p) => enStock(p) && (p.imagen || p.grupoEquivalencia?.imagen))
            .sort((a, b) => (b.nroVentas || 0) - (a.nroVentas || 0))
            .slice(0, 5),
        [productos]
    );

    useEffect(() => {
        if (destacados.length < 2 || pausado) return undefined;
        const timer = setInterval(() => setTurno((i) => (i + 1) % destacados.length), 5200);
        return () => clearInterval(timer);
    }, [destacados.length, pausado]);

    const indice = destacados.length ? turno % destacados.length : 0;
    const destacado = destacados.length ? destacados[indice] : null;
    const precioDest = destacado ? getPricing(destacado) : null;
    const totalDestUsd = useMemo(() => {
        if (!destacado || !precioDest) return 0;
        const iva = Number(destacado.porcentajeIva) || 0;
        const { montoIva, subtotal } = calcularFactura({ renglones: [{ precioUnitario: precioDest.precioFinal, cantidad: 1, aplicaIva: iva > 0, porcentajeIva: iva }] });
        return Math.round((subtotal + montoIva) * 100) / 100;
    }, [destacado, precioDest]);
    const puedeAgregarDest = destacado ? unidadesEnCarrito(destacado.id) < (Number(destacado.stockAlmacen) || 0) : false;

    const moverTurno = (delta) => {
        if (destacados.length < 2) return;
        setTurno((i) => (i + delta + destacados.length) % destacados.length);
    };

    return (
        <section className={classes.hero} aria-labelledby="titulo-tienda">
            {sinVideo ? (
                FOTOS.map((src, i) => (
                    <img key={src} className={`${classes.heroVideo} ${classes.escenaFoto}`} data-activa={i === foto || undefined} src={src} alt="" loading={i === 0 ? 'eager' : 'lazy'} />
                ))
            ) : (
                <video
                    ref={videoRef} className={classes.heroVideo}
                    src="/tenants/mediquir/hero-video.mp4?v=2" poster="/tenants/mediquir/hero-video-poster.jpg?v=2"
                    autoPlay loop muted playsInline preload="metadata" aria-hidden="true"
                    onError={() => setSinVideo(true)}
                />
            )}
            <div className={classes.heroFondo} aria-hidden="true">
                <div className={classes.heroAura} />
                <div className={classes.heroPapel} />
                <svg className={classes.heroTraza} viewBox="0 0 1440 200" preserveAspectRatio="none">
                    <path className={classes.trazaBase} d={TRAZA_ECG} pathLength="1" />
                    <path className={classes.trazaLuz} d={TRAZA_ECG} pathLength="1" />
                </svg>
            </div>

            <div className={`${classes.wrap} ${classes.heroGrid}`}>
                <div className={classes.heroTexto}>
                    <div className={classes.estadoFila}>
                        <p className={classes.estado}>
                            <span className={classes.punto} data-tono={despacho?.tono} />
                            <span>{despacho?.texto || 'Despachos de lunes a sábado'}</span>
                        </p>
                        {tasa && (
                            <p className={classes.bcvMovil} aria-label={`Tasa BCV de hoy: Bs ${formatearBs(tasa)} por dólar`}>
                                <span>BCV</span>
                                <b>Bs {formatearBs(tasa)}</b>
                            </p>
                        )}
                    </div>

                    <h1 id="titulo-tienda" className={classes.heroTitulo}>
                        Insumos médicos, <em>del mostrador a tu puerta.</em>
                    </h1>

                    <p className={classes.heroBajada}>
                        Material médico-quirúrgico <strong>al mayor y al detal</strong> para clínicas, consultorios y tu hogar.
                        Precios transparentes en dólares y bolívares a tasa BCV.
                    </p>

                    <BuscadorTienda valor={searchQuery} productos={productos} onBuscar={onSearch} />

                    <div className={classes.populares}>
                        <span className={classes.popularesTitulo}>Tendencias</span>
                        {POPULARES.map((termino) => (
                            <button key={termino} type="button" className={classes.popular} onClick={() => onSearch(termino)}>{termino}</button>
                        ))}
                    </div>

                    <div className={classes.heroAcciones}>
                        <button type="button" className={classes.heroCtaPrimario} onClick={onVerCatalogo}>
                            Explorar catálogo <IconArrowDown size={16} stroke={2.2} aria-hidden="true" />
                        </button>
                        <a
                            className={classes.heroCtaSecundario}
                            href={enlaceWhatsApp(SITIO.whatsapp, 'Hola, quisiera cotizar insumos médicos al mayor.')}
                            target="_blank" rel="noopener noreferrer"
                        >
                            <IconBrandWhatsapp size={17} stroke={1.9} aria-hidden="true" /> Cotizar al mayor
                        </a>
                    </div>

                    <dl className={classes.cifras}>
                        <Cifra valor={cifras.productos} mas etiqueta="productos" />
                        <Cifra valor={cifras.marcas} mas etiqueta="marcas" />
                        <Cifra valor={cifras.especialidades} etiqueta="especialidades" />
                    </dl>
                </div>

                {/* Escritorio: vitrina Bento de vidrio sobre el video real de la tienda */}
                <aside className={classes.heroBento} aria-label="Resumen en vivo de la tienda" onMouseEnter={() => setPausado(true)} onMouseLeave={() => setPausado(false)}>
                    <div className={classes.bentoFila}>
                        <div className={classes.bentoTile}>
                            <span className={classes.bentoLabel}>
                                <span className={classes.puntoChico} /> Tasa BCV hoy
                            </span>
                            <strong className={classes.bentoValor}>
                                {tasa ? <>Bs {formatearBs(tasa)} <small>/ $</small></> : 'Actualizando…'}
                            </strong>
                        </div>

                        <div className={classes.bentoTile}>
                            <span className={classes.bentoLabel}>
                                <IconTruckDelivery size={13} stroke={2.2} aria-hidden="true" /> Cobertura
                            </span>
                            <strong className={classes.bentoCiudad}>
                                <IconMapPin size={14} stroke={2.2} aria-hidden="true" /> {SITIO.ciudad} → Toda Venezuela
                            </strong>
                        </div>
                    </div>

                    {destacado && precioDest && (
                        <div className={classes.spotlight}>
                            <div className={classes.spotlightCab}>
                                <span className={classes.spotlightTag}>
                                    <IconFlame size={14} stroke={2.2} aria-hidden="true" /> De lo más pedido
                                </span>
                                {destacados.length > 1 && (
                                    <div className={classes.spotlightNav}>
                                        <button type="button" onClick={() => moverTurno(-1)} aria-label="Producto anterior">
                                            <IconChevronLeft size={15} stroke={2.2} />
                                        </button>
                                        <button type="button" onClick={() => moverTurno(1)} aria-label="Siguiente producto">
                                            <IconChevronRight size={15} stroke={2.2} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className={classes.spotlightCuerpo}>
                                <button type="button" className={classes.spotlightFoto} onClick={() => abrirDetalle(destacado)} aria-label={`Ver ${destacado.nombre}`}>
                                    <img key={destacado.id} src={getMainImage(destacado)} alt="" />
                                    {precioDest.hasDiscount && <span className={classes.spotlightOferta}>-{precioDest.porcentajeAhorro}%</span>}
                                </button>

                                <div className={classes.spotlightInfo}>
                                    <span className={classes.spotlightMarca}>{destacado.marca?.nombre || 'Insumo médico'}</span>
                                    <button type="button" className={classes.spotlightNombre} onClick={() => abrirDetalle(destacado)}>
                                        {destacado.nombre}
                                    </button>
                                    <div className={classes.spotlightPrecioFila}>
                                        <div>
                                            <span className={classes.spotlightUsd}>Ref ${formatearPrecio(precioDest.precioFinal)}</span>
                                            {tasa && <span className={classes.spotlightBs}>Bs {formatearBs(aBolivares(totalDestUsd, tasa))}</span>}
                                        </div>
                                        <button
                                            type="button"
                                            className={classes.spotlightAdd}
                                            disabled={!puedeAgregarDest}
                                            onClick={() => pedirCantidad(destacado, 'UNIDAD')}
                                            aria-label={`Agregar ${destacado.nombre} al carrito`}
                                        >
                                            <IconPlus size={15} stroke={2.5} aria-hidden="true" /> Agregar
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {destacados.length > 1 && (
                                <div className={classes.spotlightPuntos} role="tablist" aria-label="Elegir producto destacado">
                                    {destacados.map((item, i) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            role="tab"
                                            aria-selected={i === indice}
                                            aria-label={item.nombre}
                                            className={classes.spotlightPunto}
                                            data-activo={i === indice || undefined}
                                            onClick={() => setTurno(i)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </aside>
            </div>
        </section>
    );
}
