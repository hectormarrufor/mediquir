import React from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { IconInfoCircle, IconAlertTriangle, IconAlertOctagon } from '@tabler/icons-react';

dayjs.extend(relativeTime);

// Icono y color de Mantine según el tipo de notificación
export function getTipoMeta(tipo, size = 16) {
    if (tipo === 'Critico') return { color: 'red', icon: <IconAlertOctagon size={size} /> };
    if (tipo === 'Alerta') return { color: 'orange', icon: <IconAlertTriangle size={size} /> };
    return { color: 'brand', icon: <IconInfoCircle size={size} /> };
}

// "hace 5 minutos" (el locale 'es' se configura globalmente en ClientLayout)
export function tiempoRelativo(notif) {
    return notif.createdAt ? dayjs(notif.createdAt).fromNow() : notif.fechaHoraCaracas || '';
}
