'use client';

// Lectura de la factura del proveedor con IA: utilidades y la ventana donde la persona revisa cada renglón leído.
// Regla: la IA PROPONE, la persona decide. Ningún renglón pasa a la compra sin que alguien le haya elegido el producto.
import React, { useMemo, useState } from 'react';
import { Alert, Badge, Box, Button, Checkbox, Group, Modal, NumberInput, Paper, ScrollArea, SegmentedControl, Select, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconSparkles } from '@tabler/icons-react';
import { buscarProductos, normalizar } from '@/app/helpers/busquedaProductos';
import { claveRenglonProveedor } from '@/app/constants/claveProveedor';

// Consulta de RIF del portal del SENIAT (tiene captcha: se abre en otra pestaña y la persona pega el RIF)
export const URL_SENIAT_RIF = 'http://contribuyente.seniat.gob.ve/BuscaRif/BuscaRif.jsp';
export const normRif = (r) => String(r || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fmt = (n, dec = 2) => Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: dec });

// La descripción del proveedor trae palabras de empaque ("CAJA X 100", "C/50", "UND") que estorban al buscar el producto
const limpiarParaBuscar = (texto) => String(texto || '')
    .replace(/\b(c\/|x|cj|cja|caja|cajas|bto|bulto|bultos|fardo|und|unds|unid|unidad|unidades|pza|pzas|ref)\b\.?/gi, ' ')
    .replace(/\b(x|c\/)\s*\d+\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();

const PRESENTACION_IA = { CAJA: 'caja', BULTO: 'bulto', UNIDAD: 'unidad' };

// Las tallas cuentan como medidas: «Faja ... L» no es la misma ficha que «Faja ... XL»
const TALLAS = new Set(['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl']);
const esMedida = (t) => /\d/.test(t) || TALLAS.has(t);

// Palabras y números de un texto, separando "x10" en "x" y "10" (así "1"X10" y "1" X 10" se comparan igual)
const fichas = (texto) => normalizar(texto).replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2').split(' ').filter((t) => t.length > 1 || esMedida(t));

// Muchos artículos tienen una ficha por marca con el mismo nombre (fajas, muletas, guantes...): la que vale es la marca que llegó.
// ¿La marca del producto está en la factura? (la que leyó la IA o dentro de la descripción, como palabra completa)
export const marcaEnFactura = (producto, linea) => {
    const marca = normalizar(producto?.marca?.nombre);
    if (marca.length < 2) return false;
    return ` ${normalizar(`${linea?.marca || ''} ${linea?.descripcion || ''}`)} `.includes(` ${marca} `);
};

// Fichas agrupadas por nombre, para ofrecer las otras marcas del mismo artículo
export const agruparPorNombre = (productos) => {
    const grupos = new Map();
    for (const p of productos || []) {
        const k = normalizar(p.nombre);
        grupos.set(k, [...(grupos.get(k) || []), p]);
    }
    return grupos;
};
const otrasMarcas = (producto, porNombre) => (producto ? (porNombre.get(normalizar(producto.nombre)) || []).filter((p) => Number(p.id) !== Number(producto.id)) : []);

// Reordena los candidatos del buscador: pesan las palabras en común y, sobre todo, que las MEDIDAS coincidan
// (con el buscador solo, «Durapore 1"» proponía primero «Durapore 1/2"»). Una medida o talla del producto que la factura no dice
// resta. La marca solo desempata: entre fichas del mismo artículo pasa adelante la de la marca que dice la factura, pero no
// adelanta a otro artículo de esa marca.
function reordenar(candidatos, linea) {
    const deFactura = new Set(fichas(linea.descripcion));
    return candidatos
        .map((p, i) => {
            const delProducto = fichas(p.nombre);
            const comunes = delProducto.filter((t) => deFactura.has(t)).length;
            const medidasAjenas = delProducto.filter((t) => esMedida(t) && !deFactura.has(t)).length;
            return { p, puntos: comunes - medidasAjenas * 1.5 + (marcaEnFactura(p, linea) ? 0.5 : 0), i };
        })
        .sort((a, b) => b.puntos - a.puntos || a.i - b.i)
        .map((x) => x.p);
}

/**
 * Prepara los renglones leídos para revisarlos: producto propuesto y presentación (unidad, caja o bulto).
 *  · Si este proveedor ya tiene ese código o descripción enlazado (se aprende al registrar compras), se propone ese producto.
 *    Si la factura dice otra marca y existe la ficha de ese mismo artículo en esa marca, se propone esa.
 *  · Si no, se ofrecen candidatos por parecido (con las demás marcas del mismo artículo), pero NO se elige ninguno: lo elige la persona.
 */
export function prepararRenglones(lineas, productos, equivalencias) {
    const porClave = new Map((equivalencias || []).map((e) => [e.clave, e]));
    const porId = new Map((productos || []).map((p) => [Number(p.id), p]));
    const porNombre = agruparPorNombre(productos);
    return (lineas || []).map((l, i) => {
        const clave = claveRenglonProveedor(l);
        const aprendido = clave ? porClave.get(clave) : null;
        let producto = aprendido ? porId.get(Number(aprendido.productoId)) : null;
        let origen = producto ? 'aprendido' : null;
        let unidadPorCodigo = null;
        // Algunos proveedores imprimen el código de barras del artículo (8 a 14 dígitos): si un producto lo tiene cargado, se propone
        const codigo = String(l.codigo || '').trim();
        if (!producto && /^\d{8,14}$/.test(codigo)) {
            for (const p of productos || []) {
                if (String(p.codigoBarras || '') === codigo) { producto = p; unidadPorCodigo = 'unidad'; break; }
                if (String(p.codigoBarrasCaja || '') === codigo) { producto = p; unidadPorCodigo = 'caja'; break; }
                if (String(p.codigoBarrasBulto || '') === codigo) { producto = p; unidadPorCodigo = 'bulto'; break; }
            }
            if (producto) origen = 'barras';
        }
        // Lo enlazado antes es de una marca; si esta vez la factura dice otra y existe esa ficha, se propone la de la factura
        if (origen === 'aprendido' && !marcaEnFactura(producto, l)) {
            const deLaFactura = otrasMarcas(producto, porNombre).find((p) => marcaEnFactura(p, l));
            if (deLaFactura) { producto = deLaFactura; origen = 'marca'; }
        }
        const top = reordenar(buscarProductos(productos, limpiarParaBuscar(l.descripcion)).slice(0, 15), l).slice(0, 3);
        // Junto a cada candidato, las demás marcas del mismo artículo (hasta 6 opciones): la persona elige la que llegó
        const candidatos = [...new Set(top.flatMap((p) => [p, ...otrasMarcas(p, porNombre)]).map((p) => Number(p.id)))].slice(0, 6);
        return {
            idx: i, clave, linea: l,
            productoId: producto ? Number(producto.id) : null,
            origen,
            candidatos,
            unidadCompra: (aprendido && (origen === 'aprendido' || origen === 'marca') && aprendido.unidadCompra) || unidadPorCodigo || PRESENTACION_IA[l.unidadVenta] || 'unidad',
            contenido: Number(l.unidadesPorPresentacion) > 1 ? Math.round(Number(l.unidadesPorPresentacion)) : null,
            incluir: true,
        };
    });
}

// Unidades que trae la presentación elegida: lo que leyó la IA o, si no, lo que dice la ficha del producto
const contenidoDe = (fila, producto) => {
    if (fila.unidadCompra === 'unidad') return 1;
    if (Number(fila.contenido) > 1) return Number(fila.contenido);
    if (fila.unidadCompra === 'caja') return Number(producto?.unidadesPorCaja) || 0;
    return Number(producto?.unidadesPorBulto) > 1 ? Number(producto.unidadesPorBulto) : 0;
};

// Hay fichas con el mismo nombre: el código y la marca ayudan a elegir la correcta
const etiquetaProducto = (p) => `${p.nombre} · ${p.codigo}${p.marca?.nombre ? ` · ${p.marca.nombre}` : ''}`;

function FilaRenglon({ fila, opciones, porId, porNombre, simbolo, onCambiar }) {
    const l = fila.linea;
    const producto = fila.productoId ? porId.get(fila.productoId) : null;
    const hermanos = otrasMarcas(producto, porNombre);
    const marcaDistinta = producto && l.marca && !marcaEnFactura(producto, l);
    const candidatos = fila.candidatos.map((id) => porId.get(id)).filter(Boolean);
    const variasMarcas = candidatos.some((p) => otrasMarcas(p, porNombre).length > 0);
    const chip = (p) => {
        const deLaFactura = marcaEnFactura(p, l);
        return (
            <Button key={p.id} size="compact-xs" variant={deLaFactura ? 'filled' : 'light'} color={deLaFactura ? 'teal' : 'grape'} tt="none"
                onClick={() => onCambiar({ productoId: Number(p.id), origen: 'elegido' })} title={`Stock ${p.stockAlmacen ?? '—'}${deLaFactura ? ' · es la marca que dice la factura' : ''}`}>
                {deLaFactura ? '✓ ' : ''}{etiquetaProducto(p)}
            </Button>
        );
    };
    const contenido = contenidoDe(fila, producto);
    const faltaContenido = Boolean(producto) && fila.unidadCompra !== 'unidad' && !(contenido > 1);
    const ivaFicha = Number(producto?.porcentajeIva ?? 16);
    const ivaDistinto = producto && ((l.exento && ivaFicha > 0) || (!l.exento && ivaFicha === 0));
    const fichaCaja = Number(producto?.unidadesPorCaja) || 0;
    const fichaBulto = Number(producto?.unidadesPorBulto) > 1 ? Number(producto.unidadesPorBulto) : 0;
    const enFicha = fila.unidadCompra === 'caja' ? fichaCaja : fichaBulto;
    const cambiaFicha = producto && fila.unidadCompra !== 'unidad' && contenido > 1 && contenido !== enFicha;
    const total = l.totalLinea ?? r2((l.precioUnitario || 0) * (l.cantidad || 0));

    return (
        <Paper withBorder radius="md" p="sm" style={{ borderLeft: `4px solid var(--mantine-color-${!fila.incluir ? 'gray' : producto ? (faltaContenido ? 'orange' : 'teal') : 'orange'}-5)`, opacity: fila.incluir ? 1 : 0.6 }}>
            <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                <Box style={{ minWidth: 0 }}>
                    <Text size="sm" fw={700} lh={1.3}>{fila.idx + 1}. {l.descripcion}</Text>
                    <Text size="xs" c="dimmed">
                        {l.codigo ? `Cód. proveedor ${l.codigo} · ` : ''}{l.marca ? <>Marca <b>{l.marca}</b> · </> : ''}{fmt(l.cantidad, 3)} {l.unidadVenta ? l.unidadVenta.toLowerCase() : ''} × {simbolo} {fmt(l.precioUnitario, 4)} = <b>{simbolo} {fmt(total)}</b>
                    </Text>
                </Box>
                <Group gap={6} wrap="nowrap">
                    <Badge size="sm" variant="light" color={l.exento ? 'gray' : 'blue'}>{l.exento ? 'Exento' : 'IVA'}</Badge>
                    <Checkbox size="xs" label="Incluir" checked={fila.incluir} onChange={(e) => onCambiar({ incluir: e.currentTarget.checked })} />
                </Group>
            </Group>

            <Select mt={6} size="sm" searchable clearable limit={40} placeholder="Elige el producto del inventario…" nothingFoundMessage="No hay coincidencias"
                data={opciones} value={fila.productoId ? String(fila.productoId) : null}
                onChange={(v) => onCambiar({ productoId: v ? Number(v) : null, origen: v ? 'elegido' : null })} />
            {fila.origen === 'aprendido' && <Text size="xs" c="teal.8" mt={2}>✓ Ya enlazado antes con este proveedor (puedes cambiarlo)</Text>}
            {fila.origen === 'barras' && <Text size="xs" c="teal.8" mt={2}>✓ El código de la factura es el código de barras de este producto (puedes cambiarlo)</Text>}
            {fila.origen === 'marca' && <Text size="xs" c="teal.8" mt={2}>✓ Este artículo ya estaba enlazado con este proveedor; propongo la ficha de la marca que dice la factura (puedes cambiarla)</Text>}
            {marcaDistinta && (
                <Text size="xs" c="orange.8" mt={2}>
                    Ojo: la factura dice marca <b>{l.marca}</b> y esta ficha {producto.marca?.nombre ? <>es de <b>{producto.marca.nombre}</b></> : 'no tiene marca'}. Elige la ficha de la marca que llegó o, si no existe, créala en el inventario.
                </Text>
            )}
            {producto && hermanos.length > 0 && (
                <Group gap={4} mt={6}>
                    <Text size="xs" c="dimmed">Mismo artículo en otra marca:</Text>
                    {hermanos.slice(0, 6).map(chip)}
                </Group>
            )}
            {!producto && candidatos.length > 0 && (
                <>
                    <Group gap={4} mt={6}>
                        <Text size="xs" c="dimmed">¿Es alguno de estos?</Text>
                        {candidatos.map(chip)}
                    </Group>
                    {variasMarcas && !l.marca && <Text size="xs" c="orange.8" mt={2}>Este artículo tiene fichas de varias marcas y la factura no dice cuál: elige la marca que llegó (mírala en la mercancía).</Text>}
                </>
            )}

            {producto && (
                <Group gap="sm" mt={8} align="flex-end" wrap="wrap">
                    <Box>
                        <Text size="xs" c="dimmed" mb={2}>La cantidad de la factura son…</Text>
                        <SegmentedControl size="xs" value={fila.unidadCompra}
                            // Las unidades por caja/bulto leídas valen solo para la presentación que dijo la factura
                            onChange={(v) => onCambiar({ unidadCompra: v, contenido: PRESENTACION_IA[l.unidadVenta] === v && Number(l.unidadesPorPresentacion) > 1 ? Math.round(Number(l.unidadesPorPresentacion)) : null })}
                            data={[{ value: 'unidad', label: 'Unidades' }, { value: 'caja', label: 'Cajas' }, { value: 'bulto', label: 'Bultos' }]} />
                    </Box>
                    {fila.unidadCompra !== 'unidad' && (
                        <NumberInput size="xs" w={150} min={2} allowDecimal={false} allowNegative={false} hideControls
                            label={`Unidades por ${fila.unidadCompra}`} value={fila.contenido ?? (enFicha || '')}
                            onChange={(v) => onCambiar({ contenido: Number(v) > 1 ? Math.floor(Number(v)) : null })}
                            description={enFicha ? `En la ficha: ${enFicha}` : 'La ficha no lo tiene'} error={faltaContenido ? 'Indica cuántas unidades trae' : null} />
                    )}
                </Group>
            )}
            {cambiaFicha && <Text size="xs" c="orange.8" mt={4}>Al registrar la compra se guardará en la ficha: {fila.unidadCompra} de {contenido} unidades{enFicha ? ` (antes ${enFicha})` : ''}.</Text>}
            {ivaDistinto && (
                <Text size="xs" c="red.7" mt={4}>
                    Ojo: en la factura este renglón {l.exento ? 'es EXENTO' : 'lleva IVA'}, pero la ficha del producto dice {ivaFicha > 0 ? `IVA ${ivaFicha}%` : 'exento'}. La compra usará lo de la ficha: si la ficha está mal, corrígela.
                </Text>
            )}
        </Paper>
    );
}

/** Ventana de revisión: un renglón de la factura por tarjeta, con el producto propuesto o los candidatos para elegir. */
export function RevisionRenglonesIA({ opened, onClose, renglonesIniciales, productos, simbolo, proveedorNombre, onConfirmar }) {
    const [filas, setFilas] = useState(renglonesIniciales || []);
    const porId = useMemo(() => new Map((productos || []).map((p) => [Number(p.id), p])), [productos]);
    const porNombre = useMemo(() => agruparPorNombre(productos), [productos]);
    const opciones = useMemo(() => (productos || []).map((p) => ({ value: String(p.id), label: etiquetaProducto(p) })), [productos]);
    const cambiar = (idx, cambios) => setFilas((prev) => prev.map((f) => (f.idx === idx ? { ...f, ...cambios } : f)));

    const incluidas = filas.filter((f) => f.incluir);
    const listas = incluidas.filter((f) => f.productoId && !(f.unidadCompra !== 'unidad' && !(contenidoDe(f, porId.get(f.productoId)) > 1)));
    const pendientes = incluidas.length - listas.length;

    return (
        // Debajo de la ficha de proveedor nuevo (zIndex 2000): si el proveedor no existe, primero se registra
        <Modal opened={opened} onClose={onClose} size="xl" fullScreen={typeof window !== 'undefined' && window.innerWidth < 768} zIndex={1900} centered
            title={<Group gap={6}><IconSparkles size={20} color="var(--mantine-color-grape-6)" /><Text fw={800}>Renglones leídos de la factura{proveedorNombre ? ` de ${proveedorNombre}` : ''}</Text></Group>}>
            <Stack gap="sm">
                <Alert color="grape" variant="light" p="xs">
                    <Text size="sm">La IA <b>propone</b>; tú decides. Elige el producto de cada renglón y en qué viene (unidades, cajas o bultos). Lo que confirmes queda recordado para la próxima factura de este proveedor, y el empaque que indiques se guarda en la ficha del producto.</Text>
                </Alert>
                <ScrollArea.Autosize mah="60vh" type="auto">
                    <Stack gap="xs">
                        {filas.map((f) => <FilaRenglon key={f.idx} fila={f} opciones={opciones} porId={porId} porNombre={porNombre} simbolo={simbolo} onCambiar={(c) => cambiar(f.idx, c)} />)}
                    </Stack>
                </ScrollArea.Autosize>
                <Group justify="space-between" wrap="wrap" gap="xs">
                    <Text size="sm" c={pendientes ? 'orange.8' : 'dimmed'}>
                        {listas.length} de {filas.length} renglón(es) listos{pendientes ? ` · ${pendientes} sin producto o sin unidades por caja/bulto (no se pasan)` : ''}
                    </Text>
                    <Group gap="xs">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button color="green" leftSection={<IconCheck size={18} />} disabled={!listas.length} onClick={() => onConfirmar(listas.map((f) => ({ ...f, contenido: contenidoDe(f, porId.get(f.productoId)) })))}>
                            Pasar {listas.length} renglón(es) a la compra
                        </Button>
                    </Group>
                </Group>
            </Stack>
        </Modal>
    );
}

/**
 * Cuadre con lo impreso en la factura (el SENIAT exige que base, IVA y total coincidan al céntimo).
 * `impreso`: lo que leyó la IA · `calculado`: lo que da la compra con sus renglones.
 */
export function CuadreFactura({ impreso, calculado, simbolo, tasa, renglonesFactura, renglonesCompra, ivaAjustado, onUsarIvaImpreso, onQuitarAjuste }) {
    const filas = [
        ['Base imponible', impreso.baseImponible, calculado.base],
        ['Exento', impreso.montoExento, calculado.exento],
        ['IVA', impreso.montoIva, calculado.ivaCalculado],
        ['Total', impreso.total, calculado.total],
    ].filter(([, imp]) => imp !== null && imp !== undefined);
    const dif = (a, b) => Math.abs(r2(a) - r2(b));
    const descuadres = filas.filter(([, imp, calc]) => dif(imp, calc) > 0.005);
    const difIva = impreso.montoIva !== null && impreso.montoIva !== undefined ? dif(impreso.montoIva, calculado.ivaCalculado) : null;
    const soloCentimosIva = difIva !== null && difIva > 0.005 && difIva <= 0.5;
    if (!filas.length) return null;
    return (
        <Alert mt="xs" p="xs" color={descuadres.length ? 'orange' : 'teal'} variant="light" icon={descuadres.length ? <IconAlertTriangle size={18} /> : <IconCheck size={18} />}
            title={descuadres.length ? 'La compra todavía no cuadra con la factura' : 'Cuadra al céntimo con la factura'}>
            <Stack gap={2}>
                {renglonesCompra !== renglonesFactura && <Text size="xs">La factura trae {renglonesFactura} renglón(es) y la compra tiene {renglonesCompra}.</Text>}
                {filas.map(([nombre, imp, calc]) => (
                    <Text key={nombre} size="xs" c={dif(imp, calc) > 0.005 ? 'orange.9' : undefined}>
                        {nombre}: factura {simbolo} {fmt(imp)} · compra {simbolo} {fmt(calc)}{dif(imp, calc) > 0.005 ? ` (diferencia ${fmt(dif(imp, calc))})` : ' ✓'}
                    </Text>
                ))}
                {/* Solo de referencia: el proveedor también imprime el total en dólares; el documento fiscal es el de bolívares */}
                {simbolo === 'Bs' && Number(impreso.totalUsd) > 0 && tasa > 0 && (
                    <Text size="xs" c="dimmed">En dólares: factura $ {fmt(impreso.totalUsd)} · compra a la tasa {fmt(tasa)}: $ {fmt(calculado.total / tasa)}</Text>
                )}
                {ivaAjustado !== null && <Text size="xs" fw={700}>IVA ajustado al impreso: {simbolo} {fmt(ivaAjustado)} <Button size="compact-xs" variant="subtle" onClick={onQuitarAjuste}>Quitar ajuste</Button></Text>}
                {ivaAjustado === null && soloCentimosIva && onUsarIvaImpreso && (
                    <Group gap={6} mt={2}>
                        <Text size="xs">El IVA difiere solo por céntimos (redondeo del proveedor).</Text>
                        <Button size="compact-xs" color="orange" variant="light" onClick={onUsarIvaImpreso}>Usar el IVA de la factura</Button>
                    </Group>
                )}
            </Stack>
        </Alert>
    );
}
