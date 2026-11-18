'use client';

// Al asentar un abono se ofrece imprimir el recibo de pago de una vez (antes había que ir a la lista de abonos y tocar el icono verde de imprimir).
// Genera el recibo de ese abono (si ya existía, abre el mismo: no gasta otro número) y lo abre en una pestaña nueva lista para imprimir.
import React, { useState } from 'react';
import { Button, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPrinter } from '@tabler/icons-react';
import { Dialogo } from './Piezas';
import { enviar } from './utilidades';

export default function OfertaReciboAbono({ abonoId, documento, resumen, onCerrar }) {
    const [generando, setGenerando] = useState(false);

    const imprimir = async () => {
        // La pestaña se abre YA, con el toque del botón: si se abriera después de esperar al servidor, el navegador la bloquearía
        const ventana = window.open('', '_blank');
        setGenerando(true);
        try {
            const r = await enviar('/api/finanzas/cxc/recibo', 'POST', { abonoIds: [abonoId] });
            const url = `/superuser/recibos/${r.id}`;
            if (ventana) ventana.location.href = url; else window.open(url, '_blank');
            notifications.show({ color: 'teal', message: r.yaExistia ? `Recibo N.º ${r.numero} (ya existía)` : `Recibo N.º ${r.numero} generado` });
            onCerrar();
        } catch (e) {
            if (ventana) ventana.close();
            notifications.show({ color: 'red', title: 'No se generó el recibo', message: `${e.message} Puedes hacerlo luego desde la lista de abonos.` });
            setGenerando(false);
        }
    };

    return (
        <Dialogo abierto onCerrar={onCerrar} titulo="Abono registrado">
            <Stack gap="sm">
                <Text size="sm">{resumen || `El abono a ${documento} quedó registrado.`}</Text>
                <Text size="sm" fw={700}>¿Quieres imprimir el recibo de pago ahora?</Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onCerrar} disabled={generando}>Ahora no</Button>
                    <Button leftSection={<IconPrinter size={18} />} loading={generando} onClick={imprimir} data-autofocus>Imprimir recibo</Button>
                </Group>
            </Stack>
        </Dialogo>
    );
}
