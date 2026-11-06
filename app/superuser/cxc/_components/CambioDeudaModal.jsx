'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fechaCaracas } from '@/app/constants/hora';

const usd = (v) => `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`;
const METODOS_ABONO = ['Zelle', 'Efectivo ($)', 'Transferencia', 'Pago Móvil', 'Retención IVA', 'Nota de crédito', 'Otro'];

// Todo cambio de la deuda de una cuenta queda REGISTRADO como un abono (el cliente pagó) o un ajuste (la deuda sube): con fecha, método y referencia.
//   cuenta: fila del libro · nuevoSaldo: si la persona escribió un saldo nuevo en la celda, aquí se calcula la diferencia · onCerrar(guardado)
export default function CambioDeudaModal({ cuenta, nuevoSaldo = null, onCerrar }) {
    const queryClient = useQueryClient();
    const diferencia = nuevoSaldo === null || nuevoSaldo === undefined ? null : Math.round((cuenta.saldo - Number(nuevoSaldo)) * 100) / 100;
    const [tipo, setTipo] = useState('ABONO');
    const [monto, setMonto] = useState('');
    const [fecha, setFecha] = useState(fechaCaracas());
    const [metodo, setMetodo] = useState('Zelle');
    const [referencia, setReferencia] = useState('');
    const [notas, setNotas] = useState('');

    useEffect(() => {
        if (!cuenta) return;
        setFecha(fechaCaracas()); setReferencia(''); setNotas('');
        if (diferencia !== null) { setTipo(diferencia >= 0 ? 'ABONO' : 'AJUSTE'); setMonto(Math.abs(diferencia)); setMetodo(diferencia >= 0 ? 'Zelle' : 'Ajuste de saldo'); }
        else { setTipo('ABONO'); setMonto(''); setMetodo('Zelle'); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cuenta?.id, nuevoSaldo]);

    const guardar = useMutation({
        mutationFn: async () => {
            const importe = Number(monto);
            if (!(importe > 0)) throw new Error('Escribe el monto');
            const res = await fetch(`/api/finanzas/cxc/${cuenta.id}/abonos`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo, monto: tipo === 'AJUSTE' ? -importe : importe, fecha, metodo, referencia, notas }),
            });
            const cuerpo = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(cuerpo.error || 'No se pudo registrar');
            return cuerpo;
        },
        onSuccess: (r) => {
            notifications.show({ color: 'teal', title: tipo === 'AJUSTE' ? 'Ajuste registrado' : 'Abono registrado', message: `${cuenta.documento}: saldo ahora ${usd(r.saldo)}` });
            queryClient.invalidateQueries({ queryKey: ['cxc-libro'] }); queryClient.invalidateQueries({ queryKey: ['cuentas'] });
            onCerrar(true);
        },
        onError: (e) => notifications.show({ color: 'red', title: 'No se guardó', message: e.message }),
    });

    if (!cuenta) return null;
    const saldoResultante = Math.round((cuenta.saldo - (tipo === 'AJUSTE' ? -Number(monto || 0) : Number(monto || 0))) * 100) / 100;
    return (
        <Modal opened onClose={() => onCerrar(false)} centered title={<Text fw={800}>{tipo === 'AJUSTE' ? 'Ajuste de la deuda' : 'Registrar abono'} · {cuenta.documento}</Text>}>
            <Stack gap="sm">
                <Text size="sm">{cuenta.cliente} · saldo actual <b>{usd(cuenta.saldo)}</b></Text>
                {diferencia !== null && (
                    <Alert color={diferencia >= 0 ? 'teal' : 'orange'} variant="light" p="xs">
                        {diferencia >= 0
                            ? `Para dejar la deuda en ${usd(nuevoSaldo)} se registra un abono de ${usd(diferencia)}. Confirma la fecha y cómo pagó.`
                            : `Para dejar la deuda en ${usd(nuevoSaldo)} se registra un ajuste (cargo) de ${usd(-diferencia)}. Queda en el historial de la cuenta.`}
                    </Alert>
                )}
                <Group grow align="flex-start">
                    <Select label="Qué es" allowDeselect={false} value={tipo} onChange={(v) => { setTipo(v); setMetodo(v === 'AJUSTE' ? 'Ajuste de saldo' : 'Zelle'); }}
                        data={[{ value: 'ABONO', label: 'Abono (el cliente pagó)' }, { value: 'AJUSTE', label: 'Ajuste (sube la deuda)' }]} />
                    <NumberInput label="Monto USD" min={0} decimalScale={2} value={monto} onChange={setMonto} />
                </Group>
                <Group grow align="flex-start">
                    <TextInput type="date" label="Fecha" max={fechaCaracas()} value={fecha} onChange={(e) => setFecha(e.currentTarget.value)} />
                    {tipo === 'ABONO'
                        ? <Select label="Método" data={METODOS_ABONO} value={metodo} onChange={(v) => setMetodo(v || 'Zelle')} allowDeselect={false} searchable />
                        : <TextInput label="Concepto" value={metodo} onChange={(e) => setMetodo(e.currentTarget.value)} />}
                </Group>
                <TextInput label="Referencia (opcional)" placeholder="Nº de transferencia, de retención…" value={referencia} onChange={(e) => setReferencia(e.currentTarget.value)} maxLength={100} />
                <TextInput label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.currentTarget.value)} maxLength={250} />
                <Text size="sm" c="dimmed">Saldo después: <b>{usd(Math.max(0, saldoResultante))}</b></Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={() => onCerrar(false)}>Cancelar</Button>
                    <Button color={tipo === 'AJUSTE' ? 'orange' : 'teal'} loading={guardar.isPending} onClick={() => guardar.mutate()}>{tipo === 'AJUSTE' ? 'Registrar ajuste' : 'Registrar abono'}</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
