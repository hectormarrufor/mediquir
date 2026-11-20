'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MantineThemeProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconCheck } from '@tabler/icons-react';

import HeroSection from './components/landing/HeroSection';
import InfoEnvios from './components/landing/InfoEnvios';
import MarcasCinta from './components/landing/MarcasCinta';
import CategorySection from './components/landing/CategorySection';
import DestacadosSection from './components/landing/DestacadosSection';
import CatalogoSection from './components/landing/CatalogoSection';
import FooterSection from './components/landing/FooterSection';
import { CarritoDrawer, FlotantesTienda } from './components/landing/CarritoTienda';
import { darPorRestaurada, estadoRestaurable, guardarEstadoTienda } from './components/landing/tiendaEstado';
import CantidadProductoModal from './components/ui/CantidadProductoModal';
import { useCart } from './components/landing/CartContext';
import { TiendaProvider } from './components/landing/TiendaContext';
import { temaTienda } from './components/landing/temaTienda';
import { getPricing, presentacionesTienda } from './components/landing/productUtils';
import { rutaProducto } from '@/app/lib/seo';
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
    const router = useRouter();
    const [cartOpened, setCartOpened] = useState(false);
    const { addToCart, unidadesEnCarrito } = useCart();

    // --- FILTROS DE LA TIENDA (los comparten el buscador del encabezado, las marcas, las especialidades y el catálogo) ---
    // Al volver de la página de un producto la lista queda como estaba (búsqueda, especialidad, marca, filtros y posición)
    const [restaurada] = useState(() => estadoRestaurable());
    const [searchQuery, setSearchQuery] = useState(() => restaurada?.searchQuery ?? '');
    const [selectedCategory, setSelectedCategory] = useState(() => restaurada?.selectedCategory ?? null);
    const [selectedBrand, setSelectedBrand] = useState(() => restaurada?.marca ?? '');
    const posicion = useRef({ searchQuery, selectedCategory, marca: selectedBrand });
    posicion.current = { searchQuery, selectedCategory, marca: selectedBrand };

    useEffect(() => {
        if (!restaurada) return undefined;
        // El catálogo tarda en llegar: se espera a que la página sea lo bastante alta antes de bajar a donde estaba
        let intentos = 0;
        let marco;
        const bajar = () => {
            intentos += 1;
            const alto = document.documentElement.scrollHeight - window.innerHeight;
            if (alto >= restaurada.scrollY - 4 || intentos > 90) { window.scrollTo(0, restaurada.scrollY); darPorRestaurada(); return; }
            marco = requestAnimationFrame(bajar);
        };
        marco = requestAnimationFrame(bajar);
        return () => cancelAnimationFrame(marco);
    }, [restaurada]);

    // Enlaces desde Google o desde una ficha de producto: /?buscar=jeringa muestra esa búsqueda en la tienda
    useEffect(() => {
        const q = new URLSearchParams(window.location.search).get('buscar');
        if (q && !restaurada) setSearchQuery(q.slice(0, 100));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const scrollToProducts = useCallback(() => {
        document.getElementById('productos-section')?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    // Búsqueda desde el encabezado: es global, así que suelta la especialidad y la marca
    const handleSearch = (query) => {
        setSearchQuery(query);
        setSelectedCategory(null);
        setSelectedBrand('');
        scrollToProducts();
    };

    // Elegir una especialidad en su sección: empieza de cero en esa especialidad y baja al catálogo
    const handleSelectCategory = (category) => {
        setSelectedCategory(category);
        setSearchQuery('');
        scrollToProducts();
    };

    // Elegir una marca desde la cinta: filtra el catálogo por esa marca y baja al catálogo
    const handleSelectBrandFromRibbon = (brand) => {
        setSelectedBrand((actual) => (actual === brand ? '' : brand));
        setSelectedCategory(null);
        setSearchQuery('');
        scrollToProducts();
    };

    const handleClearFilters = () => {
        setSearchQuery('');
        setSelectedCategory(null);
        setSelectedBrand('');
    };

    // --- PÁGINA DEL PRODUCTO Y «¿CUÁNTO VAS A AGREGAR?»: la pregunta es una sola para toda la página ---
    const [pregunta, setPregunta] = useState(null); // { product, clave }: producto y presentación con que se abre la pregunta
    // Tocar un producto abre su página propia; antes se guarda cómo está la lista para dejarla igual al volver
    const abrirDetalle = useCallback((product) => {
        guardarEstadoTienda({ ...posicion.current, scrollY: window.scrollY });
        router.push(rutaProducto(product));
    }, [router]);
    const pedirCantidad = useCallback((product, clave = 'UNIDAD') => setPregunta({ product, clave }), []);
    const tienda = useMemo(() => ({ abrirDetalle, pedirCantidad }), [abrirDetalle, pedirCantidad]);

    const confirmarCantidad = (clave, n) => {
        const { product } = pregunta;
        addToCart(product, n, getPricing(product).precioFinal, clave);
        const pres = presentacionesTienda(product).find((p) => p.clave === clave);
        notifications.show({ message: `${n} ${n === 1 ? pres.singular : pres.plural} de ${product.nombre} añadido al carrito`, color: 'teal', icon: <IconCheck size={16} />, autoClose: 2200, position: 'top-center' });
    };

    const stockPregunta = pregunta ? Number(pregunta.product.stockAlmacen) || 0 : 0;

    return (
        <MantineThemeProvider theme={temaTienda}>
            <TiendaProvider value={tienda}>
                <div className={`${classes.tienda} ${fuenteTienda.className}`}>
                    <style dangerouslySetInnerHTML={{ __html: VARIABLES_TIENDA }} />

                    <HeroSection
                        searchQuery={searchQuery}
                        onSearch={handleSearch}
                        onVerCatalogo={scrollToProducts}
                    />

                    <InfoEnvios />

                    <MarcasCinta
                        marcaActiva={selectedBrand}
                        onSelectMarca={handleSelectBrandFromRibbon}
                    />

                    <CategorySection
                        selectedCategory={selectedCategory}
                        onSelectCategory={handleSelectCategory}
                        onVerTodo={() => { handleClearFilters(); scrollToProducts(); }}
                    />

                    <DestacadosSection />

                    <CatalogoSection
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        selectedCategory={selectedCategory}
                        onSelectCategory={setSelectedCategory}
                        selectedBrand={selectedBrand}
                        onSelectBrand={setSelectedBrand}
                        onClearFilters={handleClearFilters}
                    />

                    {seo}

                    <FooterSection />

                    <FlotantesTienda onAbrirCarrito={() => setCartOpened(true)} />

                    {pregunta && (
                        <CantidadProductoModal
                            opened onClose={() => setPregunta(null)} nombre={pregunta.product.nombre}
                            presentaciones={presentacionesTienda(pregunta.product)} claveInicial={pregunta.clave}
                            maxUnidades={Math.max(0, stockPregunta - unidadesEnCarrito(pregunta.product.id))} onConfirmar={confirmarCantidad} ocultarExistencias
                        />
                    )}

                    <CarritoDrawer opened={cartOpened} onClose={() => setCartOpened(false)} onVerCatalogo={scrollToProducts} />
                </div>
            </TiendaProvider>
        </MantineThemeProvider>
    );
}
