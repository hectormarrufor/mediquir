'use client';

import React, { useState, useEffect, useMemo, useDeferredValue, memo } from 'react';
import { 
    Modal, Button, Group, Title, TextInput, NumberInput, 
    Select, Paper, Stack, Grid, Table, ActionIcon,
    Text, Divider, Badge, Checkbox, Box, ScrollArea, Alert, SegmentedControl, ThemeIcon, Popover
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
    IconTrash, IconPlus, IconMinus, IconCheck, IconShieldCheck, IconAlertTriangle, IconReceiptTax, IconPackage
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { CONFIG_FISCAL } from '@/app/constants/empresa';
import PrecioVisual from '../ui/PrecioVisual';
import { useAuth } from '@/hooks/useAuth';
import { buscarProductos } from '@/app/helpers/busquedaProductos';
import { fechaCaracas } from '@/app/constants/hora';
import { PreguntarNumero, useNumeracion } from '@/app/superuser/_components/NumeracionFiscal';

const MAX_LISTA = 60; // renderizar el catálogo completo (600+ productos) en cada cambio del formulario era lo que volvía lenta la pantalla

const FilaProducto = memo(function FilaProducto({ prod, isMobile, onAgregar }) {
    return (
        <Paper p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }} onClick={() => onAgregar(prod)}>
            <Group justify="space-between" wrap="nowrap">
                <Box style={{ minWidth: 0, flex: 1 }}>
                    <Text fw={600} size={isMobile ? 'sm' : 'md'} lineClamp={isMobile ? 2 : 1}>{prod.nombre}</Text>
                    {prod.marca?.nombre && <Text size={isMobile ? 'xs' : 'sm'} fw={700} c="grape.7">Marca: {prod.marca.nombre}</Text>}
                    <Text size={isMobile ? 'xs' : 'sm'} c="dimmed">SKU: {prod.codigo} | Stock: {prod.stockAlmacen}</Text>
                </Box>
                {prod.costoUsd !== undefined && (
                    <Badge color="blue" size={isMobile ? 'md' : 'lg'} variant="light" tt="none" style={{ flexShrink: 0 }}>
                        {isMobile ? '' : 'Costo: '}<PrecioVisual valor={prod.costoUsd} simbolo="$" size="sm" />
                    </Badge>
                )}
            </Group>
        </Paper>
    );
});

// Auditoría del empaque del producto: se corrige aquí lo que el proveedor trae realmente y se guarda en la ficha al registrar la compra
const empaqueCambio = (item) => (Number(item.undPorCaja) || 0) !== (item.empaqueOriginal?.undPorCaja || 0) || (Number(item.cajasPorBulto) || 0) !== (item.empaqueOriginal?.cajasPorBulto || 0) || (Number(item.undPorBulto) || 0) !== (item.empaqueOriginal?.undPorBulto || 0);

