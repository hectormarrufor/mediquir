'use client';

// Libro de cobranza en la computadora: una tabla densa como el Excel, con el encabezado y los totales siempre a la vista.
// Cada celda con fondo al pasar el mouse se edita ahí mismo; el saldo y el monto abren su registro (abono/ajuste o corrección con motivo).
import React from 'react';
import { ActionIcon, Badge, Box, Button, Group, Table, Text, Tooltip } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconCoin, IconTrash } from '@tabler/icons-react';
import CeldaEditable from './CeldaEditable';
import { EstadoDocumento, MenuDocumento } from './PiezasLibro';
import { DESPLAZAMIENTO_CABECERA, fmtFecha, useAnchoGrande, usd } from './utilidades';
import classes from './cxc.module.css';

// Fecha de vencimiento con los días de atraso a la vista
function formatoVence(f) {
    return (v) => (
        <>
            {fmtFecha(v)}
            {f.vencida && <Text span fz={10.5} fw={800} c="red.8" ml={6}>+{-f.dias} d</Text>}
            {!f.pagada && !f.vencida && f.dias !== null && f.dias <= 7 && <Text span fz={10.5} fw={700} c="orange.9" ml={6}>{f.dias === 0 ? 'hoy' : `en ${f.dias} d`}</Text>}
        </>
    );
}

