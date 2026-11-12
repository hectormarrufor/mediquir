'use client';

import Link from 'next/link';
import { IconBrandInstagram, IconBrandWhatsapp, IconClockHour4, IconMail, IconMapPin } from '@tabler/icons-react';
import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';
import { SITIO } from '@/app/lib/seo';
import classes from './landing.module.css';

const MAPA = 'https://www.google.com/maps/search/?api=1&query=10.195099414915264,-71.31187255102861';

function WhatsApp({ numero, children }) {
    return (
        <li>
            <a href={`https://wa.me/${numero}`} target="_blank" rel="noopener noreferrer">
                <IconBrandWhatsapp size={18} stroke={1.7} aria-hidden="true" /> {children}
            </a>
        </li>
    );
}

export default function FooterSection() {
    const subir = (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); };

    return (
        <footer id="contacto" className={classes.pie}>
            <div className={classes.wrap}>
                <div className={classes.pieGrid}>
                    <div className={classes.pieMarca}>
                        <span className={classes.pieLogo}>
                            <img src="/tenants/mediquir/logo-header@2x.png" alt="Mediquir, Materiales y Equipos Quirúrgicos, C.A." width="437" height="224" loading="lazy" />
                        </span>
                        <p>Salud y bienestar a tu alcance. Distribución de insumos médicos con servicio, rapidez y calidad.</p>
                    </div>

                    <nav className={classes.pieCol} aria-label="Tienda">
                        <h3>Tienda</h3>
                        <ul>
                            <li><a href="#" onClick={subir}>Inicio</a></li>
                            <li><a href="#especialidades">Especialidades</a></li>
                            <li><a href="#productos-section">Catálogo</a></li>
                            <li><Link href="/envios-nacionales">Envíos nacionales</Link></li>
                            <li><Link href="/login">Ingresar a mi cuenta</Link></li>
                        </ul>
                    </nav>

                    <div className={classes.pieCol}>
                        <h3>Ventas al detal</h3>
                        <ul>
                            <WhatsApp numero="584141680773">0414-1680773</WhatsApp>
                            <WhatsApp numero="584146501059">0414-6501059</WhatsApp>
                        </ul>
                    </div>

                    <div className={classes.pieCol}>
                        <h3>Ventas al mayor</h3>
                        <ul>
                            <WhatsApp numero="584141680773">0414-1680773</WhatsApp>
                            <WhatsApp numero="584149701172">0414-9701172</WhatsApp>
                        </ul>
                    </div>

                    <div className={`${classes.pieCol} ${classes.pieAncha}`}>
                        <h3>Contacto</h3>
                        <ul>
                            <li>
                                <a href={MAPA} target="_blank" rel="noopener noreferrer" style={{ alignItems: 'flex-start' }}>
                                    <IconMapPin size={18} stroke={1.7} aria-hidden="true" style={{ marginTop: 2 }} />
                                    <span>Calle Venezuela, entre Av. Bolívar y Av. Alonso, Casco Central, {SITIO.ciudad}</span>
                                </a>
                            </li>
                            <li>
                                <span style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                                    <IconClockHour4 size={18} stroke={1.7} aria-hidden="true" style={{ marginTop: 2 }} />
                                    <span>Despachos: lun a vie hasta 4:30 p. m. <small>Sábados hasta 12:30 p. m.</small></span>
                                </span>
                            </li>
                            <li><a href={`mailto:${SITIO.email}`}><IconMail size={18} stroke={1.7} aria-hidden="true" /> {SITIO.email}</a></li>
                            <li><a href={SITIO.instagram} target="_blank" rel="noopener noreferrer"><IconBrandInstagram size={18} stroke={1.7} aria-hidden="true" /> @mediquirca</a></li>
                        </ul>
                    </div>
                </div>

                <div className={classes.pieBase}>
                    <span>© {new Date().getFullYear()} Mediquir C.A. · RIF {MEMBRETE_MEDIQUIR.rif} · Todos los derechos reservados.</span>
                    <ul className={classes.piePagos} aria-label="Formas de pago">
                        <li>Pago Móvil</li>
                        <li>Efectivo</li>
                        <li>Zelle</li>
                    </ul>
                </div>
            </div>
        </footer>
    );
}
