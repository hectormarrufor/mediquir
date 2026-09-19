'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Modal, Text, Stack, Button } from '@mantine/core';

// ¿Se puede abrir la cámara? (hace falta https; en localhost también funciona)
export const escanerDisponible = () =>
    typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

const FORMATOS_NATIVOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];

// Abre la cámara trasera y devuelve el primer código de barras / QR que lea.
// Usa la lectura nativa del teléfono cuando existe (Chrome en Android) y, si no, una librería de respaldo (iPhone, Safari, etc.).
export default function EscanerCodigo({ opened, onClose, onDetectar, titulo = 'Apunta al código de barras' }) {
    const videoRef = useRef(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!opened) return undefined;
        let activo = true;
        let flujo = null;
        let controles = null;
        setError(null);

        const detectado = (valor) => {
            if (!activo || !valor) return;
            activo = false;
            navigator.vibrate?.(60);
            onDetectar(String(valor));
        };

        // El <video> del modal se monta un instante después de abrirlo: se espera a tenerlo
        const esperarVideo = async () => {
            for (let i = 0; i < 20 && !videoRef.current; i++) await new Promise((r) => setTimeout(r, 50));
            return videoRef.current;
        };

        (async () => {
            try {
                const video = await esperarVideo();
                if (!video || !activo) return;

                // 1) Lectura nativa (rápida y sin descargar nada)
                if ('BarcodeDetector' in window) {
                    try {
                        const detector = new window.BarcodeDetector({ formats: FORMATOS_NATIVOS });
                        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
                        if (!activo) return flujo.getTracks().forEach((t) => t.stop());
                        video.srcObject = flujo;
                        await video.play();
                        const leer = async () => {
                            if (!activo) return;
                            try {
                                const [codigo] = await detector.detect(video);
                                if (codigo?.rawValue) return detectado(codigo.rawValue);
                            } catch { /* un fotograma sin lectura no es un error */ }
                            setTimeout(leer, 200);
                        };
                        return leer();
                    } catch (e) {
                        // Si la cámara está denegada no tiene caso reintentar con la librería
                        if (e?.name === 'NotAllowedError') throw e;
                        flujo?.getTracks().forEach((t) => t.stop());
                        flujo = null;
                    }
                }

                // 2) Respaldo: librería de lectura (funciona en iPhone y en cualquier navegador con cámara)
                const { BrowserMultiFormatReader } = await import('@zxing/browser');
                const lector = new BrowserMultiFormatReader();
                controles = await lector.decodeFromConstraints(
                    { video: { facingMode: { ideal: 'environment' } }, audio: false },
                    video,
                    (resultado) => { if (resultado) detectado(resultado.getText()); },
                );
                if (!activo) controles.stop();
            } catch (e) {
                if (activo) setError(e?.name === 'NotAllowedError'
                    ? 'No diste permiso para usar la cámara. Actívalo en la configuración del navegador o escribe el código a mano.'
                    : 'No se pudo abrir la cámara. Escribe el código a mano.');
            }
        })();

        return () => {
            activo = false;
            controles?.stop();
            flujo?.getTracks().forEach((t) => t.stop());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened]);

    return (
        <Modal opened={opened} onClose={onClose} title={titulo} centered fullScreen>
            <Stack>
                {error ? <Text c="red">{error}</Text> : (
                    <>
                        <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 8, background: '#000' }} />
                        <Text size="sm" c="dimmed" ta="center">Coloca el código de barras dentro de la imagen, con buena luz y sin moverte.</Text>
                    </>
                )}
                <Button variant="default" onClick={onClose}>Cerrar</Button>
            </Stack>
        </Modal>
    );
}
