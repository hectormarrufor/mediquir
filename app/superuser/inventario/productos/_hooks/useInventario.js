'use client';

import { useCallback, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import imageCompression from 'browser-image-compression';
import { resolverEmpaque } from '@/app/constants/inventarioCampos';
import { estadoDe } from '../_lib/columnas';
import { aQueryString } from './useInventarioParams';

// Prefijo ['productos', ...]: cualquier invalidateQueries(['productos']) (formulario de producto, pedidos)
// también refresca esta hoja.
const KEY = ['productos', 'inventario'];
const MAX_HISTORIAL = 30;

async function pedir(url, opciones) {
    const res = await fetch(url, opciones);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        const error = new Error(json.error || json.message || `Error ${res.status}`);
        error.status = res.status;
        error.data = json;
        throw error;
    }
    return json;
}

const enviar = (url, metodo, cuerpo) => pedir(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });

export const useListaInventario = (params) => useQuery({
    queryKey: [...KEY, 'lista', params],
    queryFn: () => pedir(`/api/inventario/productos?${aQueryString(params)}`),
    placeholderData: keepPreviousData, // al cambiar de página se conserva la anterior (atenuada) en vez de parpadear
    staleTime: 20_000,
});

export const useResumenInventario = () => useQuery({
    queryKey: [...KEY, 'resumen'],
    queryFn: () => pedir('/api/inventario/productos/resumen'),
    staleTime: 30_000,
});

export const useOpcionesInventario = () => useQuery({
    queryKey: [...KEY, 'opciones'],
    queryFn: () => pedir('/api/inventario/productos/opciones'),
    staleTime: 5 * 60_000,
});

// Reduce la foto en el navegador y la sube al almacenamiento. Devuelve el nombre de archivo guardado.
export async function subirImagen(archivo, prefijo) {
    const comprimida = await imageCompression(archivo, { maxSizeMB: 0.35, maxWidthOrHeight: 1200, useWebWorker: true });
    const extension = (archivo.name.split('.').pop() || 'jpg').toLowerCase();
    const nombre = `${prefijo}_${Date.now()}.${extension}`;
    const r = await fetch(`/api/upload?filename=${encodeURIComponent(nombre)}`, { method: 'POST', body: comprimida });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No se pudo subir la foto');
    return nombre;
}

// Refleja un cambio en la fila local mientras el servidor responde (actualización optimista)
function aplicarLocal(fila, campo, valor, opciones) {
    let r = { ...fila, [campo]: valor };
    const buscar = (lista) => lista?.find((o) => o.id === valor);
    if (campo === 'categoriaId') r.categoria = buscar(opciones?.categorias) || fila.categoria;
    if (campo === 'marcaId') r.marca = buscar(opciones?.marcas) || fila.marca;
    if (campo === 'grupoEquivalenciaId') { const g = buscar(opciones?.grupos); r.grupo = valor && g ? { id: g.id, nombre: g.nombre } : null; }
    if (campo === 'tags') r.tags = valor.map((nombre, i) => ({ id: `tmp${i}`, nombre }));
    // Los campos derivados del empaque se recalculan igual que en el servidor
    const empaque = resolverEmpaque(fila, { [campo]: valor });
    if (!empaque.error) r = { ...r, ...empaque.cambios, [campo]: valor };
    return r;
}

const CLAVES_ANIDADAS = ['categoria', 'marca', 'grupo', 'tags', 'unidadesPorCaja', 'cajasPorBulto', 'unidadesPorBulto'];

