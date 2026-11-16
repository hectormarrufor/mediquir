'use client';

// Compartir el presupuesto por WhatsApp con su PDF y un mensaje para el cliente.
//  · En el teléfono: se abre la hoja de compartir del sistema con el PDF adjunto y el mensaje (se elige WhatsApp y el contacto).
//  · En la computadora (que no puede adjuntar): se descarga el PDF y se abre WhatsApp con el mensaje (al número del cliente si lo tiene);
//    solo queda arrastrar el PDF a la conversación.
// El PDF se prepara al abrir esta ventana, para que el toque de «Compartir» sea inmediato (el navegador exige que compartir salga de un toque).
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Group, Loader, Modal, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBrandWhatsapp, IconDownload } from '@tabler/icons-react';
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

export default function CompartirPresupuestoModal({ opened, onClose, mensajeInicial, telefonoInicial = '', nombreArchivo, generarPdf }) {
    const [mensaje, setMensaje] = useState(mensajeInicial);
    const [telefono, setTelefono] = useState(telefonoInicial);
    const [estado, setEstado] = useState('idle'); // idle | preparando | listo | error
    const [error, setError] = useState('');
    const pdf = useRef(null);

    useEffect(() => {
        if (!opened) return undefined;
        let vigente = true;
        setMensaje(mensajeInicial); setTelefono(telefonoInicial); setEstado('preparando'); setError(''); pdf.current = null;
        generarPdf()
            .then((blob) => { if (vigente) { pdf.current = blob; setEstado('listo'); } })
            .catch((e) => { if (vigente) { setError(e.message || 'No se pudo preparar el PDF'); setEstado('error'); } });
        return () => { vigente = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened]);

    const archivo = () => new File([pdf.current], nombreArchivo, { type: 'application/pdf' });
    const puedeAdjuntar = () => { try { return Boolean(pdf.current) && typeof navigator.canShare === 'function' && navigator.canShare({ files: [archivo()] }); } catch { return false; } };

    const compartir = async () => {
        if (!pdf.current) return;
        if (puedeAdjuntar()) {
            try {
                await navigator.share({ files: [archivo()], text: mensaje, title: nombreArchivo.replace(/\.pdf$/i, '') });
                onClose();
            } catch (e) {
                if (e?.name !== 'AbortError') notifications.show({ color: 'red', title: 'No se pudo compartir', message: e.message });
            }
            return;
        }
        descargar(pdf.current, nombreArchivo);
        const tel = telefonoWhatsapp(telefono);
        window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener');
        notifications.show({ color: 'teal', title: 'PDF descargado', message: 'WhatsApp se abrió con el mensaje: arrastra o adjunta el PDF que se descargó a la conversación.', autoClose: 9000 });
        onClose();
    };

    return (
        <Modal {...PANTALLA_COMPLETA_MOVIL} opened={opened} onClose={onClose} centered title={<Text fw={800}>Compartir por WhatsApp</Text>}>
            <Stack gap="sm">
                <Textarea label="Mensaje para el cliente" description="Puedes cambiarlo antes de enviarlo" autosize minRows={6} maxRows={12} value={mensaje} onChange={(e) => setMensaje(e.currentTarget.value)} />
                <TextInput label="WhatsApp del cliente (opcional)" description="Solo se usa en la computadora, para abrir su conversación" placeholder="0414-1234567" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.currentTarget.value)} />
                {estado === 'preparando' && <Group gap="xs"><Loader size="xs" /><Text size="sm" c="dimmed">Preparando el PDF…</Text></Group>}
                {estado === 'error' && <Alert color="red" p="xs">{error}</Alert>}
                <Group justify="space-between" gap="xs" wrap="wrap">
                    <Button variant="default" leftSection={<IconDownload size={16} />} disabled={estado !== 'listo'} onClick={() => descargar(pdf.current, nombreArchivo)}>Solo descargar el PDF</Button>
                    <Button color="green" leftSection={<IconBrandWhatsapp size={18} />} disabled={estado !== 'listo' || !mensaje.trim()} onClick={compartir}>Compartir</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
