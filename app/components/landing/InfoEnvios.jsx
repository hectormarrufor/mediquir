'use client';

import React from 'react';
import { IconClockHour4, IconDeviceMobile, IconMotorbike, IconTruckDelivery } from '@tabler/icons-react';
import { ZONAS_DELIVERY } from '@/app/constants/zonasDelivery';
import classes from './landing.module.css';

// Lo primero que un cliente nuevo quiere saber antes de armar su carrito: cómo se entrega, cuándo se despacha y cómo se paga.
// Es una sola tarjeta que monta sobre el borde inferior del encabezado.
const DATOS = [
    { icono: IconMotorbike, titulo: 'Delivery', texto: `${ZONAS_DELIVERY.slice(0, -1).join(', ')} y ${ZONAS_DELIVERY.at(-1)}` },
    { icono: IconTruckDelivery, titulo: 'Envío nacional', texto: 'Por Zoom, con cobro a destino' },
    { icono: IconClockHour4, titulo: 'Despachos', texto: 'Lun–Vie hasta 4:30 p. m. · Sáb hasta 12:30 p. m.' },
    { icono: IconDeviceMobile, titulo: 'Pago Móvil', texto: 'Precios en dólares y bolívares a tasa BCV' },
];

export default function InfoEnvios() {
    return (
        <section className={`${classes.wrap} ${classes.servicios}`} aria-label="Entregas, despachos y pagos">
            <ul className={classes.serviciosLista}>
                {DATOS.map((d) => (
                    <li key={d.titulo} className={classes.servicio}>
                        <span className={classes.servicioIcono}><d.icono size={22} stroke={1.7} aria-hidden="true" /></span>
                        <div>
                            <strong>{d.titulo}</strong>
                            <span>{d.texto}</span>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
