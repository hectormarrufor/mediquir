'use client';

// Datos y acciones del libro de cobranza: lo usan por igual la tabla (escritorio) y las tarjetas (teléfono),
// así la lógica (filtros, búsqueda, orden, totales, guardar) vive en un solo lugar.
import { useMemo, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { diasEntre, enviar, hoy, pedir, r2, sinAcentos } from './utilidades';

export const VISTAS_LIBRO = [
    { value: 'pendientes', label: 'Por cobrar' },
    { value: 'vencidas', label: 'Vencidas' },
    { value: 'todas', label: 'Todas (con cobradas)' },
];
export const ORDENES_LIBRO = [
    { value: 'cliente', label: 'Cliente (A-Z)' },
    { value: 'saldo', label: 'Mayor deuda primero' },
    { value: 'vencido', label: 'Más vencido primero' },
];

const suma = (lista, campo) => r2(lista.reduce((t, f) => t + (Number(f[campo]) || 0), 0));

export function useLibroCobranza() {
    const queryClient = useQueryClient();
    const [vista, setVista] = useState('pendientes');
    const [orden, setOrden] = useState('cliente');
    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(sinAcentos(busqueda.trim()), 200);
    const pagadas = vista === 'todas';

    // al cambiar de vista se queda la tabla anterior (atenuada) mientras llega la nueva: sin parpadeos
    const consulta = useQuery({
        queryKey: ['cxc-libro', pagadas],
        queryFn: () => pedir(`/api/finanzas/cxc/libro${pagadas ? '?pagadas=1' : ''}`),
        refetchOnWindowFocus: true,
        placeholderData: (anterior) => anterior,
    });

    // Vencida con el día de hoy de Caracas (el servidor usa UTC y de noche adelantaba un día)
    const hoyCaracas = hoy();
    const todas = useMemo(() => (consulta.data?.filas || []).map((f) => {
        const pagada = !(Number(f.saldo) > 0.005);
        const dias = f.vence ? diasEntre(hoyCaracas, f.vence) : null; // negativo: días de atraso
        const vencida = !pagada && dias !== null && dias < 0;
        return { ...f, pagada, dias, vencida, estadoFila: pagada ? 'pagada' : vencida ? 'vencida' : 'normal' };
    }), [consulta.data, hoyCaracas]);

    const filas = useMemo(() => todas.filter((f) => (vista !== 'vencidas' || f.vencida)
        && (!q || [f.cliente, f.documento, f.rif, f.observacion, f.vendedor].some((x) => sinAcentos(x).includes(q)))), [todas, vista, q]);

    const grupos = useMemo(() => {
        const m = new Map();
        for (const f of filas) {
            if (!m.has(f.clienteId)) m.set(f.clienteId, { id: f.clienteId, nombre: f.cliente || 'Sin nombre', rif: f.rif, filas: [] });
            m.get(f.clienteId).filas.push(f);
        }
        const lista = [...m.values()].map((g) => ({
            ...g,
            monto: suma(g.filas, 'monto'), abonado: suma(g.filas, 'abonado'), saldo: suma(g.filas, 'saldo'),
            vencido: suma(g.filas.filter((f) => f.vencida), 'saldo'),
            atrasoMax: Math.max(0, ...g.filas.filter((f) => f.vencida).map((f) => -f.dias)),
            vencidas: g.filas.filter((f) => f.vencida).length,
        }));
        const porNombre = (a, b) => a.nombre.localeCompare(b.nombre);
        if (orden === 'saldo') lista.sort((a, b) => b.saldo - a.saldo || porNombre(a, b));
        else if (orden === 'vencido') lista.sort((a, b) => b.vencido - a.vencido || b.atrasoMax - a.atrasoMax || porNombre(a, b));
        else lista.sort(porNombre);
        return lista;
    }, [filas, orden]);

    // Totales de lo que se está viendo (con filtros) y resumen general de lo pendiente (sin filtros)
    const totales = useMemo(() => ({ monto: suma(filas, 'monto'), abonado: suma(filas, 'abonado'), saldo: suma(filas, 'saldo'), documentos: filas.length, clientes: grupos.length }), [filas, grupos]);
    const resumen = useMemo(() => {
        const pendientes = todas.filter((f) => !f.pagada);
        const vencidas = pendientes.filter((f) => f.vencida);
        return {
            saldo: suma(pendientes, 'saldo'), vencido: suma(vencidas, 'saldo'), documentos: pendientes.length, vencidas: vencidas.length,
            clientes: new Set(pendientes.map((f) => f.clienteId)).size, manuales: pendientes.filter((f) => f.manual).length,
        };
    }, [todas]);

    const refrescar = () => { queryClient.invalidateQueries({ queryKey: ['cxc-libro'] }); queryClient.invalidateQueries({ queryKey: ['cuentas'] }); };
    // al fallar se avisa y se vuelve a lanzar: la celda que lo pidió regresa a su valor anterior
    const avisar = (e) => { notifications.show({ color: 'red', title: 'No se guardó', message: e.message }); throw e; };
    const urlCuenta = (cuenta) => (cuenta.manual ? `/api/finanzas/cxc/manual/${cuenta.idReal}` : `/api/finanzas/cxc/${cuenta.id}`);
    const urlAbono = (cuenta, abono) => (cuenta.manual ? `/api/finanzas/cxc/manual/${cuenta.idReal}/abonos/${abono.id}` : `/api/finanzas/cxc/abonos/${abono.id}`);

    const editarCuenta = (cuenta, campos) => enviar(urlCuenta(cuenta), 'PATCH', campos).then(refrescar).catch(avisar);
    const editarAbono = (cuenta, abono, campos) => enviar(urlAbono(cuenta, abono), 'PUT', campos).then(refrescar).catch(avisar);
    const borrarAbono = (cuenta, abono) => enviar(urlAbono(cuenta, abono), 'DELETE')
        .then(() => { notifications.show({ color: 'teal', message: 'Abono borrado: la deuda se recalculó' }); refrescar(); })
        .catch((e) => notifications.show({ color: 'red', title: 'No se borró', message: e.message }));
    const crearManual = (datos) => enviar('/api/finanzas/cxc/manual', 'POST', { ...datos, vence: datos.vence || undefined })
        .then((r) => { notifications.show({ color: 'teal', message: r.relacionada ? 'Cuenta creada y agrupada con el cliente que ya existía' : 'Cuenta creada' }); refrescar(); return r; })
        .catch(avisar);
    // una cuenta manual solo se puede borrar si no tiene abonos (con abonos ya es historia de cobranza)
    const borrarManual = (cuenta) => enviar(`/api/finanzas/cxc/manual/${cuenta.idReal}`, 'DELETE')
        .then(() => { notifications.show({ color: 'teal', message: `Cuenta «${cuenta.documento}» borrada` }); refrescar(); })
        .catch((e) => notifications.show({ color: 'red', title: 'No se borró', message: e.message }));

    // Descarga lo que se está viendo (con filtros y búsqueda) para abrirlo en Excel
    const exportarCsv = () => {
        const lineas = [['Cliente', 'RIF', 'Documento', 'Emisión', 'Vence', 'Días de atraso', 'Monto USD', 'Abonado', 'Saldo', 'Vendedor', 'Observación']];
        for (const g of grupos) for (const f of g.filas) lineas.push([f.cliente, f.rif, f.documento, f.emision, f.vence, f.vencida ? -f.dias : '', f.monto, f.abonado, f.saldo, f.vendedor || '', f.observacion]);
        const csv = lineas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
        a.download = `cuentas-por-cobrar-${hoyCaracas}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };

    return {
        consulta, cargando: consulta.isLoading, error: consulta.error, actualizando: consulta.isFetching && !consulta.isLoading,
        vista, setVista, orden, setOrden, busqueda, setBusqueda, buscando: Boolean(q),
        filas, grupos, totales, resumen,
        editarCuenta, editarAbono, borrarAbono, crearManual, borrarManual, exportarCsv,
    };
}
