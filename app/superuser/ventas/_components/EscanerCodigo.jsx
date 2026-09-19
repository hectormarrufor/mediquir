'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Modal, Text, Stack, Button } from '@mantine/core';

// ¿Este navegador puede leer códigos de barras con la cámara? (Chrome en Android sí; Safari en iPhone todavía no)
export const escanerDisponible = () =>
    typeof window !== 'undefined' && 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia);

// Abre la cámara trasera y devuelve el primer código de barras / QR que lea.
export default function EscanerCodigo({ opened, onClose, onDetectar }) {
    const videoRef = useRef(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!opened) return undefined;
        let activo = true;
        let stream = null;
        setError(null);

        (async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
                if (!activo) return stream.getTracks().forEach((t) => t.stop());
                const video = videoRef.current;
                video.srcObject = stream;
                await video.play();

                const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] });
                const leer = async () => {
                    if (!activo) return;
                    try {
                        const [codigo] = await detector.detect(video);
                        if (codigo?.rawValue) { onDetectar(codigo.rawValue); return; }
                    } catch { /* un fotograma sin lectura no es un error */ }
                    setTimeout(leer, 200);
                };
                leer();
            } catch {
                if (activo) setError('No se pudo abrir la cámara. Revisa el permiso del navegador o escribe el código a mano.');
            }
        })();

        return () => {
            activo = false;
            stream?.getTracks().forEach((t) => t.stop());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened]);

    return (
        <Modal opened={opened} onClose={onClose} title="Apunta al código de barras" centered fullScreen>
            <Stack>
                {error ? <Text c="red">{error}</Text> : (
                    <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 8, background: '#000' }} />
                )}
                <Button variant="default" onClick={onClose}>Cerrar</Button>
            </Stack>
        </Modal>
    );
}
