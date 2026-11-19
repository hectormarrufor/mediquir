'use client';

// Estado de cuenta de un cliente: al tocar el botón se abre una VISTA PREVIA del PDF; desde ahí se imprime, se descarga
// o se comparte por WhatsApp con un mensaje alusivo.
//  · Con teléfono móvil (0412, 0414, 0416, 0422, 0424, 0426 o +58 4xx) la computadora abre el chat de ese cliente.
//  · Sin móvil (fijo 02xx o sin número) no se manda a un chat en particular: WhatsApp abre para que escojas el contacto.
//  · En el teléfono se abre la hoja de compartir con el PDF adjunto (ahí se escoge WhatsApp y el contacto).
// Los datos se piden al abrir (el estado de cuenta sale siempre al día), así que sirve desde la lista, la ficha y Cuentas por cobrar.
import React, { useEffect, useRef, useState } from 'react';
import { ActionIcon, Button, Group, Modal, Stack, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBrandWhatsapp, IconDownload, IconFileTypePdf, IconPrinter } from '@tabler/icons-react';
import CompartirModal from '@/app/superuser/presupuestos/_components/CompartirWhatsapp';
import {
    blobEstadoCuenta, cargarClienteConEstadoCuenta, descargarEstadoCuentaPdf, mensajeEstadoCuenta, nombreArchivoEstadoCuenta, whatsappMovil,
} from './estadoCuentaPdf';

// variante: 'boton' (botón con texto) | 'icono' (solo el ícono, para filas apretadas)
export default function EstadoCuentaAcciones({ clienteId, variante = 'boton', size = 'xs', color = 'navy.9' }) {
    const [ocupado, setOcupado] = useState(false);
    const [vista, setVista] = useState(null);       // { cliente, url } mientras la vista previa está abierta
    const [compartir, setCompartir] = useState(null); // el cliente, mientras el modal de WhatsApp está abierto
    const marco = useRef(null);
    const urlActual = useRef(null);

    useEffect(() => () => { if (urlActual.current) URL.revokeObjectURL(urlActual.current); }, []);

    const abrir = async () => {
        setOcupado(true);
        try {
            const cliente = await cargarClienteConEstadoCuenta(clienteId);
            const url = URL.createObjectURL(await blobEstadoCuenta(cliente));
            urlActual.current = url;
            setVista({ cliente, url });
        } catch (e) {
            notifications.show({ color: 'red', title: 'Estado de cuenta', message: e.message || 'No se pudo generar el estado de cuenta' });
        } finally { setOcupado(false); }
    };
    const cerrar = () => {
        if (urlActual.current) URL.revokeObjectURL(urlActual.current);
        urlActual.current = null; setVista(null); setCompartir(null);
    };
    const imprimir = () => {
        try { marco.current?.contentWindow?.focus(); marco.current?.contentWindow?.print(); }
        catch { window.open(vista.url, '_blank'); }
    };

    const movil = compartir ? whatsappMovil(compartir.telefono) : '';

    return (
        // Los modales viven en portales, pero sus clics suben por React hasta la fila o tarjeta que los contiene: aquí se detienen
        <span style={{ display: 'contents' }} onClick={(e) => e.stopPropagation()}>
            {variante === 'icono' ? (
                <Tooltip label="Estado de cuenta (PDF)" openDelay={300}>
                    <ActionIcon variant="subtle" color="navy.9" loading={ocupado} aria-label="Estado de cuenta" onClick={abrir}><IconFileTypePdf size={17} /></ActionIcon>
                </Tooltip>
            ) : (
                <Button size={size} color={color} variant="light" loading={ocupado} leftSection={<IconFileTypePdf size={16} />} onClick={abrir}>Estado de cuenta</Button>
            )}

            <Modal opened={Boolean(vista)} onClose={cerrar} size="xl" centered title={<Text fw={800}>Estado de cuenta{vista?.cliente?.nombre ? ` · ${vista.cliente.nombre}` : ''}</Text>} onClick={(e) => e.stopPropagation()}>
                {vista && (
                    <Stack gap="sm">
                        <iframe ref={marco} src={vista.url} title="Estado de cuenta" style={{ width: '100%', height: '65vh', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }} />
                        <Group justify="flex-end" gap="xs">
                            <Button variant="default" leftSection={<IconPrinter size={16} />} onClick={imprimir}>Imprimir</Button>
                            <Button variant="default" leftSection={<IconDownload size={16} />} onClick={() => descargarEstadoCuentaPdf(vista.cliente)}>Descargar PDF</Button>
                            <Button color="green" leftSection={<IconBrandWhatsapp size={16} />} onClick={() => setCompartir(vista.cliente)}>Compartir por WhatsApp</Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            {compartir && (
                <CompartirModal
                    opened
                    onClose={() => setCompartir(null)}
                    mensajeInicial={mensajeEstadoCuenta(compartir)}
                    telefonoInicial={movil}
                    nombreArchivo={nombreArchivoEstadoCuenta(compartir)}
                    generarPdf={() => blobEstadoCuenta(compartir)}
                    numeroDeChat={whatsappMovil}
                    descripcionTelefono={movil
                        ? 'En la computadora se abre el chat de este número. En el teléfono escoges el contacto al compartir.'
                        : 'Sin número móvil registrado: WhatsApp se abre para que escojas el contacto (o escribe aquí un móvil para ir directo a su chat).'}
                />
            )}
        </span>
    );
}
