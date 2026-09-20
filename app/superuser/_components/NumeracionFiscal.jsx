'use client';

import React, { useState } from 'react';
import { Alert, Badge, Button, Group, Modal, Paper, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

// Estado de la numeración fiscal (facturas, notas de crédito, notas de débito y número de control)
export function useNumeracion(activo = true) {
    return useQuery({ queryKey: ['numeracion'], enabled: activo, queryFn: () => pedirJson('/api/numeracion') });
}

// Vista previa de cómo saldría lo que se está escribiendo ("NC-02325")
function vistaPrevia(serie, texto) {
    if (serie.clave === 'RET-COMPRA') {
        // Comprobante de retención: año y mes + 8 dígitos (se acepta el número completo de 14 dígitos o solo la secuencia)
        const digitos = String(texto).replace(/\D/g, '');
        const secuencia = digitos.length === 14 ? digitos.slice(-8) : digitos;
        if (!secuencia || secuencia.length > 8) return null;
        return `${serie.periodo || ''}${secuencia.padStart(8, '0')}`;
    }
    const m = /^(?:[A-Za-z0-9]{1,3}\s*-\s*)?(\d{1,10})$/.exec(String(texto).trim());
    if (!m) return null;
    return `${serie.prefijo}-${m[1].padStart(Math.max(serie.ceros, m[1].length), '0')}`;
}

/**
 * Pregunta con qué número sale el PRÓXIMO documento de una serie y lo guarda (solo un administrador puede).
 * `serie`: un elemento de /api/numeracion. `onListo` se llama al guardar.
 */
export function PreguntarNumero({ serie, puedeEditar, onListo, compacto = false }) {
    const queryClient = useQueryClient();
    const [texto, setTexto] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);
    const previa = vistaPrevia(serie, texto);

    const guardar = async () => {
        setGuardando(true);
        setError(null);
        try {
            const r = await pedirJson('/api/numeracion', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave: serie.clave, siguiente: texto }) });
            notifications.show({ color: 'teal', message: `Listo: el próximo será el ${r.siguiente}` });
            setTexto('');
            await queryClient.invalidateQueries({ queryKey: ['numeracion'] });
            onListo?.(r);
        } catch (e) {
            setError(e.message);
        } finally {
            setGuardando(false);
        }
    };

    if (!puedeEditar) {
        return <Alert color="orange" icon={<IconAlertTriangle size={18} />} title={`Falta configurar: ${serie.etiqueta}`}>Un administrador debe indicar con qué número empieza esta numeración antes de continuar.</Alert>;
    }
    return (
        <Stack gap="xs">
            {!compacto && (
                <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />} title={`¿Con qué número empieza esta numeración?`}>
                    <Text size="sm">
                        {serie.clave === 'CONTROL'
                            ? 'El número de control sale de la forma libre preimpresa y es UN solo correlativo para facturas, notas de crédito y notas de débito. Escribe el número de control de la próxima forma que vas a imprimir.'
                            : 'Tu numeración no siempre arranca en el 1 (puede venir de un talonario anterior). Escribe el número de la primera que vas a emitir con el sistema; a partir de ahí lo lleva solo.'}
                    </Text>
                </Alert>
            )}
            <TextInput
                label={serie.pregunta} placeholder={`Ej: ${serie.ejemplo}`} value={texto} onChange={(e) => setTexto(e.currentTarget.value)} data-autofocus
                description={previa ? `Saldrá como ${previa}` : serie.ultimoUsado ? `El último usado es ${serie.ultimoUsado}` : undefined}
            />
            {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error}</Alert>}
            <Group justify="flex-end"><Button onClick={guardar} loading={guardando} disabled={!previa}>Guardar</Button></Group>
        </Stack>
    );
}

// Panel con las series: cuál es el próximo número de cada una y, si eres administrador, cambiarlo
export default function NumeracionFiscalModal({ opened, onClose }) {
    const { data, isLoading } = useNumeracion(opened);
    const [editando, setEditando] = useState(null);

    return (
        <Modal opened={opened} onClose={onClose} centered size="lg" title={<Text fw={800}>Numeración fiscal</Text>}>
            <Stack gap="sm">
                <Text size="sm" c="dimmed">
                    Cada serie lleva su correlativo. El número de control es uno solo para facturas y notas, porque sale de la forma libre: se asigna al imprimir cada documento.
                </Text>
                {isLoading ? <Text size="sm" c="dimmed">Cargando…</Text> : data?.series?.map((s) => (
                    <Paper key={s.clave} withBorder p="sm" radius="md">
                        <Group justify="space-between" wrap="nowrap" align="flex-start">
                            <div>
                                <Group gap={8}>
                                    <Text fw={700} size="sm">{s.etiqueta}</Text>
                                    {s.configurado ? <Badge size="xs" color="teal" variant="light">Configurada</Badge> : <Badge size="xs" color="orange">Falta configurar</Badge>}
                                </Group>
                                <Text size="sm">Próximo: <b>{s.configurado ? s.siguiente : '—'}</b>{s.ultimoUsado && <Text span size="xs" c="dimmed"> · último usado: {s.ultimoUsado}</Text>}</Text>
                            </div>
                            {data.puedeEditar && <Button size="compact-sm" variant="light" onClick={() => setEditando(editando === s.clave ? null : s.clave)}>{s.configurado ? 'Cambiar' : 'Configurar'}</Button>}
                        </Group>
                        {editando === s.clave && (
                            <Stack mt="sm" gap="xs">
                                {s.configurado && <Alert color="yellow" variant="light" p="xs">Cambia el número solo si vas a usar otro talonario o forma libre: no puede quedar por debajo de uno ya usado.</Alert>}
                                <PreguntarNumero serie={s} puedeEditar={data.puedeEditar} compacto onListo={() => setEditando(null)} />
                            </Stack>
                        )}
                    </Paper>
                ))}
                {data && !data.puedeEditar && <Text size="xs" c="dimmed">Solo un administrador puede cambiar la numeración.</Text>}
                <Group justify="flex-end"><Button variant="default" onClick={onClose}>Cerrar</Button></Group>
            </Stack>
        </Modal>
    );
}
