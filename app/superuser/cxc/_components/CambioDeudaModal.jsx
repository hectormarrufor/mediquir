'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Group, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconInfoCircle } from '@tabler/icons-react';
import { fechaCaracas } from '@/app/constants/hora';
import { Dialogo } from './Piezas';
import { dolares } from './utilidades';
import classes from './cxc.module.css';

const METODOS_ABONO = ['Zelle', 'Efectivo ($)', 'Transferencia', 'Pago Móvil', 'Retención IVA', 'Nota de crédito', 'Otro'];

// Todo cambio de la deuda de una cuenta queda REGISTRADO como un abono (el cliente pagó) o un ajuste (la deuda sube): con fecha, método y referencia.
//   cuenta: fila del libro · nuevoSaldo: si la persona escribió un saldo nuevo en la celda, aquí se calcula la diferencia
//   tipoInicial: 'ABONO' | 'AJUSTE' (desde el menú «Ajustar la deuda») · onCerrar(guardado)
export default function CambioDeudaModal({ cuenta, nuevoSaldo = null, tipoInicial = 'ABONO', onCerrar }) {
    const queryClient = useQueryClient();
    const diferencia = nuevoSaldo === null || nuevoSaldo === undefined ? null : Math.round((cuenta.saldo - Number(nuevoSaldo)) * 100) / 100;
    const [tipo, setTipo] = useState(tipoInicial);
    const [monto, setMonto] = useState('');
    const [fecha, setFecha] = useState(fechaCaracas());
    const [metodo, setMetodo] = useState('Zelle');
    const [referencia, setReferencia] = useState('');
    const [notas, setNotas] = useState('');

    useEffect(() => {
        if (!cuenta) return;
        setFecha(fechaCaracas()); setReferencia(''); setNotas('');
        if (diferencia !== null) { setTipo(diferencia >= 0 ? 'ABONO' : 'AJUSTE'); setMonto(Math.abs(diferencia)); setMetodo(diferencia >= 0 ? 'Zelle' : 'Ajuste de saldo'); }
        else { setTipo(tipoInicial); setMonto(''); setMetodo(tipoInicial === 'AJUSTE' ? 'Ajuste de saldo' : 'Zelle'); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cuenta?.id, nuevoSaldo, tipoInicial]);

    const guardar = useMutation({
        mutationFn: async () => {
            const importe = Number(monto);
            if (!(importe > 0)) throw new Error('Escribe el monto');
            const res = await fetch(cuenta.manual ? `/api/finanzas/cxc/manual/${cuenta.idReal}/abonos` : `/api/finanzas/cxc/${cuenta.id}/abonos`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo, monto: tipo === 'AJUSTE' ? -importe : importe, fecha, metodo, referencia, notas }),
            });
            const cuerpo = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(cuerpo.error || 'No se pudo registrar');
            return cuerpo;
        },
        onSuccess: (r) => {
            const saldo = Number(r.saldo);
            notifications.show({ color: 'teal', title: tipo === 'AJUSTE' ? 'Ajuste registrado' : 'Abono registrado', message: saldo <= 0.005 ? `${cuenta.documento} quedó cobrada por completo` : `${cuenta.documento}: ahora debe ${dolares(saldo)}` });
            queryClient.invalidateQueries({ queryKey: ['cxc-libro'] }); queryClient.invalidateQueries({ queryKey: ['cuentas'] });
            onCerrar(true);
        },
        onError: (e) => notifications.show({ color: 'red', title: 'No se guardó', message: e.message }),
    });

    if (!cuenta) return null;
    const esAjuste = tipo === 'AJUSTE';
    const importe = Number(monto || 0);
    const saldoResultante = Math.round((cuenta.saldo - (esAjuste ? -importe : importe)) * 100) / 100;
    const pasaDelSaldo = !esAjuste && importe - cuenta.saldo > 0.005;
    return (
        <Dialogo abierto onCerrar={() => onCerrar(false)} titulo={`${esAjuste ? 'Ajustar la deuda' : 'Registrar abono'} · ${cuenta.documento}`}>
            <Stack gap="sm">
                <Group justify="space-between" wrap="nowrap" p="xs" style={{ background: '#f4f7fc', borderRadius: 8, border: '1px solid #d5dbe5' }}>
                    <Box style={{ minWidth: 0 }}>
                        <Text fz={11} c="#5c6675" fw={700} tt="uppercase">Cliente</Text>
                        <Text fw={700} size="sm" truncate="end">{cuenta.cliente}</Text>
                    </Box>
                    <Box ta="right" style={{ flexShrink: 0 }}>
                        <Text fz={11} c="#5c6675" fw={700} tt="uppercase">Debe hoy</Text>
                        <Text fw={800} fz={18} c="navy.9">{dolares(cuenta.saldo)}</Text>
                    </Box>
                </Group>
                {diferencia !== null && (
                    <Alert color={diferencia >= 0 ? 'teal' : 'orange'} variant="light" p="xs" icon={<IconInfoCircle size={18} />}>
                        {diferencia >= 0
                            ? `Para dejar la deuda en ${dolares(nuevoSaldo)} se registra un abono de ${dolares(diferencia)}. Confirma la fecha y cómo pagó.`
                            : `Para dejar la deuda en ${dolares(nuevoSaldo)} se registra un ajuste (cargo) de ${dolares(-diferencia)}. Queda en el historial de la cuenta.`}
                    </Alert>
                )}
                <SegmentedControl
                    fullWidth color="navy.9" classNames={{ root: classes.segRaiz, label: classes.segEtiqueta }} value={tipo}
                    onChange={(v) => { setTipo(v); setMetodo(v === 'AJUSTE' ? 'Ajuste de saldo' : 'Zelle'); }}
                    data={[{ value: 'ABONO', label: 'Abono: el cliente pagó' }, { value: 'AJUSTE', label: 'Ajuste: la deuda sube' }]}
                />
                <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                    <NumberInput
                        label="Monto USD" min={0} decimalScale={2} value={monto} onChange={setMonto} data-autofocus inputMode="decimal"
                        rightSectionWidth={!esAjuste ? 64 : undefined}
                        rightSection={!esAjuste && cuenta.saldo > 0 ? <UnstyledButton fz={11} fw={800} c="brand.7" px={6} onClick={() => setMonto(cuenta.saldo)} aria-label="Abonar todo el saldo">TODO</UnstyledButton> : null}
                    />
                    <TextInput type="date" label="Fecha" max={fechaCaracas()} value={fecha} onChange={(e) => setFecha(e.currentTarget.value)} />
                    {esAjuste
                        ? <TextInput label="Concepto" value={metodo} onChange={(e) => setMetodo(e.currentTarget.value)} />
                        : <Select label="Cómo pagó" data={METODOS_ABONO} value={metodo} onChange={(v) => setMetodo(v || 'Zelle')} allowDeselect={false} searchable comboboxProps={{ withinPortal: true }} />}
                    <TextInput label="Referencia (opcional)" placeholder="Nº de transferencia, de retención…" value={referencia} onChange={(e) => setReferencia(e.currentTarget.value)} maxLength={100} />
                </SimpleGrid>
                <TextInput label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.currentTarget.value)} maxLength={250} />
                {pasaDelSaldo && <Alert color="orange" variant="light" p="xs">El abono es mayor que lo que debe ({dolares(cuenta.saldo)}). Revisa el monto.</Alert>}
                <Group justify="space-between" p="xs" style={{ background: saldoResultante <= 0.005 ? '#ebfbee' : '#f8f9fa', borderRadius: 8 }}>
                    <Text size="sm" fw={600}>Después de registrarlo debe</Text>
                    <Text fw={800} fz={16} c={saldoResultante <= 0.005 ? 'teal.8' : 'navy.9'}>{saldoResultante <= 0.005 ? 'Nada: queda cobrada' : dolares(saldoResultante)}</Text>
                </Group>
                <Group justify="flex-end" gap="xs">
                    <Button variant="default" size="sm" onClick={() => onCerrar(false)}>Cancelar</Button>
                    <Button size="sm" color={esAjuste ? 'orange' : 'teal'} loading={guardar.isPending} disabled={!(importe > 0)} onClick={() => guardar.mutate()}>{esAjuste ? 'Registrar ajuste' : 'Registrar abono'}</Button>
                </Group>
            </Stack>
        </Dialogo>
    );
}
