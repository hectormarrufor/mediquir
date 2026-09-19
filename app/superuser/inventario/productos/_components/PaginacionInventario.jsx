'use client';

import React, { useEffect, useState } from 'react';
import { Group, NumberInput, Pagination, Select, Text } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';

const TAMANOS = ['10', '25', '50', '100', '200'];

// Barra de paginación: rango visible, saltar a una página, tamaño de página y atajos Alt+← / Alt+→
export default function PaginacionInventario({ page, pageSize, total, totalProductos, totalPages, onPagina, onTamano, isMobile, cargando }) {
    const [salto, setSalto] = useState(page);
    useEffect(() => { setSalto(page); }, [page]);

    const ir = (p) => onPagina(Math.min(Math.max(1, Number(p) || 1), totalPages));
    useHotkeys([['alt+ArrowRight', () => ir(page + 1)], ['alt+ArrowLeft', () => ir(page - 1)]], [], true);

    const desde = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const hasta = Math.min(page * pageSize, total);

    return (
        <Group justify="space-between" align="center" mt="sm" gap="sm" wrap="wrap">
            <Text size="sm" c="dimmed">
                <span title="Cada grupo de equivalencia cuenta como una sola fila de la paginación">Mostrando <b>{desde.toLocaleString('es-VE')}–{hasta.toLocaleString('es-VE')}</b> de <b>{total.toLocaleString('es-VE')}</b> (grupos y productos sueltos)</span> · {totalProductos.toLocaleString('es-VE')} productos
                {cargando && ' · actualizando…'}
            </Text>

            <Group gap="sm" wrap="wrap">
                <Pagination
                    total={totalPages} value={page} onChange={ir}
                    size={isMobile ? 'sm' : 'md'} radius="md" siblings={isMobile ? 0 : 1} boundaries={1}
                    withEdges color="navy.9"
                />
                {!isMobile && (
                    <NumberInput
                        size="xs" w={92} min={1} max={totalPages} hideControls value={salto}
                        onChange={setSalto} allowDecimal={false}
                        onKeyDown={(e) => { if (e.key === 'Enter') ir(salto); }}
                        onBlur={() => setSalto(page)}
                        leftSection={<Text size="xs" c="dimmed">Ir a</Text>} leftSectionWidth={34}
                        aria-label="Ir a la página"
                    />
                )}
                <Select
                    size="xs" w={isMobile ? 90 : 118} data={TAMANOS.map((t) => ({ value: t, label: `${t} / pág.` }))}
                    value={String(pageSize)} onChange={(v) => v && onTamano(Number(v))} allowDeselect={false}
                    aria-label="Filas por página"
                />
            </Group>
        </Group>
    );
}