// Edición de celdas: actualización optimista, control de concurrencia del stock, deshacer y pegado masivo.
export function useEdicionInventario(opciones) {
    const queryClient = useQueryClient();
    const [estados, setEstados] = useState({});        // 'p12:campo' | 'g3:campo' -> { estado, mensaje }
    const [historialTam, setHistorialTam] = useState(0);
    const [procesando, setProcesando] = useState(false);
    const historial = useRef([]);                       // [{ tabla, id, campo, antes, despues }]

    const marcar = useCallback((clave, valor, limpiarEn) => {
        setEstados((s) => ({ ...s, [clave]: valor }));
        if (limpiarEn) setTimeout(() => setEstados((s) => { const { [clave]: _quitar, ...resto } = s; return resto; }), limpiarEn);
    }, []);

    // fnFila(fila) -> fila ; fnGrupo(grupo) -> grupo (opcional)
    const parchear = useCallback((fnFila, fnGrupo) => {
        queryClient.setQueriesData({ queryKey: [...KEY, 'lista'] }, (viejo) => viejo && ({
            ...viejo,
            entries: viejo.entries.map((e) => (e.tipo === 'producto'
                ? { ...e, fila: fnFila(e.fila) }
                : { ...e, filas: e.filas.map(fnFila), grupo: fnGrupo ? fnGrupo(e.grupo) : e.grupo })),
        }));
    }, [queryClient]);

    const sincronizar = useCallback((filas = [], grupos = []) => {
        const porFila = new Map(filas.map((f) => [f.id, f]));
        const porGrupo = new Map(grupos.map((g) => [g.id, g]));
        parchear((r) => porFila.get(r.id) ?? r, (g) => (porGrupo.has(g.id) ? { ...g, ...porGrupo.get(g.id) } : g));
    }, [parchear]);

    const refrescarResumen = useCallback(() => queryClient.invalidateQueries({ queryKey: [...KEY, 'resumen'] }), [queryClient]);
    const refrescarLista = useCallback(() => queryClient.invalidateQueries({ queryKey: [...KEY, 'lista'] }), [queryClient]);

    const empujarHistorial = useCallback((entrada) => {
        historial.current = [...historial.current.slice(-(MAX_HISTORIAL - 1)), entrada];
        setHistorialTam(historial.current.length);
    }, []);

    // Guarda UNA celda de un producto. `valor` ya viene validado y normalizado (ver validarCampo).
    const editarCelda = useCallback(async (fila, campo, valor, { deHistorial = false } = {}) => {
        const antes = fila[campo] ?? null;
        if (antes === valor) return true;

        const clave = `p${fila.id}:${campo}`;
        const esStock = campo === 'stockAlmacen';
        marcar(clave, { estado: 'guardando' });

        // Optimista: la fila y, si tiene grupo, el stock total del grupo
        const delta = esStock ? (valor ?? 0) - (fila.stockAlmacen ?? 0) : 0;
        parchear(
            (r) => (r.id === fila.id ? aplicarLocal(r, campo, valor, opciones) : r),
            (g) => {
                if (!esStock || fila.grupo?.id !== g.id) return g;
                const stockTotal = g.stockTotal + delta;
                return { ...g, stockTotal, estado: estadoDe(stockTotal, g.stockMinimoGlobal) };
            }
        );

        try {
            const r = await enviar(`/api/inventario/productos/${fila.id}`, 'PATCH', { cambios: { [campo]: valor }, ...(esStock ? { esperado: { stockAlmacen: antes } } : {}) });
            sincronizar([r.row], r.grupos);
            marcar(clave, { estado: 'ok' }, 1400);
            if (!deHistorial) empujarHistorial({ tabla: 'producto', id: fila.id, campo, antes, despues: valor });
            refrescarResumen();
            if (campo === 'grupoEquivalenciaId') refrescarLista(); // cambia la estructura padre/hijo
            return true;
        } catch (error) {
            if (error.status === 409 && error.data?.row) {
                sincronizar([error.data.row], error.data.grupos);
                notifications.show({ color: 'orange', title: 'El stock cambió', message: error.message, autoClose: 6000 });
                marcar(clave, { estado: 'error', mensaje: 'El stock cambió mientras editabas' }, 4000);
            } else {
                refrescarLista(); // vuelve al estado real del servidor (incluye el total del grupo)
                marcar(clave, { estado: 'error', mensaje: error.message }, 5000);
                notifications.show({ color: 'red', title: 'No se guardó', message: `${fila.nombre}: ${error.message}` });
            }
            return false;
        }
    }, [marcar, parchear, sincronizar, empujarHistorial, refrescarResumen, refrescarLista, opciones]);

    // Edición de la fila padre de un grupo: nombre, mínimo del grupo o foto
    const editarGrupo = useCallback(async (grupo, campo, valor, { deHistorial = false } = {}) => {
        const antes = grupo[campo] ?? null;
        if (antes === valor) return true;
        const clave = `g${grupo.id}:${campo}`;
        marcar(clave, { estado: 'guardando' });
        parchear((r) => r, (g) => {
            if (g.id !== grupo.id) return g;
            const cambio = { ...g, [campo]: valor };
            return { ...cambio, estado: estadoDe(cambio.stockTotal, cambio.stockMinimoGlobal) };
        });
        try {
            const r = await enviar(`/api/inventario/grupos/${grupo.id}`, 'PATCH', { cambios: { [campo]: valor } });
            sincronizar([], [r.grupo]);
            marcar(clave, { estado: 'ok' }, 1400);
            if (!deHistorial) empujarHistorial({ tabla: 'grupo', id: grupo.id, campo, antes, despues: valor });
            refrescarResumen();
            return true;
        } catch (error) {
            refrescarLista();
            marcar(clave, { estado: 'error', mensaje: error.message }, 5000);
            notifications.show({ color: 'red', title: 'No se guardó', message: `${grupo.nombre}: ${error.message}` });
            return false;
        }
    }, [marcar, parchear, sincronizar, empujarHistorial, refrescarResumen, refrescarLista]);

    // Pegado masivo: items = [{ id, cambios, esperado }]. Una sola petición y una sola sentencia SQL.
    const aplicarBloque = useCallback(async (items, filasPorId) => {
        setProcesando(true);
        try {
            const r = await enviar('/api/inventario/productos', 'PATCH', { items });
            sincronizar(r.rows, r.grupos);
            r.actualizados.forEach((id) => {
                const previa = filasPorId.get(id);
                const item = items.find((i) => i.id === id);
                Object.entries(item?.cambios || {}).forEach(([campo, despues]) => {
                    marcar(`p${id}:${campo}`, { estado: 'ok' }, 1400);
                    if (previa) empujarHistorial({ tabla: 'producto', id, campo, antes: previa[campo] ?? null, despues });
                });
            });
            refrescarResumen();
            if (items.some((i) => 'grupoEquivalenciaId' in i.cambios)) refrescarLista();

            const problemas = r.conflictos.length + r.errores.length;
            notifications.show({
                color: problemas ? 'orange' : 'teal',
                title: `${r.actualizados.length} producto(s) actualizado(s)`,
                message: problemas
                    ? `${r.conflictos.length} con stock modificado por otra persona y ${r.errores.length} con errores: ${r.errores.slice(0, 2).map((e) => e.error).join(' · ')}`
                    : 'Cambios guardados. Ctrl+Z para deshacer el último.',
                autoClose: problemas ? 8000 : 4000,
            });
            return r;
        } catch (error) {
            notifications.show({ color: 'red', title: 'No se aplicó el pegado', message: error.message });
            return null;
        } finally {
            setProcesando(false);
        }
    }, [sincronizar, marcar, empujarHistorial, refrescarResumen, refrescarLista]);

    // Ctrl+Z: revierte la última edición (para el stock, protegido por el mismo control de concurrencia)
    const deshacer = useCallback(async () => {
        const ultima = historial.current.pop();
        setHistorialTam(historial.current.length);
        if (!ultima) return;

        const lista = queryClient.getQueriesData({ queryKey: [...KEY, 'lista'] }).flatMap(([, d]) => d?.entries || []);
        if (ultima.tabla === 'grupo') {
            const grupo = lista.find((e) => e.tipo === 'grupo' && e.grupo.id === ultima.id)?.grupo;
            if (grupo && await editarGrupo(grupo, ultima.campo, ultima.antes, { deHistorial: true })) notifications.show({ color: 'gray', message: `Deshecho: ${grupo.nombre}`, autoClose: 2000 });
            return;
        }
        const fila = lista.flatMap((e) => (e.tipo === 'producto' ? [e.fila] : e.filas)).find((r) => r.id === ultima.id);
        if (fila && await editarCelda(fila, ultima.campo, ultima.antes, { deHistorial: true })) notifications.show({ color: 'gray', message: `Deshecho: ${fila.nombre}`, autoClose: 2000 });
    }, [queryClient, editarCelda, editarGrupo]);

    return { estados, editarCelda, editarGrupo, aplicarBloque, deshacer, hayHistorial: historialTam > 0, procesando, refrescarLista };
}
