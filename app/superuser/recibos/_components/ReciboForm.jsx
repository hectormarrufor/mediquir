'use client';

// Formulario del recibo (el de la forma preimpresa: «Hemos pagado a» / «He recibido de», cantidad en letras, concepto, forma de pago, banco).
// Todo es modificable, incluido el número. La cantidad en letras se arma sola del monto mientras no se escriba a mano.
import React, { useMemo, useState } from 'react';
import { Box, Button, Group, NumberInput, Paper, SegmentedControl, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { fechaCaracas } from '@/app/constants/hora';
import { numeroALetras } from '@/app/utils/numeroALetras';

const letrasDe = (monto, moneda) => (Number(monto) > 0 ? `${numeroALetras(Number(monto))} ${moneda === 'USD' ? 'Dólares' : 'Bolívares'}` : '');
const ETIQUETA_REF = { CHEQUE: 'N° de cheque', TRANSFERENCIA: 'N° de transferencia', OTRO: 'Referencia', EFECTIVO: 'Referencia (opcional)' };

export default function ReciboForm({ inicial, numeroSugerido, onGuardar, guardando, textoGuardar = 'Guardar recibo', onCancelar }) {
    const [d, setD] = useState(() => ({
        numero: inicial?.numero ?? '', tipo: inicial?.tipo || 'PAGADO_A', fecha: inicial?.fecha || fechaCaracas(), lugar: inicial?.lugar ?? 'Ciudad Ojeda',
        personaNombre: inicial?.personaNombre || '', personaIdentificacion: inicial?.personaIdentificacion || '', moneda: inicial?.moneda || 'BS',
        monto: inicial?.monto !== undefined ? Number(inicial.monto) : '', montoLetras: inicial?.montoLetras || '', concepto: inicial?.concepto || '',
        formaPago: inicial?.formaPago || 'EFECTIVO', referencia: inicial?.referencia || '', banco: inicial?.banco || '',
    }));
    // las letras se arman solas salvo que ya vengan escritas a mano (un recibo guardado con otro texto)
    const [letrasManual, setLetrasManual] = useState(() => Boolean(inicial?.montoLetras) && inicial.montoLetras !== letrasDe(inicial.monto, inicial.moneda));
    const poner = (k) => (v) => setD((x) => ({ ...x, [k]: v?.currentTarget ? v.currentTarget.value : v }));
    const letras = useMemo(() => (letrasManual ? d.montoLetras : letrasDe(d.monto, d.moneda)), [letrasManual, d.montoLetras, d.monto, d.moneda]);
    const valido = d.personaNombre.trim().length >= 2 && Number(d.monto) > 0 && d.fecha;
    const guardar = () => onGuardar({ ...d, montoLetras: letras, numero: d.numero === '' ? null : Number(d.numero) });
    const pagado = d.tipo === 'PAGADO_A';

    return (
        <Paper withBorder radius="md" p="md" bg="white">
            <Stack gap="sm">
                <SegmentedControl fullWidth color="navy.9" value={d.tipo} onChange={poner('tipo')} data={[{ value: 'PAGADO_A', label: 'Hemos pagado a' }, { value: 'RECIBIDO_DE', label: 'He recibido de' }]} />
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                    <NumberInput label="Recibo N°" hideControls min={1} allowDecimal={false} thousandSeparator="" value={d.numero} onChange={poner('numero')}
                        placeholder={numeroSugerido ? String(numeroSugerido) : ''} description={d.numero === '' && numeroSugerido ? `Vacío = ${numeroSugerido} (el siguiente)` : 'Se puede cambiar si el talonario trae otro'} />
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
                    onChange={(e) => { setLetrasManual(true); setD((x) => ({ ...x, montoLetras: e.currentTarget.value })); }}
                    description={letrasManual ? <Text span size="xs" c="orange.8">Escrita a mano. <Text span size="xs" td="underline" style={{ cursor: 'pointer' }} onClick={() => setLetrasManual(false)}>Volver a la automática</Text></Text> : 'Se arma sola con el monto; puedes corregirla'} />
                <Textarea label="Por concepto de" autosize minRows={3} maxRows={8} value={d.concepto} onChange={poner('concepto')} />
                <Box>
                    <Text size="sm" fw={500} mb={4}>Forma de pago</Text>
                    <SegmentedControl fullWidth color="navy.9" value={d.formaPago} onChange={poner('formaPago')} data={[{ value: 'EFECTIVO', label: 'Efectivo' }, { value: 'CHEQUE', label: 'Cheque' }, { value: 'TRANSFERENCIA', label: 'Transferencia' }, { value: 'OTRO', label: 'Otro' }]} />
                </Box>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <TextInput label={ETIQUETA_REF[d.formaPago]} value={d.referencia} onChange={poner('referencia')} />
                    <TextInput label="Banco" placeholder="(si aplica)" value={d.banco} onChange={poner('banco')} />
                </SimpleGrid>
                <Group justify="flex-end" gap="xs">
                    {onCancelar && <Button variant="default" onClick={onCancelar}>Cancelar</Button>}
                    <Button disabled={!valido} loading={guardando} onClick={guardar}>{textoGuardar}</Button>
                </Group>
            </Stack>
        </Paper>
    );
}