function EditorEmpaque({ item, onCambiar }) {
    const modificado = empaqueCambio(item);
    const original = item.empaqueOriginal || {};
    return (
        <Popover width={300} position="bottom-start" shadow="md" withArrow trapFocus>
            <Popover.Target>
                <Button size="compact-xs" variant={modificado ? 'filled' : 'subtle'} color={modificado ? 'orange' : 'gray'} tt="none" leftSection={<IconPackage size={14} />}>
                    {modificado ? 'Empaque modificado' : 'Auditar empaque'}
                </Button>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack gap="xs">
                    <Text size="sm" fw={700}>Empaque de {item.nombre}</Text>
                    <NumberInput size="sm" label="Unidades por caja" description={original.undPorCaja ? `En la ficha: ${original.undPorCaja}` : 'En la ficha: sin caja'} min={0} allowDecimal={false} allowNegative={false} hideControls selectAllOnFocus
                        value={item.undPorCaja || ''} onChange={(v) => onCambiar('undPorCaja', v)} />
                    {item.undPorCaja ? (
                        <NumberInput size="sm" label="Cajas por bulto" description={original.cajasPorBulto ? `En la ficha: ${original.cajasPorBulto}` : 'En la ficha: sin bulto'} min={0} allowDecimal={false} allowNegative={false} hideControls selectAllOnFocus
                            value={item.cajasPorBulto || ''} onChange={(v) => onCambiar('cajasPorBulto', v)} />
                    ) : (
                        <NumberInput size="sm" label="Unidades por bulto" description={`Producto sin caja: el bulto trae las unidades sueltas. En la ficha: ${original.undPorBulto > 1 ? original.undPorBulto : 'sin bulto'}`} min={0} allowDecimal={false} allowNegative={false} hideControls selectAllOnFocus
                            value={item.undPorBulto || ''} onChange={(v) => onCambiar('undPorBulto', v)} />
                    )}
                    <Text size="xs" c="dimmed">
                        {item.undPorCaja ? `1 caja = ${item.undPorCaja} und` : 'Sin caja'}{item.undPorBulto > 1 ? ` · 1 bulto = ${item.undPorBulto.toLocaleString('es-VE')} und` : ''}
                    </Text>
                    {modificado && <Alert color="orange" variant="light" p="xs"><Text size="xs">Al registrar la compra se guardará este empaque en la ficha del producto.</Text></Alert>}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
}

export default function CompraModal({ opened, onClose, tasaBcv = 1, iniciarComoGasto = false }) {
    const { userId } = useAuth();
    const queryClient = useQueryClient();
    const isMobile = useMediaQuery('(max-width: 768px)');
    
    const [carritoCompra, setCarritoCompra] = useState([]);
    const [busquedaProd, setBusquedaProd] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [modoNuevoProveedor, setModoNuevoProveedor] = useState(false);

    // Gasto (servicio, flete, alquiler...): documento de compra sin productos; no toca el inventario y, si es factura, entra al libro de compras
    const [esGasto, setEsGasto] = useState(iniciarComoGasto);
    const [gasto, setGasto] = useState({ descripcion: '', categoriaId: null, base: 0, exento: 0 });
    useEffect(() => { if (opened) setEsGasto(iniciarComoGasto); }, [opened, iniciarComoGasto]);

    // Estados para la Fase de Simulación y Prompt de Aceptación
    const [modalSimulacionAbierto, setModalSimulacionAbierto] = useState(false);
    const [datosSimulacion, setDatosSimulacion] = useState(null);
    const [promptTexto, setPromptTexto] = useState('');

    const fetchSelect = async (url) => {
        const res = await fetch(url);
        if (!res.ok) return [];
        return res.json();
    };

    const { data: productos } = useQuery({ queryKey: ['productos-compra'], staleTime: 60_000, queryFn: () => fetchSelect('/api/productos') });
    const { data: proveedores } = useQuery({ queryKey: ['proveedores-compra'], queryFn: () => fetchSelect('/api/proveedores') });
    const { data: categoriasGasto } = useQuery({ queryKey: ['categorias-gasto'], enabled: opened && esGasto, queryFn: async () => (await fetchSelect('/api/finanzas/categorias')).filter?.((c) => c.tipo === 'GASTO' && c.nombre !== 'Compras de Mercancía') || [] });
    const { data: numeracion } = useNumeracion(opened); // el comprobante de retención sigue su propio correlativo

    const formCompra = useForm({
        initialValues: {
            proveedorId: null,
            tipoDocumento: 'FACTURA',
            numeroDocumento: '',
            fechaFactura: fechaCaracas(),
            condicionPago: 'Contado',
            diasCredito: 0,
            moneda: 'USD',
            metodoPago: 'Efectivo',
            referencia: '',
            aplicarRetencion: CONFIG_FISCAL.agenteRetencionIva,
            porcentajeRetencion: CONFIG_FISCAL.porcentajeRetencionCompras,
            numeroControl: ''
        }
    });

    // Moneda de la factura: el costo del producto SIEMPRE se guarda en dólares; si la factura llega en bolívares se convierte con la tasa BCV del día
    const tasa = Number(tasaBcv) || 0;
    const esBs = formCompra.values.moneda === 'BS';
    const aMon = (usd) => (esBs ? (Number(usd) || 0) * tasa : Number(usd) || 0);

    const formNuevoProv = useForm({
        initialValues: {
            identificacion: '',
            nombre: '',
            telefono: '',
            email: '',
            direccion: '',
            esContribuyenteEspecial: false,
            retencionIvaPorDefecto: 75,
            notas: ''
        }
    });

    const [modalCrearProv, setModalCrearProv] = useState(false);

    // La retención de IVA la practica la EMPRESA (agente de retención) sobre toda factura con IVA, sea cual sea el proveedor;
    // el porcentaje sale de la ficha del proveedor (75 % por defecto). Se puede desmarcar para una compra puntual.
    useEffect(() => {
        formCompra.setFieldValue('aplicarRetencion', CONFIG_FISCAL.agenteRetencionIva);
        const prov = proveedores?.find(p => String(p.id) === String(formCompra.values.proveedorId));
        formCompra.setFieldValue('porcentajeRetencion', Number(prov?.retencionIvaPorDefecto) || CONFIG_FISCAL.porcentajeRetencionCompras);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formCompra.values.proveedorId, proveedores]);

    // ---- Compra por BULTO, por CAJAS o por UNIDADES ----
    // El costo del producto es POR UNIDAD y el stock está en unidades. Lo que se recibe (un bulto, N cajas
    // o N unidades) y su precio (editable, por si el proveedor lo actualizó) se convierten aquí a
    // `cantidad` (unidades) y `precioCompraUnitario` (por unidad), que es lo que espera el servidor.
    const factorDe = (item) => (item.unidadCompra === 'bulto' ? item.undPorBulto : item.unidadCompra === 'caja' ? item.undPorCaja : 1) || 1;
    const recalcular = (item) => {
        const f = factorDe(item);
        return { ...item, cantidad: (Number(item.cantidadCompra) || 0) * f, precioCompraUnitario: (Number(item.precioCompra) || 0) / f };
    };

    // Un vendedor registra la compra pero no ve costos ni cambia precios: el servidor le devuelve la simulación sin esos datos
    const soloRegistro = Boolean(datosSimulacion?.[0]?.soloRegistro);

    const agregarAlCarritoCompra = (prod) => {
        const existe = carritoCompra.find(i => i.id === prod.id);
        if (existe) {
            setCarritoCompra(carritoCompra.map(i => i.id === prod.id ? recalcular({ ...i, cantidadCompra: i.cantidadCompra + 1 }) : i));
        } else {
            const costoUnidad = Number(prod.costoUsd) || 0;
            setCarritoCompra([...carritoCompra, recalcular({
                id: prod.id,
                codigo: prod.codigo,
                nombre: prod.nombre,
                marca: prod.marca?.nombre || '',
                costoAnterior: costoUnidad,
                undPorCaja: Number(prod.unidadesPorCaja) || 0,
                undPorBulto: Number(prod.unidadesPorBulto) || 0,
                cajasPorBulto: Number(prod.cajasPorBulto) || 0,
                empaqueOriginal: { undPorCaja: Number(prod.unidadesPorCaja) || 0, cajasPorBulto: Number(prod.cajasPorBulto) || 0, undPorBulto: Number(prod.unidadesPorBulto) || 0 },
                unidadCompra: 'unidad',
                cantidadCompra: 1,
                precioCompra: Number(aMon(costoUnidad).toFixed(4)),
                porcentajeIva: prod.porcentajeIva === null || prod.porcentajeIva === undefined || prod.porcentajeIva === "" || Number.isNaN(Number(prod.porcentajeIva)) ? 16 : Number(prod.porcentajeIva), // 0 = exento: no se puede tratar como "sin dato"
                aceptarCambioPrecio: true
            })]);
        }
    };

    const cambiarCantidad = (id, delta) => {
        setCarritoCompra(carritoCompra.map(i => {
            if (i.id === id) {
                const nuevaCant = (Number(i.cantidadCompra) || 0) + delta;
                return nuevaCant > 0 ? recalcular({ ...i, cantidadCompra: nuevaCant }) : null;
            }
            return i;
        }).filter(Boolean));
    };

    const actualizarCantidadCompra = (id, valor) => {
        setCarritoCompra(carritoCompra.map(i => i.id === id ? recalcular({ ...i, cantidadCompra: valor === '' ? '' : Number(valor) || 0 }) : i));
    };

    // Al salir del campo, una cantidad vacía o 0 vuelve a 1
    const confirmarCantidadCompra = (id) => {
        setCarritoCompra(carritoCompra.map(i => i.id === id && !(Number(i.cantidadCompra) >= 1) ? recalcular({ ...i, cantidadCompra: 1 }) : i));
    };

    // Al cambiar de unidad se conserva el costo por unidad y se recalcula el precio del bulto / la caja
    const cambiarUnidadCompra = (id, unidad) => {
        setCarritoCompra(carritoCompra.map(i => {
            if (i.id !== id) return i;
            const nuevo = { ...i, unidadCompra: unidad, cantidadCompra: 1 };
            return recalcular({ ...nuevo, precioCompra: i.precioCompraUnitario * factorDe(nuevo) });
        }));
    };

    // Corrige cuántas unidades trae la caja y cuántas cajas el bulto (el total del bulto se calcula, igual que en la ficha)
    const cambiarEmpaque = (id, campo, valor) => {
        setCarritoCompra(carritoCompra.map(i => {
            if (i.id !== id) return i;
            const v = Math.max(0, Math.floor(Number(valor)) || 0);
            const n = { ...i, [campo]: v };
            if (campo === 'undPorCaja' && v && !i.undPorCaja && !i.cajasPorBulto && i.undPorBulto > 1 && i.undPorBulto % v === 0) n.cajasPorBulto = i.undPorBulto / v; // el bulto ya existía: se reparte en cajas
            if (!n.undPorCaja) n.cajasPorBulto = 0;
            if (n.undPorCaja) n.undPorBulto = n.cajasPorBulto ? n.cajasPorBulto * n.undPorCaja : 0; // sin caja el total del bulto se escribe directo
            // si la presentación elegida deja de existir, se vuelve a unidades conservando el costo por unidad
            if ((n.unidadCompra === 'caja' && !n.undPorCaja) || (n.unidadCompra === 'bulto' && !(n.undPorBulto > 1))) {
                return recalcular({ ...n, unidadCompra: 'unidad', cantidadCompra: 1, precioCompra: i.precioCompraUnitario });
            }
            return recalcular(n);
        }));
    };

    // Al cambiar la moneda de la factura se reconvierten los precios ya escritos y el monto del gasto
    const cambiarMoneda = (nueva) => {
        if (!nueva || nueva === formCompra.values.moneda) return;
        if (nueva === 'BS' && !(tasa > 0)) return notifications.show({ title: 'Sin tasa BCV', message: 'No hay una tasa BCV vigente para convertir a bolívares.', color: 'red' });
        const k = nueva === 'BS' ? tasa : 1 / tasa;
        setCarritoCompra(carritoCompra.map(i => recalcular({ ...i, precioCompra: Number(((Number(i.precioCompra) || 0) * k).toFixed(4)) })));
        setGasto({ ...gasto, base: Number(((Number(gasto.base) || 0) * k).toFixed(2)), exento: Number(((Number(gasto.exento) || 0) * k).toFixed(2)) });
        formCompra.setFieldValue('moneda', nueva);
    };

    const actualizarPrecioCompra = (id, nuevoPrecio) => {
        setCarritoCompra(carritoCompra.map(i => i.id === id ? recalcular({ ...i, precioCompra: Number(nuevoPrecio) || 0 }) : i));
    };

    const toggleAceptarCambioItem = (id) => {
        setCarritoCompra(carritoCompra.map(i => i.id === id ? { ...i, aceptarCambioPrecio: !i.aceptarCambioPrecio } : i));
    };

    const eliminarItem = (id) => setCarritoCompra(carritoCompra.filter(i => i.id !== id));

    const esFactura = formCompra.values.tipoDocumento === 'FACTURA';
    let subtotal = 0;
    let montoIva = 0;
    let montoExento = 0; // lo que no lleva IVA: va como exento en el libro de compras

    carritoCompra.forEach(item => {
        const itemSub = item.precioCompraUnitario * item.cantidad;
        subtotal += itemSub;
        if (esFactura && item.porcentajeIva > 0) {
            montoIva += itemSub * (item.porcentajeIva / 100);
        } else {
            montoExento += itemSub;
        }
    });

    if (esGasto) {
        const base = Math.max(0, Number(gasto.base) || 0);
        const exento = Math.max(0, Number(gasto.exento) || 0);
        subtotal = base + exento;
        montoExento = esFactura ? exento : 0;
        montoIva = esFactura ? Math.round(base * CONFIG_FISCAL.alicuotaGeneral) / 100 : 0;
    }

    let montoRetencion = 0;
    if (formCompra.values.aplicarRetencion && esFactura && montoIva > 0) {
        montoRetencion = montoIva * (formCompra.values.porcentajeRetencion / 100);
    }

    const totalFinal = subtotal + montoIva;

    // Comprobante de retención: si todavía no se dijo con qué número empieza la numeración, se pregunta antes de registrar
    const serieRet = numeracion?.series?.find((s) => s.clave === 'RET-COMPRA');
    const faltaNumeracionRet = montoRetencion > 0 && Boolean(serieRet) && !serieRet.configurado;
    const periodoRet = String(formCompra.values.fechaFactura || fechaCaracas()).slice(0, 7).replace('-', '');

    const handleLanzarSimulacion = async () => {
        if (carritoCompra.length === 0) return notifications.show({ message: 'El carrito de compra está vacío', color: 'orange' });
        if (!formCompra.values.numeroDocumento) return notifications.show({ message: 'Indica el número de factura o recibo', color: 'red' });
        if (!formCompra.values.proveedorId && !modoNuevoProveedor) return notifications.show({ message: 'Selecciona o crea un proveedor', color: 'red' });

        setIsSubmitting(true);
        try {
            const payload = {
                simular: true,
                proveedorId: modoNuevoProveedor ? null : Number(formCompra.values.proveedorId),
                nuevoProveedor: modoNuevoProveedor ? formNuevoProv.values : null,
                tipoDocumento: formCompra.values.tipoDocumento,
                numeroDocumento: formCompra.values.numeroDocumento,
                fechaFactura: formCompra.values.fechaFactura,
                condicionPago: formCompra.values.condicionPago,
                diasCredito: formCompra.values.diasCredito,
                moneda: formCompra.values.moneda,
                tasaCambio: tasaBcv,
                subtotal, montoIva, montoRetencion, totalFinal,
                numeroControl: esFactura ? formCompra.values.numeroControl : null, montoExento: esFactura ? montoExento : 0, porcentajeRetencion: formCompra.values.porcentajeRetencion, aplicarRetencion: Boolean(formCompra.values.aplicarRetencion),
                detalles: carritoCompra
            };

            const res = await fetch('/api/compras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al simular la compra');

            setDatosSimulacion(data.detallesSimulacion);
            setPromptTexto(data.mensajePrompt);
            setModalSimulacionAbierto(true);

        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // El gasto no pasa por la auditoría de costos (no hay productos): se valida y se registra directo
    const handleRegistrarGasto = () => {
        if (!formCompra.values.numeroDocumento) return notifications.show({ message: 'Indica el número de factura o recibo', color: 'red' });
        if (!formCompra.values.proveedorId && !modoNuevoProveedor) return notifications.show({ message: 'Selecciona o crea un proveedor', color: 'red' });
        if (String(gasto.descripcion).trim().length < 3) return notifications.show({ message: 'Describe en qué fue el gasto', color: 'red' });
        if (!gasto.categoriaId) return notifications.show({ message: 'Elige la categoría del gasto', color: 'red' });
        if (!(subtotal > 0)) return notifications.show({ message: 'Indica el monto del gasto', color: 'red' });
        return handleEjecutarCompraFinal();
    };

    const handleEjecutarCompraFinal = async () => {
        setIsSubmitting(true);
        try {
            // Primero se guarda el empaque corregido en la ficha: si falla, no se registra la compra con unidades dudosas
            if (!esGasto) {
                for (const item of carritoCompra.filter(empaqueCambio)) {
                    const r = await fetch(`/api/productos/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.undPorCaja ? { unidadesPorCaja: item.undPorCaja, cajasPorBulto: item.cajasPorBulto || null } : { unidadesPorCaja: null, cajasPorBulto: null, unidadesPorBulto: item.undPorBulto > 1 ? item.undPorBulto : null }) });
                    if (!r.ok) throw new Error(`No se pudo guardar el empaque de ${item.nombre}: ${(await r.json().catch(() => null))?.error || 'error del servidor'}`);
                }
            }
            const payload = {
                simular: false,
                proveedorId: modoNuevoProveedor ? null : Number(formCompra.values.proveedorId),
                nuevoProveedor: modoNuevoProveedor ? formNuevoProv.values : null,
                tipoDocumento: formCompra.values.tipoDocumento,
                numeroDocumento: formCompra.values.numeroDocumento,
                fechaFactura: formCompra.values.fechaFactura,
                condicionPago: formCompra.values.condicionPago,
                diasCredito: formCompra.values.diasCredito,
                moneda: formCompra.values.moneda,
                tasaCambio: tasaBcv,
                metodoPago: formCompra.values.metodoPago,
                referencia: formCompra.values.referencia,
                subtotal, montoIva, montoRetencion, totalFinal,
                numeroControl: esFactura ? formCompra.values.numeroControl : null, montoExento: esFactura ? montoExento : 0, porcentajeRetencion: formCompra.values.porcentajeRetencion, aplicarRetencion: Boolean(formCompra.values.aplicarRetencion),
                registradoPorId: userId,
                esGasto, descripcionGasto: esGasto ? gasto.descripcion : null, categoriaGastoId: esGasto ? Number(gasto.categoriaId) : null,
                detalles: esGasto ? [] : carritoCompra
            };

            const res = await fetch('/api/compras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) {
                if (data.codigo) queryClient.invalidateQueries({ queryKey: ['numeracion'] }); // falta configurar la numeración de retenciones
                throw new Error(data.error || 'Error al registrar la compra');
            }

            notifications.show({ title: 'Éxito', message: `${esGasto ? 'Gasto registrado (no afecta el inventario).' : 'Factura registrada, inventario y costos actualizados.'}${data.comprobanteRetencion ? ` Comprobante de retención de IVA: ${data.comprobanteRetencion}` : ''}`, color: 'green', autoClose: 9000 });
            queryClient.invalidateQueries(['productos-compra']);
            setCarritoCompra([]);
            setGasto({ descripcion: '', categoriaId: null, base: 0, exento: 0 });
            setModalSimulacionAbierto(false);
            onClose();

        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const opcionesProveedores = useMemo(() => proveedores?.map(p => ({ value: String(p.id), label: `${p.nombre} (RIF: ${p.identificacion})` })) || [], [proveedores]);
    const busquedaDiferida = useDeferredValue(busquedaProd);
    const coincidencias = useMemo(() => buscarProductos(productos, busquedaDiferida), [productos, busquedaDiferida]);
    const productosFiltrados = useMemo(() => coincidencias.slice(0, MAX_LISTA), [coincidencias]);
    const hayMas = coincidencias.length > MAX_LISTA;

    const sim = formCompra.values.moneda === 'BS' ? 'Bs' : '$';
    const accionRegistrar = esGasto ? handleRegistrarGasto : handleLanzarSimulacion;
    const registroBloqueado = (esGasto ? !(subtotal > 0) : carritoCompra.length === 0) || faltaNumeracionRet || (esBs && !(tasa > 0));
    const labelBoton = esGasto ? 'Registrar gasto' : 'Analizar compra y costos';

    // ---- Declaración de responsabilidad (una línea en escritorio) ----
    const declaracion = !esGasto && (
        <Alert icon={<IconShieldCheck size={isMobile ? 16 : 18} />} color="red" variant="light" mb={isMobile ? 6 : 0} py={isMobile ? undefined : 6} px="sm" p={isMobile ? 'xs' : undefined}
            title={isMobile ? 'Declaración de Responsabilidad de Recepción' : undefined}
            styles={isMobile ? { title: { fontSize: 12, textTransform: 'none' }, message: { fontSize: 11, lineHeight: 1.3 } } : { icon: { marginRight: 8 } }}>
            {isMobile
                ? 'Al registrar y firmar esta factura, certifica bajo su estricta responsabilidad que la mercancía física ingresada al almacén ha sido contada y validada.'
                : <Text size="xs"><b>Declaración de responsabilidad de recepción:</b> al registrar y firmar esta factura certifica, bajo su estricta responsabilidad, que la mercancía física ingresada al almacén ha sido contada y validada.</Text>}
        </Alert>
    );

    // ---- Aviso del primer comprobante de retención ----
    const avisoRetencion = faltaNumeracionRet && (
        <Paper radius="md" p={isMobile ? 'sm' : 'md'}
            style={{ background: 'linear-gradient(135deg, var(--mantine-color-orange-0), #fff 70%)', border: '1px solid var(--mantine-color-orange-3)', borderLeft: '5px solid var(--mantine-color-orange-6)', flex: '0 0 auto' }}>
            <Group align="flex-start" wrap={isMobile ? 'wrap' : 'nowrap'} gap="md">
                <ThemeIcon size={isMobile ? 34 : 44} radius="xl" color="orange" variant="light" style={{ flex: '0 0 auto' }}><IconReceiptTax size={isMobile ? 20 : 26} /></ThemeIcon>
                <Box style={{ flex: 1, minWidth: 0 }}>
                    <Group gap="xs" mb={2}>
                        <Text fw={800} size={isMobile ? 'sm' : 'md'}>Primer comprobante de retención de IVA</Text>
                        <Badge color="orange" variant="light" size="sm">Una sola vez</Badge>
                    </Group>
                    <Text size="sm" c="dimmed" mb="sm">Esta factura retiene IVA y su comprobante lleva su propio correlativo. Indica con qué número sale el próximo{serieRet.periodo ? <> (empieza por <b>{serieRet.periodo}</b>)</> : null}; luego el sistema lo lleva solo.</Text>
                    <PreguntarNumero serie={serieRet} puedeEditar={numeracion.puedeEditar} enLinea />
                </Box>
            </Group>
        </Paper>
    );

    // ---- Catálogo de productos disponibles ----
    const panelCatalogo = !esGasto && (
        <Paper withBorder p={isMobile ? 'xs' : 'sm'} radius="md" h={isMobile ? 260 : undefined}
            style={{ display: 'flex', flexDirection: 'column', ...(isMobile ? {} : { flex: '0 0 clamp(300px, 28%, 420px)', minHeight: 0 }) }}>
            {!isMobile && <Group justify="space-between" mb={6}><Text fw={700} size="sm">Productos disponibles</Text><Text size="xs" c="dimmed">{coincidencias.length} encontrados</Text></Group>}
            <TextInput size="sm" placeholder="Buscar producto por nombre o SKU..." mb={isMobile ? 6 : 'xs'} value={busquedaProd} onChange={(e) => setBusquedaProd(e.currentTarget.value)} data-autofocus />
            <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
                <Stack gap={6}>
                    {productosFiltrados.map(prod => <FilaProducto key={prod.id} prod={prod} isMobile onAgregar={agregarAlCarritoCompra} />)}
                    {hayMas && <Text size="xs" c="dimmed" ta="center">Mostrando {MAX_LISTA} de {coincidencias.length}: escribe para afinar la búsqueda.</Text>}
                </Stack>
            </ScrollArea>
        </Paper>
    );

    // ---- Datos del documento (proveedor, factura, fecha, moneda, retención) ----
    const datosDocumento = (
        <Box style={{ flex: '0 0 auto' }}>
            <Group justify="space-between" align="center" mb={isMobile ? 6 : 'xs'} wrap="nowrap">
                <SegmentedControl size="xs" fullWidth={isMobile} style={isMobile ? { flex: 1 } : undefined} value={esGasto ? 'gasto' : 'mercancia'} onChange={(v) => setEsGasto(v === 'gasto')}
                    data={[{ value: 'mercancia', label: isMobile ? 'Mercancía' : 'Compra de mercancía (inventario)' }, { value: 'gasto', label: isMobile ? 'Gasto' : 'Gasto (no afecta el inventario)' }]} />
            </Group>
            <Grid gutter="xs" align="flex-end">
                <Grid.Col span={{ base: 12, md: 5 }}>
                    <Group gap="xs" wrap="nowrap" align="flex-end">
                        <Select size="sm" style={{ flex: 1, minWidth: 0 }} label="Proveedor" placeholder="Seleccione proveedor..." searchable data={opcionesProveedores} {...formCompra.getInputProps('proveedorId')} />
                        <Button size="sm" variant="light" color="grape" tt="none" style={{ flex: '0 0 auto' }} onClick={() => setModalCrearProv(true)}>+ Nuevo</Button>
                    </Group>
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 3 }}>
                    <Select size="sm" label="Tipo de documento" allowDeselect={false}
                        data={[{ value: 'FACTURA', label: 'Factura (aplica IVA)' }, { value: 'NOTA_ENTREGA', label: 'Nota de entrega' }]}
                        {...formCompra.getInputProps('tipoDocumento')} />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 2 }}>
                    <TextInput size="sm" label="Nro. factura / recibo" placeholder="F-98765" withAsterisk {...formCompra.getInputProps('numeroDocumento')} />
                </Grid.Col>
                {esFactura && (
                    <Grid.Col span={{ base: 12, md: 2 }}>
                        <TextInput size="sm" label="Nro. de control" placeholder="00-009497" {...formCompra.getInputProps('numeroControl')} />
                    </Grid.Col>
                )}
                <Grid.Col span={{ base: 6, md: 2 }}>
                    <TextInput size="sm" type="date" label="Fecha de factura" withAsterisk {...formCompra.getInputProps('fechaFactura')} />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 2 }}>
                    <Select size="sm" label="Condición de pago" allowDeselect={false} data={[{ value: 'Contado', label: 'Contado' }, { value: 'Credito', label: 'Crédito' }]} {...formCompra.getInputProps('condicionPago')} />
                </Grid.Col>
                {formCompra.values.condicionPago === 'Credito' && (
                    <Grid.Col span={{ base: 6, md: 2 }}>
                        <NumberInput size="sm" label="Días de crédito" min={1} withAsterisk {...formCompra.getInputProps('diasCredito')} />
                    </Grid.Col>
                )}
                <Grid.Col span={{ base: 6, md: 2 }}>
                    <Select size="sm" label="Moneda" allowDeselect={false} data={[{ value: 'USD', label: 'USD ($)' }, { value: 'BS', label: 'Bs' }]} {...formCompra.getInputProps('moneda')} onChange={cambiarMoneda} />
                </Grid.Col>
                {esFactura && montoIva > 0 && (
                    <Grid.Col span={{ base: 12, md: 'auto' }}>
                        <Group gap="sm" wrap="nowrap" align="center" h={36}>
                            <Checkbox label={<Text fw={600} size="sm">Retener IVA</Text>} {...formCompra.getInputProps('aplicarRetencion', { type: 'checkbox' })} />
                            {formCompra.values.aplicarRetencion && (
                                <Select size="sm" allowDeselect={false} data={[{ value: '75', label: '75%' }, { value: '100', label: '100%' }]} w={84} {...formCompra.getInputProps('porcentajeRetencion')} />
                            )}
                        </Group>
                    </Grid.Col>
                )}
            </Grid>
            {esBs && (
                <Alert color="blue" variant="light" mt="xs" py={6} px="sm">
                    <Text size="xs">{tasa > 0 ? <>Factura en <b>bolívares</b>. Tasa BCV de hoy: <b>Bs {tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</b> por dólar. Escribe los precios tal como vienen en la factura (Bs); el costo del producto se guarda en dólares y aquí ves el costo actual y el de esta factura en ambas monedas.</> : <b>No hay tasa BCV vigente: no se puede registrar una factura en bolívares.</b>}</Text>
                </Alert>
            )}
            {!esFactura && <Text size="xs" c="dimmed" mt="xs">La nota de entrega no es un documento fiscal: se registra sin IVA, sin retención y sin número de control, y no entra al libro de compras. {esGasto ? 'Al ser un gasto, no mueve el inventario.' : 'El inventario y el costo se actualizan igual.'}</Text>}
        </Box>
    );

    // ---- Datos del gasto ----
    const camposGasto = (
        <Stack gap="sm">
            <TextInput size="sm" label="¿En qué fue el gasto?" placeholder="Ej: Flete de Maracaibo, alquiler del galpón, reparación del montacargas" withAsterisk maxLength={200}
                value={gasto.descripcion} onChange={(e) => setGasto({ ...gasto, descripcion: e.currentTarget.value })} />
            <Select size="sm" label="Categoría del gasto" placeholder="Elige la categoría" searchable withAsterisk
                data={(categoriasGasto || []).map((c) => ({ value: String(c.id), label: c.nombre }))}
                value={gasto.categoriaId} onChange={(v) => setGasto({ ...gasto, categoriaId: v })}
                nothingFoundMessage="No hay categorías de gasto: créalas en Finanzas" />
            <Group grow align="flex-start">
                <NumberInput size="sm" label="Monto con IVA (base imponible)" description={esFactura ? `Se le suma el IVA ${CONFIG_FISCAL.alicuotaGeneral}%` : 'La nota de entrega no lleva IVA'} min={0} decimalScale={2} hideControls
                    value={gasto.base} onChange={(v) => setGasto({ ...gasto, base: v })} />
                <NumberInput size="sm" label="Monto exento (sin IVA)" min={0} decimalScale={2} hideControls
                    value={gasto.exento} onChange={(v) => setGasto({ ...gasto, exento: v })} />
            </Group>
        </Stack>
    );

    // ---- Productos seleccionados: tarjetas en móvil ----
    const listaMovil = (
        <Stack gap={6} mb="sm">
            {carritoCompra.length === 0 && <Text size="sm" c="dimmed" ta="center" py="md">Toca un producto de la lista para agregarlo.</Text>}
            {carritoCompra.map(item => {
                const costoAntMon = aMon(item.costoAnterior);
                const diferencia = item.precioCompraUnitario - costoAntMon;
                const variacionPorcentual = costoAntMon > 0 ? ((diferencia / costoAntMon) * 100).toFixed(1) : 100;
                return (
                    <Paper key={item.id} withBorder p="xs" radius="md">
                        <Group justify="space-between" wrap="nowrap" align="flex-start" mb={4}>
                            <Box style={{ minWidth: 0, flex: 1 }}>
                                <Text fw={700} size="sm" lineClamp={2} lh={1.25}>{item.nombre}</Text>
                                <Text size="xs" c="dimmed">{item.marca ? `${item.marca} · ` : ''}SKU: {item.codigo} · costo ant. <PrecioVisual valor={item.costoAnterior} simbolo="$" size="xs" c="dimmed" />{esBs && <> · <PrecioVisual valor={costoAntMon} simbolo="Bs" size="xs" c="dimmed" /></>}</Text>
                            </Box>
                            <ActionIcon color="red" variant="subtle" size="md" onClick={() => eliminarItem(item.id)}><IconTrash size={18}/></ActionIcon>
                        </Group>
                        <SegmentedControl
                            fullWidth size="xs" mb={6} value={item.unidadCompra} onChange={(v) => cambiarUnidadCompra(item.id, v)}
                            data={[
                                { value: 'unidad', label: 'Unidades' },
                                ...(item.undPorCaja > 0 ? [{ value: 'caja', label: `Caja (${item.undPorCaja})` }] : []),
                                ...(item.undPorBulto > 1 ? [{ value: 'bulto', label: `Bulto (${item.undPorBulto})` }] : []),
                            ]}
                        />
                        <Group gap={8} wrap="nowrap" align="flex-start">
                            <Group gap={4} wrap="nowrap">
                                <ActionIcon size="lg" variant="light" onClick={() => cambiarCantidad(item.id, -1)}><IconMinus size={16}/></ActionIcon>
                                <NumberInput value={item.cantidadCompra} onChange={(v) => actualizarCantidadCompra(item.id, v)} onBlur={() => confirmarCantidadCompra(item.id)} selectAllOnFocus inputMode="numeric" min={1} allowDecimal={false} allowNegative={false} hideControls w={70} size="sm" styles={{ input: { textAlign: 'center', paddingInline: 4 } }} />
                                <ActionIcon size="lg" variant="light" onClick={() => cambiarCantidad(item.id, 1)}><IconPlus size={16}/></ActionIcon>
                            </Group>
                            <Box style={{ flex: 1, minWidth: 0 }}>
                                <NumberInput value={item.precioCompra} onChange={(val) => actualizarPrecioCompra(item.id, val)} decimalScale={4} size="sm" leftSection={esBs ? 'Bs' : '$'} leftSectionWidth={esBs ? 36 : undefined} />
                            </Box>
                        </Group>
                        <EditorEmpaque item={item} onCambiar={(c, v) => cambiarEmpaque(item.id, c, v)} />
                        <Text size="xs" c="dimmed" mt={4}>
                            por {item.unidadCompra}{item.unidadCompra !== 'unidad' ? ` = ${item.cantidad.toLocaleString('es-VE')} und · ${item.precioCompraUnitario.toFixed(4)} c/u` : ''}
                            {esBs && tasa > 0 && ` · ≈ $${(item.precioCompraUnitario / tasa).toFixed(4)} c/u`}
                            {diferencia !== 0 && <Text span size="xs" fw={700} c={diferencia > 0 ? 'red' : 'teal'}> · {diferencia > 0 ? `▲ +${variacionPorcentual}%` : `▼ ${variacionPorcentual}%`}</Text>}
                        </Text>
                    </Paper>
                );
            })}
        </Stack>
    );

    // ---- Productos seleccionados: tabla compacta con cabecera fija en escritorio ----
    const tablaEscritorio = (
        <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
            <Table stickyHeader highlightOnHover verticalSpacing={6} horizontalSpacing="sm">
                <Table.Thead style={{ background: 'var(--mantine-color-gray-0)', zIndex: 2 }}>
                    <Table.Tr>
                        <Table.Th>Producto</Table.Th>
                        <Table.Th>¿Qué recibes?</Table.Th>
                        <Table.Th>Costo actual / und</Table.Th>
                        <Table.Th>Precio de compra</Table.Th>
                        <Table.Th ta="right">Subtotal</Table.Th>
                        <Table.Th w={44}></Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {carritoCompra.length === 0 && (
                        <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center" py={60}>Aún no hay productos. Elige uno de la lista de la izquierda para agregarlo.</Text></Table.Td></Table.Tr>
                    )}
                    {carritoCompra.map(item => {
                        const costoAntMon = aMon(item.costoAnterior);
                const diferencia = item.precioCompraUnitario - costoAntMon;
                        const variacionPorcentual = costoAntMon > 0 ? ((diferencia / costoAntMon) * 100).toFixed(1) : 100;
                        return (
                            <Table.Tr key={item.id}>
                                <Table.Td style={{ maxWidth: 260 }}>
                                    <Text fw={600} size="sm" lineClamp={2} lh={1.25}>{item.nombre}</Text>
                                    <Text size="xs" c="dimmed">{item.marca ? `${item.marca} · ` : ''}SKU: {item.codigo}</Text>
                                </Table.Td>
                                <Table.Td>
                                    <Stack gap={4} align="flex-start">
                                        <SegmentedControl
                                            size="xs" value={item.unidadCompra} onChange={(v) => cambiarUnidadCompra(item.id, v)}
                                            data={[
                                                { value: 'unidad', label: 'Und' },
                                                ...(item.undPorCaja > 0 ? [{ value: 'caja', label: `Caja (${item.undPorCaja})` }] : []),
                                                ...(item.undPorBulto > 1 ? [{ value: 'bulto', label: `Bulto (${item.undPorBulto})` }] : []),
                                            ]}
                                        />
                                        <Group gap={6} wrap="nowrap">
                                            <ActionIcon size="md" variant="light" onClick={() => cambiarCantidad(item.id, -1)}><IconMinus size={14}/></ActionIcon>
                                            <NumberInput value={item.cantidadCompra} onChange={(v) => actualizarCantidadCompra(item.id, v)} onBlur={() => confirmarCantidadCompra(item.id)} selectAllOnFocus inputMode="numeric" min={1} allowDecimal={false} allowNegative={false} hideControls w={72} size="sm" styles={{ input: { textAlign: 'center', paddingInline: 4 } }} />
                                            <ActionIcon size="md" variant="light" onClick={() => cambiarCantidad(item.id, 1)}><IconPlus size={14}/></ActionIcon>
                                            {item.unidadCompra !== 'unidad' && <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>= {item.cantidad.toLocaleString('es-VE')} und</Text>}
                                        </Group>
                                        <EditorEmpaque item={item} onCambiar={(c, v) => cambiarEmpaque(item.id, c, v)} />
                                    </Stack>
                                </Table.Td>
                                <Table.Td>
                                    <PrecioVisual valor={item.costoAnterior} simbolo="$" size="sm" c="dimmed" />
                                    {esBs && <PrecioVisual valor={costoAntMon} simbolo="Bs" size="sm" c="dimmed" />}
                                </Table.Td>
                                <Table.Td>
                                    <NumberInput value={item.precioCompra} onChange={(val) => actualizarPrecioCompra(item.id, val)} decimalScale={4} w={esBs ? 150 : 120} size="sm" leftSection={esBs ? 'Bs' : '$'} leftSectionWidth={esBs ? 36 : undefined} />
                                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                                        por {item.unidadCompra}{item.unidadCompra !== 'unidad' ? ` → ${item.precioCompraUnitario.toFixed(4)} c/u` : ''}
                                        {esBs && tasa > 0 && ` · ≈ $${(item.precioCompraUnitario / tasa).toFixed(4)} c/u`}
                                        {diferencia !== 0 && <Text span size="xs" fw={700} c={diferencia > 0 ? 'red' : 'teal'}> · {diferencia > 0 ? `▲ +${variacionPorcentual}%` : `▼ ${variacionPorcentual}%`}</Text>}
                                    </Text>
                                </Table.Td>
                                <Table.Td ta="right"><PrecioVisual valor={item.precioCompraUnitario * item.cantidad} simbolo={sim} size="sm" fw={700} /></Table.Td>
                                <Table.Td><ActionIcon color="red" variant="subtle" size="lg" onClick={() => eliminarItem(item.id)}><IconTrash size={18}/></ActionIcon></Table.Td>
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>
        </ScrollArea>
    );

    const panelSeleccion = (
        <Paper withBorder p="sm" radius="md" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
            <Group justify="space-between" mb={6}>
                <Text fw={700} size="sm">{esGasto ? 'Datos del gasto' : 'Productos seleccionados'}</Text>
                {!esGasto && <Badge variant="light" size="lg">{carritoCompra.length}</Badge>}
            </Group>
            {esGasto ? camposGasto : tablaEscritorio}
        </Paper>
    );

    // ---- Totales y botón de registrar ----
    const pieEscritorio = (
        <Paper withBorder p="sm" radius="md" style={{ flex: '0 0 auto' }}>
            <Group justify="space-between" align="center" wrap="nowrap">
                <Group gap="xl" align="flex-end">
                    <Box><Text size="xs" c="dimmed">Subtotal</Text><PrecioVisual valor={subtotal} simbolo={sim} size="md" fw={600} /></Box>
                    {esFactura && <Box><Text size="xs" c="dimmed">IVA ({CONFIG_FISCAL.alicuotaGeneral}%)</Text><PrecioVisual valor={montoIva} simbolo={sim} size="md" fw={600} /></Box>}
                    {montoRetencion > 0 && (
                        <Box>
                            <Text size="xs" c="red">Retención (−)</Text>
                            <Text c="red" fw={700}><PrecioVisual valor={montoRetencion} simbolo={sim} size="md" fw={700} c="red" /></Text>
                            {serieRet?.configurado && <Text size="xs" c="dimmed">Comprobante N° {periodoRet}{serieRet.siguiente}</Text>}
                        </Box>
                    )}
                    <Box><Text size="xs" c="dimmed">Total</Text><PrecioVisual valor={totalFinal} simbolo={sim} size="xl" fw={900} c="blue.9" /></Box>
                </Group>
                <Button size="lg" color="green.8" leftSection={<IconCheck size={22} />} onClick={accionRegistrar} loading={isSubmitting} disabled={registroBloqueado}>{labelBoton}</Button>
            </Group>
        </Paper>
    );

    const pieMovil = (
        <Box style={{ position: 'sticky', bottom: 0, zIndex: 15, background: '#fff', margin: '6px -8px -8px', padding: '8px 12px calc(8px + env(safe-area-inset-bottom))', boxShadow: '0 -6px 16px rgba(0,0,0,0.12)', borderTop: '1px solid var(--mantine-color-gray-3)' }}>
            <Group justify="space-between" mb={6} wrap="nowrap">
                <Text size="xs" c="dimmed">Subtotal <PrecioVisual valor={subtotal} simbolo={sim} size="xs" />{esFactura && <> · IVA <PrecioVisual valor={montoIva} simbolo={sim} size="xs" /></>}{montoRetencion > 0 && <Text span size="xs" c="red" fw={700}> · Ret. −<PrecioVisual valor={montoRetencion} simbolo={sim} size="xs" /></Text>}</Text>
                <Text fw={900} size="lg" c="blue.9" style={{ whiteSpace: 'nowrap' }}><PrecioVisual valor={totalFinal} simbolo={sim} size="lg" fw={900} c="blue.9" /></Text>
            </Group>
            <Button fullWidth size="md" color="green.8" tt="none" leftSection={<IconCheck size={20} />} onClick={accionRegistrar} loading={isSubmitting} disabled={registroBloqueado}>{labelBoton}</Button>
        </Box>
    );

    return (
        <>
            <Modal opened={opened} onClose={onClose} fullScreen title={<Title order={isMobile ? 5 : 3} c="blue.9" tt={isMobile ? 'none' : undefined}>{esGasto ? 'Registrar gasto' : (isMobile ? 'Registrar compra' : 'Registrar factura / nota de compra (proveedor)')}</Title>}
                styles={isMobile
                    ? { content: { padding: 0 }, header: { padding: '8px 12px', minHeight: 44, background: '#fff', zIndex: 30 }, body: { padding: '0 4px' } }
                    : { content: { display: 'flex', flexDirection: 'column', overflow: 'hidden' }, header: { padding: '10px 20px' }, body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 20px 16px', overflow: 'hidden' } }}>

                {isMobile ? (
                    <Box p={4}>
                        {declaracion}
                        {avisoRetencion && <Box mb={6}>{avisoRetencion}</Box>}
                        <Stack gap="xs">
                            {panelCatalogo}
                            <Paper withBorder p="xs" radius="md">
                                {datosDocumento}
                                <Divider my="xs" />
                                {esGasto ? <Box mb="sm">{camposGasto}</Box> : listaMovil}
                                {pieMovil}
                            </Paper>
                        </Stack>
                    </Box>
                ) : (
                    <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 1800, marginInline: 'auto' }}>
                        {declaracion}
                        {avisoRetencion}
                        <Paper withBorder p="sm" radius="md" style={{ flex: '0 0 auto' }}>{datosDocumento}</Paper>
                        <Box style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>
                            {panelCatalogo}
                            {panelSeleccion}
                        </Box>
                        {pieEscritorio}
                    </Box>
                )}

                {/* MODAL SECUNDARIO: CREAR PROVEEDOR EN CALIENTE */}
                <Modal opened={modalCrearProv} onClose={() => setModalCrearProv(false)} size="lg" title={<Title order={3} c="grape">Registrar Nuevo Proveedor</Title>} centered zIndex={2000}>
                    <form onSubmit={formNuevoProv.onSubmit(async (values) => {
                        try {
                            const res = await fetch('/api/proveedores', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values)
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error);

                            notifications.show({ title: 'Proveedor Creado', message: 'Guardado y seleccionado.', color: 'green' });
                            queryClient.invalidateQueries(['proveedores-compra']);
                            formCompra.setFieldValue('proveedorId', String(data.id));
                            setModalCrearProv(false);
                            formNuevoProv.reset();
                        } catch (err) {
                            notifications.show({ title: 'Error', message: err.message, color: 'red' });
                        }
                    })}>
                        <Stack gap="md">
                            <TextInput size={isMobile ? 'sm' : 'md'} label="RIF" withAsterisk {...formNuevoProv.getInputProps('identificacion')} />
                            <TextInput size={isMobile ? 'sm' : 'md'} label="Razón Social" withAsterisk {...formNuevoProv.getInputProps('nombre')} />
                            <TextInput size={isMobile ? 'sm' : 'md'} label="Teléfono" {...formNuevoProv.getInputProps('telefono')} />
                            <TextInput size={isMobile ? 'sm' : 'md'} label="Email" {...formNuevoProv.getInputProps('email')} />
                            <TextInput size={isMobile ? 'sm' : 'md'} label="Dirección" {...formNuevoProv.getInputProps('direccion')} />
                            <Group grow>
                                <Checkbox label="Contribuyente Especial" size="md" mt={8} {...formNuevoProv.getInputProps('esContribuyenteEspecial', { type: 'checkbox' })} />
                                <Select size={isMobile ? 'sm' : 'md'} label="Retención Default" data={[{ value: '75', label: '75%' }, { value: '100', label: '100%' }]} {...formNuevoProv.getInputProps('retencionIvaPorDefecto', { transform: (v) => Number(v) })} />
                            </Group>
                            <Button size="md" type="submit" color="grape" mt="md">Guardar Proveedor</Button>
                        </Stack>
                    </form>
                </Modal>
            </Modal>

            {/* 🔥 MODAL PROMPT DE DECISIÓN DE PRECIOS PONDERADOS AMPLIADO A FULLSCREEN 🔥 */}
            <Modal opened={modalSimulacionAbierto} onClose={() => setModalSimulacionAbierto(false)} fullScreen title={<Title order={2} c="orange.8"><IconAlertTriangle size={24} style={{verticalAlign: 'middle'}} /> Auditoría de Costos Ponderados y Stock</Title>} zIndex={3000}>
                <Box p="lg" maw={1500} mx="auto">
                    <Stack gap="lg">
                        <Alert color="orange" variant="light" p="md">
                            <Text fw={700} size="md">{promptTexto}</Text>
                        </Alert>

                        <ScrollArea h="55vh">
                            <Table striped highlightOnHover verticalSpacing="md">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th><Text size="sm">Producto</Text></Table.Th>
                                        <Table.Th ta="center"><Text size="sm">Stock Previo / Compra</Text></Table.Th>
                                        {!soloRegistro && <>
                                        <Table.Th ta="center"><Text size="sm">Costo Ponderado</Text></Table.Th>
                                        <Table.Th ta="center"><Text size="sm">Aumento</Text></Table.Th>
                                        <Table.Th><Text size="sm">Precio 6 (Actual ➔ Nuevo)</Text></Table.Th>
                                        <Table.Th><Text size="sm">Precio 7 (Actual ➔ Nuevo)</Text></Table.Th>
                                        <Table.Th ta="center"><Text size="sm">¿Modificar?</Text></Table.Th>
                                        </>}
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {datosSimulacion?.map((sim) => {
                                        const itemCarrito = carritoCompra.find(i => i.id === sim.productoId);
                                        return (
                                            <Table.Tr key={sim.productoId}>
                                                <Table.Td>
                                                    <Text fw={700} size="md">{sim.nombre}</Text>
                                                    <Text size="sm" c="dimmed">SKU: {sim.codigo}</Text>
                                                </Table.Td>
                                                <Table.Td ta="center">
                                                    <Badge size="lg" variant="outline" color="blue">
                                                        Existía: {sim.stockActual} | Entran: +{sim.cantidadComprada}
                                                    </Badge>
                                                </Table.Td>
                                                {!soloRegistro && <>
                                                <Table.Td ta="center">
                                                    <Text size="sm" c="dimmed">Ant: ${sim.costoActual}{esBs && ` · Bs ${(sim.costoActual * tasa).toFixed(2)}`}</Text>
                                                    <Text size="md" fw={700} c="teal">Nuevo: ${sim.nuevoCostoPonderado}{esBs && ` · Bs ${(sim.nuevoCostoPonderado * tasa).toFixed(2)}`}</Text>
                                                </Table.Td>
                                                <Table.Td ta="center">
                                                    <Badge color={sim.porcentajeAumento >= 0 ? 'red' : 'teal'} size="lg" variant="filled">
                                                        {sim.porcentajeAumento >= 0 ? `+${sim.porcentajeAumento}%` : `${sim.porcentajeAumento}%`}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="md">${sim.precio6.actual} ➔ <Text span fw={700} c="blue" size="lg">${sim.precio6.nuevo}</Text></Text>
                                                    {esBs && <Text size="xs" c="dimmed">Bs {(sim.precio6.actual * tasa).toFixed(2)} ➔ Bs {(sim.precio6.nuevo * tasa).toFixed(2)}</Text>}
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="md">${sim.precio7.actual} ➔ <Text span fw={700} c="blue" size="lg">${sim.precio7.nuevo}</Text></Text>
                                                    {esBs && <Text size="xs" c="dimmed">Bs {(sim.precio7.actual * tasa).toFixed(2)} ➔ Bs {(sim.precio7.nuevo * tasa).toFixed(2)}</Text>}
                                                </Table.Td>
                                                <Table.Td ta="center">
                                                    <Checkbox 
                                                        size="md"
                                                        checked={itemCarrito?.aceptarCambioPrecio ?? true}
                                                        onChange={() => toggleAceptarCambioItem(sim.productoId)}
                                                        label="Aceptar"
                                                    />
                                                </Table.Td>
                                                </>}
                                            </Table.Tr>
                                        );
                                    })}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea>

                        <Group justify="flex-end" mt="xl" gap="md">
                            <Button size="lg" variant="default" onClick={() => setModalSimulacionAbierto(false)}>Cancelar</Button>
                            <Button size="lg" color="green" onClick={handleEjecutarCompraFinal} loading={isSubmitting}>
                                Confirmar y Ejecutar Compra
                            </Button>
                        </Group>
                    </Stack>
                </Box>
            </Modal>
        </>
    );
}