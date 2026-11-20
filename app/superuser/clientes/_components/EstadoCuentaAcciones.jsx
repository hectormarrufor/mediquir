'use client';

// Estado de cuenta de un cliente:
//  · En escritorio abre un Modal con vista previa en <iframe>, imprimir, descargar PDF y compartir por WhatsApp.
//  · En teléfono (donde <iframe> con blob: PDF no renderiza y un a.click() tras await se bloquea) abre un Drawer inferior
//    con resumen nativo legible del estado de cuenta y botones grandes para Descargar PDF (síncrono), Abrir PDF o Compartir por WhatsApp.
// Los datos se piden al abrir (el estado de cuenta sale siempre al día), así que sirve desde la lista, la ficha y Cuentas por cobrar.
import React, { useEffect, useRef, useState } from 'react';
import { ActionIcon, Badge, Box, Button, Drawer, Group, Modal, ScrollArea, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconBrandWhatsapp, IconDownload, IconExternalLink, IconFileTypePdf, IconPrinter } from '@tabler/icons-react';
import CompartirModal from '@/app/superuser/presupuestos/_components/CompartirWhatsapp';
import { formatearFecha } from '@/app/constants/hora';
import {
    blobEstadoCuenta, cargarClienteConEstadoCuenta, mensajeEstadoCuenta, nombreArchivoEstadoCuenta, whatsappMovil,
} from './estadoCuentaPdf';

const fmtUsd = (v) => `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`;

