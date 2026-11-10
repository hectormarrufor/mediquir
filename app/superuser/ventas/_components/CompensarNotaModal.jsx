'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Group, Modal, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PANTALLA_COMPLETA_MOVIL, useEsTelefono } from '@/app/components/ui/modalMovil';
import { IconInfoCircle } from '@tabler/icons-react';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fmtFecha = (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '—');

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

// Compensar el saldo a favor de una nota de crédito en otras facturas pendientes del mismo cliente (ver compensarSaldoAFavor en app/api/_lib/notasFiscales.js).
// `desdeEmision`: se abre solo al emitir una nota; si el cliente no tiene otras facturas pendientes (o no sobra saldo), no muestra nada.
export default function CompensarNotaModal({ nota, onClose, onCambio, desdeEmision = false }) {
    const telefono = useEsTelefono();
    const [datos, setDatos] = useState(null);
    const [elegidas, setElegidas] = useState(new Set());
    const [error, setError] = useState(null);
    const [enviando, setEnviando] = useState(false);

    useEffect(() => {
        let vivo = true;
        pedirJson(`/api/notas/${nota.id}/compensacion`)
            .then((d) => {
                if (!vivo) return;
                if (desdeEmision && (!d.facturas.length || d.disponibleUsd <= 0.005)) { onClose(); return; }
                setDatos(d);
                setElegidas(new Set(d.facturas.map((f) => f.ventaId)));
            })
            .catch((e) => { if (vivo) { if (desdeEmision) onClose(); else setError(e.message); } });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nota.id]);

    // Mismo reparto que hará el servidor: de la más antigua a la más reciente, hasta agotar el saldo a favor
    const reparto = new Map();
    if (datos) {
        let resto = datos.disponibleUsd;
        for (const f of datos.facturas) {
            if (!elegidas.has(f.ventaId) || resto <= 0.005) continue;
            const m = Math.min(resto, f.saldoUsd);
            reparto.set(f.ventaId, m);
            resto -= m;
        }
    }
    const total = [...reparto.values()].reduce((a, x) => a + x, 0);

    const compensar = async () => {
        setEnviando(true); setError(null);
        try {
            const r = await pedirJson(`/api/notas/${nota.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'COMPENSAR', ventaIds: [...elegidas] }) });
            notifications.show({ color: 'teal', title: 'Saldo a favor compensado', message: `$${nf(r.compensacion?.aplicado)} aplicados en ${r.compensacion?.reparto?.length || 0} factura(s)` });
            onCambio?.();
            onClose();
        } catch (e) {
            setError(e.message);
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Modal {...PANTALLA_COMPLETA_MOVIL} opened onClose={onClose} size="lg" centered title={<Text fw={800}>Compensar saldo a favor · {nota.numeroDocumento}</Text>}>
            {!datos && !error ? <Text size="sm" c="dimmed">Cargando…</Text> : (
                <Stack>
                    {datos && (
                        <>
                            <Text size="sm">
                                La nota dejó un <b>saldo a favor del cliente de ${nf(datos.disponibleUsd)}</b>: la factura que afecta ya estaba pagada. Puedes <b>compensarlo</b> con otras facturas que el cliente todavía debe.
                            </Text>
                            <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />} title="¿Qué hace compensar?">
                                <Text size="sm">
                                    Usa ese saldo para pagar las facturas pendientes del cliente que marques abajo, de la más antigua a la más reciente. En cada una se asienta un abono con el número de esta nota.
                                    <b> No entra ni sale dinero</b>: lo que el cliente debe baja justo lo compensado y deja de figurar como deuda algo que ya pagó. Así las cuentas por cobrar no quedan infladas.
                                </Text>
                                <Text size="sm" mt={6}>
                                    Si en cambio quieres devolverle el dinero, no compenses: usa «Reintegrar dinero al cliente». Una vez compensado no se puede reintegrar esa parte ni anular la nota.
                                </Text>
                            </Alert>
                            {telefono ? (
                                // En el teléfono, una tarjeta por factura (la tabla de seis columnas no cabe)
                                <Stack gap={6}>
                                    {datos.facturas.map((f) => {
                                        const a = reparto.get(f.ventaId) || 0;
                                        const marcada = elegidas.has(f.ventaId);
                                        return (
                                            <Group key={f.ventaId} wrap="nowrap" gap="sm" align="flex-start" p={8} style={{ border: `1px solid ${marcada ? 'var(--mantine-color-teal-4)' : '#e9ecef'}`, borderRadius: 8 }}>
                                                <Checkbox mt={2} checked={marcada} onChange={(e) => { const n = new Set(elegidas); if (e.currentTarget.checked) n.add(f.ventaId); else n.delete(f.ventaId); setElegidas(n); }} aria-label={`Compensar en ${f.documento}`} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <Group justify="space-between" wrap="nowrap" gap="xs">
                                                        <Text size="sm" fw={700}>{f.documento}</Text>
                                                        <Text size="sm">Debe ${nf(f.saldoUsd)}</Text>
                                                    </Group>
                                                    <Text size="xs" c="dimmed">Vence {fmtFecha(f.vence)}</Text>
                                                    <Group justify="space-between" wrap="nowrap" gap="xs" mt={2}>
                                                        <Text size="xs" c={a > 0 ? 'teal.8' : 'dimmed'} fw={a > 0 ? 700 : 400}>Se le aplica {a > 0 ? `−$${nf(a)}` : '—'}</Text>
                                                        <Text size="xs">Quedaría debiendo ${nf(f.saldoUsd - a)}</Text>
                                                    </Group>
                                                </div>
                                            </Group>
                                        );
                                    })}
                                </Stack>
                            ) : (
                            <Table withTableBorder verticalSpacing={4}>
                                <Table.Thead>
                                    <Table.Tr><Table.Th /><Table.Th>Factura</Table.Th><Table.Th>Vence</Table.Th><Table.Th ta="right">Debe</Table.Th><Table.Th ta="right">Se le aplica</Table.Th><Table.Th ta="right">Quedaría debiendo</Table.Th></Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {datos.facturas.map((f) => {
                                        const a = reparto.get(f.ventaId) || 0;
                                        return (
                                            <Table.Tr key={f.ventaId}>
                                                <Table.Td><Checkbox checked={elegidas.has(f.ventaId)} onChange={(e) => { const n = new Set(elegidas); if (e.currentTarget.checked) n.add(f.ventaId); else n.delete(f.ventaId); setElegidas(n); }} aria-label={`Compensar en ${f.documento}`} /></Table.Td>
                                                <Table.Td fw={600}>{f.documento}</Table.Td>
                                                <Table.Td>{fmtFecha(f.vence)}</Table.Td>
                                                <Table.Td ta="right">${nf(f.saldoUsd)}</Table.Td>
                                                <Table.Td ta="right" c={a > 0 ? 'teal.8' : 'dimmed'} fw={a > 0 ? 700 : 400}>{a > 0 ? `−$${nf(a)}` : '—'}</Table.Td>
                                                <Table.Td ta="right">${nf(f.saldoUsd - a)}</Table.Td>
                                            </Table.Tr>
                                        );
                                    })}
                                </Table.Tbody>
                            </Table>
                            )}
                            <Text size="sm">Se compensarán <b>${nf(total)}</b>{datos.disponibleUsd - total > 0.005 ? ` y quedarán $${nf(datos.disponibleUsd - total)} de saldo a favor (por reintegrar o compensar después)` : ''}.</Text>
                        </>
                    )}
                    {error && <Alert color="red">{error}</Alert>}
                    <Group justify="flex-end" style={telefono ? { flexDirection: 'column-reverse', alignItems: 'stretch' } : undefined}>
                        <Button variant="default" onClick={onClose}>{desdeEmision ? 'Ahora no' : 'Cancelar'}</Button>
                        {datos && <Button color="teal" loading={enviando} disabled={!(total > 0.005)} onClick={compensar}>Compensar ${nf(total)}</Button>}
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
