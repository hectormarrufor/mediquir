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
    const [pestana, setPestana] = useState('todos'); // 'todos' | 'sin' (clientes sin grupo) | id de un grupo (los Excel de la administradora: Vendedores, Maraplus…)
    const [abiertos, setAbiertos] = useState(() => new Set()); // clientes desplegados (con sus facturas y abonos)
    const [plegadas, setPlegadas] = useState(() => new Set()); // facturas cuyos abonos se esconden (por defecto se ven, como en la hoja de los vendedores)
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

    // Con la vista y la búsqueda; las pestañas (grupos) filtran sobre esto y muestran cuántos clientes y cuánto se debe en cada una
    const filasVista = useMemo(() => todas.filter((f) => (vista !== 'vencidas' || f.vencida)
        && (!q || [f.cliente, f.documento, f.rif, f.observacion, f.vendedor].some((x) => sinAcentos(x).includes(q)))), [todas, vista, q]);

    const gruposCobranza = useMemo(() => consulta.data?.grupos || [], [consulta.data]);
    const gruposDeCliente = useMemo(() => {
        const m = new Map();
        for (const g of gruposCobranza) for (const id of g.clienteIds) (m.get(id) || m.set(id, new Set()).get(id)).add(g.id);
        return m;
    }, [gruposCobranza]);
    const perteneceA = (clienteId, p) => (p === 'todos' ? true : p === 'sin' ? !gruposDeCliente.has(clienteId) : Boolean(gruposDeCliente.get(clienteId)?.has(p)));

    const pestanas = useMemo(() => {
        const resumenDe = (clave) => {
            const f = filasVista.filter((x) => perteneceA(x.clienteId, clave));
            return { clientes: new Set(f.map((x) => x.clienteId)).size, saldo: suma(f, 'saldo') };
        };
        const lista = [{ clave: 'todos', nombre: 'Todos', ...resumenDe('todos') }, ...gruposCobranza.map((g) => ({ clave: g.id, nombre: g.nombre, miembros: g.clienteIds.length, ...resumenDe(g.id) }))];
        const sin = resumenDe('sin');
        if (sin.clientes > 0) lista.push({ clave: 'sin', nombre: 'Sin grupo', ...sin });
        return lista;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filasVista, gruposCobranza, gruposDeCliente]);
    // si el grupo que se estaba viendo se borró (o «Sin grupo» quedó vacío), se vuelve a Todos
    const pestanaActiva = pestanas.some((p) => p.clave === pestana) ? pestana : 'todos';
    const filas = useMemo(() => filasVista.filter((f) => perteneceA(f.clienteId, pestanaActiva)), [filasVista, pestanaActiva, gruposDeCliente]); // eslint-disable-line react-hooks/exhaustive-deps

    const grupos = useMemo(() => {
        const m = new Map();
        for (const f of filas) {
            if (!m.has(f.clienteId)) m.set(f.clienteId, { id: f.clienteId, nombre: f.cliente || 'Sin nombre', rif: f.rif, filas: [] });
            m.get(f.clienteId).filas.push(f);
        }
        const lista = [...m.values()].map((g) => ({
            ...g,
            monto: suma(g.filas, 'monto'), abonado: suma(g.filas, 'abonado'), saldo: suma(g.filas, 'saldo'),
            retUsd: suma(g.filas.filter((f) => f.retReal), 'retUsd'), // solo las retenciones que el cliente sí hizo
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
    const totales = useMemo(() => ({
        monto: suma(filas, 'monto'), abonado: suma(filas, 'abonado'), saldo: suma(filas, 'saldo'), documentos: filas.length, clientes: grupos.length,
        retUsd: suma(filas.filter((f) => f.retReal), 'retUsd'), // solo las retenciones que el cliente sí hizo
    }), [filas, grupos]);
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

    // Grupos (pestañas): crear, renombrar, borrar y agregar o quitar clientes. Borrar un grupo no toca a sus clientes ni sus cuentas.
    const crearGrupo = (nombre) => enviar('/api/finanzas/cxc/grupos', 'POST', { nombre })
        .then((r) => { notifications.show({ color: 'teal', message: `Grupo «${nombre}» creado` }); refrescar(); queryClient.invalidateQueries({ queryKey: ['cxc-grupos'] }); return r; })
        .catch(avisar);
    const renombrarGrupo = (id, nombre) => enviar(`/api/finanzas/cxc/grupos/${id}`, 'PATCH', { nombre }).then(() => { refrescar(); }).catch(avisar);
    const borrarGrupo = (id) => enviar(`/api/finanzas/cxc/grupos/${id}`, 'DELETE')
        .then(() => { notifications.show({ color: 'teal', message: 'Grupo borrado (sus clientes siguen en «Todos»)' }); refrescar(); setPestana('todos'); })
        .catch((e) => notifications.show({ color: 'red', title: 'No se borró', message: e.message }));
    const cambiarClientes = (id, { agregar = [], quitar = [] }) => enviar(`/api/finanzas/cxc/grupos/${id}/clientes`, 'PUT', { agregar, quitar }).then(() => { refrescar(); }).catch(avisar);

    // Clientes desplegados: con una búsqueda se ven abiertos los que coinciden; si no, cada uno se abre con su flecha (o «Desplegar todo»)
    const abierto = (id) => abiertos.has(id) || Boolean(q);
    const alternarCliente = (id) => setAbiertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const desplegarTodo = () => setAbiertos(new Set(grupos.map((g) => g.id)));
    const plegarTodo = () => setAbiertos(new Set());
    const alternarPlegada = (id) => setPlegadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

    // Descarga lo que se está viendo (con filtros y búsqueda) para abrirlo en Excel
    const exportarCsv = () => {
        const lineas = [['Cliente', 'RIF', 'Documento', 'Emisión', 'Vence', 'Días de atraso', 'Monto USD', 'Retención USD', 'Retención', 'Monto menos retención USD', 'Total Bs', 'Total Bs menos retención', 'Abonado', 'Saldo', 'Vendedor', 'Observación']];
        const vacio = (v) => (v === null || v === undefined ? '' : v);
        for (const g of grupos) for (const f of g.filas) {
            const tipoRet = f.retUsd === null || f.retUsd === undefined ? '' : f.retReal ? 'Retuvo' : 'Calculada (75 % del IVA)';
            lineas.push([f.cliente, f.rif, f.documento, f.emision, f.vence, f.vencida ? -f.dias : '', f.monto, vacio(f.retUsd), tipoRet, vacio(f.montoMenosRet), vacio(f.totalBs), vacio(f.totalBsMenosRet), f.abonado, f.saldo, f.vendedor || '', f.observacion]);
        }
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
        pestanas, pestana: pestanaActiva, setPestana, gruposCobranza, crearGrupo, renombrarGrupo, borrarGrupo, cambiarClientes,
        abierto, alternarCliente, desplegarTodo, plegarTodo, plegadas, alternarPlegada,
        editarCuenta, editarAbono, borrarAbono, crearManual, borrarManual, exportarCsv,
    };
}
