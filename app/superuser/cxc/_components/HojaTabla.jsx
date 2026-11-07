'use client';

// Hoja de un vendedor en la computadora: cada cliente es un renglón del acordeón con sus cifras alineadas en columnas
// (se leen como una tabla resumen) y, al abrirlo, sus facturas en una tabla densa donde cada abono va debajo de su factura (└).
// Desde 75em la tabla cabe completa y su encabezado se queda pegado arriba; más angosto se desplaza de lado dentro del cliente.
import React from 'react';
import { ActionIcon, Badge, Box, Checkbox, Group, Stack, Table, Text, Tooltip } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconLinkOff } from '@tabler/icons-react';
import CeldaEditable from './CeldaEditable';
import { Cifra } from './Piezas';
import { CobroFactura, EstadoComision, MenuLinea, cifrasDe } from './PiezasVendedores';
import { esPago, estadoLinea, opcionesPct } from './comisiones';
import { DESPLAZAMIENTO_CABECERA, fmtFecha, useAnchoGrande, useAnchoMuyGrande, usd } from './utilidades';
import classes from './cxc.module.css';

const pctTexto = (v) => (v === null || v === undefined || v === '' ? '' : `${Number(v)}%`);

function FilaLinea({ l, hijo, d, hoja, acc, tasa, cols }) {
    const pago = esPago(l);
    const estado = estadoLinea(l);
    const plegada = hoja.plegadas.has(d.k);
    const seleccionada = hoja.sel.has(l.id);
    const etiqueta = `${pago ? 'abono' : 'factura'} ${l.documentoTexto || ''}`;
    return (
        <Table.Tr className={classes.linea} data-hijo={hijo || undefined} data-estado={estado} data-sel={seleccionada || undefined}>
            <Table.Td ta="center" p={0}>
                {!hijo && d.pagos.length > 0 && (
                    <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => hoja.alternarPlegada(d.k)} aria-expanded={!plegada} aria-label={`${plegada ? 'Mostrar' : 'Esconder'} los ${d.pagos.length} abonos de ${l.documentoTexto || 'la factura'}`}>
                        {plegada ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
                    </ActionIcon>
                )}
                {hijo && <Text span c="#868e96" fz={14} aria-hidden="true">└</Text>}
            </Table.Td>
            <Table.Td ta="center" p={0}><Checkbox size="xs" checked={seleccionada} onChange={(e) => hoja.alternarSel(l.id, e.currentTarget.checked)} aria-label={`Seleccionar ${etiqueta}`} /></Table.Td>
            <Table.Td>
                {hijo ? (
                    <Group gap={5} wrap="nowrap" pl={10} style={{ overflow: 'hidden' }}>
                        <Badge size="xs" variant="light" color={l.concepto === 'NOTA' ? 'orange' : 'blue'} style={{ flexShrink: 0 }}>{l.concepto === 'NOTA' ? 'N/C' : 'Abono'}</Badge>
                        <Text fz={11} c="#5c6675" truncate="end">de {l.documentoTexto}</Text>
                    </Group>
                ) : (
                    <Group gap={5} wrap="nowrap" style={{ overflow: 'hidden' }}>
                        {pago && <Badge size="xs" variant="light" color={l.concepto === 'NOTA' ? 'orange' : 'blue'} style={{ flexShrink: 0 }}>{l.concepto === 'NOTA' ? 'N/C' : 'Abono'}</Badge>}
                        <Box style={{ minWidth: 0, flex: '0 1 auto' }}>
                            <CeldaEditable valor={l.documentoTexto} etiqueta={`Número de ${etiqueta}`} onGuardar={(v) => hoja.editar(l, { documentoTexto: v })} formato={(v) => <Text span fw={800} fz={13}>{v}</Text>} placeholder="Sin número" />
                        </Box>
                        {!l.ventaId && <Tooltip label="No está enlazada con una factura del sistema: el cobro se lleva a mano"><IconLinkOff size={14} color="#b35900" aria-label="Sin enlazar" style={{ flexShrink: 0 }} /></Tooltip>}
                        <CobroFactura l={l} />
                    </Group>
                )}
            </Table.Td>
            <Table.Td><CeldaEditable tipo="fecha" valor={l.fecha} formato={fmtFecha} etiqueta={`Fecha de ${etiqueta}`} onGuardar={(v) => hoja.editar(l, { fecha: v })} /></Table.Td>
            {cols.vence && <Table.Td>{!hijo && <CeldaEditable tipo="fecha" valor={l.vencimiento} formato={fmtFecha} etiqueta={`Vencimiento de ${etiqueta}`} onGuardar={(v) => hoja.editar(l, { vencimiento: v })} />}</Table.Td>}
            <Table.Td>{!pago && <CeldaEditable tipo="numero" valor={l.montoUsd} align="right" formato={usd} negrita etiqueta={`Monto de ${etiqueta}`} onGuardar={(v) => hoja.editar(l, { montoUsd: v })} />}</Table.Td>
            <Table.Td>
                {pago && <CeldaEditable tipo="numero" valor={l.montoUsd === null ? null : Math.abs(Number(l.montoUsd))} align="right" formato={usd} negrita color={l.concepto === 'NOTA' ? '#d9480f' : '#1971c2'} etiqueta={`Monto de ${etiqueta}`} onGuardar={(v) => hoja.editar(l, { montoUsd: v === null ? null : -Math.abs(v) })} />}
            </Table.Td>
            <Table.Td><CeldaEditable tipo="numero" valor={l.baseUsd} align="right" formato={usd} etiqueta={`A comisionar sin IVA de ${etiqueta}`} onGuardar={(v) => hoja.editar(l, { baseUsd: v })} /></Table.Td>
            <Table.Td>
                {!pago && <CeldaEditable tipo="opciones" opciones={opcionesPct(l.porcentaje)} valor={l.porcentaje === null || l.porcentaje === undefined ? '' : String(Number(l.porcentaje))} align="right" negrita formato={pctTexto} etiqueta={`Porcentaje de ${etiqueta}`} onGuardar={(v) => hoja.editar(l, { porcentaje: Number(v) })} />}
            </Table.Td>
            <Table.Td title={estado === 'enabonos' ? 'Comisión posible: la real la generan sus abonos' : l.calculada ? 'Calculada sobre la parte sin IVA del abono' : undefined}>
                <CeldaEditable tipo="numero" valor={l.comisionUsd} align="right" formato={usd} negrita={!hijo && estado !== 'enabonos'} color={estado === 'enabonos' ? '#868e96' : undefined} etiqueta={`Comisión de ${etiqueta}`} onGuardar={(v) => hoja.editar(l, { comisionUsd: v })} />
            </Table.Td>
            {cols.bs && <Table.Td><Text fz={hijo ? 12 : 13} ta="right" px={6} c={estado === 'pagada' || estado === 'enabonos' ? '#868e96' : '#1a1b1e'}>{l.comisionUsd !== null && l.comisionUsd !== undefined ? usd(Number(l.comisionUsd) * tasa) : ''}</Text></Table.Td>}
            <Table.Td px={4}><EstadoComision l={l} onMarcar={hoja.marcarUna} /></Table.Td>
            {cols.estatus && <Table.Td>{!hijo && <CeldaEditable valor={l.estatusCliente} placeholder="Estatus del cliente" etiqueta={`Estatus del cliente de ${etiqueta}`} onGuardar={(v) => hoja.editar(l, { estatusCliente: v })} />}</Table.Td>}
            {cols.obs && <Table.Td><CeldaEditable valor={l.observacion} placeholder={hijo ? '' : 'Observación'} etiqueta={`Observación de ${etiqueta}`} onGuardar={(v) => hoja.editar(l, { observacion: v })} /></Table.Td>}
            <Table.Td ta="center" p={0}><MenuLinea l={l} acc={acc} /></Table.Td>
        </Table.Tr>
    );
}

