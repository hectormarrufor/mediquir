'use client';

// La hoja de cada vendedor a comisión, como la lleva la administradora: sus facturas con el monto a comisionar sin IVA, el %, la comisión,
// cómo va el cobro del cliente y si la comisión ya se pagó. En la computadora se edita en la celda (HojaTabla); en el teléfono,
// con tarjetas y hojas desde abajo (HojaTarjetas). Datos, filtros y acciones viven en useHojaVendedor; las reglas, en comisiones.js.
import React, { useState } from 'react';
import { ActionIcon, Affix, Alert, Box, Button, CloseButton, Group, Menu, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Tooltip, Transition } from '@mantine/core';
import {
    IconAlertTriangle, IconArrowBackUp, IconBuildingBank, IconChecks, IconCircleCheck, IconCoin, IconDotsVertical, IconFold, IconHourglass,
    IconInbox, IconPercentage, IconPlus, IconSearch, IconSelectAll, IconUserPlus, IconUsers, IconX,
} from '@tabler/icons-react';
import HojaTabla from './HojaTabla';
import HojaTarjetas from './HojaTarjetas';
import { DialogoAgregarLinea, DialogoEditarLinea, DialogoNuevoVendedor, LeyendaColores } from './PiezasVendedores';
import { EstadoVacio, Esqueleto, Kpi, useConfirmar } from './Piezas';
import { FILTROS, agruparFacturas, claveDoc, opcionesPct } from './comisiones';
import { useHojaVendedor } from './useHojaVendedor';
import { bolivares, dolares, useAltoElemento, usd, useVistaTarjetas } from './utilidades';
import classes from './cxc.module.css';

const SEGMENTOS = { root: classes.segRaiz, label: classes.segEtiqueta };

