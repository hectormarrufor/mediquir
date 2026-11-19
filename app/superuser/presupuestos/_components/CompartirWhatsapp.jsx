'use client';

// Compartir un PDF (presupuesto, estado de cuenta) por WhatsApp con un mensaje para el cliente.
//  · En el teléfono (o la computadora que sabe compartir archivos): se abre la hoja de compartir con el PDF adjunto. WhatsApp toma el
//    archivo pero DESCARTA el texto que lo acompaña, así que va en dos pasos: 1) el PDF, 2) el mensaje (abre el chat con el texto ya
//    escrito, solo queda tocar enviar). Además el mensaje se copia al portapapeles por si se prefiere pegarlo como texto del PDF.
//  · En la computadora (que no puede adjuntar): se descarga el PDF y se abre WhatsApp con el mensaje (al número del cliente si lo tiene);
//    solo queda arrastrar el PDF a la conversación.
// El PDF se prepara al abrir esta ventana, para que el toque de «Compartir» sea inmediato (el navegador exige que compartir salga de un toque).
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Group, Loader, Modal, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBrandWhatsapp, IconCheck, IconDownload, IconMessage } from '@tabler/icons-react';
import { PANTALLA_COMPLETA_MOVIL } from '@/app/components/ui/modalMovil';

// 0414-970.1172 / 584141234567 / +58 414 1234567 -> 584149701172 (código de Venezuela); vacío si no parece un teléfono
export function telefonoWhatsapp(texto) {
    const d = String(texto || '').split(/[\/,;]/)[0].replace(/\D/g, '');
    if (d.length < 10) return '';
    if (d.startsWith('58') && d.length >= 12) return d;
    if (d.startsWith('0')) return `58${d.slice(1)}`;
    return d.length === 10 ? `58${d}` : d;
}

const descargar = (blob, nombre) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
};

export default function CompartirPresupuestoModal({ opened, onClose, mensajeInicial, telefonoInicial = '', nombreArchivo, generarPdf, numeroDeChat = telefonoWhatsapp, etiquetaMensaje = 'Mensaje para el cliente', descripcionTelefono = 'Solo se usa en la computadora, para abrir su conversación' }) {
    const [mensaje, setMensaje] = useState(mensajeInicial);
    const [telefono, setTelefono] = useState(telefonoInicial);
    const [estado, setEstado] = useState('idle'); // idle | preparando | listo | error
    const [error, setError] = useState('');
    const [pdfEnviado, setPdfEnviado] = useState(false); // ya se compartió el PDF: falta mandar el mensaje
    const pdf = useRef(null);

    useEffect(() => {
        if (!opened) return undefined;
        let vigente = true;
        setMensaje(mensajeInicial); setTelefono(telefonoInicial); setEstado('preparando'); setError(''); setPdfEnviado(false); pdf.current = null;
        generarPdf()
            .then((blob) => { if (vigente) { pdf.current = blob; setEstado('listo'); } })
            .catch((e) => { if (vigente) { setError(e.message || 'No se pudo preparar el PDF'); setEstado('error'); } });
        return () => { vigente = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened]);

    const archivo = () => new File([pdf.current], nombreArchivo, { type: 'application/pdf' });
    const puedeAdjuntar = () => { try { return Boolean(pdf.current) && typeof navigator.canShare === 'function' && navigator.canShare({ files: [archivo()] }); } catch { return false; } };

    const copiarMensaje = async () => { try { await navigator.clipboard?.writeText(mensaje); return true; } catch { return false; } };
    // Abre WhatsApp con el mensaje ya escrito: al chat del cliente si tiene un móvil; si no, WhatsApp pide escoger el contacto
    const abrirChatConMensaje = () => {
        const tel = numeroDeChat(telefono);
        window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener');
    };

    const compartir = async () => {
        if (!pdf.current) return;
        if (puedeAdjuntar()) {
            const copiado = await copiarMensaje();
            try {
                await navigator.share({ files: [archivo()], text: mensaje, title: nombreArchivo.replace(/\.pdf$/i, '') });
                setPdfEnviado(true); // paso 2: el mensaje (WhatsApp no lo lleva junto con el archivo)
                if (copiado) notifications.show({ color: 'teal', title: 'PDF compartido', message: 'Ahora toca «2. Enviar el mensaje». El mensaje también quedó copiado, por si prefieres pegarlo.', autoClose: 7000 });
            } catch (e) {
                if (e?.name !== 'AbortError') notifications.show({ color: 'red', title: 'No se pudo compartir', message: e.message });
            }
            return;
        }
        descargar(pdf.current, nombreArchivo);
        abrirChatConMensaje();
        notifications.show({ color: 'teal', title: 'PDF descargado', message: 'WhatsApp se abrió con el mensaje: arrastra o adjunta el PDF que se descargó a la conversación.', autoClose: 9000 });
        onClose();
    };

    return (
        <Modal {...PANTALLA_COMPLETA_MOVIL} opened={opened} onClose={onClose} centered title={<Text fw={800}>Compartir por WhatsApp</Text>}>
            <Stack gap="sm">
                <Textarea label={etiquetaMensaje} description="Puedes cambiarlo antes de enviarlo" autosize minRows={6} maxRows={12} value={mensaje} onChange={(e) => setMensaje(e.currentTarget.value)} />
                <TextInput label="WhatsApp del cliente (opcional)" description={descripcionTelefono} placeholder="0414-1234567" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.currentTarget.value)} />
                {estado === 'preparando' && <Group gap="xs"><Loader size="xs" /><Text size="sm" c="dimmed">Preparando el PDF…</Text></Group>}
                {estado === 'error' && <Alert color="red" p="xs">{error}</Alert>}
                {pdfEnviado ? (
                    <Stack gap={8}>
                        <Alert color="green" variant="light" p="xs" icon={<IconCheck size={16} />}>
                            <Text size="sm"><b>Paso 1 listo:</b> el PDF se compartió. WhatsApp no envía el texto junto con el archivo, así que falta el mensaje: tócalo abajo y en WhatsApp solo toca enviar.</Text>
                        </Alert>
                        <Group justify="space-between" gap="xs" wrap="wrap">
                            <Button variant="default" onClick={onClose}>Cerrar</Button>
                            <Button color="green" size="md" leftSection={<IconMessage size={18} />} disabled={!mensaje.trim()} onClick={() => { abrirChatConMensaje(); onClose(); }}>2. Enviar el mensaje</Button>
                        </Group>
                    </Stack>
                ) : (
                    <Group justify="space-between" gap="xs" wrap="wrap">
                        <Button variant="default" leftSection={<IconDownload size={16} />} disabled={estado !== 'listo'} onClick={() => descargar(pdf.current, nombreArchivo)}>Solo descargar el PDF</Button>
                        <Button color="green" leftSection={<IconBrandWhatsapp size={18} />} disabled={estado !== 'listo' || !mensaje.trim()} onClick={compartir}>1. Compartir el PDF</Button>
                    </Group>
                )}
            </Stack>
        </Modal>
    );
}
