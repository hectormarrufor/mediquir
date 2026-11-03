'use client';

import React, { useState } from 'react';
import { Alert, Button, Checkbox, Divider, Group, Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconFileSpreadsheet, IconInfoCircle } from '@tabler/icons-react';
import { COLUMNAS_EXPORTACION, EXPORTACION_POR_DEFECTO, SECCIONES_EXPORTACION } from '@/app/constants/inventarioExportacion';
import { aQueryString } from '../_hooks/useInventarioParams';

const TOPE = 5000;

// Antes de exportar pregunta QUÉ columnas llevar al Excel. Lo elegido se recuerda en este navegador para la próxima vez.
// Exporta todo el resultado de los filtros de la hoja (búsqueda, categoría, marca, grupo, etiqueta, ofertas y stock), no solo la página.
export default function ExportarExcelModal({ opened, onClose, params, hayFiltros, totalProductos }) {
    const [elegidas, setElegidas] = useLocalStorage({ key: 'inv.exportar.v1', defaultValue: EXPORTACION_POR_DEFECTO });
    const [descargando, setDescargando] = useState(false);

    const marcadas = new Set(elegidas);
    const claves = COLUMNAS_EXPORTACION.filter((c) => marcadas.has(c.key)).map((c) => c.key);
    const alternar = (key) => setElegidas((l) => (l.includes(key) ? l.filter((k) => k !== key) : [...l, key]));
    const alternarSeccion = (seccion, marcar) => {
        const deSeccion = COLUMNAS_EXPORTACION.filter((c) => c.seccion === seccion).map((c) => c.key);
        setElegidas((l) => (marcar ? [...new Set([...l, ...deSeccion])] : l.filter((k) => !deSeccion.includes(k))));
    };

    const descargar = async () => {
        setDescargando(true);
        try {
            const { page: _p, pageSize: _s, ...filtros } = params;
            const res = await fetch(`/api/inventario/productos?${aQueryString({ ...filtros, formato: 'xlsx', columnas: claves.join(',') })}`);
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo generar el archivo');
            const blob = await res.blob();
            const nombre = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'inventario.xlsx';
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nombre;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            notifications.show({ color: 'teal', title: 'Excel descargado', message: `${nombre} con ${claves.length} columna(s).` });
            onClose();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo exportar', message: e.message });
        } finally {
            setDescargando(false);
        }
    };

    const cuantos = Number(totalProductos) || 0;

    return (
        <Modal opened={opened} onClose={onClose} centered size="lg" title={<Text fw={800}>Exportar a Excel</Text>}>
            <Stack gap="md">
                <Text size="sm">¿Qué columnas quieres en el archivo? Marca las que necesites.</Text>

                <Group gap="xs">
                    <Button size="compact-sm" variant="light" tt="none" onClick={() => setElegidas(COLUMNAS_EXPORTACION.map((c) => c.key))}>Todas</Button>
                    <Button size="compact-sm" variant="light" tt="none" onClick={() => setElegidas(EXPORTACION_POR_DEFECTO)}>Las de siempre</Button>
                    <Button size="compact-sm" variant="light" color="gray" tt="none" onClick={() => setElegidas([])}>Ninguna</Button>
                </Group>

                {SECCIONES_EXPORTACION.map((seccion) => {
                    const cols = COLUMNAS_EXPORTACION.filter((c) => c.seccion === seccion);
                    const n = cols.filter((c) => marcadas.has(c.key)).length;
                    return (
                        <Stack key={seccion} gap={6}>
                            <Divider
                                labelPosition="left"
                                label={(
                                    <Checkbox
                                        size="xs" label={<Text size="sm" fw={700} c="navy.9">{seccion}</Text>}
                                        checked={n === cols.length} indeterminate={n > 0 && n < cols.length}
                                        onChange={() => alternarSeccion(seccion, n < cols.length)}
                                    />
                                )}
                            />
                            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing={6} verticalSpacing={6} pl="md">
                                {cols.map((c) => (
                                    <Checkbox key={c.key} size="sm" label={c.label} checked={marcadas.has(c.key)} onChange={() => alternar(c.key)} />
                                ))}
                            </SimpleGrid>
                        </Stack>
                    );
                })}

                <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />} p="xs">
                    <Text size="xs">
                        Se exportan {cuantos > TOPE ? `los primeros ${TOPE.toLocaleString('es-VE')} de ` : ''}{cuantos.toLocaleString('es-VE')} producto(s)
                        {hayFiltros ? ' que cumplen los filtros de la hoja' : ' (todo el inventario)'}, no solo la página que estás viendo.
                        Los números van completos, sin redondear.
                    </Text>
                </Alert>

                <Group justify="space-between">
                    <Text size="sm" c="dimmed">{claves.length} columna(s) elegida(s)</Text>
                    <Group gap="xs">
                        <Button variant="default" onClick={onClose} tt="none">Cancelar</Button>
                        <Button color="teal" leftSection={<IconFileSpreadsheet size={16} />} disabled={!claves.length} loading={descargando} onClick={descargar} tt="none">
                            Descargar Excel
                        </Button>
                    </Group>
                </Group>
            </Stack>
        </Modal>
    );
}
