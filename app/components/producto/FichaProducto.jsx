'use client';

// Página propia de un producto de la tienda: fotos, datos, ficha técnica, caja de compra (precio, presentación, cantidad y agregar al carrito),
// características, información importante, información adicional y productos parecidos.
// Lleva su propio carrito (el mismo de la portada) porque la página se abre sola, sin pasar por la portada.
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MantineThemeProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconArrowLeft, IconBrandWhatsapp, IconCheck, IconMapPin, IconMinus, IconPlus, IconShare3, IconShoppingBagPlus, IconTruckDelivery,
} from '@tabler/icons-react';
import { CartProvider, useCart } from '@/app/components/landing/CartContext';
import { CarritoDrawer, FlotantesTienda } from '@/app/components/landing/CarritoTienda';
import BuscadorTienda from '@/app/components/landing/BuscadorTienda';
import ProductCard from '@/app/components/landing/ProductCard';
import CantidadProductoModal from '@/app/components/ui/CantidadProductoModal';
import { TiendaProvider } from '@/app/components/landing/TiendaContext';
import { useCatalogo } from '@/app/components/landing/useCatalogo';
import { marcarRestaurarTienda, vinoDeLaLista } from '@/app/components/landing/tiendaEstado';
import { temaTienda } from '@/app/components/landing/temaTienda';
import {
    enlaceWhatsApp, estadoStock, formatearBs, formatearPrecio, getPresentacionLabel, getPricing, getProductImages, nombreCategoria, presentacionesTienda,
} from '@/app/components/landing/productUtils';
import { aBolivares, calcularFactura, montoRenglon } from '@/app/constants/facturacion';
import { SITIO, etiquetasVisibles, rutaCategoria, rutaProducto } from '@/app/lib/seo';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { fuenteTienda } from '@/app/fonts/tienda';
import landing from '@/app/components/landing/landing.module.css';
import estilos from './producto.module.css';

const FILAS_VISIBLES = 8;

// Filas de la ficha técnica: lo que ya sabemos del producto + lo investigado (sin repetir etiquetas)
function filasFicha(p) {
    const filas = [];
    const poner = (etiqueta, valor) => {
        if (valor === null || valor === undefined || String(valor).trim() === '') return;
        if (filas.some((f) => f.etiqueta.toLowerCase() === etiqueta.toLowerCase())) return;
        filas.push({ etiqueta, valor: String(valor) });
    };
    poner('Marca', p.marca?.nombre);
    for (const f of Array.isArray(p.fichaTecnica) ? p.fichaTecnica : []) poner(String(f?.etiqueta || '').trim(), f?.valor);
    poner('Categoría', p.categoria?.nombre ? nombreCategoria(p.categoria.nombre) : null);
    poner('Presentación', getPresentacionLabel(p));
    const caja = presentacionesTienda(p).find((x) => x.clave === 'CAJA');
    if (caja) poner('Unidades por caja', caja.unidades);
    poner('Código', p.codigo);
    return filas;
}

function FichaTecnica({ producto }) {
    const filas = useMemo(() => filasFicha(producto), [producto]);
    const [todas, setTodas] = useState(false);
    const visibles = todas ? filas : filas.slice(0, FILAS_VISIBLES);
    return (
        <section className={estilos.ficha} aria-labelledby="ficha-tecnica">
            <h2 id="ficha-tecnica">Ficha técnica</h2>
            <dl style={{ margin: 0 }}>
                {visibles.map((f) => (
                    <div key={f.etiqueta} className={estilos.fila}>
                        <dt>{f.etiqueta}</dt>
                        <dd>{f.valor}</dd>
                    </div>
                ))}
            </dl>
            {filas.length > FILAS_VISIBLES && (
                <button type="button" className={estilos.masMenos} onClick={() => setTodas((v) => !v)}>{todas ? 'Ver menos' : 'Ver más'}</button>
            )}
        </section>
    );
}