function TablaCliente({ g, hoja, acc, tasa, cols, grande }) {
    const ids = g.filas.map((l) => l.id);
    const marcadas = ids.filter((id) => hoja.sel.has(id)).length;
    const n = 11 + (cols.vence ? 1 : 0) + (cols.bs ? 1 : 0) + (cols.estatus ? 1 : 0) + (cols.obs ? 1 : 0); // columnas visibles
    const tabla = (
        <Table
            stickyHeader={grande} withColumnBorders withRowBorders verticalSpacing={0} horizontalSpacing={4} className={classes.tabla}
            style={{ '--table-sticky-header-offset': DESPLAZAMIENTO_CABECERA }}
        >
            <Table.Thead>
                <Table.Tr>
                    <Table.Th w={26} p={0} />
                    <Table.Th w={30} p={0} ta="center">
                        <Checkbox size="xs" checked={marcadas > 0 && marcadas === ids.length} indeterminate={marcadas > 0 && marcadas < ids.length} onChange={(e) => hoja.seleccionarVarias(ids, e.currentTarget.checked)} aria-label={`Seleccionar todas las líneas de ${g.nombre}`} />
                    </Table.Th>
                    <Table.Th miw={150}>Factura</Table.Th>
                    <Table.Th w={78}>Fecha</Table.Th>
                    {cols.vence && <Table.Th w={78}>Vence</Table.Th>}
                    <Table.Th w={100} ta="right" title="Factura en dólares, con IVA">Factura USD</Table.Th>
                    <Table.Th w={100} ta="right">Abono / pago</Table.Th>
                    <Table.Th w={100} ta="right" title="Monto a comisionar, sin IVA">Sin IVA</Table.Th>
                    <Table.Th w={60} ta="right">%</Table.Th>
                    <Table.Th w={88} ta="right">Comisión $</Table.Th>
                    {cols.bs && <Table.Th w={116} ta="right" title="Comisión en bolívares a la tasa BCV de hoy">Comisión Bs</Table.Th>}
                    <Table.Th w={138}>Comisión</Table.Th>
                    {cols.estatus && <Table.Th>Estatus cliente</Table.Th>}
                    {cols.obs && <Table.Th>Observación</Table.Th>}
                    <Table.Th w={30} p={0} />
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {g.items.map((d) => (
                    <React.Fragment key={d.k}>
                        {d.padre && <FilaLinea l={d.padre} hijo={false} d={d} hoja={hoja} acc={acc} tasa={tasa} cols={cols} />}
                        {(!d.padre || !hoja.plegadas.has(d.k)) && d.pagos.map((pg) => <FilaLinea key={pg.id} l={pg} hijo={Boolean(d.padre)} d={d} hoja={hoja} acc={acc} tasa={tasa} cols={cols} />)}
                    </React.Fragment>
                ))}
            </Table.Tbody>
            <Table.Tfoot>
                <Table.Tr style={{ background: '#e8edf5' }}>
                    <Table.Td colSpan={cols.vence ? 5 : 4}><Text fw={800} fz={12} pl={6} truncate="end">Total de {g.nombre}</Text></Table.Td>
                    <Table.Td ta="right"><Text fw={800} fz={12} pr={6}>{usd(g.t.facturas)}</Text></Table.Td>
                    <Table.Td ta="right"><Text fw={800} fz={12} pr={6} c="#1971c2">{usd(g.t.abonos)}</Text></Table.Td>
                    <Table.Td ta="right"><Text fw={800} fz={12} pr={6}>{usd(g.t.base)}</Text></Table.Td>
                    <Table.Td />
                    <Table.Td ta="right"><Text fw={800} fz={12} pr={6}>{usd(g.t.comision)}</Text></Table.Td>
                    {cols.bs && <Table.Td ta="right"><Text fw={800} fz={12} pr={6}>{usd(g.t.comision * tasa)}</Text></Table.Td>}
                    <Table.Td><Text fz={11.5} fw={800} px={4} c={g.t.porPagar > 0 ? '#b35900' : 'teal.8'}>{g.t.porPagar > 0 ? `Por pagar $${usd(g.t.porPagar)}` : 'Nada por pagar'}</Text></Table.Td>
                    <Table.Td colSpan={n - (cols.vence ? 5 : 4) - 6 - (cols.bs ? 1 : 0)} />
                </Table.Tr>
            </Table.Tfoot>
        </Table>
    );
    // más angosto que 75em no cabe: se desplaza de lado (sin encabezado pegajoso, que no funciona dentro de un desplazamiento)
    return grande ? tabla : <Box className={classes.desborde} style={{ '--min-tabla': '1040px' }}>{tabla}</Box>;
}

