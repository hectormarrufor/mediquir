'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, NumberInput, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Registra una nota de crédito o de débito que EMITIÓ el proveedor sobre una factura de compra.
// Baja (crédito) o sube (débito) lo que la empresa le debe al proveedor, y entra al libro de compras.
export default function NotaCompraModal({ opened, onClose, compra, onRegistrada }) {
    const simbolo = compra.moneda === 'BS' ? 'Bs' : '$';
    const alicuota = Number(compra.alicuotaIva) || 16;
    const [tipo, setTipo] = useState('CREDITO');
    const [numero, setNumero] = useState('');
    const [control, setControl] = useState('');
    const [fecha, setFecha] = useState(hoy());
    const [base, setBase] = useState('');
    const [exento, setExento] = useState('');
    const [iva, setIva] = useState('');
    const [motivo, setMotivo] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!opened) return;
        setTipo('CREDITO'); setNumero(''); setControl(''); setFecha(hoy()); setBase(''); setExento(''); setIva(''); setMotivo(''); setError(null);
    }, [opened]);

    const ivaCalculado = r2((Number(base) || 0) * alicuota / 100);
    const ivaFinal = iva === '' ? ivaCalculado : Number(iva) || 0;
    const total = r2((Number(base) || 0) + (Number(exento) || 0) + ivaFinal);

    const registrar = async () => {
        setEnviando(true);
        setError(null);
        try {
            const res = await fetch(`/api/compras/${compra.id}/notas`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo, numeroDocumento: numero, numeroControl: control, fecha, baseImponible: Number(base) || 0, montoExento: Number(exento) || 0, montoIva: iva === '' ? undefined : Number(iva), motivo }),
            });
            const cuerpo = await res.json().catch(() => null);
            if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo registrar la nota');
            notifications.show({ color: 'teal', title: 'Nota registrada', message: `${numero} por ${simbolo}${nf(total)}` });
            onRegistrada?.(cuerpo.nota);
            onClose();
        } catch (e) {
            setError(e.message);
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Modal opened={opened} onClose={onClose} centered size="lg" title={<Text fw={800}>Nota del proveedor · factura {compra.numeroDocumento}</Text>}>
            <Stack gap="sm">
                <Text size="sm" c="dimmed">{compra.proveedor?.nombre}. Escribe los datos como aparecen en la nota que te entregó el proveedor.</Text>
                <SegmentedControl fullWidth value={tipo} onChange={setTipo} data={[{ value: 'CREDITO', label: 'Nota de crédito (te descuentan)' }, { value: 'DEBITO', label: 'Nota de débito (te cobran más)' }]} />
                <Group grow align="flex-start">
                    <TextInput label="N° de la nota" withAsterisk value={numero} onChange={(e) => setNumero(e.currentTarget.value)} maxLength={50} data-autofocus />
                    <TextInput label="N° de control" value={control} onChange={(e) => setControl(e.currentTarget.value)} maxLength={30} />
                    <TextInput type="date" label="Fecha" max={hoy()} value={fecha} onChange={(e) => setFecha(e.currentTarget.value)} />
                </Group>
                <Group grow align="flex-start">
                    <NumberInput label={`Base imponible (${simbolo})`} min={0} decimalScale={2} hideControls value={base} onChange={setBase} />
                    <NumberInput label={`Exento (${simbolo})`} min={0} decimalScale={2} hideControls value={exento} onChange={setExento} />
                    <NumberInput label={`IVA (${simbolo})`} min={0} decimalScale={2} hideControls value={iva} onChange={setIva} description={`Vacío = ${alicuota}% (${nf(ivaCalculado)})`} />
                </Group>
                <TextInput label="Motivo" withAsterisk placeholder="Ej: devolución de mercancía, descuento por pronto pago…" value={motivo} onChange={(e) => setMotivo(e.currentTarget.value)} maxLength={200} />
                <Alert color={tipo === 'CREDITO' ? 'red' : 'blue'} variant="light" title={`Total de la nota: ${simbolo}${nf(total)}`}>
                    <Text size="xs">{tipo === 'CREDITO' ? 'Baja lo que le debes a este proveedor por la factura.' : 'Sube lo que le debes a este proveedor por la factura.'} En el libro de compras {tipo === 'CREDITO' ? 'resta' : 'suma'}.</Text>
                </Alert>
                {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error}</Alert>}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cancelar</Button>
                    <Button onClick={registrar} loading={enviando} disabled={!numero.trim() || motivo.trim().length < 5 || !(total > 0)}>Registrar nota</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