function CajaCompra({ product, onVerCarrito }) {
    const { addToCart, unidadesEnCarrito } = useCart();
    const { tasa } = useTasaBcv();
    const opciones = presentacionesTienda(product);
    const [clave, setClave] = useState('UNIDAD');
    const [cantidad, setCantidad] = useState(1);
    const pres = opciones.find((o) => o.clave === clave) || opciones[0];

    const { stock, precioBase, porcentajeAhorro, hasDiscount, precioFinal, isOutOfStock } = getPricing(product);
    const estado = estadoStock(product);
    const porcentajeIva = Number(product?.porcentajeIva) || 0;
    const enCarrito = unidadesEnCarrito(product.id);
    const disponible = Math.floor(Math.max(0, stock - enCarrito) / pres.unidades);
    const precioPres = pres.unidades > 1 ? montoRenglon(precioFinal, pres.unidades) : precioFinal;
    const { montoIva: ivaPres, subtotal: basePres } = calcularFactura({ renglones: [{ precioUnitario: precioFinal, cantidad: pres.unidades, aplicaIva: porcentajeIva > 0, porcentajeIva }] });
    const totalPres = Math.round((basePres + ivaPres) * 100) / 100;

    const agregar = () => {
        addToCart(product, cantidad, precioFinal, pres.clave);
        notifications.show({
            message: `${cantidad} × ${pres.unidades > 1 ? `${pres.etiqueta} de ` : ''}${product.nombre} añadido al carrito`,
            color: 'teal', icon: <IconCheck size={16} />, autoClose: 2500, position: 'top-center',
        });
        setCantidad(1);
    };

    return (
        <aside className={estilos.compra} aria-label="Comprar">
            <div>
                <div className={estilos.precio} data-oferta={(hasDiscount && pres.unidades === 1) || undefined}>
                    Ref ${formatearPrecio(precioPres)}
                    {hasDiscount && pres.unidades === 1 && <s>${formatearPrecio(precioBase)}</s>}
                </div>
                <div className={estilos.precioPie}>
                    {pres.unidades > 1 ? `por ${pres.singular} · Ref $${formatearPrecio(precioFinal)} c/u` : hasDiscount ? `Ahorras ${porcentajeAhorro}%` : `por ${getPresentacionLabel(product).toLowerCase()}`}
                </div>
            </div>

            <span className={estilos.estado} data-estado={estado.clave}>{estado.texto}</span>

            {opciones.length > 1 && (
                <div className={landing.segmento} role="group" aria-label="¿Cómo la quieres?">
                    {opciones.map((o) => (
                        <button key={o.clave} type="button" data-activo={o.clave === pres.clave || undefined} aria-pressed={o.clave === pres.clave} onClick={() => { setClave(o.clave); setCantidad(1); }}>
                            {o.etiqueta}
                        </button>
                    ))}
                </div>
            )}

            <div>
                <div className={estilos.linea}><span>{porcentajeIva > 0 ? `IVA (${porcentajeIva}%)` : 'IVA'}</span><b>{porcentajeIva > 0 ? `$${formatearPrecio(ivaPres)}` : 'Exento'}</b></div>
                <div className={estilos.linea} data-fuerte><span>Total</span><b>Ref ${formatearPrecio(totalPres)}</b></div>
                {tasa && <div className={estilos.precioBs} style={{ marginTop: 6 }}>Bs {formatearBs(aBolivares(totalPres, tasa))} <span className={estilos.dato}>· tasa BCV {formatearBs(tasa)}</span></div>}
            </div>

            {isOutOfStock ? (
                <>
                    <p className={landing.detalleAviso} data-tono="gris">Producto temporalmente agotado. Escríbenos y te avisamos cuando llegue.</p>
                    <a className={`${landing.btn} ${landing.btnWa} ${landing.btnAncho}`} target="_blank" rel="noopener noreferrer"
                        href={enlaceWhatsApp(SITIO.whatsapp, `Hola, quisiera saber cuándo tendrán disponible: ${product.nombre}`)}>
                        <IconBrandWhatsapp size={19} stroke={1.9} aria-hidden="true" /> Consultar por WhatsApp
                    </a>
                </>
            ) : disponible <= 0 ? (
                <>
                    <p className={landing.detalleAviso}>{enCarrito > 0 ? 'Ya tienes en tu carrito todo lo disponible.' : `Por ahora no tenemos suficiente para una ${pres.singular}.`}</p>
                    {enCarrito > 0 && <button type="button" className={`${landing.btn} ${landing.btnAzul} ${landing.btnAncho}`} onClick={onVerCarrito}>Ver mi carrito</button>}
                </>
            ) : (
                <>
                    <div className={landing.cantidadFila}>
                        <span>Cantidad{pres.unidades > 1 && <small>{cantidad * pres.unidades} unidades en total</small>}</span>
                        <div className={landing.contador}>
                            <button type="button" aria-label="Menos" disabled={cantidad <= 1} onClick={() => setCantidad((q) => Math.max(1, q - 1))}><IconMinus size={17} stroke={2.2} /></button>
                            <output aria-live="polite">{cantidad}</output>
                            <button type="button" aria-label="Más" disabled={cantidad >= disponible} onClick={() => setCantidad((q) => Math.min(disponible, q + 1))}><IconPlus size={17} stroke={2.2} /></button>
                        </div>
                    </div>
                    <button type="button" className={`${landing.btn} ${landing.btnAzul} ${landing.btnAncho}`} style={{ minHeight: 52, fontSize: 16 }} onClick={agregar}>
                        <IconShoppingBagPlus size={20} stroke={1.9} aria-hidden="true" /> Agregar al carrito · ${formatearPrecio(montoRenglon(precioFinal, pres.unidades * cantidad))}
                    </button>
                    {enCarrito > 0 && <button type="button" className={estilos.masMenos} onClick={onVerCarrito}>Ya tienes {enCarrito} en el carrito · Ver carrito</button>}
                </>
            )}

            <div className={estilos.entrega}>
                <div><IconMapPin size={18} aria-hidden="true" /><span>Retiro y entrega inmediata en <b>{SITIO.ciudad}</b>, {SITIO.estado}.</span></div>
                <div><IconTruckDelivery size={18} aria-hidden="true" /><span>Envíos a toda Venezuela. <Link href="/envios-nacionales">Ver cómo son</Link></span></div>
            </div>
        </aside>
    );
}