// variante: 'boton' (botón con texto) | 'icono' (solo el ícono, para filas apretadas)
export default function EstadoCuentaAcciones({ clienteId, variante = 'boton', size = 'xs', color = 'navy.9', fullWidth = false }) {
    const esMovil = useMediaQuery('(max-width: 48em)');
    const [ocupado, setOcupado] = useState(false);
    const [vista, setVista] = useState(null);       // { cliente, blob, url } mientras la vista previa está abierta
    const [compartir, setCompartir] = useState(null); // el cliente, mientras el modal de WhatsApp está abierto
    const marco = useRef(null);
    const urlActual = useRef(null);

    useEffect(() => () => { if (urlActual.current) URL.revokeObjectURL(urlActual.current); }, []);

    const abrir = async () => {
        setOcupado(true);
        try {
            const cliente = await cargarClienteConEstadoCuenta(clienteId);
            const blob = await blobEstadoCuenta(cliente);
            const url = URL.createObjectURL(blob);
            if (urlActual.current) URL.revokeObjectURL(urlActual.current);
            urlActual.current = url;
            setVista({ cliente, blob, url });
        } catch (e) {
            notifications.show({ color: 'red', title: 'Estado de cuenta', message: e.message || 'No se pudo generar el estado de cuenta' });
        } finally { setOcupado(false); }
    };

    const cerrar = () => {
        if (urlActual.current) URL.revokeObjectURL(urlActual.current);
        urlActual.current = null; setVista(null); setCompartir(null);
    };

    // Descarga síncrona usando el blob/url ya generado (no pierde el gesto del usuario en iOS Safari / Android Chrome)
    const descargar = () => {
        if (!vista) return;
        const a = document.createElement('a');
        a.href = vista.url;
        a.download = nombreArchivoEstadoCuenta(vista.cliente);
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const abrirVisor = () => {
        if (!vista) return;
        const win = window.open(vista.url, '_blank', 'noopener');
        if (!win) descargar();
    };

    const imprimir = () => {
        try { marco.current?.contentWindow?.focus(); marco.current?.contentWindow?.print(); }
        catch { abrirVisor(); }
    };

    const movil = compartir ? whatsappMovil(compartir.telefono) : '';
    const ec = vista?.cliente?.estadoCuenta || { pendientes: [], total: 0 };
    const vencido = ec.pendientes.filter((p) => p.estado === 'vencido').reduce((a, p) => a + (Number(p.saldo) || 0), 0);
    const porVencer = Math.max((Number(ec.total) || 0) - vencido, 0);

    return (
        // Los modales viven en portales, pero sus clics suben por React hasta la fila o tarjeta que los contiene: aquí se detienen
        <span style={{ display: 'contents' }} onClick={(e) => e.stopPropagation()}>
            {variante === 'icono' ? (
                <Tooltip label="Estado de cuenta (PDF)" openDelay={300}>
                    <ActionIcon
                        variant="subtle" color="navy.9" size={esMovil ? 36 : 'md'} radius="md"
                        loading={ocupado} aria-label="Estado de cuenta (PDF)" onClick={abrir}
                    >
                        <IconFileTypePdf size={esMovil ? 20 : 17} />
                    </ActionIcon>
                </Tooltip>
            ) : (
                <Button size={size} color={color} variant="light" fullWidth={fullWidth} loading={ocupado} leftSection={<IconFileTypePdf size={16} />} onClick={abrir}>
                    Estado de cuenta
                </Button>
            )}

            {esMovil ? (
                <Drawer
                    opened={Boolean(vista)}
                    onClose={cerrar}
                    position="bottom"
                    title={<Text fw={800} c="navy.9" lineClamp={1}>Estado de cuenta{vista?.cliente?.nombre ? ` · ${vista.cliente.nombre}` : ''}</Text>}
                    styles={{
                        content: { height: 'auto', maxHeight: '88dvh', borderTopLeftRadius: 18, borderTopRightRadius: 18 },
                        body: { paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' },
                    }}
                    overlayProps={{ backgroundOpacity: 0.45, blur: 2 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {vista && (
                        <Stack gap="sm">
                            <SimpleGrid cols={3} spacing={6}>
                                <Box p={8} style={{ background: '#f4f7fc', borderRadius: 10, border: '1px solid #d5dbe5' }}>
                                    <Text fz={10} fw={700} tt="uppercase" c="#5c6675">Adeudado</Text>
                                    <Text fz={15} fw={800} c="navy.9" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(ec.total)}</Text>
                                </Box>
                                <Box p={8} style={{ background: vencido > 0 ? '#fff5f5' : '#f4f7fc', borderRadius: 10, border: `1px solid ${vencido > 0 ? '#ffc9c9' : '#d5dbe5'}` }}>
                                    <Text fz={10} fw={700} tt="uppercase" c="#5c6675">Vencido</Text>
                                    <Text fz={15} fw={800} c={vencido > 0 ? 'red.8' : 'teal.8'} style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(vencido)}</Text>
                                </Box>
                                <Box p={8} style={{ background: '#f4f7fc', borderRadius: 10, border: '1px solid #d5dbe5' }}>
                                    <Text fz={10} fw={700} tt="uppercase" c="#5c6675">Por vencer</Text>
                                    <Text fz={15} fw={800} c="navy.9" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(porVencer)}</Text>
                                </Box>
                            </SimpleGrid>

                            {ec.pendientes.length > 0 ? (
                                <ScrollArea.Autosize mah="32dvh" offsetScrollbars>
                                    <Stack gap={6}>
                                        {ec.pendientes.map((p, idx) => (
                                            <Group key={`${p.numero}-${idx}`} justify="space-between" wrap="nowrap" px={10} py={7} style={{ background: '#fff', border: '1px solid #e1e6ee', borderRadius: 10 }}>
                                                <Box style={{ minWidth: 0 }}>
                                                    <Group gap={6} wrap="nowrap">
                                                        <Text fz={13} fw={700} truncate="end">{p.numero}</Text>
                                                        {p.estado === 'vencido' && <Badge size="xs" color="red" variant="light">Vencida</Badge>}
                                                    </Group>
                                                    <Text fz={11.5} c="#5c6675">Vence {formatearFecha(p.vence) || '—'}{p.etiqueta ? ` · ${p.etiqueta}` : ''}</Text>
                                                </Box>
                                                <Text fz={14} fw={800} c={p.estado === 'vencido' ? 'red.8' : 'navy.9'} style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(p.saldo)}</Text>
                                            </Group>
                                        ))}
                                    </Stack>
                                </ScrollArea.Autosize>
                            ) : (
                                <Text size="sm" c="teal.8" fw={700} ta="center" py="xs">Este cliente no tiene saldo pendiente.</Text>
                            )}

                            <Stack gap={8} mt={4}>
                                <Button fullWidth size="md" color="navy.9" leftSection={<IconDownload size={18} />} onClick={descargar}>
                                    Descargar PDF
                                </Button>
                                <Group grow gap={8}>
                                    <Button size="sm" variant="default" leftSection={<IconExternalLink size={16} />} onClick={abrirVisor}>
                                        Abrir PDF
                                    </Button>
                                    <Button size="sm" color="green" leftSection={<IconBrandWhatsapp size={16} />} onClick={() => setCompartir(vista.cliente)}>
                                        WhatsApp
                                    </Button>
                                </Group>
                            </Stack>
                        </Stack>
                    )}
                </Drawer>
            ) : (
                <Modal opened={Boolean(vista)} onClose={cerrar} size="xl" centered title={<Text fw={800}>Estado de cuenta{vista?.cliente?.nombre ? ` · ${vista.cliente.nombre}` : ''}</Text>} onClick={(e) => e.stopPropagation()}>
                    {vista && (
                        <Stack gap="sm">
                            <iframe ref={marco} src={vista.url} title="Estado de cuenta" style={{ width: '100%', height: '65vh', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }} />
                            <Group justify="flex-end" gap="xs">
                                <Button variant="default" leftSection={<IconPrinter size={16} />} onClick={imprimir}>Imprimir</Button>
                                <Button variant="default" leftSection={<IconDownload size={16} />} onClick={descargar}>Descargar PDF</Button>
                                <Button color="green" leftSection={<IconBrandWhatsapp size={16} />} onClick={() => setCompartir(vista.cliente)}>Compartir por WhatsApp</Button>
                            </Group>
                        </Stack>
                    )}
                </Modal>
            )}

            {compartir && (
                <CompartirModal
                    opened
                    onClose={() => setCompartir(null)}
                    mensajeInicial={mensajeEstadoCuenta(compartir)}
                    telefonoInicial={movil}
                    nombreArchivo={nombreArchivoEstadoCuenta(compartir)}
                    generarPdf={() => (vista?.cliente?.id === compartir.id && vista?.blob ? Promise.resolve(vista.blob) : blobEstadoCuenta(compartir))}
                    numeroDeChat={whatsappMovil}
                    descripcionTelefono={movil
                        ? 'En la computadora se abre el chat de este número. En el teléfono escoges el contacto al compartir.'
                        : 'Sin número móvil registrado: WhatsApp se abre para que escojas el contacto (o escribe aquí un móvil para ir directo a su chat).'}
                />
            )}
        </span>
    );
}
