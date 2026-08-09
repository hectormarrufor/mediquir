// components/reportes/ReporteCompras.jsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Title, Paper, Group, Text, Select, Button, Loader, Center,
  Table, Stack, Collapse, Tooltip, ActionIcon, Flex, Badge, SimpleGrid
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconChevronDown, IconChevronUp, IconRefresh, IconSearch } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';

const getEstadoOCColor = (estado) => {
  switch (estado) {
    case 'Pendiente': return 'blue';
    case 'Aprobada': return 'grape';
    case 'Enviada': return 'indigo';
    case 'Recibida Parcial': return 'orange';
    case 'Recibida Completa': return 'green';
    case 'Facturada': return 'cyan'; // Nuevo estado que podrías considerar
    case 'Cancelada': return 'red';
    default: return 'gray';
  }
};

export function ReporteCompras() {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [consumibles, setConsumibles] = useState([]);

  // Filtros
  const [fechaInicio, setFechaInicio] = useState(null);
  const [fechaFin, setFechaFin] = useState(null);
  const [selectedProveedor, setSelectedProveedor] = useState(null);
  const [selectedConsumible, setSelectedConsumible] = useState(null);
  const [selectedEstadoOC, setSelectedEstadoOC] = useState(null);

  const [expandedOrders, setExpandedOrders] = useState({}); // Para expandir/contraer detalles de OC

  const toggleOrderExpand = (id) => {
    setExpandedOrders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const fetchDependencies = useCallback(async () => {
    try {
      const [provRes, consRes] = await Promise.all([
        fetch('/api/compras/proveedores'),
        fetch('/api/inventario/consumibles'),
      ]);

      const [provData, consData] = await Promise.all([
        provRes.json(),
        consRes.json(),
      ]);

      setProveedores(provData.map(p => ({ value: p.id.toString(), label: p.nombre })));
      setConsumibles(consData.map(c => ({ value: c.id.toString(), label: c.nombre })));
    } catch (err) {
      notifications.show({
        title: 'Error de Carga',
        message: `No se pudieron cargar las dependencias: ${err.message}`,
        color: 'red',
      });
    }
  }, []);

  useEffect(() => {
    fetchDependencies();
  }, [fetchDependencies]);

  const generateReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fechaInicio) params.append('fechaInicio', fechaInicio.toISOString().split('T')[0]);
      if (fechaFin) params.append('fechaFin', fechaFin.toISOString().split('T')[0]);
      if (selectedProveedor) params.append('proveedorId', selectedProveedor);
      if (selectedConsumible) params.append('consumibleId', selectedConsumible);
      if (selectedEstadoOC) params.append('estadoOC', selectedEstadoOC);

      const response = await fetch(`/api/reportes/compras?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Error al generar el reporte: ${response.statusText}`);
      }
      const data = await response.json();
      setReportData(data);
      notifications.show({
        title: 'Reporte Generado',
        message: 'El reporte de compras se ha actualizado exitosamente.',
        color: 'green',
      });
    } catch (err) {
      console.error('Failed to generate report:', err);
      setError(err);
      notifications.show({
        title: 'Error',
        message: `No se pudo generar el reporte: ${err.message}`,
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, [fechaInicio, fechaFin, selectedProveedor, selectedConsumible, selectedEstadoOC]);

  useEffect(() => {
    // Generar el reporte inicial al cargar la página
    generateReport();
  }, [generateReport]);

  if (loading && !reportData) {
    return (
      <Center style={{ height: '400px' }}>
        <Loader size="lg" />
        <Text ml="md">Generando reporte de compras...</Text>
      </Center>
    );
  }

  if (error && !reportData) {
    return (
      <Center style={{ height: '400px' }}>
        <Text color="red">Hubo un error al cargar el reporte: {error.message}</Text>
      </Center>
    );
  }

  return (
    <Box>
      <Title order={2} mb="lg">Reporte de Compras</Title>

      <Paper shadow="md" p="md" mb="lg">
        <Title order={4} mb="md">Filtros de Reporte</Title>
        <Group grow mb="md">
          <DateInput
            label="Fecha Inicio"
            placeholder="DD/MM/YYYY"
            valueFormat="DD/MM/YYYY"
            value={fechaInicio}
            onChange={setFechaInicio}
            clearable
          />
          <DateInput
            label="Fecha Fin"
            placeholder="DD/MM/YYYY"
            valueFormat="DD/MM/YYYY"
            value={fechaFin}
            onChange={setFechaFin}
            clearable
          />
        </Group>
        <Group grow mb="md">
          <Select
            label="Proveedor"
            placeholder="Selecciona un proveedor"
            data={proveedores}
            value={selectedProveedor}
            onChange={setSelectedProveedor}
            searchable
            clearable
          />
          <Select
            label="Consumible"
            placeholder="Selecciona un consumible"
            data={consumibles}
            value={selectedConsumible}
            onChange={setSelectedConsumible}
            searchable
            clearable
          />
          <Select
            label="Estado de OC"
            placeholder="Filtrar por estado de OC"
            data={[
              { value: 'Pendiente', label: 'Pendiente' },
              { value: 'Aprobada', label: 'Aprobada' },
              { value: 'Enviada', label: 'Enviada' },
              { value: 'Recibida Parcial', label: 'Recibida Parcial' },
              { value: 'Recibida Completa', label: 'Recibida Completa' },
              { value: 'Facturada', label: 'Facturada' },
              { value: 'Cancelada', label: 'Cancelada' },
            ]}
            value={selectedEstadoOC}
            onChange={setSelectedEstadoOC}
            clearable
          />
        </Group>
        <Group justify="flex-end">
          <Button onClick={generateReport} leftSection={<IconSearch size={18} />} loading={loading}>
            Generar Reporte
          </Button>
          <Tooltip label="Limpiar filtros y recargar">
            <ActionIcon onClick={() => {
              setFechaInicio(null);
              setFechaFin(null);
              setSelectedProveedor(null);
              setSelectedConsumible(null);
              setSelectedEstadoOC(null);
              // Llama a generateReport después de que los estados se actualicen
              setTimeout(generateReport, 0);
            }} variant="outline" size="lg">
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Paper>

      {reportData && (
        <>
          <Paper shadow="md" p="md" mb="lg">
            <Title order={4} mb="md">Resumen Global</Title>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
              <Paper   p="sm" radius="md">
                <Text size="sm" c="dimmed">Total Ordenado</Text>
                <Text size="xl" fw={700}>${reportData.totalOrdenado.toFixed(2)}</Text>
              </Paper>
              <Paper   p="sm" radius="md">
                <Text size="sm" c="dimmed">Total Recibido</Text>
                <Text size="xl" fw={700}>${reportData.totalRecibido.toFixed(2)}</Text>
              </Paper>
              <Paper   p="sm" radius="md">
                <Text size="sm" c="dimmed">Total Facturado</Text>
                <Text size="xl" fw={700}>${reportData.totalFacturado.toFixed(2)}</Text>
              </Paper>
              <Paper   p="sm" radius="md">
                <Text size="sm" c="dimmed">Total Pagado</Text>
                <Text size="xl" fw={700}>${reportData.totalPagado.toFixed(2)}</Text>
              </Paper>
            </SimpleGrid>
          </Paper>

          <Paper shadow="md" p="md" mb="lg">
            <Title order={4} mb="md">Compras por Proveedor</Title>
            <Table striped highlightOnHover withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Proveedor</Table.Th>
                  <Table.Th>Total Ordenado</Table.Th>
                  <Table.Th>Total Recibido</Table.Th>
                  <Table.Th>Total Facturado</Table.Th>
                  <Table.Th>Total Pagado</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {Object.entries(reportData.comprasPorProveedor).map(([nombreProv, data]) => (
                  <Table.Tr key={nombreProv}>
                    <Table.Td>{nombreProv}</Table.Td>
                    <Table.Td>${data.totalOrdenado.toFixed(2)}</Table.Td>
                    <Table.Td>${data.totalRecibido.toFixed(2)}</Table.Td>
                    <Table.Td>${data.totalFacturado.toFixed(2)}</Table.Td>
                    <Table.Td>${data.totalPagado.toFixed(2)}</Table.Td>
                  </Table.Tr>
                ))}
                {Object.keys(reportData.comprasPorProveedor).length === 0 && (
                  <Table.Tr><Table.Td colSpan={5} ta="center">No hay datos por proveedor para los filtros aplicados.</Table.Td></Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Paper>

          <Paper shadow="md" p="md" mb="lg">
            <Title order={4} mb="md">Compras por Consumible</Title>
            <Table striped highlightOnHover withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Consumible</Table.Th>
                  <Table.Th>Cantidad Recibida</Table.Th>
                  <Table.Th>Costo Total Recibido</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {Object.entries(reportData.comprasPorConsumible).map(([nombreCons, data]) => (
                  <Table.Tr key={nombreCons}>
                    <Table.Td>{nombreCons}</Table.Td>
                    <Table.Td>{data.cantidadRecibida.toFixed(2)}</Table.Td>
                    <Table.Td>${data.costoTotal.toFixed(2)}</Table.Td>
                  </Table.Tr>
                ))}
                {Object.keys(reportData.comprasPorConsumible).length === 0 && (
                  <Table.Tr><Table.Td colSpan={3} ta="center">No hay datos por consumible para los filtros aplicados.</Table.Td></Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Paper>

          <Paper shadow="md" p="md" mb="lg">
            <Title order={4} mb="md">Detalle de Órdenes de Compra</Title>
            <Table striped highlightOnHover withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nº OC</Table.Th>
                  <Table.Th>Proveedor</Table.Th>
                  <Table.Th>F. Emisión</Table.Th>
                  <Table.Th>Monto OC</Table.Th>
                  <Table.Th>Recibido</Table.Th>
                  <Table.Th>Facturado</Table.Th>
                  <Table.Th>Pagado</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {reportData.ordenes.length > 0 ? (
                  reportData.ordenes.map((oc) => (
                    <React.Fragment key={oc.id}>
                      <Table.Tr>
                        <Table.Td>{oc.numeroOrden}</Table.Td>
                        <Table.Td>{oc.proveedor}</Table.Td>
                        <Table.Td>{new Date(oc.fechaEmision).toLocaleDateString()}</Table.Td>
                        <Table.Td>${oc.montoTotalOrden.toFixed(2)}</Table.Td>
                        <Table.Td>${oc.totalRecibidoOC.toFixed(2)}</Table.Td>
                        <Table.Td>${oc.totalFacturadoOC.toFixed(2)}</Table.Td>
                        <Table.Td>${oc.totalPagadoOC.toFixed(2)}</Table.Td>
                        <Table.Td>
                          <Badge color={getEstadoOCColor(oc.estadoOrden)} variant="light">
                            {oc.estadoOrden}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon variant="light" onClick={() => toggleOrderExpand(oc.id)}>
                            {expandedOrders[oc.id] ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td colSpan={9} style={{ padding: 0, border: 'none' }}>
                          <Collapse in={expandedOrders[oc.id]} transitionDuration={200} transitionTimingFunction="linear">
                            <Box p="md" bg="gray.0">
                              <Title order={5} mb="sm">Detalle de la Orden de Compra ({oc.numeroOrden})</Title>
                              <Table withColumnBorders size="xs">
                                <Table.Thead>
                                  <Table.Tr>
                                    <Table.Th>Consumible</Table.Th>
                                    <Table.Th>Cant. Ordenada</Table.Th>
                                    <Table.Th>P. Unit. OC</Table.Th>
                                    <Table.Th>Cant. Recibida</Table.Th>
                                    <Table.Th>Cant. Facturada</Table.Th>
                                  </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                  {oc.detallesOrden.map((d, idx) => (
                                    <Table.Tr key={idx}>
                                      <Table.Td>{d.consumible}</Table.Td>
                                      <Table.Td>{d.cantidadOrdenada.toFixed(2)}</Table.Td>
                                      <Table.Td>${d.precioUnitarioOrden.toFixed(2)}</Table.Td>
                                      <Table.Td>{d.cantidadRecibida.toFixed(2)}</Table.Td>
                                      <Table.Td>{d.cantidadFacturada.toFixed(2)}</Table.Td>
                                    </Table.Tr>
                                  ))}
                                </Table.Tbody>
                              </Table>

                              {oc.recepciones.length > 0 && (
                                <Box mt="md">
                                  <Title order={6}>Recepciones Asociadas</Title>
                                  {oc.recepciones.map(recepcion => (
                                    <Paper key={recepcion.id}   p="xs" my="xs" bg="white">
                                      <Text size="sm" fw={500}>Nº Recepción: {recepcion.numeroRecepcion} - Fecha: {new Date(recepcion.fechaRecepcion).toLocaleDateString()}</Text>
                                      <Table withColumnBorders size="xs">
                                        <Table.Thead>
                                          <Table.Tr>
                                            <Table.Th>Consumible</Table.Th>
                                            <Table.Th>Cant. Recibida</Table.Th>
                                            <Table.Th>P. Unit.</Table.Th>
                                          </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                          {recepcion.detalles.map((dr, drIdx) => (
                                            <Table.Tr key={drIdx}>
                                              <Table.Td>{dr.consumible}</Table.Td>
                                              <Table.Td>{dr.cantidadRecibida.toFixed(2)}</Table.Td>
                                              <Table.Td>${dr.precioUnitario.toFixed(2)}</Table.Td>
                                            </Table.Tr>
                                          ))}
                                        </Table.Tbody>
                                      </Table>
                                    </Paper>
                                  ))}
                                </Box>
                              )}

                              {oc.facturas.length > 0 && (
                                <Box mt="md">
                                  <Title order={6}>Facturas de Proveedor Asociadas</Title>
                                  {oc.facturas.map(factura => (
                                    <Paper key={factura.id}   p="xs" my="xs" bg="white">
                                      <Text size="sm" fw={500}>Nº Factura: {factura.numeroFactura} - Total: ${factura.montoTotal.toFixed(2)} - Pagado: ${factura.montoPagado.toFixed(2)}</Text>
                                      <Text size="xs" c="dimmed">Estado: <Badge color={getEstadoOCColor(factura.estado)} size="xs">{factura.estado}</Badge></Text>
                                      {factura.pagos.length > 0 && (
                                        <List size="xs">
                                            {factura.pagos.map((p, pIdx) => (
                                                <List.Item key={pIdx}>
                                                    Pago de ${p.monto.toFixed(2)} el {new Date(p.fechaPago).toLocaleDateString()} ({p.metodoPago})
                                                </List.Item>
                                            ))}
                                        </List>
                                      )}
                                    </Paper>
                                  ))}
                                </Box>
                              )}

                            </Box>
                          </Collapse>
                        </Table.Td>
                      </Table.Tr>
                    </React.Fragment>
                  ))
                ) : (
                  <Table.Tr><Table.Td colSpan={9} ta="center">No hay Órdenes de Compra para los filtros aplicados.</Table.Td></Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Paper>
        </>
      )}
    </Box>
  );
}