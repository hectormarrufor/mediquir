import Link from 'next/link';
import { IconArrowRight, IconBrandWhatsapp, IconBuildingStore, IconMapPin, IconTruckDelivery } from '@tabler/icons-react';
import { SITIO } from '@/app/lib/seo';
import Pulso, { TRAZA_ECG } from './Pulso';
import classes from './landing.module.css';

const VENTAJAS = [
    { icono: IconBuildingStore, titulo: 'Al mayor y al detal', texto: 'Clínicas, hospitales, farmacias, consultorios y particulares: compra por unidad, por caja o por bulto.' },
    { icono: IconTruckDelivery, titulo: 'Envíos a toda Venezuela', texto: 'Despachamos desde Ciudad Ojeda a todo el país, con la empresa de transporte que prefieras.' },
    { icono: IconBrandWhatsapp, titulo: 'Atención por WhatsApp', texto: 'Te asesoramos, cotizamos y coordinamos tu pedido de forma rápida y directa.' },
    { icono: IconMapPin, titulo: 'Ciudad Ojeda, Zulia', texto: 'Casco Central, Calle Venezuela entre Av. Bolívar y Av. Alonso. Ven a conocernos.' },
];

// Mismo punto que usa el pago para calcular el delivery (la tienda en el Casco Central)
const MAPA = 'https://www.google.com/maps/search/?api=1&query=10.195099414915264,-71.31187255102861';

// Texto de la portada para buscadores y para las personas: quiénes somos y a dónde enviamos, junto a una foto real de la tienda.
// Se arma en el servidor, así Google lo lee completo sin ejecutar JavaScript. Las categorías las lista la sección de categorías y el sitemap.
export default function SeccionSeo() {
    return (
        <section className={classes.nosotros} aria-labelledby="quienes-somos">
            <div className={classes.wrap}>
                <div className={classes.nosotrosGrid}>
                    <div className={`${classes.nosotrosTexto} ${classes.aparece}`}>
                        <p className={classes.eyebrow}><Pulso /> Distribuidora médica · Ciudad Ojeda, Zulia</p>
                        <h2 id="quienes-somos" className={classes.h2}>
                            Materiales y equipos médico-quirúrgicos <em>para toda Venezuela</em>
                        </h2>
                        <p className={classes.lead}>
                            {SITIO.nombre} distribuye insumos médicos y equipos quirúrgicos: jeringas, agujas, guantes, mascarillas, catéteres, gasas, drenajes,
                            circuitos de anestesia y mucho más. Compra en la tienda en línea, escríbenos por WhatsApp o visítanos en {SITIO.ciudad}, estado {SITIO.estado}.
                        </p>

                        <ul className={classes.ventajas}>
                            {VENTAJAS.map((v) => (
                                <li key={v.titulo} className={classes.ventaja}>
                                    <span className={classes.ventajaIcono}><v.icono size={23} stroke={1.6} aria-hidden="true" /></span>
                                    <div>
                                        <h3>{v.titulo}</h3>
                                        <p>{v.texto}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <figure className={`${classes.retrato} ${classes.aparece}`}>
                        <div className={classes.retratoMarco}>
                            <img
                                src="/tenants/mediquir/hero-2-lg.jpg" width="1600" height="900" loading="lazy" decoding="async"
                                alt="Interior de la tienda Mediquir en Ciudad Ojeda: estantes con insumos médicos y el mostrador de atención al cliente"
                            />
                        </div>
                        <a className={classes.retratoPie} href={MAPA} target="_blank" rel="noopener noreferrer">
                            <span><IconMapPin size={21} stroke={1.8} aria-hidden="true" /></span>
                            <span>
                                <strong>Visítanos en {SITIO.ciudad}</strong>
                                <small>Calle Venezuela, entre Av. Bolívar y Av. Alonso · Casco Central. Ver en el mapa</small>
                            </span>
                        </a>
                    </figure>
                </div>

                <div className={`${classes.llamado} ${classes.aparece}`}>
                    <svg className={classes.llamadoTraza} viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true">
                        <path d={TRAZA_ECG} />
                    </svg>
                    <div>
                        <h3>¿Buscas algo en especial o necesitas cotizar al mayor?</h3>
                        <p>Escríbenos y te respondemos con disponibilidad, precios y tiempos de envío.</p>
                    </div>
                    <div className={classes.llamadoAcciones}>
                        <a className={`${classes.btn} ${classes.btnWa}`} href={`https://wa.me/${SITIO.whatsapp}`} target="_blank" rel="noopener noreferrer">
                            <IconBrandWhatsapp size={19} stroke={1.9} aria-hidden="true" /> Escribir por WhatsApp
                        </a>
                        <Link className={`${classes.btn} ${classes.btnBlanco}`} href="/envios-nacionales">
                            Envíos nacionales <IconArrowRight size={17} stroke={2} aria-hidden="true" />
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}
