'use client';

import { nombreConMarca } from '@/app/constants/nombreConMarca';
import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { 
    Modal, Button, Group, Title, TextInput, NumberInput, 
    Select, Paper, Stack, Grid, Table, ActionIcon, 
    Text, Divider, Badge, Checkbox, Box, ScrollArea, Avatar, ThemeIcon, Textarea,
    Alert, SegmentedControl, SimpleGrid, CloseButton, UnstyledButton
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query'; // 🔥 AÑADIDO useQueryClient
import { useMediaQuery, useViewportSize } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import {
    IconTrash, IconPlus, IconMinus, IconExchange,
    IconPackage, IconReceiptTax, IconCheck, IconTag,
    IconZoomIn, IconZoomOut, IconEdit, IconArrowBackUp, IconFileInvoice,
    IconSearch, IconShoppingCart, IconChevronRight, IconPrinter
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import PrecioVisual from '../ui/PrecioVisual'; 
import SelectorRetencion, { validarRetencion } from './SelectorRetencion';
import { useAuth } from '@/hooks/useAuth';
import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';
import { numeroALetras } from '@/app/utils/numeroALetras';
import { calcularFactura, aBolivares, aDolares, precioPorTarifa } from '@/app/constants/facturacion';
import { CONFIG_FISCAL } from '@/app/constants/empresa';
import { buscarProductos } from '@/app/helpers/busquedaProductos';
import { presentacionesDe, presentacionDe } from '@/app/constants/presentaciones';
import { fechaCaracas, formatearFecha } from '@/app/constants/hora';
import { CONTENIDO_SIN_RELLENO } from '@/app/components/ui/modalMovil';
import CantidadProductoModal from '@/app/components/ui/CantidadProductoModal';

// Precio unitario editable de un renglón (solo administración). Se confirma al salir del campo o con Enter; no cambia el precio del producto,
// solo el de esta venta. Resaltado en naranja cuando difiere del precio del sistema.
function PrecioEditable({ valor, simbolo, editado, onCommit, onRestablecer, size = 'xs' }) {
    const [txt, setTxt] = useState(String(valor));
    useEffect(() => { setTxt(String(valor)); }, [valor]);
    const confirmar = () => {
        const n = Number(txt);
        if (n > 0) { if (n !== Number(valor)) onCommit(n); } else setTxt(String(valor));
    };
    return (
        <Group gap={2} wrap="nowrap" justify="flex-end">
            <NumberInput
                size={size} w={size === 'xs' ? 100 : 112} hideControls decimalScale={3} min={0} allowNegative={false} inputMode="decimal" aria-label="Precio unitario" value={txt} onChange={setTxt}
                prefix={simbolo === 'Bs' ? 'Bs ' : '$'} onBlur={confirmar}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                styles={{ input: { textAlign: 'right', fontWeight: 600, ...(editado ? { borderColor: '#f08c00', backgroundColor: '#fff9db' } : {}) } }}
            />
            {editado && (
                <ActionIcon size={size === 'xs' ? 'sm' : 'lg'} variant="subtle" color="orange" title="Volver al precio del sistema" aria-label="Volver al precio del sistema" onClick={onRestablecer}>
                    <IconArrowBackUp size={size === 'xs' ? 14 : 18} />
                </ActionIcon>
            )}
        </Group>
    );
}

// modo="presupuesto": la misma pantalla de venta, pero solo para cotizar (no hay correlativo, pago ni inventario).
// Un presupuesto siempre cuenta el IVA de cada producto y el cliente es opcional.
// controlInicial: número de control con el que se abre (registrar la factura de un número que faltaba en la secuencia de la forma libre)
// presupuestoEditar: presupuesto ya guardado (con modo="presupuesto"): se carga para modificarlo y al guardar se actualiza el mismo número
export default function PosModal({ opened, onClose, tasaBcv = 1, modo = 'venta', controlInicial = null, presupuestoEditar = null }) {
    const esPresupuesto = modo === 'presupuesto';
    const editando = esPresupuesto && presupuestoEditar ? presupuestoEditar : null;
    const queryClient = useQueryClient(); // 🔥 INSTANCIADO PARA INVALIDAR QUERIES
    const [tipoVenta, setTipoVenta] = useState('DETAL'); 
    const [carrito, setCarrito] = useState([]);
    const [busquedaProducto, setBusquedaProducto] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [guardandoPresupuesto, setGuardandoPresupuesto] = useState(false);
    const router = useRouter();
    const [previewAbierto, setPreviewAbierto] = useState(false);
    
    const [modalFicticio, setModalFicticio] = useState(false);
    const formFicticio = useForm({
        initialValues: { nombre: 'Producto Genérico', precio: '', cantidad: 1, aplicaIva: true }
    });

    // 🔥 ESTADOS Y FORMULARIO PARA NUEVO CLIENTE EN CALIENTE 🔥
    const [modalCrearCliente, setModalCrearCliente] = useState(false);
    const formNuevoCliente = useForm({
        initialValues: {
            identificacion: '',
            nombre: '',
            telefono: '',
            email: '',
            direccion: '',
            notas: ''
        },
        validate: {
        }
    });

    const [zoomPreview, setZoomPreview] = useState(false); // teléfono: false = hoja completa (achicada), true = tamaño real para leer de cerca
    const [vista, setVista] = useState('productos'); // teléfono: 'productos' | 'carrito' | 'datos'

    const { userId, esVendedor, rolUsuario } = useAuth();
    const puedeEditarPrecio = rolUsuario === 'admin'; // el servidor ya obliga a un vendedor a cobrar por tarifa
    // Por debajo de 62em (donde ya no caben las dos columnas) se usa el diseño de teléfono, a pantalla completa.
    // Se lee en el primer render (este componente solo se pinta en el navegador) para que no abra con el diseño de escritorio y salte.
    const isMobile = useMediaQuery('(max-width: 61.99em)', false, { getInitialValueInEffect: false });
    const { width: anchoVentana } = useViewportSize();
    // La vista previa es tamaño carta (8,5 in = 816 px): en el teléfono se achica al ancho de la pantalla
    const escalaHoja = Math.min(1, Math.max(0.3, ((anchoVentana || 816) - 16) / 816));

    const getImageUrl = (path) => {
        if (!path) return null;
        if (path.startsWith('http://') || path.startsWith('https://')) return path;
        const base = process.env.NEXT_PUBLIC_IMG_BASE || '';
        const cleanPath = path.replace(/^\/+/, '');
        const cleanBase = base.replace(/\/+$/, '');
        return `${cleanBase}/${cleanPath}`;
    };

    const fetchSelect = async (url) => {
        const res = await fetch(url);
        if (!res.ok) return [];
        return res.json();
    };

    const { data: productos } = useQuery({ queryKey: ['productos-pos'], queryFn: () => fetchSelect('/api/productos') });
    const { data: clientes } = useQuery({ queryKey: ['clientes-pos'], queryFn: () => fetchSelect('/api/clientes') });
    const { data: correlativos } = useQuery({ queryKey: ['correlativos-pos'], queryFn: () => fetchSelect('/api/correlativos') });

    const formVenta = useForm({
        initialValues: {
            clienteId: null,
            tipoPrecio: 'precio7', 
            conIva: true,
            condicionPago: 'Contado',
            diasCredito: 15, // solo a crédito: arranca con los días del cliente
            metodoPago: 'Efectivo ($)', 
            referencia: '',
            quienRetira: '',
            costoFlete: '',
            numeroDocumento: '',
            numeroControl: '',
            fechaEmision: '', // vacía = hoy; solo administración (copiar un documento que el sistema anterior emitió otro día)
            validoDias: 15, // solo presupuesto
            notas: ''       // solo presupuesto
        }
    });

    // Abierto desde «Números de control»: es una factura (con IVA) y lleva ese número de control
    useEffect(() => {
        if (!opened || !controlInicial) return;
        formVenta.setFieldValue('conIva', true);
        formVenta.setFieldValue('numeroControl', controlInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, controlInicial]);

    // Presupuesto guardado: se cargan sus renglones (precios fijos como estaban, en su moneda), cliente, vigencia y observaciones.
    // Los presupuestos en $ sacados antes con una tarifa en Bs guardaron sus precios en $: se abren con la tarifa equivalente en $.
    useEffect(() => {
        if (!opened || !editando) return;
        const enBs = editando.moneda === 'BS';
        const tarifa = enBs
            ? (['precio4', 'precio5'].includes(editando.tarifa) ? editando.tarifa : 'precio4')
            : ({ precio4: 'precio7', precio5: 'precio6', precio1: 'precio7' }[editando.tarifa] || editando.tarifa || 'precio7');
        formVenta.setValues({ ...formVenta.values, clienteId: editando.clienteId ? String(editando.clienteId) : null, tipoPrecio: tarifa, validoDias: editando.validoDias || 15, notas: editando.notas || '' });
        setCarrito((editando.renglones || []).map((r, i) => {
            const base = { clave: `ed-${i}`, presentacion: 'UNIDAD', unidadesPorPres: 1, cantidadPres: r.cantidad, cantidad: r.cantidad, precio: Number(r.precioUnitario), precioManual: true, simbolo: enBs ? 'Bs' : '$', tieneDescuento: false, afectaInventario: false };
            if (r.productoId) return { ...base, id: r.productoId, nombre: r.nombre, codigo: r.codigo, marcaNombre: r.marca || undefined, porcentajeIva: Number(r.porcentajeIva) || 0, isFicticio: false, afectaInventario: true };
            return { ...base, id: `ficticio-ed-${i}`, nombre: r.nombre, codigo: r.codigo || '1010', aplicaIva: Boolean(r.aplicaIva), isFicticio: true };
        }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, editando?.id]);

    const tipoDocumentoActual = tipoVenta === 'DETAL'
        ? (formVenta.values.conIva ? 'FACTURA' : 'VENTA RAPIDA')
        : (formVenta.values.conIva ? 'FACTURA' : 'NOTA DE ENTREGA');

    useEffect(() => {
        let prefijo = 'V';
        if (tipoDocumentoActual === 'FACTURA') prefijo = 'F';
        if (tipoDocumentoActual === 'NOTA DE ENTREGA') prefijo = 'NE';

        if (correlativos) {
            const corr = correlativos.find(c => c.prefijo === prefijo);
            const num = corr ? corr.siguienteNumero : 1;
            const ceros = corr ? corr.cerosRelleno : 5;
            formVenta.setFieldValue('numeroDocumento', `${prefijo}-${String(num).padStart(ceros, '0')}`);
        } else {
            formVenta.setFieldValue('numeroDocumento', `${prefijo}-00001`);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tipoDocumentoActual, correlativos]);

    const esMonedaBs = ['precio1', 'precio4', 'precio5'].includes(formVenta.values.tipoPrecio);
    const opcionesMetodoPago = esMonedaBs 
        ? ['Efectivo (Bs)', 'Transferencia', 'Pago Móvil', 'Punto de Venta Provincial', 'Punto de Venta Banesco', 'Biopago'] 
        : ['Efectivo ($)', 'Zelle'];

    useEffect(() => {
        const metodoActual = formVenta.values.metodoPago;
        if (esMonedaBs && !opcionesMetodoPago.includes(metodoActual)) {
            formVenta.setFieldValue('metodoPago', 'Efectivo (Bs)');
        } else if (!esMonedaBs && !opcionesMetodoPago.includes(metodoActual)) {
            formVenta.setFieldValue('metodoPago', 'Efectivo ($)');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formVenta.values.tipoPrecio]);

    useEffect(() => {
        if (tipoVenta === 'DETAL') {
            formVenta.setFieldValue('condicionPago', 'Contado');
            formVenta.setFieldValue('clienteId', null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tipoVenta]);

    // ---- Días de crédito: arrancan con los del cliente; solo administración los cambia (de esta factura o también de las futuras del cliente)
    const esCredito = formVenta.values.condicionPago === 'Credito';
    const clienteDelCredito = clientes?.find((c) => c.id.toString() === formVenta.values.clienteId?.toString());
    const diasDelCliente = Number(clienteDelCredito?.diasCredito) > 0 ? Number(clienteDelCredito.diasCredito) : 15;
    const [alcanceDias, setAlcanceDias] = useState(null); // { valor, alcance: 'factura' | 'cliente' } del cambio ya confirmado
    const [preguntarDias, setPreguntarDias] = useState(null); // valor nuevo pendiente de decidir su alcance
    useEffect(() => {
        formVenta.setFieldValue('diasCredito', diasDelCliente);
        setAlcanceDias(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formVenta.values.clienteId, formVenta.values.condicionPago, clienteDelCredito?.diasCredito]);
    // Cliente con crédito habilitado (días y pedidos a crédito mayores a 0): la venta al mayor arranca A CRÉDITO; si no, de contado.
    // Se decide al elegir el cliente y se puede cambiar en el selector «Forma de cobro».
    useEffect(() => {
        if (esPresupuesto || tipoVenta !== 'MAYOR' || !formVenta.values.clienteId) return;
        const c = clientes?.find((x) => x.id.toString() === formVenta.values.clienteId.toString());
        if (!c) return;
        formVenta.setFieldValue('condicionPago', Number(c.diasCredito) > 0 && Number(c.maxPedidosCredito) > 0 ? 'Credito' : 'Contado');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formVenta.values.clienteId]);
    const confirmarDias = () => {
        const v = Math.floor(Number(formVenta.values.diasCredito));
        if (!(v >= 0)) { formVenta.setFieldValue('diasCredito', diasDelCliente); setAlcanceDias(null); return; }
        if (v === diasDelCliente) { setAlcanceDias(null); return; }
        if (alcanceDias?.valor === v) return;
        setPreguntarDias(v);
    };

    // Misma función que usa el servidor para cobrarle a un vendedor: el precio que se ve es el que se acepta.
    // Un vendedor no ve costos, así que el Precio 6 faltante nunca se rellena con el costo.
    const calcularPrecioInfo = (producto, tarifa) => {
        const { precio, moneda, descuento } = precioPorTarifa(producto, tarifa, tasaBcv, { sinCosto: esVendedor });
        return {
            precio,
            simbolo: moneda === 'BS' ? 'Bs' : '$',
            tieneDescuento: descuento > 0,
            porcentajeDescuento: descuento,
        };
    };

    useEffect(() => {
        if (!productos || carrito.length === 0) return;
        setCarrito(prevCarrito => prevCarrito.map(item => {
            if (item.isFicticio) return { ...item, simbolo: esMonedaBs ? 'Bs' : '$' };

            const productoOriginal = productos.find(p => p.id === item.id);
            if (!productoOriginal) return item;
            const info = calcularPrecioInfo(productoOriginal, formVenta.values.tipoPrecio);
            const conservar = item.precioManual && item.simbolo === info.simbolo;
            return { 
                ...item, 
                precio: conservar ? item.precio : info.precio, 
                precioManual: Boolean(conservar),
                simbolo: info.simbolo, 
                tieneDescuento: info.tieneDescuento,
                porcentajeDescuento: info.porcentajeDescuento,
                porcentajeIva: Number(productoOriginal.porcentajeIva) || 0,
                imagen: getImageUrl(productoOriginal.imagen),
                marcaImagen: getImageUrl(productoOriginal.marca?.imagen),
                marcaNombre: productoOriginal.marca?.nombre
            };
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formVenta.values.tipoPrecio, tasaBcv]);


    // Un renglón por producto Y presentación: 2 cajas + 50 sueltas del mismo producto son dos renglones.
    // `cantidad` siempre son UNIDADES (precio, stock y factura no cambian); `cantidadPres` es lo que se pide (2 cajas).
    // En un presupuesto siempre se pregunta cuánto se agrega (unidades o cajas) y a qué precio. En una venta en la computadora el toque
    // agrega una unidad al instante (el precio se cambia en la tabla); en el teléfono, donde la tarjeta del carrito queda lejos,
    // administración también recibe la pregunta con la caja del precio. Un vendedor cobra siempre la tarifa: a él se le agrega al instante.
    const [preguntar, setPreguntar] = useState(null); // { producto, clave }
    const pedirProducto = (producto, presentacion = 'UNIDAD') => {
        if (esPresupuesto || (isMobile && puedeEditarPrecio)) setPreguntar({ producto, clave: presentacion });
        else agregarAlCarrito(producto, presentacion);
    };

    // precioElegido: el que se escribió en la pregunta de cantidad (solo administración); si difiere del de la tarifa, el renglón queda con precio propio
    const agregarAlCarrito = (producto, presentacion = 'UNIDAD', n = 1, precioElegido) => {
        const info = calcularPrecioInfo(producto, formVenta.values.tipoPrecio);
        const pres = presentacionDe(producto, presentacion) || presentacionDe(producto, 'UNIDAD');
        const clave = `${producto.id}:${pres.clave}`;
        const imgProducto = getImageUrl(producto.imagen);
        const imgMarca = getImageUrl(producto.marca?.imagen);
        const conPrecio = puedeEditarPrecio && Number(precioElegido) > 0;
        const manualElegido = conPrecio && Math.abs(Number(precioElegido) - Number(info.precio)) >= 0.0005;

        // Con la función de actualización: dos toques rápidos en el teléfono suman dos (el segundo no pisa al primero)
        setCarrito((prev) => {
            const existe = prev.find(item => item.clave === clave);
            if (existe) return prev.map(item => item.clave === clave ? {
                ...item, cantidadPres: item.cantidadPres + n, cantidad: (item.cantidadPres + n) * pres.unidades,
                precio: conPrecio ? Number(precioElegido) : (item.precioManual ? item.precio : info.precio),
                precioManual: conPrecio ? manualElegido : item.precioManual, simbolo: info.simbolo,
                tieneDescuento: info.tieneDescuento, porcentajeDescuento: info.porcentajeDescuento,
                porcentajeIva: Number(producto.porcentajeIva) || 0,
                imagen: imgProducto, marcaImagen: imgMarca, marcaNombre: producto.marca?.nombre
            } : item);
            return [...prev, {
                id: producto.id, nombre: producto.nombre, codigo: producto.codigo,
                precio: conPrecio ? Number(precioElegido) : info.precio, precioManual: manualElegido, simbolo: info.simbolo,
                tieneDescuento: info.tieneDescuento, porcentajeDescuento: info.porcentajeDescuento,
                porcentajeIva: Number(producto.porcentajeIva) || 0, 
                clave, presentacion: pres.clave, presentacionEtiqueta: pres.etiqueta, unidadesPorPres: pres.unidades, cantidadPres: n, cantidad: n * pres.unidades,
                imagen: imgProducto, marcaImagen: imgMarca, marcaNombre: producto.marca?.nombre,
                isFicticio: false,
                afectaInventario: true
            }];
        });
    };

    const handleAgregarFicticio = (values) => {
        if (!values.precio || Number(values.precio) <= 0) {
            return notifications.show({ message: 'Indica un precio válido', color: 'red' });
        }
        
        setCarrito([...carrito, {
            id: `ficticio-${Date.now()}`,
            clave: `ficticio-${Date.now()}`, presentacion: 'UNIDAD', unidadesPorPres: 1, cantidadPres: Math.max(1, Math.floor(Number(values.cantidad) || 1)),
            isFicticio: true,
            codigo: '1010',
            nombre: values.nombre || 'Producto Genérico',
            precio: Number(values.precio),
            simbolo: esMonedaBs ? 'Bs' : '$',
            cantidad: Math.max(1, Math.floor(Number(values.cantidad) || 1)),
            aplicaIva: values.aplicaIva,
            tieneDescuento: false,
            afectaInventario: false 
        }]);

        setModalFicticio(false);
        formFicticio.reset();
    };

    const cambiarCantidad = (clave, delta) => {
        setCarrito(carrito.map(item => {
            if (item.clave === clave) {
                const nueva = item.cantidadPres + delta;
                return nueva > 0 ? { ...item, cantidadPres: nueva, cantidad: nueva * item.unidadesPorPres } : null;
            }
            return item;
        }).filter(Boolean));
    };

    const setCantidadAbsoluta = (clave, cantidad) => {
        if (cantidad === undefined || cantidad === null || cantidad === '') return;
        const cant = Math.floor(Number(cantidad));
        if (!(cant > 0)) return eliminarItem(clave);
        setCarrito(carrito.map(item => item.clave === clave ? { ...item, cantidadPres: cant, cantidad: cant * item.unidadesPorPres } : item));
    };

    const toggleAfectaInventario = (clave, value) => {
        setCarrito(carrito.map(item => item.clave === clave ? { ...item, afectaInventario: value } : item));
    };

    // Precio solo de esta venta: el del producto no cambia
    const fijarPrecio = (clave, valor) => setCarrito((prev) => prev.map((i) => (i.clave === clave ? { ...i, precio: valor, precioManual: true } : i)));
    const restablecerPrecio = (clave) => setCarrito((prev) => prev.map((i) => {
        if (i.clave !== clave || i.isFicticio) return i;
        const p = productos?.find((x) => x.id === i.id);
        if (!p) return i;
        const info = calcularPrecioInfo(p, formVenta.values.tipoPrecio);
        return { ...i, precio: info.precio, simbolo: info.simbolo, precioManual: false };
    }));
    const eliminarItem = (clave) => setCarrito(carrito.filter(item => item.clave !== clave));

    const conIva = esPresupuesto || Boolean(formVenta.values.conIva);
    const llevaIva = (item) => conIva && (item.isFicticio ? Boolean(item.aplicaIva) : item.porcentajeIva > 0);
    const costoFleteNum = Number(formVenta.values.costoFlete) || 0;
    const factura = carrito.length
        ? calcularFactura({
            renglones: carrito.map((item) => ({ precioUnitario: item.precio, cantidad: item.cantidad, aplicaIva: llevaIva(item), porcentajeIva: item.isFicticio ? undefined : item.porcentajeIva })),
            costoFlete: costoFleteNum,
        })
        : { renglones: [], subtotal: 0, exento: 0, baseImponible: 0, montoIva: 0, totalFinal: 0 };
    const { subtotal, montoIva, totalFinal, baseImponible, exento: totalExento } = factura;
    const montoRenglonDe = (idx) => factura.renglones[idx]?.monto ?? 0;
    const simboloMoneda = esMonedaBs ? 'Bs' : '$';

    const handleRevisarVenta = () => {
        // En el teléfono, si falta algo se abre la parte de la pantalla donde se arregla
        if (carrito.length === 0) { setVista('productos'); return notifications.show({ message: 'El carrito está vacío', color: 'orange' }); }
        if (tipoVenta === 'MAYOR' && !formVenta.values.clienteId) { setVista('datos'); return notifications.show({ message: 'Debe seleccionar un cliente mayorista', color: 'red' }); }
        if (!formVenta.values.numeroDocumento) { setVista('datos'); return notifications.show({ message: 'El número de documento es obligatorio', color: 'red' }); }
        if (tipoDocumentoActual === 'FACTURA' && carrito.length > CONFIG_FISCAL.maxRenglonesFactura) {
            return notifications.show({ title: 'Demasiados renglones', message: `Una factura admite hasta ${CONFIG_FISCAL.maxRenglonesFactura} renglones (es lo que cabe en la forma libre). Divide la venta en dos facturas.`, color: 'orange' });
        }
        
        // Una venta al mayor casi siempre es a crédito: si va de contado se confirma antes de asentar (se registra el pago de una vez)
        if (tipoVenta === 'MAYOR' && formVenta.values.condicionPago === 'Contado' && !window.confirm('Esta venta al MAYOR quedó DE CONTADO: se registrará el pago ahora, sin cuenta por cobrar. ¿Es correcto? (Aceptar = de contado · Cancelar = volver para cambiarla a Crédito)')) {
            setVista('datos');
            return;
        }
        setZoomPreview(false);
        setPreviewAbierto(true);
    };

    // Presupuesto con lo que hay en el carrito: no es documento fiscal, no usa correlativo ni toca inventario.
    // El cliente es opcional y SIEMPRE cuenta el IVA de cada producto (aunque la venta esté marcada sin IVA).
    // Se guarda en la moneda de la tarifa, tal cual se ve en el carrito: P7/P6 en $, P4/P5 (y P1) en Bs a la tasa del día.
    const guardarPresupuesto = async () => {
        if (carrito.length === 0) return notifications.show({ message: 'El carrito está vacío', color: 'orange' });
        // El presupuesto muestra también los montos en la otra moneda a la tasa: sin tasa no se puede guardar
        if (!(tasaBcv > 0)) return notifications.show({ message: 'Todavía no hay tasa BCV: espera un momento e intenta de nuevo', color: 'red' });
        const renglones = carrito.map((item) => ({
            productoId: item.isFicticio ? null : item.id,
            codigo: item.codigo,
            nombre: !item.isFicticio && item.presentacion !== 'UNIDAD' ? `${item.nombre} (${item.cantidadPres} ${item.presentacionEtiqueta})` : item.nombre,
            marca: item.isFicticio ? null : (item.marcaNombre || null),
            cantidad: item.cantidad, // siempre en unidades
            precioUnitario: item.precio,
            aplicaIva: item.isFicticio ? Boolean(item.aplicaIva) : item.porcentajeIva > 0,
            porcentajeIva: item.isFicticio ? undefined : item.porcentajeIva,
        }));
        if (costoFleteNum > 0) renglones.push({ codigo: '', nombre: 'Flete', cantidad: 1, precioUnitario: costoFleteNum, aplicaIva: false });

        setGuardandoPresupuesto(true);
        try {
            const res = await fetch(editando ? `/api/presupuestos/${editando.id}` : '/api/presupuestos', {
                method: editando ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clienteId: clienteSeleccionado?.id || null, clienteNombre: clienteSeleccionado?.nombre || '',
                    tarifa: formVenta.values.tipoPrecio, moneda: esMonedaBs ? 'BS' : 'USD', tasaCambio: tasaBcv, renglones,
                    ...(esPresupuesto ? { validoDias: formVenta.values.validoDias, notas: formVenta.values.notas } : {}),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo guardar el presupuesto');
            notifications.show({ color: 'teal', title: editando ? 'Presupuesto modificado' : 'Presupuesto guardado', message: data.numero });
            setCarrito([]);
            formVenta.reset();
            // En modo presupuesto esta pantalla ES la página de nuevo presupuesto (su onClose vuelve a la lista):
            // se reemplaza por el presupuesto guardado. Desde una venta se cierra el POS y se abre el presupuesto.
            if (esPresupuesto) return router.replace(`/superuser/presupuestos/${data.id}`);
            onClose();
            router.push(`/superuser/presupuestos/${data.id}`);
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setGuardandoPresupuesto(false);
        }
    };

    const handleProcesarVenta = async () => {
        setIsSubmitting(true);
        try {
            const payload = {
                vendedorId: userId,
                tipoPrecio: formVenta.values.tipoPrecio, // el servidor recalcula el precio de un vendedor con esta tarifa
                tipoVenta,
                tipoDocumento: tipoDocumentoActual === 'VENTA RAPIDA' ? 'VENTA_RAPIDA' : (tipoDocumentoActual === 'NOTA DE ENTREGA' ? 'NOTA_ENTREGA' : 'FACTURA'),
                numeroDocumentoManual: formVenta.values.numeroDocumento,
                numeroControl: tipoDocumentoActual === 'FACTURA' ? formVenta.values.numeroControl : null,
                fechaEmision: puedeEditarPrecio && formVenta.values.fechaEmision ? formVenta.values.fechaEmision : undefined,
                clienteId: formVenta.values.clienteId ? Number(formVenta.values.clienteId) : null,
                moneda: simboloMoneda === 'Bs' ? 'BS' : 'USD',
                tasaCambio: tasaBcv,
                condicionPago: formVenta.values.condicionPago,
                ...(esCredito ? { diasCredito: Math.floor(Number(formVenta.values.diasCredito)), actualizarDiasCliente: alcanceDias?.alcance === 'cliente' && alcanceDias.valor === Math.floor(Number(formVenta.values.diasCredito)) } : {}),
                metodoPago: formVenta.values.condicionPago === 'Contado' ? formVenta.values.metodoPago : null,
                referencia: formVenta.values.condicionPago === 'Contado' ? (formVenta.values.referencia || null) : null,
                quienRetira: formVenta.values.quienRetira || null, 
                costoFlete: costoFleteNum,                         
                subtotal, montoIva, totalFinal,
                detalles: carrito.map(item => ({
                    productoId: item.isFicticio ? null : item.id, 
                    isFicticio: item.isFicticio || false,
                    nombreFicticio: item.isFicticio ? item.nombre : null,
                    cantidad: item.cantidad, // siempre en unidades
                    presentacionPedida: item.isFicticio ? null : item.presentacion,
                    cantidadPresentacion: item.isFicticio ? null : item.cantidadPres,
                    precioUnitario: item.precio, 
                    subtotal: montoRenglonDe(carrito.indexOf(item)),
                    aplicaIva: formVenta.values.conIva ? (item.isFicticio ? item.aplicaIva : item.porcentajeIva > 0) : false,
                    afectaInventario: item.afectaInventario 
                }))
            };

            const res = await fetch('/api/ventas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al procesar la venta');

            // Se ofrece imprimir de una vez. Va en un aviso con botón (y no se abre sola) porque el navegador bloquea ventanas que no vienen de un toque;
            // el aviso sobrevive al cierre de esta pantalla
            notifications.show({
                id: `venta-${data.ventaId}`, color: 'green', autoClose: 20000, withCloseButton: true,
                title: `Venta registrada: ${data.numeroDocumento}`,
                message: (
                    <Group gap="sm" mt={4}>
                        <Button size="xs" color="blue.8" leftSection={<IconPrinter size={14} />}
                            onClick={() => { window.open(`/superuser/ventas/imprimir/${data.ventaId}`, '_blank'); notifications.hide(`venta-${data.ventaId}`); }}>
                            Imprimir ahora
                        </Button>
                    </Group>
                ),
            });
            // El próximo número de documento y el stock cambiaron: la siguiente venta debe verlos al día
            queryClient.invalidateQueries({ queryKey: ['correlativos-pos'] });
            queryClient.invalidateQueries({ queryKey: ['clientes-pos'] }); // por si cambiaron los días de crédito del cliente
            queryClient.invalidateQueries({ queryKey: ['productos-pos'] });
            queryClient.invalidateQueries({ queryKey: ['ventas'] });

            setCarrito([]);
            formVenta.reset();
            setPreviewAbierto(false);
            onClose();

        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // La búsqueda difusa recorre todo el catálogo: se calcula solo cuando cambia el texto, no en cada cambio del formulario o del carrito
    const busquedaDiferida = useDeferredValue(busquedaProducto);
    const productosFiltrados = useMemo(() => buscarProductos(productos, busquedaDiferida).slice(0, 20), [productos, busquedaDiferida]);
    // Unidades de cada producto que ya están en el carrito: la lista las marca para que se vea que el toque sirvió
    const unidadesEnCarrito = useMemo(() => {
        const m = new Map();
        carrito.forEach((i) => { if (!i.isFicticio) m.set(i.id, (m.get(i.id) || 0) + i.cantidad); });
        return m;
    }, [carrito]);
    const opcionesClientes = useMemo(
        () => clientes?.map(c => ({ value: c.id.toString(), label: `${c.nombre} (${tipoVenta === 'MAYOR' ? 'RIF' : 'C.I./RIF'}: ${c.identificacion})` })) || [],
        [clientes, tipoVenta]
    );

    const tituloDocumento = tipoDocumentoActual === 'FACTURA' ? 'Factura' : (tipoDocumentoActual === 'NOTA DE ENTREGA' ? 'Nota de Entrega' : 'Recibo de Venta');
    
    const aBs = (v) => (esMonedaBs ? v : aBolivares(v, tasaBcv));
    const aUsd = (v) => (esMonedaBs ? aDolares(v, tasaBcv) : v);
    const prevTotalBs = aBs(totalFinal);
    const prevTotalUsd = aUsd(totalFinal);
    const prevIvaBs = aBs(montoIva);
    const prevIvaUsd = aUsd(montoIva);
    const prevExentoBs = aBs(totalExento);
    const prevExentoUsd = aUsd(totalExento);
    const prevBaseBs = aBs(baseImponible);
    const prevBaseUsd = aUsd(baseImponible);
    
    const clienteSeleccionado = clientes?.find(c => c.id.toString() === formVenta.values.clienteId?.toString());
    const formatoNumero = (num) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num || 0);
    const fechaEmision = formatearFecha(formVenta.values.fechaEmision ? new Date(`${formVenta.values.fechaEmision}T12:00:00-04:00`) : new Date());

    const limiteMediaCarta = 8;
    const cantidadArticulos = carrito.length || 0;
    const altoPapel = cantidadArticulos <= limiteMediaCarta ? '5.5in' : '10.5in';

    // ---------------- Piezas de la pantalla (las mismas en el teléfono y en la computadora) ----------------
    const esFactura = tipoDocumentoActual === 'FACTURA';
    const tamCampo = isMobile ? 'md' : 'sm'; // en el teléfono, campos más altos (se tocan con el dedo y la letra no obliga a acercar)
    const opcionesTarifa = [
        { value: 'precio7', label: 'P7 (Detal USD)' },
        { value: 'precio6', label: 'P6 (Mayor USD)' },
        // P4/P5: P7/P6 en Bs a la tasa del día (el presupuesto en Bs se guarda en Bs y muestra el equivalente en $)
        { value: 'precio4', label: 'P4 (P7 en Bs)' },
        { value: 'precio5', label: 'P5 (P6 en Bs)' },
        ...(esVendedor || esPresupuesto ? [] : [{ value: 'precio1', label: 'P1 (35% en Bs)' }]), // deriva del costo: solo administración y solo en ventas
    ];
    const etiquetaTarifa = opcionesTarifa.find((o) => o.value === formVenta.values.tipoPrecio)?.label || '';

    // Precio que se propone al preguntar la cantidad: el de la tarifa, con botones para los otros precios del producto en la misma moneda
    // (P7/P6 en $, P4/P5 en Bs) y el total del renglón también en la otra moneda a la tasa del día
    const CORTO_TARIFA = { precio7: 'P7 Detal', precio6: 'P6 Mayor', precio4: 'P4 Detal', precio5: 'P5 Mayor', precio1: 'P1' };
    const precioPregunta = (producto) => {
        const tarifa = formVenta.values.tipoPrecio;
        const info = calcularPrecioInfo(producto, tarifa);
        const mismas = (esMonedaBs ? ['precio4', 'precio5', 'precio1'] : ['precio7', 'precio6']).filter((t) => opcionesTarifa.some((o) => o.value === t));
        return {
            valor: info.precio, simbolo: info.simbolo, editable: puedeEditarPrecio, etiqueta: etiquetaTarifa,
            opciones: mismas.map((t) => ({ etiqueta: CORTO_TARIFA[t], valor: calcularPrecioInfo(producto, t).precio })),
            equivalente: tasaBcv > 0 ? (v) => (esMonedaBs ? `≈ $${formatoNumero(aDolares(v, tasaBcv))}` : `≈ Bs ${formatoNumero(aBolivares(v, tasaBcv))}`) : null,
        };
    };
    const esEfectivo = ['Efectivo ($)', 'Efectivo (Bs)'].includes(formVenta.values.metodoPago);
    const unidadesCarrito = carrito.reduce((a, i) => a + i.cantidad, 0);
    // Lo que se cobra en la otra moneda (a la tasa de hoy): la persona en caja lo ve sin hacer la cuenta
    const equivalenteTotal = tasaBcv > 0 && totalFinal > 0 ? (esMonedaBs ? `≈ $${formatoNumero(prevTotalUsd)}` : `≈ Bs ${formatoNumero(prevTotalBs)}`) : null;
    const esExento = (item) => (item.isFicticio ? !item.aplicaIva : item.porcentajeIva === 0);

    const selectorTipoVenta = !esPresupuesto && (isMobile ? (
        <SegmentedControl fullWidth size="md" value={tipoVenta} onChange={setTipoVenta} color={tipoVenta === 'MAYOR' ? 'grape' : 'blue'}
            data={[{ value: 'DETAL', label: 'Al detal' }, { value: 'MAYOR', label: 'Al mayor' }]} />
    ) : (
        <Button.Group mb="sm">
            <Button fullWidth variant={tipoVenta === 'DETAL' ? 'filled' : 'light'} onClick={() => setTipoVenta('DETAL')}>Detal</Button>
            <Button fullWidth variant={tipoVenta === 'MAYOR' ? 'filled' : 'light'} color="grape" onClick={() => setTipoVenta('MAYOR')}>Mayor</Button>
        </Button.Group>
    ));

    const buscador = (
        <Group wrap="nowrap" gap="xs" mb={isMobile ? 0 : 'sm'}>
            <TextInput
                style={{ flex: 1, minWidth: 0 }} size={tamCampo} placeholder="Buscar producto…" inputMode="search" enterKeyHint="search" autoComplete="off"
                leftSection={<IconSearch size={16} />} value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.currentTarget.value)}
                rightSectionPointerEvents="all"
                rightSection={busquedaProducto ? <CloseButton size="sm" onClick={() => setBusquedaProducto('')} aria-label="Borrar la búsqueda" /> : null}
                // En el teléfono no se enfoca solo: el teclado taparía media pantalla apenas se abre la venta
                data-autofocus={isMobile ? undefined : true}
            />
            {/* El producto genérico (precio escrito a mano) es solo de administración */}
            {!esVendedor && (
                <Button color="grape" variant="light" size={tamCampo} px="sm" onClick={() => setModalFicticio(true)} title="Agregar ítem ficticio (1010)" style={{ flexShrink: 0 }}>
                    + Ficticio
                </Button>
            )}
        </Group>
    );

    const filaProducto = (prod) => {
        const info = calcularPrecioInfo(prod, formVenta.values.tipoPrecio);
        const imgFinal = getImageUrl(prod.imagen) || getImageUrl(prod.marca?.imagen);
        const enCarrito = unidadesEnCarrito.get(prod.id) || 0;
        const botonesPresentacion = presentacionesDe(prod).filter((p) => p.clave !== 'UNIDAD').map((p) => (
            <Button key={p.clave} size={isMobile ? 'compact-sm' : 'compact-xs'} color="grape" variant="light" onClick={(e) => { e.stopPropagation(); pedirProducto(prod, p.clave); }}>
                + {p.etiqueta}
            </Button>
        ));
        return (
            <Paper
                key={prod.id} p={isMobile ? 8 : 'sm'} withBorder radius="md" role="button" tabIndex={0}
                onClick={() => pedirProducto(prod)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) pedirProducto(prod); }}
                style={{ cursor: 'pointer', ...(enCarrito ? { borderColor: 'var(--mantine-color-blue-4)', background: 'var(--mantine-color-blue-0)' } : {}) }}
            >
                <Group wrap="nowrap" justify="space-between" gap="sm" align="flex-start">
                    <Group wrap="nowrap" gap="sm" style={{ minWidth: 0, flex: 1 }}>
                        <Avatar src={imgFinal} size={isMobile ? 44 : 'md'} radius="sm" color="blue">
                            <IconPackage size={16} />
                        </Avatar>
                        <Box style={{ minWidth: 0 }}>
                            <Group gap={4} wrap="nowrap" align="flex-start">
                                <Text fw={600} size="sm" lineClamp={2} lh={1.25}>{prod.nombre}</Text>
                                {info.tieneDescuento && <IconTag size={14} color="#FF6B6B" style={{ flexShrink: 0, marginTop: 2 }} />}
                            </Group>
                            <Text size="xs" c="dimmed" lineClamp={1}>
                                SKU: {prod.codigo} {prod.marca?.nombre ? `| ${prod.marca.nombre}` : ''}
                            </Text>
                            {enCarrito > 0 && <Badge size="xs" color="blue" variant="filled" mt={2} tt="none">{enCarrito} und en el carrito</Badge>}
                        </Box>
                    </Group>

                    <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                        <Badge color={info.simbolo === 'Bs' ? 'teal' : 'blue'} variant="light" size="lg" px={isMobile ? 6 : 8}>
                            <PrecioVisual valor={info.precio} simbolo={info.simbolo} size="sm" fw={700} />
                        </Badge>
                        {!isMobile && botonesPresentacion}
                    </Stack>
                </Group>
                {/* En el teléfono «+ Caja» y «+ Bulto» van en su propia línea: así el nombre del producto no queda cortado */}
                {isMobile && botonesPresentacion.length > 0 && <Group gap={6} mt={6} justify="flex-end">{botonesPresentacion}</Group>}
            </Paper>
        );
    };

    const sinResultados = productos && !productosFiltrados.length && (
        <Text c="dimmed" ta="center" size="sm" py="lg">{busquedaProducto.trim() ? `No hay productos que coincidan con «${busquedaProducto.trim()}».` : 'No hay productos.'}</Text>
    );

    const bloqueDocumento = esPresupuesto ? (
        <Paper p="sm" mb="sm" bg="teal.0" radius="md" withBorder>
            <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                    <ThemeIcon size={isMobile ? 'md' : 'lg'} variant="light" color="teal"><IconFileInvoice size={isMobile ? 16 : 20} /></ThemeIcon>
                    <Box style={{ minWidth: 0 }}>
                        <Text size={isMobile ? 'md' : 'lg'} fw={800} c="teal.9">PRESUPUESTO</Text>
                        <Text size="xs" c="dimmed" lh={1.2}>Con IVA · no es documento fiscal ni toca el inventario</Text>
                    </Box>
                </Group>
                <NumberInput label="Válido (días)" size={tamCampo} w={isMobile ? 96 : 110} min={1} max={365} allowDecimal={false} allowNegative={false} inputMode="numeric" style={{ flexShrink: 0 }} {...formVenta.getInputProps('validoDias')} />
            </Group>
        </Paper>
    ) : (
        <Paper p="sm" mb="sm" bg={esFactura ? 'red.0' : 'gray.1'} radius="md" withBorder>
            <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                    <ThemeIcon size={isMobile ? 'md' : 'lg'} variant="light" color={esFactura ? 'red' : 'blue'}>
                        <IconReceiptTax size={isMobile ? 16 : 20} />
                    </ThemeIcon>
                    <Box style={{ minWidth: 0 }}>
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Emitir:</Text>
                        <Text size={isMobile ? 'md' : 'lg'} fw={800} lh={1.2} c={esFactura ? 'red.9' : 'blue.9'}>{tipoDocumentoActual}</Text>
                    </Box>
                </Group>
                <TextInput label="Correlativo" size={tamCampo} w={isMobile ? 128 : 150} fw={700} autoComplete="off" style={{ flexShrink: 0 }} {...formVenta.getInputProps('numeroDocumento')} />
            </Group>
            {/* En la computadora van lado a lado (la explicación debajo del campo) para que el carrito tenga espacio */}
            {(esFactura || puedeEditarPrecio) && (
                <SimpleGrid cols={!isMobile && esFactura && puedeEditarPrecio ? 2 : 1} spacing="xs" mt="xs">
                    {esFactura && (
                        <TextInput label="N° de control" placeholder="00-000000" size={tamCampo} autoComplete="off" {...formVenta.getInputProps('numeroControl')} />
                    )}
                    {puedeEditarPrecio && (
                        <TextInput type="date" label="Fecha de emisión" description="Vacía = hoy. Si copias una factura de otro día, elige esa fecha (toma la tasa BCV de ese día)"
                            inputWrapperOrder={isMobile ? undefined : ['label', 'input', 'description', 'error']}
                            size={tamCampo} max={fechaCaracas()} {...formVenta.getInputProps('fechaEmision')} />
                    )}
                </SimpleGrid>
            )}
        </Paper>
    );

    // Al mayor el cliente es obligatorio; al detal es opcional (venta sola, sin cliente) y se puede crear uno nuevo con cédula, nombre y teléfono
    const campoCliente = (
        <Group wrap="nowrap" gap="xs" align="flex-end">
            <Select
                style={{ flex: 1, minWidth: 0 }} size={tamCampo}
                label={esPresupuesto ? 'Cliente (opcional)' : (tipoVenta === 'MAYOR' ? 'Cliente mayorista' : 'Cliente (opcional)')}
                placeholder={tipoVenta === 'MAYOR' && !esPresupuesto ? 'Seleccione…' : 'Sin cliente'}
                withAsterisk={tipoVenta === 'MAYOR' && !esPresupuesto}
                searchable
                clearable={tipoVenta !== 'MAYOR' || esPresupuesto}
                nothingFoundMessage="No hay coincidencias: crea uno con el botón +"
                data={opcionesClientes}
                {...formVenta.getInputProps('clienteId')}
            />
            <ActionIcon size={isMobile ? 42 : 36} radius="md" variant="light" color="grape" onClick={() => setModalCrearCliente(true)} title="Crear cliente nuevo" aria-label="Crear cliente nuevo">
                <IconPlus size={20} />
            </ActionIcon>
        </Group>
    );

    const campoTarifa = (
        <Select label="Tarifa" size={tamCampo} data={opcionesTarifa} allowDeselect={false} {...formVenta.getInputProps('tipoPrecio')} />
    );

    // «Forma de cobro»: grande y a la vista, porque de ella depende que la factura registre el pago (contado) o quede una cuenta por cobrar (crédito)
    const selectorCobro = !esPresupuesto && (tipoVenta === 'MAYOR' || puedeEditarPrecio) && (
        <Box mb="sm">
            <Text size="sm" fw={700} mb={4}>Forma de cobro</Text>
            <SegmentedControl fullWidth size={isMobile ? 'md' : 'sm'} value={formVenta.values.condicionPago} onChange={(v) => formVenta.setFieldValue('condicionPago', v)}
                color={formVenta.values.condicionPago === 'Credito' ? 'orange.7' : 'green.7'}
                data={[{ value: 'Contado', label: 'Contado (cobra ahora)' }, { value: 'Credito', label: 'Crédito (queda por cobrar)' }]} />
            <Text size="xs" mt={4} fw={600} c={formVenta.values.condicionPago === 'Credito' ? 'orange.8' : 'green.8'}>
                {formVenta.values.condicionPago === 'Credito'
                    ? `Esta venta saldrá A CRÉDITO${formVenta.values.clienteId ? ` a ${Number(formVenta.values.diasCredito) || diasDelCliente} días` : ' (elige el cliente)'}: no se registra pago, queda en Cuentas por cobrar.`
                    : 'Esta venta saldrá DE CONTADO: se registra el pago ahora.'}
            </Text>
        </Box>
    );

    const filaIvaCondicion = !esPresupuesto && (
        <>
            <Group mb="sm" justify="space-between" align="center" wrap="nowrap" gap="sm">
                <Checkbox size={isMobile ? 'md' : 'sm'} label={<Text fw={600} size="sm">IVA (16%)</Text>} {...formVenta.getInputProps('conIva', { type: 'checkbox' })} />
            </Group>
            {selectorCobro}
        </>
    );

    const filaCredito = !esPresupuesto && esCredito && (
        <Box mb="sm">
            <NumberInput label="Días de crédito" size={tamCampo} min={0} max={365} allowDecimal={false} allowNegative={false} inputMode="numeric" w={isMobile ? '100%' : 180}
                readOnly={!puedeEditarPrecio} disabled={!formVenta.values.clienteId}
                description={!formVenta.values.clienteId ? 'Elige el cliente' : `El cliente tiene ${diasDelCliente} días${puedeEditarPrecio ? '' : ' (solo administración los cambia)'}`}
                {...formVenta.getInputProps('diasCredito')} onBlur={confirmarDias} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarDias(); } }} />
            {alcanceDias && <Text size="xs" c="dimmed" mt={2}>{alcanceDias.alcance === 'cliente' ? `Se guardará también como los días de crédito de ${clienteDelCredito?.nombre || 'este cliente'}.` : 'Solo para esta factura.'}</Text>}
        </Box>
    );

    const filaPago = !esPresupuesto && formVenta.values.condicionPago === 'Contado' && (
        <SimpleGrid cols={isMobile && esEfectivo ? 1 : 2} spacing="sm" mb="sm">
            <Select label="Método de pago" size={tamCampo} data={opcionesMetodoPago} allowDeselect={false} {...formVenta.getInputProps('metodoPago')} />
            {!esEfectivo ? (
                <TextInput label="Referencia" placeholder="Últimos 6 dígitos" size={tamCampo} autoComplete="off" {...formVenta.getInputProps('referencia')} />
            ) : (!isMobile && <Box />)}
        </SimpleGrid>
    );

    const filaMayor = !esPresupuesto && tipoVenta === 'MAYOR' && (
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm" mb="sm">
            <TextInput placeholder="(Opcional)" label="¿Chofer que retira?" size={tamCampo} {...formVenta.getInputProps('quienRetira')} />
            <NumberInput placeholder="(Opcional)" label={`Flete (${simboloMoneda})`} size={tamCampo} decimalScale={2} min={0} allowNegative={false} inputMode="decimal" hideControls {...formVenta.getInputProps('costoFlete')} />
        </SimpleGrid>
    );

    const campoObservaciones = esPresupuesto && (
        <Textarea mb="sm" size={tamCampo} label="Observaciones (opcional, salen en el presupuesto)" autosize minRows={isMobile ? 2 : 1} maxRows={4} {...formVenta.getInputProps('notas')} />
    );

    const etiquetasRenglon = (item) => (
        <>
            {item.tieneDescuento && <Badge size="xs" color="red" variant="filled">-{item.porcentajeDescuento}%</Badge>}
            {esExento(item) && conIva && <Badge size="xs" color="gray" variant="light">EXENTO</Badge>}
        </>
    );

    // Carrito del teléfono: una tarjeta por renglón, con botones grandes para la cantidad
    const tarjetasCarrito = (
        <Stack gap={8}>
            {carrito.map((item, idxItem) => (
                <Paper key={item.clave} withBorder radius="md" p="sm" bg="white" style={{ borderLeft: `4px solid ${!item.isFicticio && item.presentacion !== 'UNIDAD' ? '#7048e8' : '#1971c2'}` }}>
                    <Group wrap="nowrap" align="flex-start" gap="xs">
                        {item.isFicticio ? <Avatar color="grape" size={40} radius="sm"><IconEdit size={16} /></Avatar> : <Avatar src={item.imagen || item.marcaImagen} size={40} radius="sm"><IconPackage size={16} /></Avatar>}
                        <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text fw={700} size="sm" lineClamp={2} lh={1.25}>{item.nombre}</Text>
                            <Group gap={4} mt={2}>
                                {etiquetasRenglon(item)}
                                {!item.isFicticio && item.presentacion !== 'UNIDAD' && <Badge size="xs" color="grape.7" variant="filled" tt="none">{item.presentacionEtiqueta} · {item.cantidad} und</Badge>}
                                {item.isFicticio && <Badge size="xs" color="grape" variant="light">Ficticio 1010</Badge>}
                                {!item.isFicticio && item.marcaNombre && <Text size="xs" c="dimmed">{item.marcaNombre}</Text>}
                            </Group>
                        </Box>
                        <ActionIcon size="lg" color="red" variant="subtle" onClick={() => eliminarItem(item.clave)} aria-label="Quitar del carrito"><IconTrash size={18} /></ActionIcon>
                    </Group>
                    <Group justify="space-between" align="flex-end" mt={8} wrap="nowrap" gap={6}>
                        <Group gap={4} wrap="nowrap">
                            <ActionIcon size={40} radius="md" color="gray" variant="light" onClick={() => cambiarCantidad(item.clave, -1)} aria-label="Uno menos"><IconMinus size={18} /></ActionIcon>
                            <NumberInput value={item.cantidadPres} onChange={(val) => setCantidadAbsoluta(item.clave, val)} min={1} allowDecimal={false} allowNegative={false} size="md" w={64} hideControls inputMode="numeric"
                                aria-label="Cantidad" styles={{ input: { textAlign: 'center', fontWeight: 900, color: '#1971c2', backgroundColor: '#f8f9fa', paddingInline: 4 } }} />
                            <ActionIcon size={40} radius="md" color="blue" variant="light" onClick={() => cambiarCantidad(item.clave, 1)} aria-label="Uno más"><IconPlus size={18} /></ActionIcon>
                        </Group>
                        <Box ta="right" style={{ minWidth: 0 }}>
                            {puedeEditarPrecio ? (
                                <PrecioEditable valor={item.precio} simbolo={item.simbolo} editado={Boolean(item.precioManual)} size="sm" onCommit={(n) => fijarPrecio(item.clave, n)} onRestablecer={() => restablecerPrecio(item.clave)} />
                            ) : (
                                <Text size="xs" c="dimmed">c/u <PrecioVisual valor={item.precio} simbolo={item.simbolo} size="xs" fw={600} /></Text>
                            )}
                            <PrecioVisual valor={montoRenglonDe(idxItem)} simbolo={item.simbolo} size="lg" fw={800} />
                        </Box>
                    </Group>
                    {!item.isFicticio && !esPresupuesto && (
                        <Checkbox size="sm" mt={8} color="teal" label="Afectar inventario" checked={item.afectaInventario} onChange={(e) => toggleAfectaInventario(item.clave, e.currentTarget.checked)} />
                    )}
                </Paper>
            ))}
        </Stack>
    );

    const tablaCarrito = (
        <Table striped highlightOnHover verticalSpacing="xs">
            <Table.Thead>
                <Table.Tr>
                    <Table.Th style={{ width: '36%' }}>Producto</Table.Th>
                    <Table.Th style={{ width: '28%', textAlign: 'center' }}>Cantidad</Table.Th>
                    <Table.Th style={{ width: puedeEditarPrecio ? '18%' : '12%', textAlign: 'right' }}>Unit.</Table.Th>
                    <Table.Th style={{ width: '13%', textAlign: 'right' }}>Total</Table.Th>
                    <Table.Th style={{ width: '5%' }}></Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {carrito.map((item, idxItem) => (
                    <Table.Tr key={item.clave}>
                        <Table.Td>
                            <Group gap="xs" wrap="nowrap">
                                {item.isFicticio ? (
                                    <Avatar color="grape" size="sm" radius="sm"><IconEdit size={14} /></Avatar>
                                ) : (
                                    <Avatar src={item.imagen || item.marcaImagen} size="sm" radius="sm"><IconPackage size={14} /></Avatar>
                                )}
                                <Box>
                                    <Group gap={4}>
                                        <Text fw={600} size="sm" lineClamp={2}>{item.nombre}</Text>
                                        {etiquetasRenglon(item)}
                                    </Group>
                                    {!item.isFicticio && item.marcaNombre && <Text size="xs" c="dimmed">{item.marcaNombre}</Text>}
                                    {!item.isFicticio && item.presentacion !== 'UNIDAD' && (
                                        <Badge size="sm" color="grape" variant="filled" tt="none" mt={2}>{item.presentacionEtiqueta} · {item.cantidad} unidades</Badge>
                                    )}
                                    {item.isFicticio && <Text size="xs" c="dimmed">Código: 1010</Text>}

                                    {!item.isFicticio && !esPresupuesto && (
                                        <Checkbox
                                            size="xs" mt={4} color="teal" label="Afectar inventario"
                                            checked={item.afectaInventario}
                                            onChange={(e) => toggleAfectaInventario(item.clave, e.currentTarget.checked)}
                                        />
                                    )}
                                </Box>
                            </Group>
                        </Table.Td>

                        <Table.Td>
                            <Group gap="xs" wrap="nowrap" justify="center">
                                <ActionIcon size="md" color="gray" variant="light" onClick={() => cambiarCantidad(item.clave, -1)} aria-label="Uno menos">
                                    <IconMinus size={16} />
                                </ActionIcon>
                                <NumberInput
                                    value={item.cantidadPres}
                                    onChange={(val) => setCantidadAbsoluta(item.clave, val)}
                                    min={1} allowDecimal={false} allowNegative={false} size="sm" w={75} hideControls aria-label="Cantidad"
                                    styles={{ input: { textAlign: 'center', fontWeight: 900, fontSize: '1rem', color: '#1971c2', backgroundColor: '#f8f9fa' } }}
                                />
                                <ActionIcon size="md" color="blue" variant="light" onClick={() => cambiarCantidad(item.clave, 1)} aria-label="Uno más">
                                    <IconPlus size={16} />
                                </ActionIcon>
                            </Group>
                        </Table.Td>

                        <Table.Td style={{ textAlign: 'right' }}>
                            {puedeEditarPrecio ? (
                                <PrecioEditable
                                    valor={item.precio} simbolo={item.simbolo} editado={Boolean(item.precioManual)}
                                    onCommit={(n) => fijarPrecio(item.clave, n)} onRestablecer={() => restablecerPrecio(item.clave)}
                                />
                            ) : (
                                <PrecioVisual valor={item.precio} simbolo={item.simbolo} size="sm" fw={500} />
                            )}
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right' }}>
                            <PrecioVisual valor={montoRenglonDe(idxItem)} simbolo={item.simbolo} size="sm" fw={800} />
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right' }}>
                            <ActionIcon color="red" variant="subtle" onClick={() => eliminarItem(item.clave)} aria-label="Quitar del carrito">
                                <IconTrash size={18} />
                            </ActionIcon>
                        </Table.Td>
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    );

    // ---------------- Computadora: productos a la izquierda, documento y carrito a la derecha ----------------
    const contenidoEscritorio = (
        <>
            <Paper p="xs" mb="sm" bg="blue.0" radius="md">
                <Group gap="xs">
                    <IconExchange size={20} color="#1971C2" />
                    <Text fw={600} c="blue.9">Tasa BCV:</Text>
                    <Badge size="lg" color="blue" variant="filled">{tasaBcv} Bs/$</Badge>
                </Group>
            </Paper>

            <Grid gutter="md" m={0}>
                <Grid.Col span={5} p={0} pr="md">
                    <Paper withBorder p="md" radius="md" h="75vh" style={{ display: 'flex', flexDirection: 'column' }}>
                        {selectorTipoVenta}
                        {buscador}
                        <ScrollArea style={{ flex: 1 }} type="auto">
                            <Stack gap="xs">
                                {productosFiltrados.map(filaProducto)}
                                {sinResultados}
                            </Stack>
                        </ScrollArea>
                    </Paper>
                </Grid.Col>

                <Grid.Col span={7} p={0}>
                    {/* Si la pantalla es baja, el panel se desplaza entero en vez de dejar el carrito sin espacio */}
                    <Paper withBorder p="md" radius="md" h="75vh" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                        {bloqueDocumento}
                        <Group grow mb="sm" align="flex-end">
                            {campoCliente}
                            {campoTarifa}
                        </Group>
                        {filaIvaCondicion}
                        {filaPago}
                        {filaCredito}

                        <ScrollArea style={{ flex: '1 0 200px' }} offsetScrollbars type="auto" mb="sm">
                            {carrito.length ? tablaCarrito : <Text c="dimmed" ta="center" size="sm" py="xl">Haz clic en un producto de la lista para agregarlo.</Text>}
                        </ScrollArea>

                        {campoObservaciones}
                        {filaMayor}

                        <Divider mb="xs" />

                        <Group justify="space-between" align="flex-end">
                            <Stack gap={2}>
                                <Group gap="xs">
                                    <Text size="xs" c="dimmed">Subtotal:</Text>
                                    <PrecioVisual valor={subtotal} simbolo={simboloMoneda} size="xs" c="dimmed" />
                                </Group>
                                <Group gap="xs">
                                    <Text size="xs" c="dimmed">IVA (16%):</Text>
                                    <PrecioVisual valor={montoIva} simbolo={simboloMoneda} size="xs" c="dimmed" />
                                </Group>
                                {costoFleteNum > 0 && (
                                    <Group gap="xs">
                                        <Text size="xs" c="dimmed">Flete:</Text>
                                        <PrecioVisual valor={costoFleteNum} simbolo={simboloMoneda} size="xs" c="dimmed" />
                                    </Group>
                                )}
                                <Group gap="xs" mt={2}>
                                    <Text fw={900} size="md" c="blue.9">Total a Pagar:</Text>
                                    <PrecioVisual valor={totalFinal} simbolo={simboloMoneda} size="lg" fw={900} c="blue.9" />
                                    {equivalenteTotal && <Text size="xs" c="dimmed">{equivalenteTotal}</Text>}
                                </Group>
                            </Stack>

                            {esPresupuesto ? (
                                <Button size="md" color="teal" leftSection={<IconFileInvoice size={20} />} onClick={guardarPresupuesto} loading={guardandoPresupuesto} disabled={carrito.length === 0}>
                                    {editando ? 'Guardar cambios' : 'Guardar presupuesto'}
                                </Button>
                            ) : (
                                <Group gap="xs">
                                    <Button size="md" variant="light" color="teal" leftSection={<IconFileInvoice size={20} />} onClick={guardarPresupuesto} loading={guardandoPresupuesto} disabled={carrito.length === 0} title="Guarda el carrito como presupuesto (con IVA, cliente opcional) sin registrar la venta">
                                        Presupuesto
                                    </Button>
                                    <Button size="md" color="blue.8" leftSection={<IconReceiptTax size={20} />} onClick={handleRevisarVenta} disabled={carrito.length === 0}>
                                        Revisar
                                    </Button>
                                </Group>
                            )}
                        </Group>
                    </Paper>
                </Grid.Col>
            </Grid>
        </>
    );

    // ---------------- Teléfono: pantalla completa en tres partes (productos, carrito, datos) y el total siempre abajo ----------------
    const faltaCliente = !esPresupuesto && tipoVenta === 'MAYOR' && !formVenta.values.clienteId;
    const contenidoTelefono = (
        <Box style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#f1f3f7' }}>
            <Box style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', borderBottom: '1px solid #e3e7ee', padding: 'calc(8px + env(safe-area-inset-top, 0px)) 12px 8px', boxShadow: '0 4px 12px -8px rgba(0,0,0,0.25)' }}>
                <Group justify="space-between" wrap="nowrap" gap="xs" mb={8}>
                    <Box style={{ minWidth: 0 }}>
                        <Text fw={800} size="lg" c="blue.9" lh={1.2} truncate="end">{esPresupuesto ? (editando ? `Modificar ${editando.numero}` : 'Nuevo presupuesto') : 'Nueva venta'}</Text>
                        <Group gap={4} wrap="nowrap">
                            <IconExchange size={14} color="#1971C2" />
                            <Text size="xs" c="dimmed" lh={1.2}>Tasa BCV: <b>{tasaBcv ? `${tasaBcv} Bs/$` : '…'}</b></Text>
                        </Group>
                    </Box>
                    <CloseButton size="xl" onClick={onClose} aria-label="Cerrar" />
                </Group>
                <SegmentedControl
                    fullWidth value={vista} onChange={setVista} color="blue.8"
                    data={[
                        { value: 'productos', label: 'Productos' },
                        { value: 'carrito', label: carrito.length ? `Carrito (${carrito.length})` : 'Carrito' },
                        { value: 'datos', label: esPresupuesto ? 'Datos' : 'Datos y pago' },
                    ]}
                />
            </Box>

            <Box p="sm" style={{ flex: 1 }}>
                {vista === 'productos' && (
                    <Stack gap={8}>
                        {/* Qué se va a emitir y para quién: se cambia en «Datos y pago» */}
                        <UnstyledButton onClick={() => setVista('datos')} p={10} bg="white" style={{ borderRadius: 8, border: `1px solid ${faltaCliente ? 'var(--mantine-color-red-4)' : '#dee2e6'}` }}>
                            <Group justify="space-between" wrap="nowrap" gap="xs">
                                <Box style={{ minWidth: 0 }}>
                                    <Text size="sm" fw={700} lh={1.3} truncate="end">
                                        {esPresupuesto ? 'Presupuesto' : `${tipoDocumentoActual} ${formVenta.values.numeroDocumento}`} · {etiquetaTarifa}
                                    </Text>
                                    <Text size="xs" lh={1.3} c={faltaCliente ? 'red.7' : 'dimmed'} fw={faltaCliente ? 700 : 400} truncate="end">
                                        {!esPresupuesto && `${tipoVenta === 'MAYOR' ? 'Al mayor' : 'Al detal'} · `}{clienteSeleccionado ? clienteSeleccionado.nombre : (faltaCliente ? 'Falta elegir el cliente' : 'Sin cliente')}
                                    </Text>
                                </Box>
                                <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
                                    <Text size="xs" fw={700} c="blue.7">Cambiar</Text>
                                    <IconChevronRight size={16} color="var(--mantine-color-blue-7)" />
                                </Group>
                            </Group>
                        </UnstyledButton>
                        {buscador}
                        {!productos && <Text c="dimmed" ta="center" size="sm" py="lg">Cargando productos…</Text>}
                        {productosFiltrados.map(filaProducto)}
                        {sinResultados}
                    </Stack>
                )}

                {vista === 'carrito' && (
                    carrito.length === 0 ? (
                        <Stack align="center" gap="sm" py={48}>
                            <ThemeIcon size={56} radius="xl" variant="light" color="blue"><IconShoppingCart size={30} /></ThemeIcon>
                            <Text fw={700}>El carrito está vacío</Text>
                            <Button variant="light" onClick={() => setVista('productos')}>Agregar productos</Button>
                        </Stack>
                    ) : (
                        <Stack gap={8}>
                            <Group justify="space-between">
                                <Text size="sm" fw={700} c="blue.9">{carrito.length} {carrito.length === 1 ? 'producto' : 'productos'} · {unidadesCarrito} und</Text>
                                <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => setVista('productos')}>Agregar más</Button>
                            </Group>
                            {tarjetasCarrito}
                        </Stack>
                    )
                )}

                {vista === 'datos' && (
                    <Stack gap={0}>
                        {selectorTipoVenta && <Box mb="sm">{selectorTipoVenta}</Box>}
                        {bloqueDocumento}
                        <Paper withBorder radius="md" p="sm" mb="sm" bg="white">
                            <Stack gap="sm">
                                {campoCliente}
                                {campoTarifa}
                            </Stack>
                        </Paper>
                        {!esPresupuesto && (
                            <Paper withBorder radius="md" p="sm" mb="sm" bg="white">
                                <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={6}>Cobro</Text>
                                {filaIvaCondicion}
                                {filaPago}
                                {filaCredito}
                        {filaCredito}
                                {formVenta.values.condicionPago !== 'Contado' && <Text size="xs" c="dimmed">A crédito: el cliente queda debiendo y los abonos se registran después en Cuentas por cobrar.</Text>}
                            </Paper>
                        )}
                        {filaMayor && (
                            <Paper withBorder radius="md" p="sm" mb="sm" bg="white">
                                <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={6}>Despacho</Text>
                                {filaMayor}
                            </Paper>
                        )}
                        {campoObservaciones}
                    </Stack>
                )}
            </Box>

            {/* Total y botones siempre a la vista; los botones a todo el ancho porque en una sola fila no caben */}
            <Box style={{ position: 'sticky', bottom: 0, zIndex: 15, background: '#fff', padding: '8px 12px calc(10px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 -6px 16px rgba(0,0,0,0.12)', borderTop: '1px solid #e9ecef' }}>
                <Group justify="space-between" align="flex-end" wrap="nowrap" gap="xs" mb={8}>
                    <Box style={{ minWidth: 0 }}>
                        <Text size="xs" c="dimmed" lh={1.35}>Subtotal <PrecioVisual valor={subtotal} simbolo={simboloMoneda} size="xs" c="dimmed" fw={600} /></Text>
                        <Text size="xs" c="dimmed" lh={1.35}>IVA <PrecioVisual valor={montoIva} simbolo={simboloMoneda} size="xs" c="dimmed" fw={600} />{costoFleteNum > 0 && <> · Flete <PrecioVisual valor={costoFleteNum} simbolo={simboloMoneda} size="xs" c="dimmed" fw={600} /></>}</Text>
                    </Box>
                    <Box ta="right" style={{ flexShrink: 0 }}>
                        <Text size="xs" fw={800} c="blue.9" tt="uppercase" lh={1}>Total</Text>
                        <PrecioVisual valor={totalFinal} simbolo={simboloMoneda} size="xl" fw={900} c="blue.9" />
                        {equivalenteTotal && <Text size="xs" c="dimmed" lh={1.1}>{equivalenteTotal}</Text>}
                    </Box>
                </Group>
                {esPresupuesto ? (
                    <Button fullWidth size="md" color="teal" leftSection={<IconFileInvoice size={20} />} onClick={guardarPresupuesto} loading={guardandoPresupuesto} disabled={carrito.length === 0}>{editando ? 'Guardar cambios' : 'Guardar presupuesto'}</Button>
                ) : (
                    <Group gap={8} wrap="nowrap">
                        <Button size="sm" h={46} px="sm" variant="light" color="teal" onClick={guardarPresupuesto} loading={guardandoPresupuesto} disabled={carrito.length === 0}
                            title="Guarda el carrito como presupuesto (con IVA, cliente opcional) sin registrar la venta" style={{ flexShrink: 0 }}>
                            Presupuesto
                        </Button>
                        <Button size="sm" h={46} style={{ flex: 1 }} color="blue.8" leftSection={<IconReceiptTax size={18} />} onClick={handleRevisarVenta} disabled={carrito.length === 0}>
                            Revisar venta
                        </Button>
                    </Group>
                )}
            </Box>
        </Box>
    );

    return (
        <>
            {isMobile ? (
                <Modal opened={opened} onClose={onClose} fullScreen withCloseButton={false} classNames={{ content: CONTENIDO_SIN_RELLENO }} transitionProps={{ transition: 'fade', duration: 120 }}
                    styles={{ body: { padding: 0 }, content: { background: '#f1f3f7' } }}>
                    {contenidoTelefono}
                </Modal>
            ) : (
                <Modal
                    opened={opened} onClose={onClose} size="95%" centered
                    title={<Title order={3} c="blue.9" component="div">{esPresupuesto ? (editando ? `Modificar ${editando.numero}` : 'Nuevo presupuesto') : 'Terminal POS - Nueva Venta'}</Title>}
                    styles={{ inner: { padding: '16px' }, content: { borderRadius: '8px' }, body: { padding: '20px' }, header: { padding: '20px' } }}
                >
                    {contenidoEscritorio}
                </Modal>
            )}

            {/* MODAL SECUNDARIO: CREAR CLIENTE EN CALIENTE */}
            <Modal opened={modalCrearCliente} onClose={() => setModalCrearCliente(false)} size="lg" fullScreen={isMobile} classNames={isMobile ? { content: CONTENIDO_SIN_RELLENO } : undefined} title={<Title order={4} c="grape" component="div">{tipoVenta === 'MAYOR' ? 'Registrar Nuevo Cliente' : 'Cliente nuevo al detal'}</Title>} centered zIndex={2000}>
                <form onSubmit={formNuevoCliente.onSubmit(async (values) => {
                    try {
                        if (!String(values.identificacion || '').trim() || !String(values.nombre || '').trim()) throw new Error('La cédula y el nombre son obligatorios');
                        const res = await fetch('/api/clientes', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(tipoVenta === 'MAYOR' ? { ...values } : { identificacion: values.identificacion.trim(), nombre: values.nombre.trim(), telefono: values.telefono?.trim() || null })
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);

                        notifications.show({ title: 'Cliente Creado', message: 'El cliente ha sido guardado y seleccionado exitosamente.', color: 'green' });
                        await queryClient.invalidateQueries({ queryKey: ['clientes-pos'] });
                        formVenta.setFieldValue('clienteId', String(data.id));
                        setModalCrearCliente(false);
                        formNuevoCliente.reset();
                    } catch (err) {
                        notifications.show({ title: 'Error', message: err.message, color: 'red' });
                    }
                })}>
                    <Stack gap="sm">
                        <TextInput size="md" label={tipoVenta === 'MAYOR' ? 'RIF / Cédula' : 'Cédula'} placeholder={tipoVenta === 'MAYOR' ? 'Ej: J-12345678-9 o V-12345678' : 'Ej: V-12345678'} withAsterisk autoComplete="off" data-autofocus {...formNuevoCliente.getInputProps('identificacion')} />
                        <TextInput size="md" label={tipoVenta === 'MAYOR' ? 'Razón Social / Nombre' : 'Nombre'} placeholder={tipoVenta === 'MAYOR' ? 'Ej: Farmacia San Pedro' : 'Ej: María Pérez'} withAsterisk autoComplete="off" {...formNuevoCliente.getInputProps('nombre')} />
                        <TextInput size="md" type="tel" inputMode="tel" label="Teléfono" placeholder="Ej: 0414-1234567 (opcional)" {...formNuevoCliente.getInputProps('telefono')} />
                        {tipoVenta === 'MAYOR' && (
                            <>
                                <TextInput size="md" type="email" inputMode="email" label="Correo Electrónico" placeholder="contacto@cliente.com" {...formNuevoCliente.getInputProps('email')} />
                                <TextInput size="md" label="Dirección Fiscal" placeholder="Ej: Av. Principal, Local 4..." {...formNuevoCliente.getInputProps('direccion')} />
                                <TextInput size="md" label="Notas Adicionales" placeholder="(Opcional)" {...formNuevoCliente.getInputProps('notas')} />
                            </>
                        )}
                        <Button size="md" type="submit" color="grape" mt="md" loading={formNuevoCliente.submitting}>Guardar y Seleccionar Cliente</Button>
                    </Stack>
                </form>
            </Modal>

            {/* PRODUCTO FICTICIO (1010): descripción y precio escritos a mano */}
            {preguntar && (
                <CantidadProductoModal opened onClose={() => setPreguntar(null)} zIndex={3000} nombre={preguntar.producto.nombre} presentaciones={presentacionesDe(preguntar.producto)}
                    claveInicial={preguntar.clave} precio={precioPregunta(preguntar.producto)} onConfirmar={(clave, n, precio) => agregarAlCarrito(preguntar.producto, clave, n, precio)} />
            )}

            <Modal opened={modalFicticio} onClose={() => setModalFicticio(false)} fullScreen={isMobile} classNames={isMobile ? { content: CONTENIDO_SIN_RELLENO } : undefined} title={<Title order={4} c="grape" component="div">Agregar Ítem Ficticio (1010)</Title>} centered zIndex={2000}>
                <form onSubmit={formFicticio.onSubmit(handleAgregarFicticio)}>
                    <Stack gap="md">
                        <TextInput size={tamCampo} label="Descripción del artículo" withAsterisk autoComplete="off" {...formFicticio.getInputProps('nombre')} />
                        <NumberInput
                            size={tamCampo}
                            label={`Precio Unitario (${esMonedaBs ? 'Bs' : 'USD'})`}
                            withAsterisk decimalScale={3} min={0} allowNegative={false} inputMode="decimal" hideControls={isMobile}
                            description="Ingresa el precio en la moneda seleccionada."
                            data-autofocus
                            {...formFicticio.getInputProps('precio')}
                        />
                        <NumberInput size={tamCampo} label="Cantidad" withAsterisk min={1} allowDecimal={false} allowNegative={false} inputMode="numeric" {...formFicticio.getInputProps('cantidad')} />
                        <Checkbox
                            size={isMobile ? 'md' : 'sm'}
                            label={<Text fw={600}>Lleva IVA (16%)</Text>}
                            description="Si desmarcas, será EXENTO."
                            color="grape"
                            {...formFicticio.getInputProps('aplicaIva', { type: 'checkbox' })}
                        />
                        <Button type="submit" fullWidth size={tamCampo} color="grape" mt="sm">Agregar al carrito</Button>
                    </Stack>
                </form>
            </Modal>

            {/* VISTA PREVIA: la hoja tal como saldrá, para confirmar antes de asentar */}
            <Modal opened={preguntarDias !== null} onClose={() => { setPreguntarDias(null); formVenta.setFieldValue('diasCredito', alcanceDias?.valor ?? diasDelCliente); }} centered zIndex={3000} title={<Text fw={800}>Días de crédito: {preguntarDias}</Text>}>
                <Stack gap="sm">
                    <Text size="sm">{clienteDelCredito?.nombre} tiene {diasDelCliente} días de crédito. ¿Los {preguntarDias} días son solo para esta factura o también para las futuras de este cliente?</Text>
                    <Button onClick={() => { setAlcanceDias({ valor: preguntarDias, alcance: 'factura' }); setPreguntarDias(null); }}>Solo esta factura</Button>
                    <Button variant="light" onClick={() => { setAlcanceDias({ valor: preguntarDias, alcance: 'cliente' }); setPreguntarDias(null); }}>Esta y las futuras del cliente</Button>
                    <Button variant="default" onClick={() => { setPreguntarDias(null); formVenta.setFieldValue('diasCredito', diasDelCliente); setAlcanceDias(null); }}>Cancelar</Button>
                </Stack>
            </Modal>
            <Modal
                opened={previewAbierto} onClose={() => setPreviewAbierto(false)} size="1000px" fullScreen={isMobile} classNames={isMobile ? { content: CONTENIDO_SIN_RELLENO } : undefined}
                title={<Title order={4} c="blue.9" component="div">Confirme el Documento</Title>}
                centered zIndex={2000}
                styles={{
                    inner: { padding: isMobile ? 0 : '16px' }, content: { borderRadius: isMobile ? 0 : '8px', margin: 0, ...(isMobile ? { display: 'flex', flexDirection: 'column', overflow: 'hidden' } : {}) },
                    body: { padding: 0, display: 'flex', flexDirection: 'column', ...(isMobile ? { flex: 1, minHeight: 0 } : {}) },
                    header: { padding: isMobile ? '10px 12px' : '20px', ...(isMobile ? { minHeight: 52, flexShrink: 0 } : {}) }
                }}
            >
                {isMobile && (
                    <Box p="sm" bg="#f1f3f5" style={{ borderBottom: '1px solid #ddd', flexShrink: 0 }}>
                        {/* La hoja es tamaño carta: en el teléfono se ve achicada, así que lo importante se repite arriba en grande */}
                        <Group justify="space-between" wrap="nowrap" gap="xs" mb={8}>
                            <Box style={{ minWidth: 0 }}>
                                <Text size="sm" fw={800} c={esFactura ? 'red.9' : 'blue.9'} lh={1.2}>{tituloDocumento} {formVenta.values.numeroDocumento}</Text>
                                <Text size="xs" lh={1.3} truncate="end">{clienteSeleccionado?.nombre || 'Sin cliente'}</Text>
                                <Text size="xs" c="dimmed" lh={1.3}>{formVenta.values.condicionPago === 'Contado' ? `Contado · ${formVenta.values.metodoPago}` : 'Crédito'}</Text>
                            </Box>
                            <Box ta="right" style={{ flexShrink: 0 }}>
                                <PrecioVisual valor={totalFinal} simbolo={simboloMoneda} size="lg" fw={900} c="blue.9" />
                                {equivalenteTotal && <Text size="xs" c="dimmed">{equivalenteTotal}</Text>}
                            </Box>
                        </Group>
                        <Button
                            variant="light" color={zoomPreview ? 'blue' : 'gray'} fullWidth size="sm"
                            leftSection={zoomPreview ? <IconZoomOut size={18} /> : <IconZoomIn size={18} />}
                            onClick={() => setZoomPreview(!zoomPreview)}
                        >
                            {zoomPreview ? 'Ver la hoja completa' : 'Acercar para leer'}
                        </Button>
                    </Box>
                )}

                <Box className="preview-scale-wrapper" bg={isMobile ? '#e9ecef' : '#525659'} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: isMobile ? 8 : 20 }}>
                    {/* En el teléfono la hoja se encoge (zoom) al ancho de la pantalla o se ve a tamaño real para leerla de cerca */}
                    <div className="print-preview-container" style={isMobile ? { zoom: zoomPreview ? 1 : escalaHoja } : undefined}>

                        <img src={MEMBRETE_MEDIQUIR?.logo || "/tenants/mediquir/logo.png"} alt="Fondo Mediquir" className="watermark" />

                        <header className="header-grid">
                            <div className="logo-section"><img src={MEMBRETE_MEDIQUIR?.logo || "/tenants/mediquir/logo.png"} alt="Logo" className="logo" /></div>
                            <div className="membrete-section">
                                <h3>{MEMBRETE_MEDIQUIR?.nombre}</h3>
                                <p className="rif">RIF.: {MEMBRETE_MEDIQUIR?.rif}</p>
                                <p className="direccion">{MEMBRETE_MEDIQUIR?.direccion}</p>
                                <p className="telefonos">TELF.: {MEMBRETE_MEDIQUIR?.telefonos}, E-mail: {MEMBRETE_MEDIQUIR?.email}</p>
                            </div>
                        </header>

                        <section className="info-grid">
                            <div className="cliente-box">
                                <div className="line-item"><span className="label-red">CLIENTE:</span><span className="value-line">{clienteSeleccionado?.nombre || 'Cliente Genérico (Detal)'}</span></div>
                                <div className="line-item"><span className="label-red">RIF:</span><span className="value-line">{clienteSeleccionado?.identificacion || 'N/A'}</span></div>
                                <div className="line-item"><span className="label-red">DOMICILIO FISCAL:</span><span className="value-line">{clienteSeleccionado?.direccion || 'N/A'}</span></div>
                            </div>
                            <div className="doc-box">
                                <h2 className="doc-title">{tituloDocumento}</h2>
                                <h1 className="doc-number">{formVenta.values.numeroDocumento}</h1>
                                <table className="doc-meta">
                                    <tbody>
                                        <tr><td className="text-right fw-bold" style={{ width: '60%' }}>ORDEN DE COMPRA</td><td>Emisión: {fechaEmision}</td></tr>
                                        <tr><td className="text-right">Condiciones de la Transacción<br/><strong>{formVenta.values.condicionPago === 'Credito' ? 'Crédito' : formVenta.values.condicionPago}</strong></td><td className="valign-bottom">Vence: {esCredito ? formatearFecha(new Date(Date.now() + (Number(formVenta.values.diasCredito) || 0) * 86400000)) : fechaEmision}</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <table className="items-table">
                            <thead>
                                <tr>
                                    <th style={{width: '10%'}}>CÓDIGO</th>
                                    <th style={{width: '50%', textAlign: 'left'}}>NOMBRE DEL ARTÍCULO</th>
                                    <th style={{width: '15%', textAlign: 'right'}}>PRECIO UNIT ({simboloMoneda})</th>
                                    <th style={{width: '10%', textAlign: 'center'}}>CANTIDAD</th>
                                    <th style={{width: '15%', textAlign: 'right'}}>TOTAL NETO ({simboloMoneda})</th>
                                </tr>
                            </thead>
                            <tbody>
                                {carrito.map((d, index) => (
                                    <tr key={d.clave}>
                                        <td>{d.codigo || 'S/C'}</td>
                                        <td style={{textAlign: 'left'}}>
                                            {d.isFicticio ? d.nombre : nombreConMarca(d.nombre, d.marcaNombre)}
                                            {esExento(d) && formVenta.values.conIva && (
                                                <span style={{fontSize: '8px', color: '#666', marginLeft: 4}}>(E)</span>
                                            )}
                                        </td>
                                        <td style={{textAlign: 'right'}}>{formatoNumero(d.precio)}</td>
                                        <td style={{textAlign: 'center'}}>{formatoNumero(d.cantidad)}</td>
                                        <td style={{textAlign: 'right'}}>{formatoNumero(montoRenglonDe(index))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <footer className="footer-section">
                            <table className="totals-table">
                                <tbody>
                                    <tr>
                                        <td className="total-cell border-right text-center">
                                            {formVenta.values.conIva ? (
                                                <>
                                                    <span className="label-red">TOTAL IMPUESTO: 16%</span><br/>
                                                    <div className="monto-split">
                                                        <strong>{formatoNumero(prevIvaBs)} <span className="label-red">Bs.</span></strong>
                                                        <strong>{formatoNumero(prevIvaUsd)} <span className="label-red">USD</span></strong>
                                                    </div>
                                                </>
                                            ) : (
                                                <span className="label-red">OPERACIÓN NO GRAVADA (SIN IVA)</span>
                                            )}
                                        </td>
                                        <td className="total-cell border-right text-center">
                                            <span className="label-red">TOTAL EXENTO:</span><br/>
                                            <div className="monto-split">
                                                <strong>{formatoNumero(prevExentoBs)} <span className="label-red">Bs.</span></strong>
                                                <strong>{formatoNumero(prevExentoUsd)} <span className="label-red">USD</span></strong>
                                            </div>
                                        </td>
                                        <td className="total-cell text-center" style={{ backgroundColor: '#f9f9f9' }}>
                                            <span className="label-red">TOTAL GENERAL Bs.</span><br/>
                                            <strong style={{fontSize: '1.1rem'}}>{formatoNumero(prevTotalBs)}</strong>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="total-cell border-right text-center">
                                            {formVenta.values.conIva ? (
                                                <>
                                                    <span className="label-red">BASE IMPONIBLE:</span><br/>
                                                    <div className="monto-split">
                                                        <strong>{formatoNumero(prevBaseBs)} <span className="label-red">Bs.</span></strong>
                                                        <strong>{formatoNumero(prevBaseUsd)} <span className="label-red">USD</span></strong>
                                                    </div>
                                                </>
                                            ) : (
                                                <span>-</span>
                                            )}
                                        </td>
                                        <td className="total-cell border-right text-center">
                                            <span className="text-black">Monto Operación segun Tasa BCV</span><br/>
                                            <strong>{formatoNumero(tasaBcv)} <span className="label-red">Bs.</span></strong>
                                        </td>
                                        <td className="total-cell text-center" style={{ backgroundColor: '#f9f9f9' }}>
                                            <span className="label-red">TOTAL GENERAL USD$</span><br/>
                                            <strong style={{fontSize: '1.1rem'}}>{formatoNumero(prevTotalUsd)}</strong>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            <div className="monto-letras"><span className="label-blue">Son: Bs. </span><span className="text-black">{numeroALetras(prevTotalBs)}</span></div>
                            <div className="original-label label-red text-center">VISTA PREVIA DE CONFIRMACIÓN</div>
                        </footer>
                    </div>
                </Box>

                {!esPresupuesto && (
                    <Alert color={esCredito ? 'orange' : 'green'} variant="filled" radius={0} py={8} style={{ flexShrink: 0 }}>
                        <Text fw={800} size={isMobile ? 'sm' : 'md'} c="white" ta="center">
                            {esCredito
                                ? `ESTA FACTURA SALDRÁ A CRÉDITO${formVenta.values.clienteId ? ` · ${Number(formVenta.values.diasCredito) || diasDelCliente} días · ${clienteSeleccionado?.nombre || ''}` : ''}: queda por cobrar, no se registra pago`
                                : `ESTA VENTA SALDRÁ DE CONTADO: se registra el pago ahora (${formVenta.values.metodoPago})`}
                        </Text>
                    </Alert>
                )}
                <Group justify="flex-end" gap="sm" wrap="nowrap" bg="gray.1"
                    style={{ borderTop: '1px solid #ddd', flexShrink: 0, padding: isMobile ? '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))' : 'var(--mantine-spacing-md)' }}>
                    <Button variant="outline" color="gray" onClick={() => setPreviewAbierto(false)} size={isMobile ? 'sm' : 'md'} h={isMobile ? 46 : undefined} style={isMobile ? { flex: 1 } : undefined}>
                        {isMobile ? 'Editar' : 'Volver a Editar'}
                    </Button>
                    <Button color="green.8" leftSection={<IconCheck size={20} />} onClick={handleProcesarVenta} loading={isSubmitting} size={isMobile ? 'sm' : 'md'} h={isMobile ? 46 : undefined} style={isMobile ? { flex: 2 } : undefined}>
                        {esPresupuesto ? 'Asentar venta' : (esCredito ? 'Asentar A CRÉDITO' : 'Asentar DE CONTADO')}
                    </Button>
                </Group>

                <style dangerouslySetInnerHTML={{ __html: `
                    .preview-scale-wrapper { display: flex; justify-content: center; align-items: flex-start; width: 100%; }
                    .print-preview-container * { box-sizing: border-box; }
                    .print-preview-container { background: white; color: black; width: 8.5in; flex-shrink: 0; min-height: ${altoPapel}; height: max-content; padding: 0.2in 0.3in; position: relative; font-family: Arial, Helvetica, sans-serif; font-size: 11px; display: flex; flex-direction: column; box-shadow: 0 0 8px rgba(0,0,0,.25); }
                    @media (max-width: 61.99em) { .preview-scale-wrapper { justify-content: flex-start; } }
                    .label-red { color: #d32f2f !important; font-weight: bold; }
                    .label-blue { color: #1976d2 !important; font-weight: bold; }
                    .text-black { color: #000 !important; }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    .fw-bold { font-weight: bold; }
                    .valign-bottom { vertical-align: bottom; }
                    .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 50%; opacity: 0.08; z-index: 0; pointer-events: none; }
                    .header-grid, .info-grid, .items-table, .footer-section { position: relative; z-index: 1; }
                    .header-grid { display: grid; grid-template-columns: 25% 75%; align-items: center; border-bottom: 2px solid #ccc; padding-bottom: 2px; margin-bottom: 2px; }
                    .logo { padding: 0; margin-left: 15px; max-width: 100%; max-height: 100px; object-fit: contain; }
                    .membrete-section { text-align: left; padding-left: 0px; margin-left: 0px; }
                    .membrete-section h3 { color: #1976d2 !important; margin: 0 0 2px 0; font-size: 13px; }
                    .membrete-section p { margin: 0; font-size: 8.5px; font-weight: bold; }
                    .info-grid { display: grid; grid-template-columns: 60% 40%; margin-bottom: 5px; }
                    .cliente-box { padding-right: 15px; }
                    .line-item { margin-bottom: 2px; display: flex; align-items: flex-end; border-bottom: 1px solid #000; padding-bottom: 2px; }
                    .line-item .label-red { width: 120px; flex-shrink: 0; }
                    .value-line { flex-grow: 1; font-weight: bold; font-size: 11px; }
                    .doc-box { text-align: right; }
                    .doc-title { font-size: 16px; margin: 0; font-weight: 900; color: #222; text-transform: uppercase; }
                    .doc-number { color: #d32f2f !important; font-size: 14px; margin: 0 0 2px 0; letter-spacing: 1px; }
                    .doc-meta { width: 100%; font-size: 9.5px; }
                    .doc-meta td { padding: 1px 4px; }
                    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
                    .items-table th { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 3px 2px; font-size: 9.5px; }
                    .items-table td { padding: 3px 2px; font-size: 9.5px; vertical-align: top; border-bottom: 1px dashed #eee; }
                    .footer-section { margin-top: auto; position: relative; }
                    .totals-table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-bottom: 5px; }
                    .totals-table td { padding: 2px; border-bottom: 1px solid #000; font-size: 9.5px; }
                    .border-right { border-right: 1px solid #000; }
                    .monto-split { display: flex; justify-content: space-around; margin-top: 2px; font-size: 10px; }
                    .monto-letras { font-size: 9px; margin-bottom: 4px; padding-left: 5px; }
                    .original-label { font-size: 10px; margin-bottom: 2px; font-weight: bold;}
                `}} />
            </Modal>
        </>
    );
}