export default function HojaTabla({ hoja, acc }) {
    const grande = useAnchoGrande();
    const muyGrande = useAnchoMuyGrande();
    const tasa = hoja.tasa;
    const cols = { vence: Boolean(muyGrande), bs: Boolean(tasa), estatus: Boolean(grande), obs: Boolean(muyGrande) };
    return (
        <Stack gap={6}>
            {hoja.grupos.map((g) => {
                const abierto = hoja.abiertos.has(g.k);
                const idPanel = `cxc-cliente-${g.k.replace(/[^a-zA-Z0-9]/g, '-')}`;
                return (
                    <section key={g.k} className={classes.grupo} data-abierto={abierto || undefined}>
                        <Box component="button" type="button" className={classes.grupoCabecera} onClick={() => hoja.alternarGrupo(g.k)} aria-expanded={abierto} aria-controls={idPanel}>
                            <IconChevronRight size={18} style={{ transform: abierto ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} aria-hidden="true" />
                            <Box style={{ minWidth: 0 }}>
                                <Text component="div" fw={800} fz={13.5} truncate="end" title={g.nombre}>{g.nombre}</Text>
                                <Text component="div" fz={11} c="#5c6675">{g.facturas} factura(s) · {g.filas.length} línea(s)</Text>
                            </Box>
                            {cifrasDe(g.t, g.deuda, tasa).map((c) => <Cifra key={c.clave} titulo={c.titulo} valor={c.valor} color={c.color} tasa={c.tasa} ayuda={c.ayuda} />)}
                        </Box>
                        {abierto && <Box id={idPanel}><TablaCliente g={g} hoja={hoja} acc={acc} tasa={tasa} cols={cols} grande={Boolean(grande)} /></Box>}
                    </section>
                );
            })}
            <Box className={classes.totalGeneral} aria-label="Total general">
                <span />
                <Box style={{ minWidth: 0 }}>
                    <Text component="div" fw={900} fz={13.5}>TOTAL GENERAL</Text>
                    <Text component="div" fz={11} c="#5c6675">{hoja.grupos.length} cliente(s) · {hoja.lineas.length} línea(s)</Text>
                </Box>
                {cifrasDe(hoja.totalVisible, hoja.deudaVisible, tasa).map((c) => <Cifra key={c.clave} titulo={c.titulo} valor={c.valor} color={c.color} tasa={c.tasa} ayuda={c.ayuda} />)}
            </Box>
        </Stack>
    );
}
