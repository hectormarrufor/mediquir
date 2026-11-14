'use client';

// Datos, filtros, selección y acciones de la hoja de un vendedor a comisión. Lo usan por igual la tabla (escritorio) y las tarjetas (teléfono).
import { useEffect, useMemo, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { agruparPorCliente, contarPorFiltro, deudaDe, esPago, filtrarLineas, porCliente, porPagar, prepararLineas, r2, totales } from './comisiones';
import { enLotes, enviar, hoy, pedir, sinAcentos } from './utilidades';

const sumaComision = (lineas) => r2(lineas.reduce((t, l) => t + (Number(l.comisionUsd) || 0), 0));

export function useHojaVendedor() {
    const queryClient = useQueryClient();
    const consulta = useQuery({ queryKey: ['comisiones'], queryFn: () => pedir('/api/comisiones'), refetchOnWindowFocus: true });
    const [elegido, setElegido] = useState(null);
    const [filtro, setFiltro] = useState('porpagar');
    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(sinAcentos(busqueda.trim()), 200);
    const [sel, setSel] = useState(() => new Set());
    const [abiertos, setAbiertos] = useState(() => new Set()); // clientes desplegados
    const [plegadas, setPlegadas] = useState(() => new Set()); // facturas con sus abonos escondidos

    const vendedores = consulta.data?.vendedores || [];
    const actual = vendedores.find((v) => v.id === elegido) || vendedores[0] || null;
    const tasa = Number(consulta.data?.tasaBcv) > 0 ? Number(consulta.data.tasaBcv) : null; // BCV del día: la comisión se paga en bolívares

    const lineasActual = useMemo(() => prepararLineas(actual?.lineas || [], actual?.porcentaje), [actual]);
    const porId = useMemo(() => new Map(lineasActual.map((l) => [l.id, l])), [lineasActual]);
    const lineas = useMemo(() => filtrarLineas(lineasActual, filtro, q), [lineasActual, filtro, q]);
    const conteos = useMemo(() => contarPorFiltro(lineasActual), [lineasActual]);
    const todasPorCliente = useMemo(() => porCliente(lineasActual), [lineasActual]);
    const grupos = useMemo(() => agruparPorCliente(lineas, todasPorCliente), [lineas, todasPorCliente]);
    const totalVendedor = useMemo(() => totales(lineasActual), [lineasActual]);
    const totalVisible = useMemo(() => totales(lineas), [lineas]);
    const deudaTotal = useMemo(() => r2([...todasPorCliente.values()].reduce((t, ls) => t + deudaDe(ls), 0)), [todasPorCliente]);
    const deudaVisible = useMemo(() => (grupos.some((g) => g.deuda !== null) ? r2(grupos.reduce((t, g) => t + (g.deuda || 0), 0)) : null), [grupos]);
    const hayEnlazadas = useMemo(() => lineasActual.some((l) => l.ventaId), [lineasActual]);
    const porPagarVisibles = useMemo(() => lineas.filter(porPagar).map((l) => l.id), [lineas]);
    // Facturas y clientes de la hoja: sugerencias al agregar una línea
    const facturas = useMemo(() => {
        const m = new Map();
        for (const l of lineasActual) if (!esPago(l) && l.documentoTexto && !m.has(l.documentoTexto)) m.set(l.documentoTexto, { documento: l.documentoTexto, cliente: l.clienteTexto || l.clienteNombre || '', porcentaje: l.porcentaje });
        return [...m.values()];
    }, [lineasActual]);
    const clientes = useMemo(() => [...new Set(lineasActual.map((l) => l.clienteTexto || l.clienteNombre).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [lineasActual]);
    // lo marcado: cuántas comisiones y cuánto suman (para pagarle al vendedor)
    const seleccion = useMemo(() => {
        const ls = [...sel].map((id) => porId.get(id)).filter(Boolean);
        return { lineas: ls, cantidad: ls.length, comision: sumaComision(ls), pendientes: ls.filter((l) => l.estatusComision !== 'PAGADA').length };
    }, [sel, porId]);

    // al buscar (o si hay muy pocos clientes) se despliegan solos: lo buscado se ve sin tocar nada más
    useEffect(() => {
        if (q || grupos.length <= 2) setAbiertos(new Set(grupos.map((g) => g.k)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, actual?.id, filtro]);

    const refrescar = () => queryClient.invalidateQueries({ queryKey: ['comisiones'] });
    // al fallar se avisa y se vuelve a lanzar: la celda (o el formulario) que lo pidió no se da por guardado
    const avisar = (e) => { notifications.show({ color: 'red', title: 'No se guardó', message: e.message }); throw e; };

    const editar = (l, campos) => enviar(`/api/comisiones/${l.id}`, 'PATCH', campos).then((r) => {
        if (r?.hijosActualizados) notifications.show({ color: 'teal', title: 'Porcentaje cambiado', message: `Se recalculó la comisión de ${r.hijosActualizados} abono(s) por pagar de esta factura` });
        refrescar();
        return r;
    }).catch(avisar);

    // Marcar varias comisiones pagadas o pendientes (de a pocas para no saturar el servidor)
    const marcar = async (ids, estatus) => {
        const lista = [...ids];
        if (!lista.length) return;
        const resultados = await enLotes(lista, (id) => enviar(`/api/comisiones/${id}`, 'PATCH', { estatusComision: estatus }));
        const bien = lista.filter((_, i) => resultados[i].ok);
        const mal = resultados.filter((r) => !r.ok);
        setSel((s) => { const n = new Set(s); for (const id of bien) n.delete(id); return n; });
        refrescar();
        if (bien.length) notifications.show({ color: 'teal', title: estatus === 'PAGADA' ? 'Comisiones pagadas' : 'Comisiones pendientes', message: `${bien.length} comisión(es) marcada(s) ${estatus === 'PAGADA' ? 'pagadas con fecha de hoy' : 'pendientes'}` });
        if (mal.length) notifications.show({ color: 'red', title: 'Algunas no se guardaron', message: `${mal.length} no se pudieron marcar: ${mal[0].error?.message || 'error'}` });
    };
    const marcarUna = (l, estatus) => marcar([l.id], estatus);

    const agregar = async (linea) => {
        try {
            const r = await enviar('/api/comisiones', 'POST', {
                vendedorId: actual.id, concepto: linea.concepto, documento: linea.documento, cliente: linea.cliente,
                montoUsd: linea.montoUsd === '' ? null : linea.montoUsd, baseUsd: linea.baseUsd === '' ? null : linea.baseUsd,
                porcentaje: linea.porcentaje === '' || linea.porcentaje === null || linea.porcentaje === undefined || !Number.isFinite(Number(linea.porcentaje)) ? actual.porcentaje : Number(linea.porcentaje),
                fecha: linea.fecha || hoy(),
            });
            refrescar();
            notifications.show({ color: r.enlazada ? 'teal' : 'yellow', title: 'Línea agregada', message: r.enlazada ? 'Quedó enlazada con su factura del sistema' : 'No se encontró esa factura en el sistema: queda sin enlazar (el cobro se lleva a mano)' });
            return r;
        } catch (e) { return avisar(e); }
    };
    const borrar = (l) => enviar(`/api/comisiones/${l.id}`, 'DELETE')
        .then(() => { notifications.show({ color: 'teal', message: 'Línea borrada de la hoja' }); setSel((s) => { const n = new Set(s); n.delete(l.id); return n; }); refrescar(); })
        .catch((e) => notifications.show({ color: 'red', title: 'No se borró', message: e.message }));
    const crearVendedor = async (nuevo) => {
        try {
            const r = await enviar('/api/comisiones/vendedores', 'POST', nuevo);
            elegir(r.vendedor.id);
            refrescar();
            notifications.show({ color: 'teal', message: `Vendedor ${r.vendedor.nombre} creado` });
            return r;
        } catch (e) { return avisar(e); }
    };
    const cambiarPctVendedor = (porcentaje) => enviar('/api/comisiones/vendedores', 'PATCH', { id: actual.id, porcentaje })
        .then(() => { notifications.show({ color: 'teal', message: `Porcentaje por defecto de ${actual.nombre}: ${porcentaje} %` }); refrescar(); })
        .catch(avisar);

    // Préstamos y pago de lo acumulado (el servidor marca las líneas pagadas, asienta el abono al préstamo y deja el formato de pago)
    const prestar = (datos) => enviar('/api/comisiones/prestamos', 'POST', { vendedorId: actual.id, ...datos })
        .then((r) => { refrescar(); notifications.show({ color: 'teal', title: 'Préstamo registrado', message: `${actual.nombre}: +$${Number(datos.montoUsd).toFixed(2)}` }); return r; })
        .catch(avisar);
    const abonarPrestamo = (datos) => enviar('/api/comisiones/prestamos', 'POST', { vendedorId: actual.id, tipo: 'ABONO', ...datos })
        .then((r) => { refrescar(); notifications.show({ color: 'teal', title: 'Abono registrado', message: `${actual.nombre}: −$${Number(datos.montoUsd).toFixed(2)} de su préstamo` }); return r; })
        .catch(avisar);
    const borrarPrestamo = (m) => enviar(`/api/comisiones/prestamos?id=${m.id}`, 'DELETE')
        .then((r) => { refrescar(); notifications.show({ color: 'teal', message: 'Préstamo borrado' }); return r; })
        .catch(avisar);
    const revertirPago = (p) => enviar(`/api/comisiones/pagos?id=${p.id}`, 'DELETE')
        .then((r) => { setSel(new Set()); refrescar(); notifications.show({ color: 'teal', message: `Pago #${p.id} revertido: sus comisiones vuelven a «por pagar»` }); return r; })
        .catch(avisar);
    const pagarComision = (lineaIds, datos) => enviar('/api/comisiones/pagos', 'POST', { vendedorId: actual.id, lineaIds, ...datos })
        .then((r) => { setSel(new Set()); refrescar(); return r; })
        .catch(avisar);

    function elegir(id) { setElegido(id); setSel(new Set()); setAbiertos(new Set()); setPlegadas(new Set()); }
    const alternar = (setter) => (k, valor) => setter((s) => { const n = new Set(s); const poner = valor === undefined ? !n.has(k) : valor; if (poner) n.add(k); else n.delete(k); return n; });
    const alternarSel = alternar(setSel);
    const alternarGrupo = alternar(setAbiertos);
    const alternarPlegada = alternar(setPlegadas);
    const seleccionarVarias = (ids, valor) => setSel((s) => { const n = new Set(s); for (const id of ids) { if (valor) n.add(id); else n.delete(id); } return n; });

    return {
        consulta, cargando: consulta.isLoading, error: consulta.error,
        vendedores, actual, elegir, tasa,
        filtro, setFiltro, busqueda, setBusqueda, buscando: Boolean(q), conteos,
        lineasActual, lineas, grupos, totalVendedor, totalVisible, deudaTotal, deudaVisible, hayEnlazadas, facturas, clientes,
        sel, seleccion, alternarSel, seleccionarVarias, limpiarSeleccion: () => setSel(new Set()), porPagarVisibles,
        abiertos, alternarGrupo, expandirTodo: () => setAbiertos(new Set(grupos.map((g) => g.k))), contraerTodo: () => setAbiertos(new Set()),
        plegadas, alternarPlegada,
        prestar, abonarPrestamo, borrarPrestamo, revertirPago, pagarComision, editar, marcar, marcarUna, agregar, borrar, crearVendedor, cambiarPctVendedor,
    };
}