export default function HojasVendedores() {
    const hoja = useHojaVendedor();
    const tarjetas = useVistaTarjetas();
    const [refBarra, altoBarra] = useAltoElemento();
    const [dialogo, setDialogo] = useState(null); // { tipo: 'editar' | 'agregar' | 'vendedor', linea?, inicial? }
    const { confirmar, dialogo: confirmacion } = useConfirmar();
    const cerrar = () => setDialogo(null);
    const { actual, tasa } = hoja;

    const acc = {
        editarLinea: (l) => setDialogo({ tipo: 'editar', linea: l }),
        // el abono se arma con los datos de su factura (número, cliente y su %): solo falta escribir el monto
        agregarAbono: (factura) => {
            const inicial = { concepto: 'ABONO', documento: factura.documentoTexto || '', cliente: factura.clienteTexto || factura.clienteNombre || '' };
            if (factura.porcentaje !== null && factura.porcentaje !== undefined) inicial.porcentaje = String(Number(factura.porcentaje));
            setDialogo({ tipo: 'agregar', inicial });
        },
        borrarLinea: async (l) => {
            const ok = await confirmar({ titulo: 'Borrar de la hoja', textoConfirmar: 'Sí, borrar', mensaje: `Se borra ${l.concepto === 'ABONO' ? 'el abono' : 'la línea'} ${l.documentoTexto || ''} de la hoja de ${actual?.nombre}. No toca la factura ni el cobro del cliente.` });
            if (ok) await hoja.borrar(l);
            return ok;
        },
    };

    // Pagar comisiones: siempre con confirmación y el total en dólares y bolívares a la vista
    const marcarSeleccion = async (estatus) => {
        const s = hoja.seleccion;
        const ok = await confirmar({
            titulo: estatus === 'PAGADA' ? 'Marcar comisiones pagadas' : 'Volver a pendientes',
            color: estatus === 'PAGADA' ? 'teal' : 'orange',
            textoConfirmar: estatus === 'PAGADA' ? `Sí, marcar ${s.cantidad} pagada(s)` : `Sí, volver ${s.cantidad} a pendiente`,
            mensaje: (
                <Stack gap={6}>
                    <Text size="sm">{estatus === 'PAGADA' ? `Se marcan ${s.cantidad} comisión(es) de ${actual?.nombre} como pagadas con la fecha de hoy. Quedarán en gris.` : `Se marcan ${s.cantidad} comisión(es) como pendientes (se borra su fecha de pago).`}</Text>
                    <Group gap="lg" p="xs" style={{ background: '#f4f7fc', borderRadius: 8 }}>
                        <Box><Text fz={11} c="#5c6675" fw={700} tt="uppercase">Total</Text><Text fw={800} fz={18}>{dolares(s.comision)}</Text></Box>
                        {tasa && <Box><Text fz={11} c="#5c6675" fw={700} tt="uppercase">En bolívares (BCV {usd(tasa)})</Text><Text fw={800} fz={18}>{bolivares(s.comision * tasa)}</Text></Box>}
                    </Group>
                </Stack>
            ),
        });
        if (ok) await hoja.marcar(hoja.sel, estatus);
    };

    if (hoja.error) return <Alert color="red" icon={<IconAlertTriangle size={18} />} title="No se pudieron cargar las comisiones">{hoja.error.message}</Alert>;
    if (hoja.cargando || tarjetas === undefined) return <Esqueleto indicadores={6} />;

    const tv = hoja.totalVendedor;
    const idsPorPagar = new Set(hoja.porPagarVisibles);
    const facturasConPorPagar = new Set(hoja.lineas.filter((l) => idsPorPagar.has(l.id)).map(claveDoc)).size;
    const hayVendedores = hoja.vendedores.length > 0;

    // ---------- Encabezado: vendedor elegido, su % por defecto y alta de vendedores ----------
    const selectorVendedor = !tarjetas && hoja.vendedores.length <= 6 ? (
        <SegmentedControl color="navy.9" classNames={SEGMENTOS} value={String(actual?.id ?? '')} onChange={(v) => hoja.elegir(Number(v))} data={hoja.vendedores.map((v) => ({ value: String(v.id), label: v.nombre }))} aria-label="Vendedor" />
    ) : (
        <Select
            w={tarjetas ? '100%' : 280} size={tarjetas ? 'md' : 'sm'} aria-label="Vendedor" leftSection={<IconUsers size={16} />} allowDeselect={false} searchable
            data={hoja.vendedores.map((v) => ({ value: String(v.id), label: v.nombre }))} value={String(actual?.id ?? '')} onChange={(v) => v && hoja.elegir(Number(v))}
            styles={{ input: { fontWeight: 800 } }} comboboxProps={{ withinPortal: true }}
        />
    );
    const encabezado = (
        <Box className={classes.superficie} p={8}>
            <Group gap={8} wrap="wrap" justify="space-between">
                {hayVendedores ? selectorVendedor : <Text fw={700} size="sm">Todavía no hay vendedores a comisión.</Text>}
                <Group gap={8} wrap="nowrap" style={tarjetas ? { width: '100%' } : undefined}>
                    {actual && (
                        <Tooltip label="Se propone al agregar sus facturas; cada factura puede tener el suyo">
                            <Select
                                size={tarjetas ? 'sm' : 'xs'} w={tarjetas ? undefined : 150} flex={tarjetas ? 1 : undefined} aria-label="% de comisión por defecto"
                                leftSection={<IconPercentage size={14} />} data={opcionesPct(actual.porcentaje).map((o) => ({ ...o, label: `${o.label} por defecto` }))}
                                value={String(Number(actual.porcentaje))} onChange={(v) => v && hoja.cambiarPctVendedor(Number(v)).catch(() => {})} allowDeselect={false} comboboxProps={{ withinPortal: true }}
                            />
                        </Tooltip>
                    )}
                    <Button size={tarjetas ? 'sm' : 'compact-sm'} variant="light" leftSection={<IconUserPlus size={16} />} onClick={() => setDialogo({ tipo: 'vendedor' })}>Nuevo vendedor</Button>
                </Group>
            </Group>
        </Box>
    );

    if (!actual) {
        return (
            <Stack gap={8}>
                {encabezado}
                <EstadoVacio icono={IconUserPlus} titulo="Crea el primer vendedor a comisión" texto="Cada vendedor tiene su hoja: sus facturas, los abonos de sus clientes y las comisiones que se le deben." accion={<Button size="sm" leftSection={<IconUserPlus size={16} />} onClick={() => setDialogo({ tipo: 'vendedor' })}>Nuevo vendedor</Button>} />
                <DialogoNuevoVendedor abierto={dialogo?.tipo === 'vendedor'} onCerrar={cerrar} onCrear={hoja.crearVendedor} />
            </Stack>
        );
    }

    // ---------- Barra pegajosa: filtro, búsqueda, atajos y la selección ----------
    const filtros = (
        <SegmentedControl
            size="xs" color="navy.9" classNames={SEGMENTOS} fullWidth={tarjetas} value={hoja.filtro} onChange={hoja.setFiltro} aria-label="Qué líneas ver"
            data={FILTROS.map((f) => ({
                value: f.value,
                // en el teléfono el número va debajo: cuatro opciones caben a 360 px y el botón queda más alto (más fácil de tocar)
                label: tarjetas
                    ? <Box lh={1.15} py={2}><Text component="span" display="block" fz={12} fw="inherit" c="inherit">{f.label}</Text><Text component="span" display="block" fz={11} fw="inherit" c="inherit" opacity={0.85}>{hoja.conteos[f.value] ?? 0}</Text></Box>
                    : `${f.largo} · ${hoja.conteos[f.value] ?? 0}`,
            }))}
        />
    );
    const buscador = (
        <TextInput
            size={tarjetas ? 'sm' : 'xs'} flex="1 1 220px" miw={0} aria-label="Buscar en la hoja" placeholder="Buscar cliente, factura u observación…" leftSection={<IconSearch size={15} />}
            value={hoja.busqueda} onChange={(e) => hoja.setBusqueda(e.currentTarget.value)}
            rightSection={hoja.busqueda ? <CloseButton size="sm" aria-label="Borrar búsqueda" onClick={() => hoja.setBusqueda('')} /> : null}
        />
    );
    const seleccionarPorPagar = () => hoja.seleccionarVarias(hoja.porPagarVisibles, true);
    const agregarLinea = () => setDialogo({ tipo: 'agregar', inicial: null });
    const resumenSeleccion = (
        <Text fz={13} fw={700} c="#4d3800">
            {hoja.seleccion.cantidad} seleccionada(s) · {dolares(hoja.seleccion.comision)}{tasa ? ` · ${bolivares(hoja.seleccion.comision * tasa)}` : ''}
        </Text>
    );

    return (
        <Stack gap={8} style={{ '--cxc-barra': `${altoBarra + 6}px`, paddingBottom: tarjetas && hoja.seleccion.cantidad ? 96 : undefined }}>
            {encabezado}

            <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing={8}>
                <Box style={{ gridColumn: tarjetas ? 'span 2' : undefined }}>
                    <Kpi
                        titulo="Comisión por pagar" valor={dolares(tv.porPagar)} color={tv.porPagar > 0 ? '#8a4b00' : 'teal.8'} destacado="#e0b400" icono={IconCoin} colorIcono="yellow"
                        detalle={tasa ? `${bolivares(tv.porPagar * tasa)} · el cliente ya pagó` : 'El cliente ya pagó'}
                        onClick={() => hoja.setFiltro('porpagar')} activo={hoja.filtro === 'porpagar'} ayuda="Toca para ver solo las comisiones por pagar (amarillas)"
                    />
                </Box>
                <Kpi titulo="Por generar (sin cobrar)" valor={dolares(tv.futura)} color="#5c6675" icono={IconHourglass} colorIcono="gray" detalle={tasa ? bolivares(tv.futura * tasa) : 'Facturas que el cliente aún no paga'} ayuda="Lo que dejarán las facturas que el cliente todavía no paga" />
                <Kpi titulo="Comisión pagada" valor={dolares(actual.resumen.comisionPagada)} color="teal.8" icono={IconCircleCheck} colorIcono="teal" detalle={tasa ? bolivares(actual.resumen.comisionPagada * tasa) : undefined} onClick={() => hoja.setFiltro('pagadas')} activo={hoja.filtro === 'pagadas'} ayuda="Toca para ver las pagadas" />
                <Kpi
                    titulo="Los clientes deben" valor={hoja.hayEnlazadas ? dolares(hoja.deudaTotal) : '—'} color={hoja.deudaTotal > 0 ? 'red.8' : 'teal.8'} icono={IconAlertTriangle} colorIcono="red"
                    detalle={hoja.hayEnlazadas ? 'De las facturas enlazadas de esta hoja' : 'Ninguna factura enlazada con el sistema'}
                />
                <Kpi titulo="A comisionar sin IVA" valor={dolares(tv.base)} icono={IconChecks} colorIcono="blue" detalle={`Facturas con IVA ${dolares(tv.facturas)}`} />
                <Kpi titulo="Tasa BCV de hoy" valor={tasa ? `Bs ${usd(tasa)}` : 'Sin tasa'} color={tasa ? 'navy.9' : 'orange.9'} icono={IconBuildingBank} colorIcono="indigo" detalle={tasa ? 'Las comisiones en Bs se calculan con ella' : 'Las comisiones se ven solo en $'} />
            </SimpleGrid>

            <Box className={classes.superficie} px={10} py={6}><LeyendaColores compacta={tarjetas} /></Box>

            <Box ref={refBarra} className={`${classes.barra} ${classes.noImprimir}`}>
                {tarjetas ? (
                    <Stack gap={6}>
                        <Group gap={6} wrap="nowrap">
                            {buscador}
                            <ActionIcon size={36} radius="md" onClick={agregarLinea} aria-label="Agregar una línea"><IconPlus size={20} /></ActionIcon>
                            <Menu position="bottom-end" withinPortal shadow="md" width={260}>
                                <Menu.Target><ActionIcon size={36} radius="md" variant="default" aria-label="Más opciones de la hoja"><IconDotsVertical size={20} /></ActionIcon></Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Item leftSection={<IconSelectAll size={16} />} disabled={!hoja.porPagarVisibles.length} onClick={seleccionarPorPagar}>Seleccionar las por pagar ({hoja.porPagarVisibles.length})</Menu.Item>
                                    <Menu.Item leftSection={<IconPlus size={16} />} onClick={agregarLinea}>Agregar factura o abono</Menu.Item>
                                    <Menu.Divider />
                                    <Menu.Item leftSection={<IconFold size={16} />} onClick={hoja.expandirTodo}>Desplegar todos los clientes</Menu.Item>
                                    <Menu.Item leftSection={<IconFold size={16} />} onClick={hoja.contraerTodo}>Plegar todos los clientes</Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        </Group>
                        {filtros}
                    </Stack>
                ) : (
                    <Group gap={8} wrap="wrap">
                        {filtros}
                        {buscador}
                        <Group gap={6} ml="auto" wrap="nowrap">
                            <Tooltip label={`Marca las ${hoja.porPagarVisibles.length} comisiones por pagar que se ven`}>
                                <Button size="compact-sm" variant="default" leftSection={<IconSelectAll size={15} />} disabled={!hoja.porPagarVisibles.length} onClick={seleccionarPorPagar}>Seleccionar por pagar</Button>
                            </Tooltip>
                            <Button size="compact-sm" variant="default" onClick={hoja.expandirTodo}>Desplegar todo</Button>
                            <Button size="compact-sm" variant="default" onClick={hoja.contraerTodo}>Plegar todo</Button>
                            <Button size="compact-sm" leftSection={<IconPlus size={15} />} onClick={agregarLinea}>Agregar línea</Button>
                        </Group>
                    </Group>
                )}
                <Text fz={11.5} c="#5c6675" mt={4} lh={1.35}>
                    {hoja.grupos.length} cliente(s) · {hoja.lineas.length} línea(s){hoja.filtro === 'porpagar' && facturasConPorPagar ? ` · ${facturasConPorPagar} factura(s) con comisión por pagar` : ''}
                    {!tarjetas && ' · Clic en una celda para corregirla (Enter guarda, Esc cancela) · el estado de la comisión se cambia tocándolo'}
                </Text>
                {!tarjetas && hoja.seleccion.cantidad > 0 && (
                    <Group className={classes.franjaSeleccion} justify="space-between" gap={8} wrap="wrap">
                        {resumenSeleccion}
                        <Group gap={6} wrap="nowrap">
                            <Button size="compact-sm" color="teal" leftSection={<IconCircleCheck size={15} />} onClick={() => marcarSeleccion('PAGADA')}>Marcar pagadas</Button>
                            <Button size="compact-sm" variant="default" leftSection={<IconArrowBackUp size={15} />} onClick={() => marcarSeleccion('PENDIENTE')}>Marcar pendientes</Button>
                            <Button size="compact-sm" variant="subtle" color="gray" leftSection={<IconX size={15} />} onClick={hoja.limpiarSeleccion}>Quitar selección</Button>
                        </Group>
                    </Group>
                )}
            </Box>

            {!hoja.grupos.length ? (
                <EstadoVacio
                    icono={IconInbox}
                    titulo={hoja.buscando ? 'Nada coincide con la búsqueda' : hoja.filtro === 'porpagar' ? `${actual.nombre} no tiene comisiones por pagar` : 'No hay líneas con este filtro'}
                    texto={hoja.buscando ? 'Prueba con otra palabra o borra la búsqueda.' : hoja.filtro === 'porpagar' ? 'Cuando un cliente pague una factura o haga un abono, su comisión aparece aquí en amarillo.' : 'Cambia el filtro de arriba o agrega una factura a la hoja.'}
                    accion={hoja.buscando
                        ? <Button size="xs" variant="light" onClick={() => hoja.setBusqueda('')}>Borrar búsqueda</Button>
                        : <Group gap="xs" justify="center"><Button size="xs" variant="light" onClick={() => hoja.setFiltro('todas')}>Ver todas</Button><Button size="xs" leftSection={<IconPlus size={14} />} onClick={agregarLinea}>Agregar línea</Button></Group>}
                />
            ) : tarjetas ? <HojaTarjetas hoja={hoja} acc={acc} /> : <HojaTabla hoja={hoja} acc={acc} />}

            {/* Teléfono: la selección vive en una barra fija abajo, al alcance del pulgar */}
            {tarjetas && (
                <Affix position={{ bottom: 0, left: 0, right: 0 }} zIndex={150}>
                    <Transition mounted={hoja.seleccion.cantidad > 0} transition="slide-up" duration={180}>
                        {(estilos) => (
                            <Box className={classes.barraInferior} style={estilos}>
                                <Group justify="space-between" wrap="nowrap" gap={8}>
                                    <Box style={{ minWidth: 0 }}>{resumenSeleccion}</Box>
                                    <Group gap={6} wrap="nowrap">
                                        <Button size="sm" color="teal" leftSection={<IconCircleCheck size={16} />} onClick={() => marcarSeleccion('PAGADA')}>Pagadas</Button>
                                        <Menu position="top-end" withinPortal shadow="md">
                                            <Menu.Target><ActionIcon size={36} variant="default" radius="md" aria-label="Más acciones con la selección"><IconDotsVertical size={20} /></ActionIcon></Menu.Target>
                                            <Menu.Dropdown>
                                                <Menu.Item leftSection={<IconArrowBackUp size={16} />} onClick={() => marcarSeleccion('PENDIENTE')}>Marcar pendientes</Menu.Item>
                                                <Menu.Item leftSection={<IconSelectAll size={16} />} onClick={seleccionarPorPagar}>Agregar todas las por pagar</Menu.Item>
                                                <Menu.Item leftSection={<IconX size={16} />} onClick={hoja.limpiarSeleccion}>Quitar selección</Menu.Item>
                                            </Menu.Dropdown>
                                        </Menu>
                                    </Group>
                                </Group>
                            </Box>
                        )}
                    </Transition>
                </Affix>
            )}

            {dialogo?.tipo === 'editar' && (
                <DialogoEditarLinea
                    linea={dialogo.linea} tasa={tasa} /* la línea tal como estaba al abrir: una actualización en segundo plano no debe borrar lo que se está escribiendo */
                    hijos={agruparFacturas(hoja.lineasActual).find((d) => d.padre?.id === dialogo.linea.id)?.pagos.filter((p) => p.concepto !== 'NOTA').length || 0}
                    onCerrar={cerrar} onGuardar={hoja.editar} onBorrar={acc.borrarLinea}
                />
            )}
            <DialogoAgregarLinea abierto={dialogo?.tipo === 'agregar'} inicial={dialogo?.inicial} vendedor={actual} facturas={hoja.facturas} clientes={hoja.clientes} onCerrar={cerrar} onAgregar={hoja.agregar} />
            <DialogoNuevoVendedor abierto={dialogo?.tipo === 'vendedor'} onCerrar={cerrar} onCrear={hoja.crearVendedor} />
            {confirmacion}
        </Stack>
    );
}
