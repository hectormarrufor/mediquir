'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Box, Button, Group, Text } from '@mantine/core';
import { IconEraser } from '@tabler/icons-react';

// Cuadro para firmar con el dedo (o el mouse). onChange recibe la firma como imagen PNG (data URL) o null si está en blanco.
export default function FirmaPad({ onChange, altura = 180, error }) {
    const canvasRef = useRef(null);
    const dibujando = useRef(false);
    const [hayTrazo, setHayTrazo] = useState(false);

    // El lienzo se ajusta a la densidad de pantalla para que el trazo no salga borroso
    useEffect(() => {
        const c = canvasRef.current;
        if (!c) return;
        const ratio = window.devicePixelRatio || 1;
        const w = c.clientWidth;
        c.width = w * ratio;
        c.height = altura * ratio;
        const ctx = c.getContext('2d');
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#0b1f4d';
    }, [altura]);

    const punto = (e) => {
        const r = canvasRef.current.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const empezar = (e) => {
        e.preventDefault();
        canvasRef.current.setPointerCapture?.(e.pointerId);
        dibujando.current = true;
        const ctx = canvasRef.current.getContext('2d');
        const { x, y } = punto(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.01, y + 0.01); // un toque suelto deja un punto
        ctx.stroke();
    };
    const mover = (e) => {
        if (!dibujando.current) return;
        e.preventDefault();
        const ctx = canvasRef.current.getContext('2d');
        const { x, y } = punto(e);
        ctx.lineTo(x, y);
        ctx.stroke();
    };
    const terminar = () => {
        if (!dibujando.current) return;
        dibujando.current = false;
        setHayTrazo(true);
        onChange?.(canvasRef.current.toDataURL('image/png'));
    };
    const borrar = () => {
        const c = canvasRef.current;
        c.getContext('2d').clearRect(0, 0, c.width, c.height);
        setHayTrazo(false);
        onChange?.(null);
    };

    return (
        <Box>
            <Box style={{ border: `2px dashed ${error ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-gray-5)'}`, borderRadius: 8, background: '#fff', position: 'relative' }}>
                <canvas
                    ref={canvasRef}
                    style={{ width: '100%', height: altura, display: 'block', touchAction: 'none', cursor: 'crosshair' }}
                    onPointerDown={empezar} onPointerMove={mover} onPointerUp={terminar} onPointerLeave={terminar} onPointerCancel={terminar}
                />
                {!hayTrazo && <Text c="dimmed" size="sm" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>El chofer firma aquí</Text>}
            </Box>
            <Group justify="space-between" mt={4}>
                <Text size="xs" c={error ? 'red' : 'dimmed'}>{error || 'Firma con el dedo dentro del recuadro'}</Text>
                <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconEraser size={14} />} onClick={borrar} disabled={!hayTrazo}>Borrar firma</Button>
            </Group>
        </Box>
    );
}
