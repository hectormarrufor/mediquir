'use client';

// Estado de cuenta de un cliente: imprimir, descargar el PDF o compartirlo por WhatsApp con un mensaje alusivo.
//  · Con teléfono móvil (0412, 0414, 0416, 0422, 0424, 0426 o +58 4xx) la computadora abre el chat de ese cliente.
//  · Sin móvil (fijo 02xx o sin número) no se manda a un chat en particular: WhatsApp abre para que escojas el contacto.
//  · En el teléfono se abre la hoja de compartir con el PDF adjunto (ahí se escoge WhatsApp y el contacto).
// Los datos se piden al abrir (el estado de cuenta sale siempre al día), así que sirve desde la lista, la ficha y Cuentas por cobrar.
import React, { useState } from 'react';
import { ActionIcon, Button, Menu, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBrandWhatsapp, IconDownload, IconFileTypePdf, IconPrinter } from '@tabler/icons-react';
import CompartirModal from '@/app/superuser/presupuestos/_components/CompartirWhatsapp';
import {
    abrirEstadoCuentaPdf, blobEstadoCuenta, cargarClienteConEstadoCuenta, descargarEstadoCuentaPdf, mensajeEstadoCuenta, nombreArchivoEstadoCuenta, whatsappMovil,
} from './estadoCuentaPdf';

// variante: 'boton' (botón con texto) | 'icono' (solo el ícono, para filas apretadas)
export default function EstadoCuentaAcciones({ clienteId, variante = 'boton', size = 'xs', color = 'navy.9' }) {
    const [ocupado, setOcupado] = useState(false);
    const [compartir, setCompartir] = useState(null); // el cliente cargado, mientras el modal está abierto

    const avisar = (e) => notifications.show({ color: 'red', title: 'Estado de cuenta', message: e.message || 'No se pudo completar' });
    const cargar = () => cargarClienteConEstadoCuenta(clienteId);
    const correr = async (fn) => { setOcupado(true); try { await fn(); } catch (e) { avisar(e); } finally { setOcupado(false); } };

    const imprimir = () => correr(() => abrirEstadoCuentaPdf(cargar));
    const descargar = () => correr(async () => descargarEstadoCuentaPdf(await cargar()));
    const abrirCompartir = () => correr(async () => setCompartir(await cargar()));

    const movil = compartir ? whatsappMovil(compartir.telefono) : '';

    return (
        // Los menús y la ventana viven en portales, pero sus clics suben por React hasta la fila o tarjeta que los contiene: aquí se detienen
        <span style={{ display: 'contents' }} onClick={(e) => e.stopPropagation()}>
            <Menu position="bottom-end" shadow="md" withinPortal width={250}>
                <Menu.Target>
                    {variante === 'icono' ? (
                        <Tooltip label="Estado de cuenta (PDF)" openDelay={300}>
                            <ActionIcon variant="subtle" color="navy.9" loading={ocupado} aria-label="Estado de cuenta" onClick={(e) => e.stopPropagation()}><IconFileTypePdf size={17} /></ActionIcon>
                        </Tooltip>
                    ) : (
                        <Button size={size} color={color} variant="light" loading={ocupado} leftSection={<IconFileTypePdf size={16} />} onClick={(e) => e.stopPropagation()}>Estado de cuenta</Button>
                    )}
                </Menu.Target>
                <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                    <Menu.Label>Estado de cuenta del cliente</Menu.Label>
                    <Menu.Item leftSection={<IconPrinter size={15} />} onClick={imprimir}>Imprimir</Menu.Item>
                    <Menu.Item leftSection={<IconDownload size={15} />} onClick={descargar}>Descargar PDF</Menu.Item>
                    <Menu.Item color="green" leftSection={<IconBrandWhatsapp size={15} />} onClick={abrirCompartir}>Compartir PDF por WhatsApp</Menu.Item>
                </Menu.Dropdown>
            </Menu>

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
