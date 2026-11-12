'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Group, NumberInput, Paper, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { fechaCaracas } from '@/app/constants/hora';

// Nota de débito de un proveedor (formato del sistema anterior: «Nota de débito a Proveedores»).
// Sube lo que se le debe al proveedor por la factura que afecta y entra al libro de compras. Se guarda con el mismo servicio que las
// notas registradas desde la lista de compras (POST /api/compras/[id]/notas), así que los montos van en la moneda de esa factura.
const ALICUOTAS = [16, 8, 27];
const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const limpiar = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');

// ia (opcional): lo que leyó la IA { numero, control, fecha, concepto, facturaAfectada, bases: [{ porcentaje, base }], exento, iva, moneda, tasa }
export default function NotaDebitoCompra({ proveedorId, ia, onRegistrada, onCancelar }) {
    const queryClient = useQueryClient();
    const [numero, setNumero] = useState('');
    const [control, setControl] = useState('');
    const [fecha, setFecha] = useState(fechaCaracas());
    const [facturaId, setFacturaId] = useState(null);
    const [concepto, setConcepto] = useState('');
    const [bases, setBases] = useState({ 16: '', 8: '', 27: '' });
    const [exento, setExento] = useState('');
    const [ivaImpreso, setIvaImpreso] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);
    const [avisos, setAvisos] = useState([]);

    // Facturas de este proveedor a las que se le puede poner la nota
    const { data: facturas, isLoading } = useQuery({
        queryKey: ['compras-proveedor', proveedorId],
        enabled: Boolean(proveedorId),
        queryFn: async () => {
            const res = await fetch(`/api/compras?proveedorId=${proveedorId}&soloFacturas=1`);
            return res.ok ? res.json() : [];
        },
    });
    const factura = useMemo(() => (facturas || []).find((f) => f.id === facturaId) || null, [facturas, facturaId]);
    const simbolo = factura ? (factura.moneda === 'BS' ? 'Bs' : '$') : '';

    // Lo leído por la IA llena el formulario (la persona lo revisa antes de registrar)
    useEffect(() => {
        if (!ia) return;
        const nuevos = [];
        if (ia.numero) setNumero(String(ia.numero).slice(0, 50));
        if (ia.control) setControl(String(ia.control).slice(0, 30));
        if (ia.fecha) { if (ia.fecha <= fechaCaracas()) setFecha(ia.fecha); else nuevos.push('La fecha leída es posterior a hoy: revísala.'); }
        if (ia.concepto) setConcepto(String(ia.concepto).slice(0, 200));
        const b = { 16: '', 8: '', 27: '' };
        (ia.bases || []).forEach((x) => { const p = ALICUOTAS.includes(Number(x.porcentaje)) ? Number(x.porcentaje) : 16; b[p] = (Number(b[p]) || 0) + (Number(x.base) || 0) || ''; });
        setBases(b);
        setExento(ia.exento ? ia.exento : '');
        setIvaImpreso(ia.iva ? ia.iva : '');
        setAvisos(nuevos);
    }, [ia]);

    // La factura afectada se elige sola cuando el número leído coincide con una de las del proveedor
    useEffect(() => {
        if (!ia?.facturaAfectada || !facturas?.length || facturaId) return;
        const buscada = limpiar(ia.facturaAfectada);
        const f = buscada && facturas.find((x) => limpiar(x.numeroDocumento) === buscada);
        if (f) setFacturaId(f.id);
        else setAvisos((a) => [...a, `La nota dice que afecta la factura «${ia.facturaAfectada}», pero no está entre las facturas de este proveedor: elige la correcta o regístrala primero.`]);
    }, [ia, facturas, facturaId]);

    // La nota se guarda en la moneda de la factura: si la IA leyó otra moneda se avisa (no se convierte sola)
    const monedaLeida = ia?.moneda === 'USD' ? 'USD' : ia?.moneda ? 'BS' : null;
    const desajusteMoneda = factura && monedaLeida && monedaLeida !== factura.moneda;

    const baseTotal = r2(ALICUOTAS.reduce((a, p) => a + (Number(bases[p]) || 0), 0));
    const ivaCalculado = r2(ALICUOTAS.reduce((a, p) => a + ((Number(bases[p]) || 0) * p) / 100, 0));
    const ivaFinal = ivaImpreso === '' ? ivaCalculado : r2(Number(ivaImpreso) || 0);
    const total = r2(baseTotal + (Number(exento) || 0) + ivaFinal);
    const valido = Boolean(factura) && numero.trim() && concepto.trim().length >= 5 && total > 0;

    const registrar = async () => {
        setEnviando(true);
        setError(null);
        try {
            const res = await fetch(`/api/compras/${factura.id}/notas`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo: 'DEBITO', numeroDocumento: numero, numeroControl: control, fecha, baseImponible: baseTotal, montoExento: Number(exento) || 0, montoIva: ivaFinal, motivo: concepto }),
            });
            const cuerpo = await res.json().catch(() => null);
            if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo registrar la nota de débito');
            notifications.show({ color: 'teal', title: 'Nota de débito registrada', message: `${numero} por ${simbolo}${nf(total)}: sube lo que le debes al proveedor y entra al libro de compras.` });
            queryClient.invalidateQueries({ queryKey: ['compras'] });
            queryClient.invalidateQueries({ queryKey: ['compras-proveedor'] });
            onRegistrada?.(cuerpo.nota);
        } catch (e) {
            setError(e.message);
        } finally {
            setEnviando(false);
        }
    };

    if (!proveedorId) return <Alert color="blue" variant="light">Elige primero el proveedor que emitió la nota de débito.</Alert>;

    return (
        <Paper withBorder p="md" radius="md" maw={820} mx="auto" w="100%">
            <Stack gap="sm">
                <Text fw={800} size="lg" c="blue.9">Nota de débito del proveedor</Text>
                {avisos.length > 0 && (
                    <Alert p="xs" color="yellow" variant="light" icon={<IconAlertTriangle size={18} />} title="Revisa lo que leyó la IA" withCloseButton onClose={() => setAvisos([])}>
                        <Stack gap={2}>{avisos.map((a, i) => <Text key={i} size="xs">{a}</Text>)}</Stack>
                    </Alert>
                )}
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
                    <TextInput label="N° de la nota de débito (del proveedor)" withAsterisk value={numero} onChange={(e) => setNumero(e.currentTarget.value)} maxLength={50} />
                    <TextInput label="N° de control" value={control} onChange={(e) => setControl(e.currentTarget.value)} maxLength={30} />
                    <TextInput type="date" label="Fecha" max={fechaCaracas()} value={fecha} onChange={(e) => setFecha(e.currentTarget.value)} />
                </SimpleGrid>
                <Select
                    label="Factura que afecta (Referencia / Fac. Afec.)" withAsterisk searchable allowDeselect={false} value={facturaId} onChange={setFacturaId}
                    placeholder={isLoading ? 'Cargando facturas…' : 'Elige la factura'} nothingFoundMessage="Este proveedor no tiene facturas registradas"
                    data={(facturas || []).map((f) => ({ value: f.id, label: `${f.numeroDocumento} · ${String(f.fechaFactura).slice(0, 10).split('-').reverse().join('/')} · ${f.moneda === 'BS' ? 'Bs' : '$'}${nf(f.totalFinal)}` }))}
                />
                {factura && <Text size="xs" c="dimmed">Los montos van en <b>{factura.moneda === 'BS' ? 'bolívares (Bs)' : 'dólares ($)'}</b>, la moneda de la factura{Number(factura.tasaCambio) > 1 ? ` · factor de cambio ${nf(factura.tasaCambio)}` : ''}.</Text>}
                {desajusteMoneda && <Alert p="xs" color="orange" variant="light" icon={<IconAlertTriangle size={18} />}>La nota está en {monedaLeida === 'BS' ? 'bolívares' : 'dólares'} y la factura en {factura.moneda === 'BS' ? 'bolívares' : 'dólares'}: pasa los montos a la moneda de la factura antes de registrar.</Alert>}
                <Textarea label="Concepto" withAsterisk minRows={2} autosize maxRows={4} maxLength={200} placeholder="Ej: diferencial cambiario, intereses por mora, cargo por flete…" value={concepto} onChange={(e) => setConcepto(e.currentTarget.value)} />

                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
                    {ALICUOTAS.map((p) => (
                        <NumberInput key={p} label={`Base imponible ${p}%${simbolo ? ` (${simbolo})` : ''}`} min={0} decimalScale={2} hideControls value={bases[p]} onChange={(v) => setBases({ ...bases, [p]: v })}
                            description={`IVA ${simbolo}${nf(((Number(bases[p]) || 0) * p) / 100)}`} />
                    ))}
                </SimpleGrid>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                    <NumberInput label={`Monto exento${simbolo ? ` (${simbolo})` : ''}`} min={0} decimalScale={2} hideControls value={exento} onChange={setExento} />
                    <NumberInput label={`Total impuestos (IVA)${simbolo ? ` (${simbolo})` : ''}`} min={0} decimalScale={2} hideControls value={ivaImpreso} onChange={setIvaImpreso}
                        description={`Vacío = calculado (${simbolo}${nf(ivaCalculado)}). Escríbelo si la nota trae otro por céntimos.`} />
                </SimpleGrid>
                <Alert color="blue" variant="light" title={`Total de la operación: ${simbolo}${nf(total)}`}>
                    <Text size="xs">Sube lo que le debes a este proveedor por la factura y suma en el libro de compras.</Text>
                </Alert>
                {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error}</Alert>}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onCancelar}>Cancelar</Button>
                    <Button color="green.8" leftSection={<IconCheck size={18} />} loading={enviando} disabled={!valido} onClick={registrar}>Procesar</Button>
                </Group>
            </Stack>
        </Paper>
    );
}
