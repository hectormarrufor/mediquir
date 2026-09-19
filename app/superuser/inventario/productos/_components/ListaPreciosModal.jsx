'use client';

import React, { useState } from 'react';
import { Alert, Box, Button, Group, Modal, Progress, SegmentedControl, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconFileTypePdf, IconInfoCircle } from '@tabler/icons-react';
import { descargarListaPrecios } from '../_lib/listaPreciosPdf';
import { aQueryString } from '../_hooks/useInventarioParams';

const FRASE = {
    datos: 'Preparando los productos…',
    pdf: 'Armando el PDF…',
};

// Genera y descarga la lista de precios (Precio 6 o Precio 7) con fotos por jerarquía:
// 1) foto del producto, 2) foto de su grupo de equivalencia, 3) foto de su marca.
export default function ListaPreciosModal({ opened, onClose, params, hayFiltros }) {
    const [precio, setPrecio] = useState('7');
    const [incluirPrecioCaja, setIncluirPrecioCaja] = useState(true);
    const [soloConStock, setSoloConStock] = useState(false);
    const [incluirSinPrecio, setIncluirSinPrecio] = useState(false);
    const [usarFiltros, setUsarFiltros] = useState(false);
    const [progreso, setProgreso] = useState(null); // { fase, hecho, total }
    const generando = progreso !== null;

    const generar = async () => {
        setProgreso({ fase: 'datos' });
        try {
            // Los filtros de la hoja (búsqueda, categoría, marca, grupo, etiqueta, ofertas); sin paginación
            const { page: _p, pageSize: _s, sort: _o, dir: _d, stock: _e, ...filtros } = params;
            const r = await descargarListaPrecios({
                precio: Number(precio), incluirPrecioCaja, soloConStock, incluirSinPrecio,
                filtros: usarFiltros ? aQueryString(filtros) : null,
            }, setProgreso);

            const { producto, grupo, marca, sin } = r.imagenes;
            notifications.show({
                color: 'teal', autoClose: 9000, title: `Lista descargada: ${r.nombre}`,
                message: `${r.total} productos en ${r.paginas} páginas. Fotos: ${producto} del producto, ${grupo} del grupo, ${marca} de la marca, ${sin} sin foto.`
                    + (r.omitidosSinPrecio ? ` ${r.omitidosSinPrecio} producto(s) sin precio no se incluyeron.` : ''),
            });
            onClose();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo generar la lista', message: e.message });
        } finally {
            setProgreso(null);
        }
    };

    const porcentaje = progreso?.fase === 'imagenes' ? Math.round((progreso.hecho / progreso.total) * 100) : progreso?.fase === 'pdf' ? 100 : 5;

    return (
        <Modal opened={opened} onClose={generando ? () => {} : onClose} closeOnClickOutside={!generando} withCloseButton={!generando} centered size="md"
            title={<Group gap="xs"><IconFileTypePdf size={20} /><Text fw={800}>Lista de precios (PDF)</Text></Group>}>
            <Stack gap="md">
                <Box>
                    <Text size="sm" fw={600} mb={6}>¿Con cuál precio?</Text>
                    <SegmentedControl fullWidth color="navy.9" value={precio} onChange={setPrecio} disabled={generando}
                        data={[{ value: '7', label: 'Precio 7 · Detal' }, { value: '6', label: 'Precio 6 · Mayor' }]} />
                </Box>

                <Stack gap={8}>
                    <Switch color="brand.6" checked={incluirPrecioCaja} onChange={(e) => setIncluirPrecioCaja(e.currentTarget.checked)} disabled={generando}
                        label="Mostrar también el precio por caja" description="Precio por unidad × unidades por caja (solo productos en caja)" />
                    <Switch color="brand.6" checked={soloConStock} onChange={(e) => setSoloConStock(e.currentTarget.checked)} disabled={generando}
                        label="Solo productos con existencia" description="Por defecto se incluyen todos, también los agotados" />
                    <Switch color="brand.6" checked={incluirSinPrecio} onChange={(e) => setIncluirSinPrecio(e.currentTarget.checked)} disabled={generando}
                        label="Incluir productos sin precio" description="Si no, se omiten los que tienen el precio elegido en 0" />
                    <Switch color="brand.6" checked={usarFiltros} onChange={(e) => setUsarFiltros(e.currentTarget.checked)} disabled={generando || !hayFiltros}
                        label="Solo lo que estoy filtrando ahora" description={hayFiltros ? 'Aplica la búsqueda, categoría, marca, grupo, etiqueta y ofertas actuales' : 'No hay filtros aplicados: se incluye todo el catálogo'} />
                </Stack>

                <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />} p="xs">
                    <Text size="xs">Cada producto lleva su propia foto; si no tiene, la de su grupo de equivalencia; y si tampoco, la de su marca. Los precios se muestran exactos, sin redondear.</Text>
                </Alert>

                {generando && (
                    <Box>
                        <Text size="sm" c="dimmed" mb={4}>
                            {progreso.fase === 'imagenes' ? `Descargando fotos… ${progreso.hecho} de ${progreso.total}` : FRASE[progreso.fase]}
                        </Text>
                        <Progress value={porcentaje} animated color="brand.6" radius="xl" />
                    </Box>
                )}

                <Button fullWidth size="md" color="navy.9" leftSection={<IconFileTypePdf size={18} />} loading={generando} onClick={generar} tt="none">
                    Descargar lista de precio {precio}
                </Button>
            </Stack>
        </Modal>
    );
}
