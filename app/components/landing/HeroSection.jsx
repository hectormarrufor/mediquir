'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IconMapPin } from '@tabler/icons-react';
import { ahoraCaracas, avisoDespacho } from '@/app/constants/horario';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import BuscadorTienda from './BuscadorTienda';
import { TRAZA_ECG } from './Pulso';
import { useTienda } from './TiendaContext';
import { useCatalogo } from './useCatalogo';
import { enStock, formatearBs, formatearPrecio, getMainImage, getPricing } from './productUtils';
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

export default function HeroSection({ searchQuery, onSearch }) {
    const { data: productos } = useCatalogo();
    const { tasa } = useTasaBcv();
    const { abrirDetalle } = useTienda();
    const videoRef = useRef(null);
    const [sinVideo, setSinVideo] = useState(false);
    const [foto, setFoto] = useState(0);
    const [despacho, setDespacho] = useState(null); // depende de la hora: se calcula ya en el navegador
    const [turno, setTurno] = useState(0);

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

    // Los más pedidos que hay en existencia y tienen foto: rotan en la tarjeta que monta sobre el video
    const destacados = useMemo(
        () => (productos || [])
            .filter((p) => enStock(p) && (p.imagen || p.grupoEquivalencia?.imagen))
            .sort((a, b) => (b.nroVentas || 0) - (a.nroVentas || 0))
            .slice(0, 5),
        [productos]
    );
    useEffect(() => {
        if (destacados.length < 2) return undefined;
        const timer = setInterval(() => setTurno((i) => i + 1), 4800);
        return () => clearInterval(timer);
    }, [destacados.length]);
    const destacado = destacados.length ? destacados[turno % destacados.length] : null;

    return (
        <section className={classes.hero} aria-labelledby="titulo-tienda">
            {sinVideo ? (
                FOTOS.map((src, i) => (
                    <img key={src} className={`${classes.heroVideo} ${classes.escenaFoto}`} data-activa={i === foto || undefined} src={src} alt="" loading={i === 0 ? 'eager' : 'lazy'} />
                ))
            ) : (
                <video
                    ref={videoRef} className={classes.heroVideo}
                    src="/tenants/mediquir/hero-video.mp4" poster="/tenants/mediquir/hero-video-poster.jpg"
                    autoPlay loop muted playsInline preload="metadata" aria-hidden="true"
                    onError={() => setSinVideo(true)}
                />
            )}
            <div className={classes.heroFondo} aria-hidden="true">
                <div className={classes.heroPapel} />
                <svg className={classes.heroTraza} viewBox="0 0 1440 200" preserveAspectRatio="none">
                    <path className={classes.trazaBase} d={TRAZA_ECG} pathLength="1" />
                    <path className={classes.trazaLuz} d={TRAZA_ECG} pathLength="1" />
                </svg>
            </div>

            <div className={`${classes.wrap} ${classes.heroGrid}`}>
                <div className={classes.heroTexto}>
                    <p className={classes.estado}>
                        <span className={classes.punto} data-tono={despacho?.tono} />
                        <span>{despacho?.texto || 'Despachos de lunes a sábado'}</span>
                    </p>

                    <h1 id="titulo-tienda" className={classes.heroTitulo}>
                        Insumos médicos, <em>del mostrador a tu puerta.</em>
                    </h1>

                    <p className={classes.heroBajada}>
                        Material médico-quirúrgico <strong>al mayor y al detal</strong> para clínicas, consultorios y tu hogar.
                        Precios en dólares y en bolívares a tasa BCV.
                    </p>

                    <BuscadorTienda valor={searchQuery} productos={productos} onBuscar={onSearch} />

                    <div className={classes.populares}>
                        <span className={classes.popularesTitulo}>Lo más buscado</span>
                        {POPULARES.map((termino) => (
                            <button key={termino} type="button" className={classes.popular} onClick={() => onSearch(termino)}>{termino}</button>
                        ))}
                    </div>

                    <dl className={classes.cifras}>
                        <Cifra valor={cifras.productos} mas etiqueta="productos" />
                        <Cifra valor={cifras.marcas} mas etiqueta="marcas" />
                        <Cifra valor={cifras.especialidades} etiqueta="especialidades" />
                    </dl>
                </div>

                <div className={classes.escena}>
                    <div className={classes.escenaMarco} />

                    {tasa && (
                        <div className={`${classes.flot} ${classes.flotTasa}`}>
                            <span className={classes.flotEtiqueta}>Tasa BCV de hoy</span>
                            <span className={classes.flotValor}>Bs {formatearBs(tasa)} <small>por $</small></span>
                        </div>
                    )}

                    {destacado && (
                        <button type="button" className={`${classes.flot} ${classes.flotTop}`} onClick={() => abrirDetalle(destacado)} aria-label={`Ver ${destacado.nombre}`}>
                            <span className={classes.flotFoto}><img key={destacado.id} src={getMainImage(destacado)} alt="" /></span>
                            <span className={classes.flotTexto}>
                                <span className={classes.flotEtiqueta}>De lo más pedido</span>
                                <span className={classes.flotNombre}>{destacado.nombre}</span>
                                <span className={classes.flotPrecio}>Ref ${formatearPrecio(getPricing(destacado).precioFinal)}</span>
                            </span>
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
}
