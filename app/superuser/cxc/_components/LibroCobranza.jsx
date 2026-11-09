'use client';

// Las cuentas por cobrar como las lleva la administradora en Excel: una fila por documento, agrupadas por cliente.
// El saldo no se sobrescribe: al cambiarlo se registra el abono o el ajuste que lo explica; el monto del documento se corrige con su motivo.
// En la computadora es una tabla editable (LibroTabla); en el teléfono, tarjetas (LibroTarjetas). Los datos y las acciones son los mismos (useLibroCobranza).
import React, { useState } from 'react';
import { ActionIcon, Alert, Box, Button, CloseButton, Group, Menu, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertTriangle, IconArrowsSort, IconCash, IconClockExclamation, IconDotsVertical, IconDownload, IconFileInvoice, IconInbox, IconPlus, IconSearch, IconUsers } from '@tabler/icons-react';
import CambioDeudaModal from './CambioDeudaModal';
import { IconFold } from '@tabler/icons-react';
import { DialogoGrupos, PestanasGrupos } from './GruposLibro';
import LibroTabla from './LibroTabla';
import LibroTarjetas from './LibroTarjetas';
import { DialogoCorregirMonto, DialogoCuentaManual, DialogoEditarAbono, DialogoEditarCuenta } from './PiezasLibro';
import { EstadoVacio, Esqueleto, Kpi, useConfirmar } from './Piezas';
import { ORDENES_LIBRO, VISTAS_LIBRO, useLibroCobranza } from './useLibroCobranza';
import { dolares, useAltoElemento, useVistaTarjetas } from './utilidades';
import classes from './cxc.module.css';

