'use client';

// Formulario del recibo («Hemos pagado a» / «He recibido de», cantidad en letras, concepto, forma de pago y banco).
// Todo es modificable, incluido el número. La cantidad en letras se arma sola del monto mientras no se escriba a mano.
import React, { useMemo, useState } from 'react';
import { Box, Button, Group, NumberInput, Paper, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { fechaCaracas } from '@/app/constants/hora';
import { BANCOS_VENEZUELA } from '@/app/constants/bancosVenezuela';
import { numeroALetras } from '@/app/utils/numeroALetras';

const letrasDe = (monto, moneda) => (Number(monto) > 0 ? `${numeroALetras(Number(monto))} ${moneda === 'USD' ? 'Dólares' : 'Bolívares'}` : '');
const ETIQUETA_REF = {
    PAGO_MOVIL: 'N° de referencia (Pago móvil)',
    TRANSFERENCIA: 'N° de transferencia',
    EFECTIVO: 'Referencia (opcional)',
};
const FORMAS_VALIDAS = new Set(['PAGO_MOVIL', 'TRANSFERENCIA', 'EFECTIVO']);

export default function ReciboForm({ inicial, numeroSugerido, onGuardar, guardando, textoGuardar = 'Guardar recibo', onCancelar }) {
    const [d, setD] = useState(() => ({
        numero: inicial?.numero ?? '', tipo: inicial?.tipo || 'PAGADO_A', fecha: inicial?.fecha || fechaCaracas(), lugar: inicial?.lugar ?? 'Ciudad Ojeda',
        personaNombre: inicial?.personaNombre || '', personaIdentificacion: inicial?.personaIdentificacion || '', moneda: inicial?.moneda || 'BS',
        monto: inicial?.monto !== undefined ? Number(inicial.monto) : '', montoLetras: inicial?.montoLetras || '', concepto: inicial?.concepto || '',
        formaPago: FORMAS_VALIDAS.has(inicial?.formaPago) ? inicial.formaPago : 'PAGO_MOVIL',
        referencia: inicial?.referencia || '', banco: inicial?.banco || '',
    }));
    // las letras se arman solas salvo que ya vengan escritas a mano (un recibo guardado con otro texto)
    const [letrasManual, setLetrasManual] = useState(() => Boolean(inicial?.montoLetras) && inicial.montoLetras !== letrasDe(inicial.monto, inicial.moneda));
    const poner = (k) => (v) => setD((x) => ({ ...x, [k]: v?.currentTarget ? v.currentTarget.value : (v ?? '') }));
    const letras = useMemo(() => (letrasManual ? d.montoLetras : letrasDe(d.monto, d.moneda)), [letrasManual, d.montoLetras, d.monto, d.moneda]);
    const bancosOpciones = useMemo(() => {
        if (!d.banco || BANCOS_VENEZUELA.includes(d.banco)) return BANCOS_VENEZUELA;
        return [d.banco, ...BANCOS_VENEZUELA];
    }, [d.banco]);
    const valido = d.personaNombre.trim().length >= 2 && Number(d.monto) > 0 && d.fecha;
    const guardar = () => onGuardar({ ...d, montoLetras: letras, numero: d.numero === '' ? null : Number(d.numero) });
    const pagado = d.tipo === 'PAGADO_A';
    const numSugFmt = numeroSugerido ? `00-${String(numeroSugerido).padStart(5, '0')}` : '';

    return (
        <Paper withBorder radius="md" p="md" bg="white">
            <Stack gap="sm">
                <SegmentedControl fullWidth color="navy.9" value={d.tipo} onChange={poner('tipo')} data={[{ value: 'PAGADO_A', label: 'Hemos pagado a' }, { value: 'RECIBIDO_DE', label: 'He recibido de' }]} />
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                    <NumberInput label="Recibo N°" hideControls min={1} allowDecimal={false} thousandSeparator="" value={d.numero} onChange={poner('numero')}
                        placeholder={numSugFmt} description={d.numero === '' && numSugFmt ? `Vacío = ${numSugFmt} (el siguiente)` : 'Se puede cambiar si el talonario trae otro'} />
                    <TextInput label="Lugar" value={d.lugar} onChange={poner('lugar')} />
                    <TextInput type="date" label="Fecha" value={d.fecha} onChange={poner('fecha')} />
                </SimpleGrid>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <TextInput label={pagado ? 'Pagado a' : 'Recibido de'} withAsterisk value={d.personaNombre} onChange={poner('personaNombre')} data-autofocus />
                    <TextInput label="Cédula / RIF" placeholder="(opcional)" value={d.personaIdentificacion} onChange={poner('personaIdentificacion')} />
                </SimpleGrid>
                <Group gap="sm" align="flex-end" wrap="wrap">
                    <Box>
                        <Text size="sm" fw={500} mb={4}>Moneda</Text>
                        <SegmentedControl color="navy.9" value={d.moneda} onChange={poner('moneda')} data={[{ value: 'BS', label: 'Bolívares' }, { value: 'USD', label: 'Dólares' }]} />
                    </Box>
                    <NumberInput label={`Monto (${d.moneda === 'USD' ? '$' : 'Bs'})`} withAsterisk decimalScale={2} fixedDecimalScale min={0} hideControls thousandSeparator="." decimalSeparator="," value={d.monto} onChange={poner('monto')} inputMode="decimal" w={200} />
                </Group>
                <Textarea label="La cantidad de (en letras)" autosize minRows={1} maxRows={3} value={letras}
                    onChange={(e) => { const v = e.currentTarget.value; setLetrasManual(true); setD((x) => ({ ...x, montoLetras: v })); }}
                    description={letrasManual ? <Text span size="xs" c="orange.8">Escrita a mano. <Text span size="xs" td="underline" style={{ cursor: 'pointer' }} onClick={() => setLetrasManual(false)}>Volver a la automática</Text></Text> : 'Se arma sola con el monto; puedes corregirla'} />
                <Textarea label="Por concepto de" autosize minRows={3} maxRows={8} value={d.concepto} onChange={poner('concepto')} />
                <Box>
                    <Text size="sm" fw={500} mb={4}>Método de pago</Text>
                    <SegmentedControl
                        fullWidth color="navy.9" value={d.formaPago} onChange={poner('formaPago')}
                        data={[
                            { value: 'PAGO_MOVIL', label: 'Pago móvil' },
                            { value: 'TRANSFERENCIA', label: 'Transferencia' },
                            { value: 'EFECTIVO', label: 'Efectivo' },
                        ]}
                    />
                </Box>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <TextInput label={ETIQUETA_REF[d.formaPago] || 'Referencia'} value={d.referencia} onChange={poner('referencia')} />
                    <Select
                        label="Banco"
                        placeholder={d.formaPago === 'EFECTIVO' ? 'Opcional (efectivo)' : 'Selecciona el banco'}
                        data={bancosOpciones}
                        value={d.banco || null}
                        onChange={(v) => setD((x) => ({ ...x, banco: v || '' }))}
                        searchable
                        clearable
                        nothingFoundMessage="Banco no encontrado"
                    />
                </SimpleGrid>
                <Group justify="flex-end" gap="xs">
                    {onCancelar && <Button variant="default" onClick={onCancelar}>Cancelar</Button>}
                    <Button disabled={!valido} loading={guardando} onClick={guardar}>{textoGuardar}</Button>
                </Group>
            </Stack>
        </Paper>
    );
}
