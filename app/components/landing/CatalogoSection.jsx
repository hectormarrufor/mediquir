'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from '@mantine/core';
import {
    IconAdjustmentsHorizontal, IconBrandWhatsapp, IconChevronDown, IconMoodEmpty, IconRefresh, IconSearch, IconX,
} from '@tabler/icons-react';
import { buscarProductos } from '@/app/helpers/busquedaProductos';
import { SITIO } from '@/app/lib/seo';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import ProductCard from './ProductCard';
import Pulso from './Pulso';
import { useCatalogo, useCategorias } from './useCatalogo';
import { enStock, enlaceWhatsApp, getPricing, nombreCategoria } from './productUtils';
import classes from './landing.module.css';

const PAGINA = 24;
const MILES = new Intl.NumberFormat('es-VE');

const ORDENES = [
    { value: 'auto', label: 'Más vendidos', conBusqueda: 'Más relevantes' },
    { value: 'precio-asc', label: 'Precio: menor a mayor' },
    { value: 'precio-desc', label: 'Precio: mayor a menor' },
    { value: 'nombre', label: 'Nombre (A–Z)' },
    { value: 'recientes', label: 'Recién llegados' },
];

const deCategoria = (p, cat) => p.categoriaId === cat.id || p.categoria?.id === cat.id
    || p.categoria?.nombre?.toLowerCase() === cat.nombre?.toLowerCase();

