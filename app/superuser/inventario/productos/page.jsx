'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Box, Button, Group, Paper, Skeleton, Text, Title, Tooltip } from '@mantine/core';
import { useLocalStorage, useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { IconAlertCircle, IconBarcode, IconEye, IconPencil } from '@tabler/icons-react';
import { COLUMNAS, VISIBLES_POR_DEFECTO, aplanarEntradas } from './_lib/columnas';
import { useInventarioParams } from './_hooks/useInventarioParams';
import { useEdicionInventario, useListaInventario, useOpcionesInventario, useResumenInventario } from './_hooks/useInventario';
import BarraFiltros from './_components/BarraFiltros';
import FotoModal from './_components/FotoModal';
import ListaPreciosModal from './_components/ListaPreciosModal';
import InventarioGrid from './_components/InventarioGrid';
import ListaMovil from './_components/ListaMovil';
import PaginacionInventario from './_components/PaginacionInventario';
import ResumenKpis from './_components/ResumenKpis';
import classes from './_components/grid.module.css';

// Inventario: hoja de cálculo paginada en el servidor. Cargar la página cuesta lo mismo con 600 o con 60.000 productos.
// Cada grupo de equivalencia es una fila padre (con la foto, el stock total y el MÍNIMO del grupo) y sus hermanos debajo.
export default function InventarioProductosPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const isMobile = useMediaQuery('(max-width: 48em)');

    const { params, setParams, hayFiltros, limpiarFiltros } = useInventarioParams();
    const { data, isPending, isFetching, isPlaceholderData, isError, error, refetch } = useListaInventario(params);
    const { data: resumen, isFetching: cargandoResumen } = useResumenInventario();
    const { data: opciones } = useOpcionesInventario();
    const edicion = useEdicionInventario(opciones);

    const [visibles, setVisibles] = useLocalStorage({ key: 'inv.columnas.v4', defaultValue: VISIBLES_POR_DEFECTO });
    const [bloqueado, setBloqueado] = useLocalStorage({ key: 'inv.bloqueado', defaultValue: false });
    // Cada persona ajusta la hoja a su gusto: ancho de cada columna y orden de las columnas (se guardan en su navegador)
    const [anchos, setAnchos] = useLocalStorage({ key: 'inv.anchos.v1', defaultValue: {} });
    const [ordenCols, setOrdenCols] = useLocalStorage({ key: 'inv.orden.v1', defaultValue: [] });
    const [contraidos, setContraidos] = useState(() => new Set());
    const [fotoDe, setFotoDe] = useState(null);
    const [listaPrecios, setListaPrecios] = useState(false);

    const entries = data?.entries ?? [];
    const tienePermiso = Boolean(data?.permisos?.editar);
    const puedeEditar = tienePermiso && !bloqueado;
    // Las columnas fijas (foto, código y producto) se quedan a la izquierda; el resto se puede reordenar
    const esFijaIzq = (c) => Boolean(c.fija || c.sticky);
    const columnas = useMemo(() => {
        const base = COLUMNAS.filter((c) => c.fija || visibles.includes(c.key));
        const posicion = (k) => { const i = ordenCols.indexOf(k); return i === -1 ? 1000 + COLUMNAS.findIndex((c) => c.key === k) : i; };
        const izq = base.filter(esFijaIzq);
        const resto = base.filter((c) => !esFijaIzq(c)).sort((a, b) => posicion(a.key) - posicion(b.key));
        return [...izq, ...resto].map((c) => (anchos[c.key] ? { ...c, ancho: anchos[c.key] } : c));
    }, [visibles, ordenCols, anchos]);
    const cambiarAncho = (clave, ancho) => setAnchos((a) => ({ ...a, [clave]: ancho }));
    const restablecerAncho = (clave) => setAnchos((a) => { const { [clave]: _quitada, ...resto } = a; return resto; });
    const moverColumna = (desde, hacia) => {
        const claves = columnas.filter((c) => !esFijaIzq(c)).map((c) => c.key);
        if (!claves.includes(desde) || !claves.includes(hacia) || desde === hacia) return;
        const nueva = claves.filter((k) => k !== desde);
        nueva.splice(nueva.indexOf(hacia) + (claves.indexOf(desde) < claves.indexOf(hacia) ? 1 : 0), 0, desde);
        setOrdenCols(nueva);
    };
    const restablecerColumnas = () => { setAnchos({}); setOrdenCols([]); };
    const items = useMemo(() => aplanarEntradas(entries, contraidos), [entries, contraidos]);

    // Si tras filtrar la página actual ya no existe, vuelve a la última que sí
    useEffect(() => {
        if (data && data.entries.length === 0 && params.page > 1 && !isPlaceholderData) setParams({ page: data.totalPages }, { resetPage: false });
    }, [data, params.page, isPlaceholderData, setParams]);

    // Clic en un encabezado: ascendente -> descendente -> orden por defecto
    const onOrden = (clave) => {
        if (params.sort !== clave) setParams({ sort: clave, dir: 'asc' });
        else if (params.dir === 'asc') setParams({ sort: clave, dir: 'desc' });
        else setParams({ sort: '', dir: '' });
    };

    const alternarGrupo = (id) => setContraidos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const todosLosGrupos = entries.filter((e) => e.tipo === 'grupo').map((e) => e.grupo.id);
    const filasVisibles = entries.flatMap((e) => (e.tipo === 'producto' ? [e.fila] : e.filas));
    const mapaFilas = () => new Map(filasVisibles.map((f) => [f.id, f]));
    const irFicha = (id) => router.push(`/superuser/inventario/productos/${id}/editar`);

    // Una edición puede ser de un producto o de la fila padre de un grupo
    const editar = (item, edit, valor) => (edit.tabla === 'grupo'
        ? edicion.editarGrupo(item.grupo, edit.campo, valor)
        : edicion.editarCelda(item.fila, edit.campo, valor));

    const cambiarImagen = (item, nombre) => (item.k === 'grupo' ? edicion.editarGrupo(item.grupo, 'imagen', nombre) : edicion.editarCelda(item.fila, 'imagen', nombre));

    const cambiarFotoMarca = async (marca, nombre) => {
        const res = await fetch(`/api/marcas/${marca.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: marca.nombre, imagen: nombre }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo actualizar la marca');
        await queryClient.invalidateQueries({ queryKey: ['productos'] });
        setFotoDe(null);
    };

    const pegarBloque = async (lote, problemas, celdas) => {
        if (!lote.length) {
            notifications.show({ color: 'orange', title: 'No hay nada que pegar', message: problemas[0] || 'Los valores pegados son iguales a los actuales.' });
            return;
        }
        const aviso = problemas.length ? `\n\n${problemas.length} aviso(s):\n- ${problemas.slice(0, 5).join('\n- ')}` : '';
        if (!window.confirm(`Se modificarán ${celdas} celdas en ${lote.length} producto(s).${aviso}\n\n¿Aplicar los cambios?`)) return;
        await edicion.aplicarBloque(lote, mapaFilas());
    };

    const guardarMovil = (fila, cambios) => edicion.aplicarBloque(
        [{ id: fila.id, cambios, ...('stockAlmacen' in cambios ? { esperado: { stockAlmacen: fila.stockAlmacen } } : {}) }],
        mapaFilas()
    );

    const eliminar = async (fila) => {
        if (!window.confirm(`¿Eliminar "${fila.nombre}"? Esta acción no se puede deshacer.`)) return;
        try {
            const res = await fetch(`/api/productos/${fila.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo eliminar');
            notifications.show({ color: 'teal', message: `"${fila.nombre}" eliminado` });
            queryClient.invalidateQueries({ queryKey: ['productos'] });
        } catch (e) {
            notifications.show({ color: 'red', title: 'Error', message: e.message });
        }
    };

    // La hoja usa TODO el ancho de la pantalla (sin tope ni márgenes laterales): cuanto más ancha, más columnas a la vista
    return (
        <Box px={isMobile ? 'xs' : 6} py={isMobile ? 'xs' : 'sm'} w="100%">
            <Group justify="space-between" align="center" mb="sm">
                <Box>
                    <Title order={2} c="white" fz={isMobile ? 22 : 28} tt="none" display="block" pb={0}>Inventario</Title>
                    <Text size="sm" c="gray.4">Hoja de control de productos, costos, precios y existencias</Text>
                </Box>
                {data && (
                    tienePermiso
                        ? <Badge size="lg" variant="light" color={puedeEditar ? 'teal' : 'gray'} leftSection={puedeEditar ? <IconPencil size={14} /> : <IconEye size={14} />}>{puedeEditar ? 'Edición activa' : 'Edición bloqueada'}</Badge>
                        : <Tooltip label="Pide al administrador el permiso de edición de inventario"><Badge size="lg" variant="light" color="gray" leftSection={<IconEye size={14} />}>Solo lectura</Badge></Tooltip>
                )}
            </Group>

            {tienePermiso && (
                <Button fullWidth={isMobile} mb="sm" variant="white" leftSection={<IconBarcode size={18} />} onClick={() => router.push('/superuser/inventario/codigos')}>
                    Cargar códigos de barras
                </Button>
            )}

            <ResumenKpis resumen={resumen} params={params} setParams={setParams} cargando={cargandoResumen} />

            <BarraFiltros
                params={params} setParams={setParams} hayFiltros={hayFiltros} limpiarFiltros={limpiarFiltros}
                opciones={opciones} isMobile={isMobile}
                columnasVisibles={visibles} setColumnasVisibles={setVisibles} onRestablecerColumnas={restablecerColumnas}
                puedeEditar={tienePermiso} bloqueado={bloqueado} setBloqueado={setBloqueado}
                onDeshacer={edicion.deshacer} hayHistorial={edicion.hayHistorial}
                grupos={todosLosGrupos} contraidos={contraidos} setContraidos={setContraidos}
                onNuevo={() => router.push('/superuser/inventario/productos/nuevo')}
                onListaPrecios={() => setListaPrecios(true)}
            />

            {isError && !data ? (
                <Alert color="red" icon={<IconAlertCircle size={18} />} title="No se pudo cargar el inventario" variant="light">
                    {error?.message} <Button size="compact-sm" variant="white" ml="sm" onClick={() => refetch()} tt="none">Reintentar</Button>
                </Alert>
            ) : isPending ? (
                <Skeleton h={480} radius="md" />
            ) : (
                <>
                    {isMobile ? (
                        <ListaMovil entries={entries} puedeEditar={tienePermiso} onGuardar={guardarMovil} onGuardarGrupo={(g, valor) => edicion.editarGrupo(g, 'stockMinimoGlobal', valor)} onFicha={irFicha} />
                    ) : (
                        <InventarioGrid
                            items={items} columnas={columnas} opciones={opciones}
                            puedeEditar={puedeEditar} estados={edicion.estados}
                            orden={{ sort: params.sort, dir: params.dir }} onOrden={onOrden}
                            onEditar={editar} onPegarBloque={pegarBloque} onDeshacer={edicion.deshacer}
                            onAncho={cambiarAncho} onRestablecerAncho={restablecerAncho} onMoverColumna={moverColumna}
                            onFicha={irFicha} onEliminar={eliminar} onFoto={setFotoDe} onToggleGrupo={alternarGrupo}
                            cargando={isPlaceholderData || edicion.procesando}
                        />
                    )}

                    <Paper withBorder radius="md" px="sm" pb="sm" mt="sm" bg="white">
                        <PaginacionInventario
                            page={data.page} pageSize={data.pageSize} total={data.total} totalProductos={data.totalProductos} totalPages={data.totalPages}
                            onPagina={(p) => setParams({ page: p }, { resetPage: false })}
                            onTamano={(n) => setParams({ pageSize: n })}
                            isMobile={isMobile} cargando={isFetching}
                        />
                    </Paper>

                    {puedeEditar && !isMobile && (
                        <Text size="xs" c="gray.4" mt="sm" className={classes.ayuda}>
                            <kbd>↑↓←→</kbd> / <kbd>Tab</kbd> moverse · <kbd>Enter</kbd> o <kbd>F2</kbd> editar · escribir reemplaza el valor · <kbd>Esc</kbd> cancela ·{' '}
                            <kbd>Supr</kbd> vacía · <kbd>Ctrl</kbd>+<kbd>V</kbd> pega desde Excel · <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshace · clic en la foto para verla o cambiarla
                        </Text>
                    )}
                </>
            )}

            <ListaPreciosModal opened={listaPrecios} onClose={() => setListaPrecios(false)} params={params} hayFiltros={hayFiltros} />
            <FotoModal item={fotoDe} onCerrar={() => setFotoDe(null)} onCambiarImagen={cambiarImagen} onCambiarMarca={cambiarFotoMarca} />
        </Box>
    );
}