function Abonos({ f, acc }) {
    if (!f.abonos.length) {
        return (
            <Group gap="sm" py={6} pl={4}>
                <Text size="xs" c="#5c6675">Sin abonos registrados.</Text>
                {!f.pagada && <Button size="compact-xs" variant="light" color="teal" leftSection={<IconCoin size={12} />} onClick={() => acc.abonar(f)}>Registrar el primero</Button>}
            </Group>
        );
    }
    return (
        <Table withRowBorders verticalSpacing={0} horizontalSpacing={6} fz="xs" my={4} style={{ color: '#1a1b1e', background: '#fff' }}>
            <Table.Thead><Table.Tr><Table.Th w={110}>Fecha</Table.Th><Table.Th w={110} ta="right">Monto</Table.Th><Table.Th w={170}>Método</Table.Th><Table.Th>Referencia</Table.Th><Table.Th>Notas</Table.Th><Table.Th w={40} /></Table.Tr></Table.Thead>
            <Table.Tbody>
                {f.abonos.map((a) => (
                    <Table.Tr key={a.id}>
                        <Table.Td><CeldaEditable tipo="fecha" valor={a.fecha} formato={fmtFecha} etiqueta={`Fecha del abono de ${f.documento}`} onGuardar={(v) => acc.guardarAbono(f, a, { fecha: v })} /></Table.Td>
                        <Table.Td><CeldaEditable tipo="numero" valor={a.monto} align="right" formato={usd} etiqueta={`Monto del abono de ${f.documento}`} onGuardar={(v) => acc.guardarAbono(f, a, { monto: v })} color={a.monto < 0 ? '#d9480f' : '#1971c2'} negrita /></Table.Td>
                        <Table.Td><CeldaEditable valor={a.metodo} etiqueta="Método" onGuardar={(v) => acc.guardarAbono(f, a, { metodo: v })} /></Table.Td>
                        <Table.Td><CeldaEditable valor={a.referencia} placeholder="Referencia" etiqueta="Referencia" onGuardar={(v) => acc.guardarAbono(f, a, { referencia: v })} /></Table.Td>
                        <Table.Td><CeldaEditable valor={a.notas} placeholder="Notas" etiqueta="Notas" onGuardar={(v) => acc.guardarAbono(f, a, { notas: v })} /></Table.Td>
                        <Table.Td ta="center"><Tooltip label="Borrar este abono"><ActionIcon variant="subtle" color="red" size="sm" onClick={() => acc.borrarAbono(f, a)} aria-label={`Borrar el abono de ${usd(a.monto)}`}><IconTrash size={14} /></ActionIcon></Tooltip></Table.Td>
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    );
}

// Como la hoja de los vendedores: cada cliente es un renglón que se despliega con sus facturas, y cada factura trae sus abonos debajo (se pueden esconder con su flecha).
export default function LibroTabla({ grupos, totales, acc, libro }) {
    const grande = useAnchoGrande(); // la columna del vendedor solo cuando cabe sin apretar las demás
    const { abierto, alternarCliente, desplegarTodo, plegarTodo, plegadas, alternarPlegada } = libro;
    const columnas = grande ? 14 : 13;
    // Retención de IVA, siempre en las facturas: la que hizo el cliente (morado, negrita) o la calculada, 75 % del IVA (gris, cursiva),
    // para confirmar si pagó reteniendo o no. La factura con y sin ella, en dólares y en bolívares.
    const conRet = (v) => (v === null || v === undefined ? <Text span c="dimmed">—</Text> : usd(v));
    const estiloRet = (f) => (f.retReal ? { c: 'grape.8', fw: 700 } : { c: 'dimmed', fs: 'italic' });
    const todosAbiertos = grupos.length > 0 && grupos.every((g) => abierto(g.id));
    const abonosVisibles = (f) => f.abonos.length > 0 && !plegadas.has(f.id);

    return (
        <Table
            stickyHeader withColumnBorders withRowBorders verticalSpacing={0} horizontalSpacing={6} className={classes.tabla}
            style={{ '--table-sticky-header-offset': DESPLAZAMIENTO_CABECERA, borderRadius: 10 }}
        >
            <Table.Thead>
                <Table.Tr>
                    <Table.Th w={34} p={0} ta="center">
                        <Tooltip label={todosAbiertos ? 'Plegar todos los clientes' : 'Desplegar todos los clientes'}>
                            <ActionIcon variant="subtle" color="gray" size="sm" aria-label={todosAbiertos ? 'Plegar todos los clientes' : 'Desplegar todos los clientes'} onClick={todosAbiertos ? plegarTodo : desplegarTodo}>
                                {todosAbiertos ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                            </ActionIcon>
                        </Tooltip>
                    </Table.Th>
                    <Table.Th>Documento</Table.Th>
                    <Table.Th w={80}>Emisión</Table.Th>
                    <Table.Th w={122}>Vence</Table.Th>
                    <Table.Th w={106} ta="right">Monto USD</Table.Th>
                    <Table.Th w={92} ta="right"><Tooltip label="IVA que retuvo el cliente (lo paga al SENIAT), en dólares"><span>Retención</span></Tooltip></Table.Th>
                    <Table.Th w={104} ta="right"><Tooltip label="Monto de la factura con la retención aplicada (lo que paga en dinero)"><span>Monto − ret.</span></Tooltip></Table.Th>
                    <Table.Th w={118} ta="right">Total Bs</Table.Th>
                    <Table.Th w={118} ta="right"><Tooltip label="Total en bolívares con la retención aplicada"><span>Bs − ret.</span></Tooltip></Table.Th>
                    <Table.Th w={100} ta="right">Abonado</Table.Th>
                    <Table.Th w={112} ta="right">Saldo</Table.Th>
                    {grande && <Table.Th w={130}>Vendedor</Table.Th>}
                    <Table.Th>Observación</Table.Th>
                    <Table.Th w={118} ta="right">Acciones</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {grupos.map((g) => (
                    <React.Fragment key={g.id}>
                        <Table.Tr className={classes.filaCliente} style={{ cursor: 'pointer' }} onClick={() => alternarCliente(g.id)} aria-expanded={abierto(g.id)}>
                            <Table.Td colSpan={4}>
                                <Group gap={8} wrap="nowrap" pl={4} style={{ overflow: 'hidden' }}>
                                    {abierto(g.id) ? <IconChevronDown size={16} aria-hidden="true" style={{ flexShrink: 0 }} /> : <IconChevronRight size={16} aria-hidden="true" style={{ flexShrink: 0 }} />}
                                    <Text fw={800} size="sm" truncate="end">{g.nombre}</Text>
                                    {g.rif && <Text fz={11} c="#5c6675" style={{ whiteSpace: 'nowrap' }}>{g.rif}</Text>}
                                    <Text fz={11} c="#5c6675" style={{ whiteSpace: 'nowrap' }}>· {g.filas.length} factura{g.filas.length === 1 ? '' : 's'} · {g.filas.reduce((t, f) => t + f.abonos.length, 0)} abono(s)</Text>
                                    {g.vencido > 0 && <span className={classes.estado} data-estado="vencida" title={`${g.vencidas} documento(s) vencido(s); el más atrasado, ${g.atrasoMax} días`}>Vencido ${usd(g.vencido)}</span>}
                                </Group>
                            </Table.Td>
                            <Table.Td ta="right"><Text fz={12} fw={700} pr={6}>{usd(g.monto)}</Text></Table.Td>
                            <Table.Td ta="right"><Text fz={12} fw={700} pr={6} c="grape.8">{g.retUsd > 0 ? usd(g.retUsd) : ''}</Text></Table.Td>
                            <Table.Td colSpan={3} />
                            <Table.Td ta="right"><Text fz={12} fw={700} pr={6} c="#1971c2">{usd(g.abonado)}</Text></Table.Td>
                            <Table.Td ta="right"><Text size="sm" fw={800} pr={6} c={g.vencido > 0 ? 'red.8' : 'navy.9'}>{usd(g.saldo)}</Text></Table.Td>
                            <Table.Td colSpan={columnas - 11} />
                        </Table.Tr>
                        {abierto(g.id) && g.filas.map((f) => (
                            <React.Fragment key={f.id}>
                                <Table.Tr className={classes.filaDoc} data-estado={f.estadoFila}>
                                    <Table.Td ta="center" p={0}>
                                        <ActionIcon variant="subtle" size="sm" color={f.abonos.length ? 'blue' : 'gray'} disabled={!f.abonos.length} onClick={() => alternarPlegada(f.id)} aria-expanded={abonosVisibles(f)} aria-label={`${abonosVisibles(f) ? 'Esconder' : 'Ver'} los abonos de ${f.documento} (${f.abonos.length})`}>
                                            {abonosVisibles(f) ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                                        </ActionIcon>
                                    </Table.Td>
                                    <Table.Td>
                                        <Group gap={6} wrap="nowrap" px={4} style={{ overflow: 'hidden' }}>
                                            {f.manual && <Badge size="xs" color="grape" variant="light" style={{ flexShrink: 0 }}>Manual</Badge>}
                                            <Text size="sm" fw={700} truncate="end">{f.documento}</Text>
                                            {f.abonos.length > 0 && <Text fz={10.5} c="#5c6675" style={{ whiteSpace: 'nowrap' }}>{f.abonos.length} ab.</Text>}
                                            <EstadoDocumento f={f} corto />
                                        </Group>
                                    </Table.Td>
                                    <Table.Td><Text fz={12} px={6}>{fmtFecha(f.emision)}</Text></Table.Td>
                                    <Table.Td><CeldaEditable tipo="fecha" valor={f.vence} formato={formatoVence(f)} etiqueta={`Vencimiento de ${f.documento}`} onGuardar={(v) => acc.guardar(f, { fechaVencimiento: v })} color={f.vencida ? '#c92a2a' : undefined} /></Table.Td>
                                    <Table.Td><CeldaEditable tipo="numero" valor={f.monto} align="right" formato={usd} etiqueta={`Monto de ${f.documento}`} onGuardar={(v) => { acc.corregirMonto(f, v); return Promise.resolve(); }} /></Table.Td>
                                    <Table.Td>
                                        <Tooltip label={f.retReal ? 'El cliente retuvo (declarada en el abono o con comprobante)' : 'Calculada: 75 % del IVA. El cliente no ha declarado retención'} disabled={f.retUsd === null || f.retUsd === undefined}>
                                            <Text fz={12.5} ta="right" px={6} {...estiloRet(f)}>{conRet(f.retUsd)}</Text>
                                        </Tooltip>
                                    </Table.Td>
                                    <Table.Td><Text fz={12.5} ta="right" px={6} {...estiloRet(f)} c={f.retReal ? undefined : 'dimmed'}>{conRet(f.montoMenosRet)}</Text></Table.Td>
                                    <Table.Td><Text fz={12.5} ta="right" px={6}>{f.totalBs !== null && f.totalBs !== undefined ? usd(f.totalBs) : ''}</Text></Table.Td>
                                    <Table.Td><Text fz={12.5} ta="right" px={6} c={f.retReal ? undefined : 'dimmed'} fs={f.retReal ? undefined : 'italic'}>{conRet(f.totalBsMenosRet)}</Text></Table.Td>
                                    <Table.Td><Text size="sm" ta="right" px={6} c="#1971c2">{usd(f.abonado)}</Text></Table.Td>
                                    <Table.Td><CeldaEditable tipo="numero" valor={f.saldo} align="right" formato={usd} negrita color={f.vencida ? '#c92a2a' : undefined} etiqueta={`Saldo de ${f.documento}`} onGuardar={(v) => { acc.abonar(f, v); return Promise.resolve(); }} /></Table.Td>
                                    {grande && <Table.Td><Text fz={12} px={6} truncate="end">{f.vendedor || ''}</Text></Table.Td>}
                                    <Table.Td><CeldaEditable valor={f.observacion} placeholder="Observación" etiqueta={`Observación de ${f.documento}`} onGuardar={(v) => acc.guardar(f, { observacion: v })} /></Table.Td>
                                    <Table.Td>
                                        <Group gap={2} wrap="nowrap" justify="flex-end">
                                            {!f.pagada && <Button size="compact-xs" variant="light" color="teal" leftSection={<IconCoin size={13} />} onClick={() => acc.abonar(f)} aria-label={`Registrar abono de ${f.documento}`}>Abonar</Button>}
                                            <MenuDocumento f={f} acc={acc} abonosVisibles={abonosVisibles(f)} onVerAbonos={() => alternarPlegada(f.id)} />
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                                {abonosVisibles(f) && (
                                    <Table.Tr className={classes.filaAbonos}>
                                        <Table.Td />
                                        <Table.Td colSpan={columnas - 1} style={{ height: 'auto' }}><Box pr={6}><Abonos f={f} acc={acc} /></Box></Table.Td>
                                    </Table.Tr>
                                )}
                            </React.Fragment>
                        ))}
                    </React.Fragment>
                ))}
            </Table.Tbody>
            <Table.Tfoot className={classes.pie}>
                <Table.Tr>
                    <Table.Td colSpan={4}><Text fw={800} fz={12} pl={4}>TOTAL · {totales.documentos} documento(s) de {totales.clientes} cliente(s)</Text></Table.Td>
                    <Table.Td ta="right"><Text fw={800} fz={12} pr={6}>{usd(totales.monto)}</Text></Table.Td>
                    <Table.Td ta="right"><Text fw={800} fz={12} pr={6} c="grape.8">{totales.retUsd > 0 ? usd(totales.retUsd) : ''}</Text></Table.Td>
                    <Table.Td colSpan={3} />
                    <Table.Td ta="right"><Text fw={800} fz={12} pr={6} c="#1971c2">{usd(totales.abonado)}</Text></Table.Td>
                    <Table.Td ta="right"><Text fw={800} size="sm" pr={6} c="navy.9">{usd(totales.saldo)}</Text></Table.Td>
                    <Table.Td colSpan={columnas - 11} />
                </Table.Tr>
            </Table.Tfoot>
        </Table>
    );
}