// Catálogo de la tienda: una sola lista con búsqueda al escribir, especialidad, marca, orden y «solo disponibles».
// La barra queda pegada arriba mientras se recorre la lista, así se puede afinar la búsqueda sin volver al inicio.
// Los disponibles van siempre primero, sea cual sea el orden elegido.
export default function CatalogoSection({ searchQuery, onSearchChange, selectedCategory, onSelectCategory, onClearFilters }) {
    const { data: productos, isLoading, isError, refetch } = useCatalogo();
    const { data: categorias } = useCategorias();
    const { tasa } = useTasaBcv();

    const [marca, setMarca] = useState('');
    const [orden, setOrden] = useState('auto');
    const [soloDisponibles, setSoloDisponibles] = useState(false);
    const [visible, setVisible] = useState(PAGINA);
    const [pegada, setPegada] = useState(false);
    const [hojaAbierta, setHojaAbierta] = useState(false);

    const centinela = useRef(null);
    const riel = useRef(null);

    // Lo que se escribe se aplica al dejar de teclear un instante (la lista no salta con cada letra)
    const [texto, setTexto] = useState(searchQuery || '');
    useEffect(() => { setTexto(searchQuery || ''); }, [searchQuery]);
    useEffect(() => {
        const limpio = texto.trim();
        if (limpio === (searchQuery || '')) return undefined;
        const espera = setTimeout(() => onSearchChange(limpio), 240);
        return () => clearTimeout(espera);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [texto]);

    const base = productos || [];

    // Especialidades con su conteo, de la más surtida a la menos
    const chips = useMemo(() => {
        const cuenta = new Map();
        base.forEach((p) => { const id = p.categoriaId ?? p.categoria?.id; if (id != null) cuenta.set(id, (cuenta.get(id) || 0) + 1); });
        return (categorias || [])
            .map((cat) => ({ cat, total: cuenta.get(cat.id) || 0, etiqueta: nombreCategoria(cat.nombre) }))
            .filter((c) => c.total > 0)
            .sort((a, b) => (b.total - a.total) || a.etiqueta.localeCompare(b.etiqueta, 'es'));
    }, [categorias, base]);

    const enCategoria = useMemo(() => (selectedCategory ? base.filter((p) => deCategoria(p, selectedCategory)) : base), [base, selectedCategory]);

    // Marcas de lo que se está viendo (toda la tienda o la especialidad elegida)
    const marcas = useMemo(() => {
        const cuenta = new Map();
        enCategoria.forEach((p) => { const n = p.marca?.nombre?.trim(); if (n) cuenta.set(n, (cuenta.get(n) || 0) + 1); });
        return [...cuenta.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
    }, [enCategoria]);

    // Si la marca elegida no existe en la especialidad nueva, se suelta
    useEffect(() => {
        if (marca && productos && !marcas.some(([n]) => n === marca)) setMarca('');
    }, [marca, marcas, productos]);

    const lista = useMemo(() => {
        let l = enCategoria;
        if (marca) l = l.filter((p) => p.marca?.nombre?.trim() === marca);
        if (soloDisponibles) l = l.filter(enStock);
        // Búsqueda por palabras sueltas, tolerante a tildes, plurales y errores de tipeo; ya devuelve primero lo más parecido
        if (searchQuery) l = buscarProductos(l, searchQuery, { desempate: enStock });

        if (orden === 'auto') {
            return searchQuery ? l : [...l].sort((a, b) => (enStock(b) - enStock(a)) || ((b.nroVentas || 0) - (a.nroVentas || 0)));
        }
        const precios = orden.startsWith('precio') ? new Map(l.map((p) => [p.id, getPricing(p).precioFinal])) : null;
        const criterio = {
            'precio-asc': (a, b) => precios.get(a.id) - precios.get(b.id),
            'precio-desc': (a, b) => precios.get(b.id) - precios.get(a.id),
            nombre: (a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { numeric: true }),
            recientes: (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
        }[orden];
        return [...l].sort((a, b) => (enStock(b) - enStock(a)) || criterio(a, b));
    }, [enCategoria, marca, soloDisponibles, searchQuery, orden]);

    const disponiblesHoy = useMemo(() => base.filter(enStock).length, [base]);

    // Al cambiar cualquier filtro se vuelve a la primera página y, si la barra ya iba pegada, al inicio de la lista
    const firma = `${searchQuery}|${selectedCategory?.id ?? ''}|${marca}|${orden}|${soloDisponibles}`;
    const primera = useRef(true);
    useEffect(() => {
        setVisible(PAGINA);
        if (primera.current) { primera.current = false; return; }
        const el = centinela.current;
        if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start', behavior: 'instant' });
    }, [firma]);

    // Sombra de la barra solo cuando va pegada
    useEffect(() => {
        const el = centinela.current;
        if (!el) return undefined;
        const observador = new IntersectionObserver(([e]) => setPegada(!e.isIntersecting && e.boundingClientRect.top < 120), { rootMargin: '-90px 0px 0px 0px' });
        observador.observe(el);
        return () => observador.disconnect();
    }, []);

    // La especialidad activa siempre a la vista dentro del riel (sin mover la página)
    useEffect(() => {
        const cont = riel.current;
        const activo = cont?.querySelector('[data-activo]');
        if (cont && activo) cont.scrollTo({ left: activo.offsetLeft - cont.clientWidth / 2 + activo.clientWidth / 2, behavior: 'smooth' });
    }, [selectedCategory?.id, chips.length]);

    const limpiarTodo = () => { setMarca(''); setOrden('auto'); setSoloDisponibles(false); setTexto(''); onClearFilters(); };
    const extras = (marca ? 1 : 0) + (orden !== 'auto' ? 1 : 0) + (soloDisponibles ? 1 : 0);
    const hayFiltros = Boolean(searchQuery || selectedCategory || marca || soloDisponibles);
    const etiquetaOrden = (o) => (searchQuery && o.conBusqueda) || o.label;

    const titulo = searchQuery
        ? <>Resultados para <em>«{searchQuery}»</em></>
        : selectedCategory ? nombreCategoria(selectedCategory.nombre) : <>Insumos para tu clínica <em>y tu hogar</em></>;

    const selectorMarca = (
        <label className={classes.selector} data-activo={marca || undefined}>
            <span className={classes.selectorEtiqueta}>Marca</span>
            <select value={marca} onChange={(e) => setMarca(e.currentTarget.value)} aria-label="Filtrar por marca">
                <option value="">Todas</option>
                {marcas.map(([n, total]) => <option key={n} value={n}>{n} ({total})</option>)}
            </select>
            <IconChevronDown size={16} stroke={2} aria-hidden="true" />
        </label>
    );
    const selectorOrden = (
        <label className={classes.selector} data-activo={orden !== 'auto' || undefined}>
            <span className={classes.selectorEtiqueta}>Ordenar</span>
            <select value={orden} onChange={(e) => setOrden(e.currentTarget.value)} aria-label="Ordenar productos">
                {ORDENES.map((o) => <option key={o.value} value={o.value}>{etiquetaOrden(o)}</option>)}
            </select>
            <IconChevronDown size={16} stroke={2} aria-hidden="true" />
        </label>
    );
    const interruptor = (
        <label className={classes.interruptor}>
            <span>Solo disponibles</span>
            <input type="checkbox" checked={soloDisponibles} onChange={(e) => setSoloDisponibles(e.currentTarget.checked)} />
            <span className={classes.interruptorPista} aria-hidden="true" />
        </label>
    );

    const mostrados = lista.slice(0, visible);
    const restantes = lista.length - mostrados.length;

    return (
        <section id="productos-section" className={classes.catalogo} aria-labelledby="titulo-catalogo">
            <div className={classes.wrap}>
                <header className={classes.seccionCab}>
                    <div>
                        <p className={classes.eyebrow}><Pulso /> Catálogo</p>
                        <h2 id="titulo-catalogo" className={classes.h2}>{titulo}</h2>
                    </div>
                    {disponiblesHoy > 0 && (
                        <p className={classes.seccionNota}><strong>{MILES.format(disponiblesHoy)}</strong> productos disponibles hoy</p>
                    )}
                </header>

                <div ref={centinela} className={classes.barraCentinela} style={{ scrollMarginTop: 96 }} />
                <div className={classes.barra} data-pegada={pegada || undefined}>
                    <div className={classes.barraFila}>
                        <label className={classes.campo}>
                            <IconSearch size={19} stroke={1.9} aria-hidden="true" />
                            <input
                                type="search" enterKeyHint="search" autoComplete="off" spellCheck={false} maxLength={100}
                                value={texto} placeholder="Buscar en el catálogo…" aria-label="Buscar en el catálogo"
                                onChange={(e) => setTexto(e.currentTarget.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            />
                            {texto && (
                                <button type="button" className={classes.buscadorBorrar} aria-label="Borrar búsqueda" onClick={() => { setTexto(''); onSearchChange(''); }}>
                                    <IconX size={17} stroke={2} />
                                </button>
                            )}
                        </label>

                        <div className={classes.barraControles}>
                            {selectorMarca}
                            {selectorOrden}
                            {interruptor}
                        </div>

                        <button type="button" className={classes.barraFiltros} data-activo={extras > 0 || undefined} onClick={() => setHojaAbierta(true)}>
                            <IconAdjustmentsHorizontal size={19} stroke={1.9} aria-hidden="true" />
                            Filtros
                            {extras > 0 && <span className={classes.barraFiltrosNum}>{extras}</span>}
                        </button>
                    </div>

                    <div className={classes.riel} ref={riel} role="group" aria-label="Especialidades">
                        <button type="button" className={classes.chip} data-activo={!selectedCategory || undefined} aria-pressed={!selectedCategory} onClick={() => onSelectCategory(null)}>
                            Todas
                        </button>
                        {chips.map(({ cat, total, etiqueta }) => {
                            const activa = selectedCategory?.id === cat.id;
                            return (
                                <button key={cat.id} type="button" className={classes.chip} data-activo={activa || undefined} aria-pressed={activa} onClick={() => onSelectCategory(activa ? null : cat)}>
                                    {etiqueta} <small>{total}</small>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {isLoading ? (
                    <div className={classes.grid} style={{ marginTop: 20 }} aria-busy="true" aria-label="Cargando el catálogo">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i} className={classes.cardSkel}>
                                <div className={classes.skel} />
                                <div className={classes.skel} style={{ width: '40%' }} />
                                <div className={classes.skel} style={{ width: '80%' }} />
                                <div className={classes.skel} style={{ width: '55%', height: 18 }} />
                            </div>
                        ))}
                    </div>
                ) : isError || !productos ? (
                    <div className={classes.vacio}>
                        <span className={classes.vacioIcono}><IconRefresh size={28} stroke={1.7} /></span>
                        <h3>No pudimos cargar el catálogo</h3>
                        <p>Revisa tu conexión e inténtalo de nuevo.</p>
                        <div className={classes.vacioAcciones}>
                            <button type="button" className={`${classes.btn} ${classes.btnOscuro}`} onClick={() => refetch()}>Reintentar</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className={classes.resumen} aria-live="polite">
                            <span><strong>{MILES.format(lista.length)}</strong> {lista.length === 1 ? 'producto' : 'productos'}</span>
                            {searchQuery && (
                                <button type="button" className={classes.quitar} onClick={() => { setTexto(''); onSearchChange(''); }} aria-label={`Quitar la búsqueda ${searchQuery}`}>
                                    «{searchQuery}» <IconX size={15} stroke={2.2} />
                                </button>
                            )}
                            {selectedCategory && (
                                <button type="button" className={classes.quitar} onClick={() => onSelectCategory(null)} aria-label="Quitar la especialidad">
                                    {nombreCategoria(selectedCategory.nombre)} <IconX size={15} stroke={2.2} />
                                </button>
                            )}
                            {marca && (
                                <button type="button" className={classes.quitar} onClick={() => setMarca('')} aria-label="Quitar la marca">
                                    {marca} <IconX size={15} stroke={2.2} />
                                </button>
                            )}
                            {soloDisponibles && (
                                <button type="button" className={classes.quitar} onClick={() => setSoloDisponibles(false)} aria-label="Ver también los agotados">
                                    Solo disponibles <IconX size={15} stroke={2.2} />
                                </button>
                            )}
                            {hayFiltros && <button type="button" className={classes.limpiar} onClick={limpiarTodo}>Limpiar todo</button>}
                        </div>

                        {mostrados.length > 0 ? (
                            <>
                                <div className={classes.grid}>
                                    {mostrados.map((p) => <ProductCard key={p.id} product={p} tasa={tasa} />)}
                                </div>

                                <div className={classes.mas}>
                                    <span className={classes.masTexto}>Viendo {MILES.format(mostrados.length)} de {MILES.format(lista.length)}</span>
                                    <div className={classes.masBarra} aria-hidden="true"><i style={{ width: `${(mostrados.length / lista.length) * 100}%` }} /></div>
                                    {restantes > 0 && (
                                        <button type="button" className={`${classes.btn} ${classes.btnLinea}`} onClick={() => setVisible((v) => v + PAGINA)}>
                                            Mostrar {Math.min(PAGINA, restantes)} más <IconChevronDown size={17} stroke={2} aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className={classes.vacio}>
                                <span className={classes.vacioIcono}><IconMoodEmpty size={30} stroke={1.6} /></span>
                                <h3>Sin resultados</h3>
                                <p>
                                    {searchQuery ? <>No encontramos «{searchQuery}» con estos filtros.</> : 'No hay productos con estos filtros.'}
                                    {' '}Si no lo ves aquí, pregúntanos: puede que lo tengamos por llegar.
                                </p>
                                <div className={classes.vacioAcciones}>
                                    {searchQuery && (selectedCategory || marca || soloDisponibles) && (
                                        <button type="button" className={`${classes.btn} ${classes.btnOscuro} ${classes.btnChico}`} onClick={() => { setMarca(''); setSoloDisponibles(false); onSelectCategory(null); }}>
                                            Buscar en todo el catálogo
                                        </button>
                                    )}
                                    <button type="button" className={`${classes.btn} ${classes.btnLinea} ${classes.btnChico}`} onClick={limpiarTodo}>Ver todos los productos</button>
                                    <a
                                        className={`${classes.btn} ${classes.btnWa} ${classes.btnChico}`} target="_blank" rel="noopener noreferrer"
                                        href={enlaceWhatsApp(SITIO.whatsapp, searchQuery ? `Hola, estoy buscando: ${searchQuery}` : 'Hola, estoy buscando un producto que no veo en la tienda.')}
                                    >
                                        <IconBrandWhatsapp size={17} stroke={1.9} aria-hidden="true" /> Preguntar por WhatsApp
                                    </a>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Teléfono: marca, orden y disponibilidad en un cajón inferior */}
            <Drawer
                opened={hojaAbierta} onClose={() => setHojaAbierta(false)} position="bottom" size="auto" padding="md"
                title="Filtros" styles={{ content: { height: 'auto', maxHeight: '90dvh', borderRadius: '24px 24px 0 0' } }}
            >
                <div className={classes.hoja}>
                    <div className={classes.hojaGrupo}>
                        <span className={classes.hojaTitulo}>Ordenar por</span>
                        <div className={classes.hojaOpciones}>
                            {ORDENES.map((o) => (
                                <button key={o.value} type="button" className={classes.chip} data-activo={orden === o.value || undefined} aria-pressed={orden === o.value} onClick={() => setOrden(o.value)}>
                                    {etiquetaOrden(o)}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className={classes.hojaGrupo}>
                        <span className={classes.hojaTitulo}>Marca</span>
                        {selectorMarca}
                    </div>
                    {interruptor}
                    <button type="button" className={`${classes.btn} ${classes.btnAzul} ${classes.btnAncho}`} onClick={() => setHojaAbierta(false)}>
                        Ver {MILES.format(lista.length)} {lista.length === 1 ? 'producto' : 'productos'}
                    </button>
                </div>
            </Drawer>
        </section>
    );
}