function Contenido({ producto, relacionados }) {
    const router = useRouter();
    const { data: catalogo } = useCatalogo();
    const [imagen, setImagen] = useState(0);
    const [cartOpened, setCartOpened] = useState(false);
    const [pregunta, setPregunta] = useState(null);
    const { addToCart, unidadesEnCarrito } = useCart();

    const imagenes = getProductImages(producto);
    const etiquetas = etiquetasVisibles(producto.tags);
    const { hasDiscount, porcentajeAhorro } = getPricing(producto);

    // La flecha «atrás» del navegador también debe dejar la lista como estaba
    useEffect(() => {
        const alVolver = () => marcarRestaurarTienda();
        window.addEventListener('popstate', alVolver);
        return () => window.removeEventListener('popstate', alVolver);
    }, []);
    useEffect(() => { window.scrollTo(0, 0); }, [producto.id]);

    const volver = () => {
        // Si se llegó desde la lista, «volver» regresa a ella tal como estaba; si se llegó directo (Google, un enlace), va a la tienda
        if (vinoDeLaLista()) { marcarRestaurarTienda(); router.back(); }
        else router.push('/#productos-section');
    };

    const compartir = async () => {
        const url = `${SITIO.url}${rutaProducto(producto)}`;
        try {
            if (navigator.share) { await navigator.share({ title: producto.nombre, text: `${producto.nombre} en ${SITIO.nombre}`, url }); return; }
            await navigator.clipboard.writeText(url);
            notifications.show({ color: 'teal', icon: <IconCheck size={16} />, message: 'Enlace copiado', autoClose: 2000, position: 'top-center' });
        } catch (e) {
            if (e?.name !== 'AbortError') notifications.show({ color: 'red', message: 'No se pudo compartir el enlace' });
        }
    };

    // En esta página tocar otro producto lo abre (sin guardar nada de la lista); «agregar» de los parecidos pregunta la cantidad
    const tienda = useMemo(() => ({
        abrirDetalle: (p) => router.push(rutaProducto(p)),
        pedirCantidad: (p, clave = 'UNIDAD') => setPregunta({ product: p, clave }),
    }), [router]);
    const confirmarCantidad = (clave, n) => {
        const { product } = pregunta;
        addToCart(product, n, getPricing(product).precioFinal, clave);
        const pres = presentacionesTienda(product).find((x) => x.clave === clave);
        notifications.show({ message: `${n} ${n === 1 ? pres.singular : pres.plural} de ${product.nombre} añadido al carrito`, color: 'teal', icon: <IconCheck size={16} />, autoClose: 2200, position: 'top-center' });
    };

    const puntos = Array.isArray(producto.puntosClave) ? producto.puntosClave.filter(Boolean) : [];
    const adicional = Array.isArray(producto.infoAdicional) ? producto.infoAdicional.filter((s) => s?.titulo && s?.texto) : [];
    const parrafos = String(producto.descripcion || '').split(/\n{2,}/).map((t) => t.trim()).filter(Boolean);

    return (
        <TiendaProvider value={tienda}>
            <div className={`${landing.tienda} ${fuenteTienda.className}`}>
                <header className={estilos.barra}>
                    <div className={estilos.barraDentro}>
                        <Link href="/" className={estilos.logo} aria-label="Mediquir, ir a la tienda"><img src={SITIO.logo} alt="Mediquir" /></Link>
                        <div className={estilos.buscar}>
                            <BuscadorTienda productos={catalogo} onBuscar={(q) => router.push(`/?buscar=${encodeURIComponent(q)}#productos-section`)} placeholder="Busca otro producto…" />
                        </div>
                        <Link href="/#productos-section" className={estilos.irTienda}>Ver tienda</Link>
                    </div>
                </header>

                <main className={estilos.pagina}>
                    <nav className={estilos.migas} aria-label="Ruta">
                        <button type="button" className={estilos.volver} onClick={volver}><IconArrowLeft size={16} aria-hidden="true" /> Volver</button>
                        <Link href="/">Inicio</Link> /
                        {producto.categoria && <><Link href={rutaCategoria(producto.categoria)}>{nombreCategoria(producto.categoria.nombre)}</Link> /</>}
                        <b>{producto.nombre}</b>
                    </nav>

                    <div className={estilos.principal}>
                        <div className={estilos.galeria}>
                            {imagenes.length > 1 && (
                                <div className={estilos.miniaturas}>
                                    {imagenes.map((img, i) => (
                                        <button key={img.src} type="button" className={estilos.mini} data-activa={i === imagen || undefined} onClick={() => setImagen(i)} aria-label={`Ver foto: ${img.label}`}>
                                            <img src={img.src} alt="" loading="lazy" />
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className={estilos.foto}>
                                <img src={imagenes[Math.min(imagen, imagenes.length - 1)].src} alt={producto.nombre} />
                                {hasDiscount && <span className={estilos.oferta}>{porcentajeAhorro}% ¡Aprovecha!</span>}
                            </div>
                        </div>

                        <div className={estilos.datos}>
                            {producto.marca?.nombre && <span className={estilos.marca}>{producto.marca.nombre}</span>}
                            <h1 className={estilos.titulo}>{producto.nombre}</h1>
                            <span className={estilos.codigo}>Código {producto.codigo}</span>
                            <div className={estilos.acciones}>
                                <button type="button" className={estilos.accion} onClick={compartir}><IconShare3 size={17} aria-hidden="true" /> Compartir</button>
                            </div>
                            <a className={estilos.asesor} target="_blank" rel="noopener noreferrer"
                                href={enlaceWhatsApp(SITIO.whatsapp, `Hola, tengo una consulta sobre: ${producto.nombre}`)}>
                                <span className={estilos.asesorIcono}><IconBrandWhatsapp size={22} aria-hidden="true" /></span>
                                <span>
                                    <strong>Consulta con un asesor por WhatsApp</strong>
                                    <small>Ej: ¿Qué medida o presentación me conviene?</small>
                                </span>
                            </a>
                            <FichaTecnica producto={producto} />
                        </div>

                        <CajaCompra product={producto} onVerCarrito={() => setCartOpened(true)} />
                    </div>

                    {parrafos.length > 0 && (
                        <section className={estilos.bloque} aria-labelledby="caracteristicas">
                            <h2 id="caracteristicas">Características de {producto.nombre}</h2>
                            {parrafos.map((t) => <p key={t.slice(0, 40)}>{t}</p>)}
                        </section>
                    )}

                    {puntos.length > 0 && (
                        <section className={estilos.bloque} aria-labelledby="importante">
                            <h2 id="importante">Información importante del producto</h2>
                            <ul className={estilos.vinetas}>{puntos.map((t) => <li key={t.slice(0, 50)}>{t}</li>)}</ul>
                        </section>
                    )}

                    {(adicional.length > 0 || etiquetas.length > 0) && (
                        <section className={`${estilos.bloque} ${estilos.dos}`}>
                            {adicional.length > 0 && (
                                <div style={{ gridColumn: etiquetas.length ? undefined : '1 / -1' }}>
                                    <h2>Información adicional</h2>
                                    <div className={estilos.acordeon}>
                                        {adicional.map((s) => (
                                            <details key={s.titulo}><summary>{s.titulo}</summary><p>{s.texto}</p></details>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {etiquetas.length > 0 && (
                                <div>
                                    <h2>También se busca como</h2>
                                    <div className={estilos.chips}>{etiquetas.map((t) => <span key={t} className={estilos.chip}>{t}</span>)}</div>
                                </div>
                            )}
                        </section>
                    )}

                    {relacionados.length > 0 && (
                        <section className={estilos.bloque} aria-labelledby="parecidos">
                            <h2 id="parecidos">Productos parecidos</h2>
                            <ParecidosRiel productos={relacionados} />
                        </section>
                    )}

                    <section className={estilos.bloque}>
                        <h2>{producto.nombre} en {SITIO.ciudad}, {SITIO.estado}</h2>
                        <p>
                            En {SITIO.nombre} ({SITIO.razonSocial}) vendemos materiales y equipos médico-quirúrgicos al mayor y al detal desde {SITIO.ciudad}, estado {SITIO.estado}.
                            {' '}Hacemos envíos a toda Venezuela. <Link href="/envios-nacionales">Ver cómo son los envíos nacionales</Link>.
                        </p>
                        <p>Estamos en {SITIO.direccion}. Escríbenos por WhatsApp o llámanos al {SITIO.telefono.replace('+58-', '0')}.</p>
                    </section>
                </main>

                <FlotantesTienda onAbrirCarrito={() => setCartOpened(true)} />
                <CarritoDrawer opened={cartOpened} onClose={() => setCartOpened(false)} onVerCatalogo={() => router.push('/#productos-section')} />

                {pregunta && (
                    <CantidadProductoModal
                        opened onClose={() => setPregunta(null)} nombre={pregunta.product.nombre}
                        presentaciones={presentacionesTienda(pregunta.product)} claveInicial={pregunta.clave}
                        maxUnidades={Math.max(0, (Number(pregunta.product.stockAlmacen) || 0) - unidadesEnCarrito(pregunta.product.id))} onConfirmar={confirmarCantidad} ocultarExistencias
                    />
                )}
            </div>
        </TiendaProvider>
    );
}

function ParecidosRiel({ productos }) {
    const { tasa } = useTasaBcv();
    return (
        <div className={estilos.riel}>
            {productos.map((p) => <ProductCard key={p.id} product={p} tasa={tasa} />)}
        </div>
    );
}

export default function FichaProducto(props) {
    return (
        <MantineThemeProvider theme={temaTienda}>
            <CartProvider>
                <Contenido {...props} />
            </CartProvider>
        </MantineThemeProvider>
    );
}
