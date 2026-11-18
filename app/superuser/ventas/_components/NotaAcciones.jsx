'use client';

import React, { useState } from 'react';
import { ActionIcon, Alert, Button, Group, Menu, Modal, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBan, IconCash, IconDotsVertical, IconHash, IconPrinter, IconArrowsSplit2, IconTrash } from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import CompensarNotaModal from './CompensarNotaModal';

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

// Acciones de una nota: imprimir, cargar el número de control, reintegrar dinero al cliente y anular (solo administrador).
// `nota` necesita: id, numeroDocumento, tipo, origen, estado, numeroControl, saldoAFavorUsd, reintegradoUsd.
export default function NotaAcciones({ nota, onCambio }) {
    const { rolUsuario } = useAuth();
    const [modal, setModal] = useState(null); // 'control' | 'reintegro' | 'anular'
    const [control, setControl] = useState(nota.numeroControl || '');
    const [monto, setMonto] = useState('');
    const [metodo, setMetodo] = useState('Transferencia');
    const [referencia, setReferencia] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);

    const vigente = nota.estado === 'EMITIDA';
    // El control de una nota de la empresa se asigna al imprimirla por primera vez. Sin control se elimina directo; con control se pregunta qué pasó con la forma física
    const esDeLaEmpresa = nota.origen === 'VENTA';
    const sinControl = esDeLaEmpresa && !nota.numeroControl;
    // Saldo a favor que falta por devolver o compensar (lo ya compensado en otras facturas no se puede reintegrar)
    const porReintegrar = Math.max(0, Number(nota.saldoAFavorUsd || 0) - Number(nota.reintegradoUsd || 0) - Number(nota.compensadoUsd || 0));
    const puedeReintegrar = vigente && nota.tipo === 'CREDITO' && nota.origen === 'VENTA' && porReintegrar > 0.005;

    const abrir = (m) => {
        setError(null); setModal(m);
        if (m === 'control') setControl(nota.numeroControl || '');
        if (m === 'reintegro') { setMonto(Number(porReintegrar.toFixed(2))); setReferencia(''); }
    };

    const enviar = async (cuerpo, mensaje) => {
        setEnviando(true); setError(null);
        try {
            await pedirJson(`/api/notas/${nota.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
            notifications.show({ color: 'teal', message: mensaje });
            setModal(null);
            onCambio?.();
        } catch (e) {
            setError(e.message);
        } finally {
            setEnviando(false);
        }
    };

    return (
        <>
            <Menu position="bottom-end" withinPortal shadow="md">
                <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label="Acciones de la nota"><IconDotsVertical size={16} /></ActionIcon></Menu.Target>
                <Menu.Dropdown>
                    {nota.origen === 'VENTA' && vigente && (
                        <Menu.Item leftSection={<IconPrinter size={14} />} component="a" href={`/superuser/notas/${nota.id}/imprimir`} target="_blank">Imprimir</Menu.Item>
                    )}
                    {vigente && nota.origen !== 'VENTA' && <Menu.Item leftSection={<IconHash size={14} />} onClick={() => abrir('control')}>Número de control</Menu.Item>}
                    {esDeLaEmpresa && rolUsuario !== 'vendedor' && <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => abrir('eliminar')}>{sinControl ? 'Eliminar nota (aún sin control)' : 'Eliminar nota (forma dañada o no impresa)'}</Menu.Item>}
                    {puedeReintegrar && <Menu.Item leftSection={<IconArrowsSplit2 size={14} />} onClick={() => abrir('compensar')}>Compensar con otras facturas del cliente</Menu.Item>}
                    {puedeReintegrar && <Menu.Item leftSection={<IconCash size={14} />} onClick={() => abrir('reintegro')}>Reintegrar dinero al cliente</Menu.Item>}
                    {vigente && rolUsuario === 'admin' && <Menu.Item color="red" leftSection={<IconBan size={14} />} onClick={() => abrir('anular')}>Anular nota</Menu.Item>}
                </Menu.Dropdown>
            </Menu>

            {modal === 'compensar' && <CompensarNotaModal nota={nota} onClose={() => setModal(null)} onCambio={onCambio} />}

            <Modal opened={modal === 'eliminar'} onClose={() => setModal(null)} centered title={<Text fw={800}>Eliminar {nota.numeroDocumento}</Text>}>
                <Stack>
                    <Text size="sm">Se revierten sus efectos y la nota desaparece; si fue un error al hacerla, emítela de nuevo.</Text>
                    {error && <Alert color="red">{error}</Alert>}
                    {sinControl ? (
                        <Group justify="flex-end"><Button variant="default" onClick={() => setModal(null)}>Volver</Button><Button color="red" loading={enviando} onClick={() => enviar({ accion: 'ELIMINAR' }, 'Nota eliminada')}>Sí, eliminar</Button></Group>
                    ) : (
                        <>
                            <Text size="sm" fw={700}>¿La forma física con el control {nota.numeroControl} se usó (o se dañó)?</Text>
                            <Group justify="flex-end" gap="xs">
                                <Button variant="default" onClick={() => setModal(null)}>Volver</Button>
                                <Button color="teal" loading={enviando} onClick={() => enviar({ accion: 'ELIMINAR', formaUsada: false }, 'Nota eliminada: el control se recuperó')}>No se usó (no salió o falló la impresión): recuperar el control</Button>
                                <Button color="orange" loading={enviando} onClick={() => enviar({ accion: 'ELIMINAR', formaUsada: true }, 'Nota eliminada: la forma quedó anotada como anulada')}>Sí se usó o se dañó: anotarla como anulada</Button>
                            </Group>
                        </>
                    )}
                </Stack>
            </Modal>

            <Modal opened={modal === 'control'} onClose={() => setModal(null)} centered title={<Text fw={800}>Número de control · {nota.numeroDocumento}</Text>}>
                <Stack>
                    <TextInput label="N° de control" placeholder="00-000000" value={control} onChange={(e) => setControl(e.currentTarget.value)} maxLength={30} data-autofocus />
                    {error && <Alert color="red">{error}</Alert>}
                    <Group justify="flex-end"><Button variant="default" onClick={() => setModal(null)}>Cancelar</Button><Button loading={enviando} onClick={() => enviar({ accion: 'NUMERO_CONTROL', numeroControl: control }, 'Número de control guardado')}>Guardar</Button></Group>
                </Stack>
            </Modal>

            <Modal opened={modal === 'reintegro'} onClose={() => setModal(null)} centered title={<Text fw={800}>Reintegro al cliente · {nota.numeroDocumento}</Text>}>
                <Stack>
                    <Text size="sm" c="dimmed">La nota superó lo que el cliente debía: le corresponden <b>${porReintegrar.toFixed(2)}</b>. Al registrar el reintegro se asienta como un gasto (sale dinero).</Text>
                    <NumberInput label="Monto a reintegrar (USD)" decimalScale={2} min={0} max={porReintegrar} allowNegative={false} inputMode="decimal" hideControls value={monto} onChange={setMonto} />
                    <Select label="Método" data={['Transferencia', 'Pago Móvil', 'Efectivo', 'Zelle']} value={metodo} onChange={(v) => setMetodo(v || 'Transferencia')} allowDeselect={false} />
                    <TextInput label="Referencia (opcional)" value={referencia} onChange={(e) => setReferencia(e.currentTarget.value)} />
                    {error && <Alert color="red">{error}</Alert>}
                    <Group justify="flex-end"><Button variant="default" onClick={() => setModal(null)}>Cancelar</Button><Button color="teal" loading={enviando} disabled={!(Number(monto) > 0)} onClick={() => enviar({ accion: 'REINTEGRO', montoUsd: Number(monto), metodoPago: metodo, referencia }, 'Reintegro registrado')}>Registrar reintegro</Button></Group>
                </Stack>
            </Modal>

            <Modal opened={modal === 'anular'} onClose={() => setModal(null)} centered title={<Text fw={800}>Anular {nota.numeroDocumento}</Text>}>
                <Stack>
                    <Text size="sm">Se revierten sus efectos: {nota.tipo === 'CREDITO' ? 'lo que el cliente debe vuelve a subir (y la mercancía sale del inventario si se había reintegrado)' : 'lo que el cliente debe vuelve a bajar'}. La numeración queda usada.</Text>
                    {error && <Alert color="red">{error}</Alert>}
                    <Group justify="flex-end"><Button variant="default" onClick={() => setModal(null)}>Volver</Button><Button color="red" loading={enviando} onClick={() => enviar({ accion: 'ANULAR' }, 'Nota anulada')}>Sí, anular</Button></Group>
                </Stack>
            </Modal>
        </>
    );
}