export default function LibroCobranza() {
    const libro = useLibroCobranza();
    const tarjetas = useVistaTarjetas();
    const [refBarra, altoBarra] = useAltoElemento();
    const [dialogo, setDialogo] = useState(null); // { tipo: 'deuda' | 'monto' | 'editar' | 'abono' | 'manual', ... }
    const { confirmar, dialogo: confirmacion } = useConfirmar();
    const [gruposAbierto, setGruposAbierto] = useState(false); // diálogo «Administrar grupos»
    const cerrar = () => setDialogo(null);

    // Lo que se puede hacer con un documento: igual desde la tabla o desde la tarjeta
    const acc = {
        abonar: (cuenta, nuevoSaldo = null) => setDialogo({ tipo: 'deuda', cuenta, nuevoSaldo }),
        ajustar: (cuenta) => setDialogo({ tipo: 'deuda', cuenta, nuevoSaldo: null, tipoInicial: 'AJUSTE' }),
        corregirMonto: (cuenta, nuevo = null) => setDialogo({ tipo: 'monto', cuenta, nuevo }),
        editar: (cuenta) => setDialogo({ tipo: 'editar', cuenta }),
        editarAbono: (cuenta, abono) => setDialogo({ tipo: 'abono', cuenta, abono }),
        guardar: libro.editarCuenta,
        guardarAbono: libro.editarAbono,
        borrarAbono: async (cuenta, abono) => {
            const ok = await confirmar({
                titulo: 'Borrar abono', textoConfirmar: 'Sí, borrar el abono',
                mensaje: <Text size="sm">Se borra el abono de <b>{dolares(abono.monto)}</b> del {abono.fecha?.split('-').reverse().join('/')} en <b>{cuenta.documento}</b>. La deuda vuelve a subir y, si tenía su ingreso de caja, también se quita.</Text>,
            });
            if (ok) await libro.borrarAbono(cuenta, abono);
            return ok;
        },
        borrarManual: async (cuenta) => {
            const ok = await confirmar({ titulo: 'Borrar cuenta manual', textoConfirmar: 'Sí, borrarla', mensaje: `Se borra la cuenta «${cuenta.documento}» de ${cuenta.cliente} por ${dolares(cuenta.monto)}. Solo se puede porque no tiene abonos.` });
            if (ok) await libro.borrarManual(cuenta);
        },
    };

    if (libro.error) return <Alert color="red" icon={<IconAlertTriangle size={18} />} title="No se pudo cargar el libro">{libro.error.message}</Alert>;
    if (libro.cargando || tarjetas === undefined) return <Esqueleto />;

    const r = libro.resumen;
    const pctVencido = r.saldo > 0 ? Math.round((r.vencido / r.saldo) * 100) : 0;
    const nuevaManual = () => setDialogo({ tipo: 'manual' });
    const buscador = (
        <TextInput
            size={tarjetas ? 'sm' : 'xs'} flex="1 1 240px" miw={0} aria-label="Buscar en el libro"
            placeholder={tarjetas ? 'Buscar cliente o documento…' : 'Buscar cliente, documento, RIF, vendedor u observación…'}
            leftSection={<IconSearch size={15} />} value={libro.busqueda} onChange={(e) => libro.setBusqueda(e.currentTarget.value)}
            rightSection={libro.busqueda ? <CloseButton size="sm" aria-label="Borrar búsqueda" onClick={() => libro.setBusqueda('')} /> : null}
        />
    );
    const vistas = (
        <SegmentedControl
            size="xs" color="navy.9" fullWidth={tarjetas} classNames={{ root: classes.segRaiz, label: classes.segEtiqueta }}
            value={libro.vista} onChange={libro.setVista} aria-label="Qué documentos ver"
            data={VISTAS_LIBRO.map((v) => ({ ...v, label: tarjetas && v.value === 'todas' ? 'Todas' : v.label }))}
        />
    );

    return (
        <Stack gap={8} style={{ '--cxc-barra': `${altoBarra + 6}px` }}>
            <SimpleGrid cols={{ base: 2, md: 4 }} spacing={8}>
                <Kpi titulo="Por cobrar" valor={dolares(r.saldo)} detalle={`${r.documentos} documento(s) pendientes`} icono={IconCash} />
                <Kpi
                    titulo="Vencido" valor={dolares(r.vencido)} color={r.vencido > 0 ? 'red.8' : 'teal.8'} icono={IconClockExclamation} colorIcono="red"
                    detalle={r.vencido > 0 ? `${r.vencidas} documento(s) · ${pctVencido} % de lo que se debe` : 'Nada vencido'}
                    onClick={() => libro.setVista(libro.vista === 'vencidas' ? 'pendientes' : 'vencidas')} activo={libro.vista === 'vencidas'}
                    ayuda="Toca para ver solo las vencidas"
                />
                <Kpi titulo="Documentos" valor={r.documentos} icono={IconFileInvoice} colorIcono="grape" detalle={r.manuales ? `${r.manuales} cuenta(s) manual(es)` : 'Facturas y notas de entrega'} />
                <Kpi titulo="Clientes con saldo" valor={r.clientes} icono={IconUsers} colorIcono="teal" detalle="Con algo pendiente" />
            </SimpleGrid>

            <Box ref={refBarra} className={`${classes.barra} ${classes.noImprimir}`}>
                <Box mb={6}><PestanasGrupos libro={libro} onAdministrar={() => setGruposAbierto(true)} /></Box>
                {tarjetas ? (
                    <Stack gap={6}>
                        <Group gap={6} wrap="nowrap">
                            {buscador}
                            <ActionIcon size={36} radius="md" color="grape" onClick={nuevaManual} aria-label="Nueva cuenta manual"><IconPlus size={20} /></ActionIcon>
                            <Menu position="bottom-end" withinPortal shadow="md" width={240}>
                                <Menu.Target><ActionIcon size={36} radius="md" variant="default" aria-label="Más opciones del libro"><IconDotsVertical size={20} /></ActionIcon></Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Label>Ordenar clientes</Menu.Label>
                                    {ORDENES_LIBRO.map((o) => <Menu.Item key={o.value} leftSection={<IconArrowsSort size={16} />} fw={libro.orden === o.value ? 800 : 400} onClick={() => libro.setOrden(o.value)}>{o.label}{libro.orden === o.value ? ' ✓' : ''}</Menu.Item>)}
                                    <Menu.Divider />
                                    <Menu.Item leftSection={<IconPlus size={16} />} onClick={nuevaManual}>Nueva cuenta manual</Menu.Item>
                                    <Menu.Item leftSection={<IconDownload size={16} />} onClick={libro.exportarCsv}>Descargar para Excel (CSV)</Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        </Group>
                        {vistas}
                    </Stack>
                ) : (
                    <Group gap={8} wrap="wrap">
                        {buscador}
                        {vistas}
                        <Select size="xs" w={190} aria-label="Ordenar clientes" leftSection={<IconArrowsSort size={14} />} data={ORDENES_LIBRO} value={libro.orden} onChange={(v) => libro.setOrden(v || 'cliente')} allowDeselect={false} comboboxProps={{ withinPortal: true }} />
                        <Group gap={6} ml="auto" wrap="nowrap">
                            <Button size="compact-sm" variant="default" leftSection={<IconFold size={15} />} onClick={libro.desplegarTodo}>Desplegar todo</Button>
                            <Button size="compact-sm" variant="default" onClick={libro.plegarTodo}>Plegar todo</Button>
                            <Button size="compact-sm" variant="default" leftSection={<IconDownload size={15} />} onClick={libro.exportarCsv}>Excel (CSV)</Button>
                            <Button size="compact-sm" color="grape" leftSection={<IconPlus size={15} />} onClick={nuevaManual}>Nueva cuenta manual</Button>
                        </Group>
                    </Group>
                )}
                <Text fz={11.5} c="#5c6675" mt={4} lh={1.35}>
                    {libro.actualizando ? 'Actualizando… ' : ''}
                    Viendo <b>{libro.totales.documentos}</b> documento(s) de <b>{libro.totales.clientes}</b> cliente(s) · deben <b>{dolares(libro.totales.saldo)}</b>
                    {!tarjetas && ' · Clic en una celda para corregirla (Enter guarda, Esc cancela)'}
                </Text>
            </Box>

            <Box style={{ opacity: libro.actualizando && libro.consulta.isPlaceholderData ? 0.55 : 1, transition: 'opacity .2s' }}>
                {!libro.grupos.length ? (
                    <EstadoVacio
                        icono={IconInbox}
                        titulo={libro.buscando ? 'Nada coincide con la búsqueda' : libro.vista === 'vencidas' ? 'No hay documentos vencidos' : 'No hay cuentas por cobrar'}
                        texto={libro.buscando ? 'Prueba con otra palabra (cliente, número de documento, RIF, vendedor u observación) o borra la búsqueda.' : libro.vista === 'vencidas' ? 'Todo lo pendiente está al día.' : 'Cuando una venta queda a crédito aparece aquí. Para una deuda o préstamo sin venta, crea una cuenta manual.'}
                        accion={libro.buscando
                            ? <Button size="xs" variant="light" onClick={() => libro.setBusqueda('')}>Borrar búsqueda</Button>
                            : <Button size="xs" color="grape" leftSection={<IconPlus size={14} />} onClick={nuevaManual}>Nueva cuenta manual</Button>}
                    />
                ) : tarjetas ? <LibroTarjetas grupos={libro.grupos} acc={acc} buscando={libro.buscando} /> : <LibroTabla grupos={libro.grupos} totales={libro.totales} acc={acc} libro={libro} />}
            </Box>

            <DialogoCuentaManual abierto={dialogo?.tipo === 'manual'} onCerrar={cerrar} onCrear={libro.crearManual} />
            {dialogo?.tipo === 'deuda' && <CambioDeudaModal cuenta={dialogo.cuenta} nuevoSaldo={dialogo.nuevoSaldo} tipoInicial={dialogo.tipoInicial} onCerrar={cerrar} />}
            {dialogo?.tipo === 'monto' && <DialogoCorregirMonto cuenta={dialogo.cuenta} nuevo={dialogo.nuevo} onCerrar={cerrar} onGuardar={libro.editarCuenta} />}
            {dialogo?.tipo === 'editar' && <DialogoEditarCuenta cuenta={dialogo.cuenta} onCerrar={cerrar} onGuardar={libro.editarCuenta} />}
            {dialogo?.tipo === 'abono' && <DialogoEditarAbono cuenta={dialogo.cuenta} abono={dialogo.abono} onCerrar={cerrar} onGuardar={libro.editarAbono} onBorrar={acc.borrarAbono} />}
            <DialogoGrupos abierto={gruposAbierto} onCerrar={() => setGruposAbierto(false)} libro={libro} confirmar={confirmar} />
            {confirmacion}
        </Stack>
    );
}
