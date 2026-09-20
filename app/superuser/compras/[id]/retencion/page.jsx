'use client';

import React, { useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Checkbox, Group, Loader, Paper, ScrollArea, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconBrandWhatsapp, IconDownload, IconPrinter, IconShare } from '@tabler/icons-react';
import ComprobanteRetencion from '../../_components/ComprobanteRetencion';

async function pedirJson(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo cargar el comprobante');
    return cuerpo;
}

const bs = (n) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

// Comprobante de retención de IVA de una compra: ver, imprimir, guardar en PDF y mandarlo al proveedor por WhatsApp
export default function ComprobanteRetencionPage() {
    const { id } = useParams();
    const router = useRouter();
    const hoja = useRef(null);
    const [conSello, setConSello] = useState(true);
    const [trabajando, setTrabajando] = useState(false);

    const { data, isLoading, error } = useQuery({ queryKey: ['comprobante-retencion', id], queryFn: () => pedirJson(`/api/compras/${id}/retencion`) });

    const nombreArchivo = data ? `Comprobante-Retencion-${data.comprobante}.pdf` : 'comprobante.pdf';

    // Fotografía el comprobante tal como se ve y lo convierte en un PDF de una página (carta horizontal)
    const generarPdf = async () => {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
        const canvas = await html2canvas(hoja.current, { scale: 2.2, backgroundColor: '#ffffff', useCORS: true });
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
        const ancho = pdf.internal.pageSize.getWidth() - 36;
        const alto = (canvas.height * ancho) / canvas.width;
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 18, 18, ancho, Math.min(alto, pdf.internal.pageSize.getHeight() - 36));
        return pdf.output('blob');
    };

    const descargar = (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = nombreArchivo;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    const envolver = (fn) => async () => {
        setTrabajando(true);
        try { await fn(); } catch (e) { notifications.show({ color: 'red', title: 'No se pudo generar el PDF', message: e.message }); } finally { setTrabajando(false); }
    };

    const mensaje = data && `Buen día, le enviamos el comprobante de retención de IVA N° ${data.comprobante} correspondiente a su factura ${data.lineas[0].numeroFactura}, por un IVA retenido de Bs ${bs(data.totales.retenido)}. Gracias por su atención. — ${data.agente.nombre}`;

    // Guarda el PDF y abre el chat del proveedor con el mensaje escrito: solo falta adjuntar el archivo descargado
    const whatsapp = envolver(async () => {
        descargar(await generarPdf());
        window.open(`https://wa.me/${data.whatsapp}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener');
        notifications.show({ color: 'teal', title: 'PDF descargado', message: 'En el chat de WhatsApp que se abrió, adjunta el archivo (clip → Documento).', autoClose: 12000 });
    });

    // En el teléfono se puede compartir el PDF directo desde la hoja de compartir (se elige el chat allí)
    const compartir = envolver(async () => {
        const blob = await generarPdf();
        const archivo = new File([blob], nombreArchivo, { type: 'application/pdf' });
        try { await navigator.share({ files: [archivo], text: mensaje, title: nombreArchivo }); } catch (e) { if (e.name !== 'AbortError') throw e; }
    });

    const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && data
        && navigator.canShare({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] });

    if (isLoading) return <Box p="xl"><Group justify="center"><Loader /></Group></Box>;
    if (error) return (
        <Box p="md" maw={700} mx="auto">
            <Alert color="orange" title="Sin comprobante">{error.message}</Alert>
            <Button mt="md" variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => router.back()}>Volver</Button>
        </Box>
    );

    return (
        <Box p="md" style={{ maxWidth: 1120, margin: '0 auto' }}>
            <style>{'@media print { .no-print { display: none !important; } body { background: #fff !important; } }'}</style>
            <Paper className="no-print" withBorder radius="md" p="sm" mb="md" bg="white">
                <Group justify="space-between" wrap="wrap" gap="sm">
                    <Group gap="sm">
                        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => router.back()}>Volver</Button>
                        <Box>
                            <Text fw={800} c="navy.9" lh={1.1}>Comprobante de retención N° {data.comprobante}</Text>
                            <Text size="xs" c="dimmed">{data.sujeto.nombre} · factura {data.lineas[0].numeroFactura}</Text>
                        </Box>
                    </Group>
                    <Group gap="xs" wrap="wrap">
                        <Checkbox size="sm" checked={conSello} onChange={(e) => setConSello(e.currentTarget.checked)} label="Incluir sello y firma" />
                        <Button leftSection={<IconPrinter size={16} />} variant="default" onClick={() => window.print()}>Imprimir</Button>
                        <Button leftSection={<IconDownload size={16} />} variant="default" loading={trabajando} onClick={envolver(async () => descargar(await generarPdf()))}>Descargar PDF</Button>
                        <Tooltip label="El proveedor no tiene un teléfono válido registrado" disabled={Boolean(data.whatsapp)}>
                            <Button color="green" leftSection={<IconBrandWhatsapp size={18} />} loading={trabajando} disabled={!data.whatsapp} onClick={whatsapp}>
                                WhatsApp al proveedor
                            </Button>
                        </Tooltip>
                        {puedeCompartir && <Button variant="light" color="green" leftSection={<IconShare size={16} />} loading={trabajando} onClick={compartir}>Compartir PDF</Button>}
                    </Group>
                </Group>
                {data.whatsapp
                    ? <Text size="xs" c="dimmed" mt={6}>Se enviará al WhatsApp del proveedor: +{data.whatsapp}. Con el sello y la firma el PDF queda listo para enviar; para imprimir y firmar a mano, desmarca «Incluir sello y firma».</Text>
                    : <Text size="xs" c="orange.8" mt={6}>Este proveedor no tiene un teléfono válido. Agrégalo en su ficha para poder enviarle el comprobante por WhatsApp.</Text>}
            </Paper>

            <ScrollArea type="auto" offsetScrollbars>
                <Box ref={hoja} style={{ width: 1040, margin: '0 auto', boxShadow: '0 6px 24px rgba(0,0,0,.18)', background: '#fff' }}>
                    <ComprobanteRetencion datos={data} conSello={conSello} />
                </Box>
            </ScrollArea>
        </Box>
    );
}
