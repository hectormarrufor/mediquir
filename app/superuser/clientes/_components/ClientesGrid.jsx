'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Avatar, Badge, Box, Group, Menu, Select, Text, TextInput, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { IconArrowDown, IconArrowUp, IconArrowsSort, IconBrandWhatsapp, IconDotsVertical, IconEye, IconKey } from '@tabler/icons-react';
import { validarCampoCliente } from '@/app/constants/clienteCampos';
import classes from '../../inventario/productos/_components/grid.module.css';
import { OPCIONES, textoEdicion } from './columnasClientes';
import FotoClienteModal from './FotoClienteModal';
import { telefonoWhatsapp } from './AccesoModal';

const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;
const KEY = ['clientes', 'resumen'];
const limitar = (n, min, max) => Math.max(min, Math.min(max, n));
const cls = (...c) => c.filter(Boolean).join(' ');
const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (v) => `$${usd.format(Number(v) || 0)}`;
const fmtFecha = (v) => (v ? new Date(v).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }) : '');

// Editor que reemplaza la celda mientras se edita (no controlado: teclear no repinta la hoja).
//   Enter -> confirma y baja · Tab / Shift+Tab -> confirma y avanza / retrocede · Esc -> cancela · clic fuera -> confirma
function Editor({ col, edicion, onConfirmar, onCancelar }) {
    const ref = useRef(null);
    useEffect(() => {
        const el = ref.current;
        if (!el || col.tipo === 'select') return;
        if (edicion.seleccionar) el.select(); else el.setSelectionRange(el.value.length, el.value.length);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (col.tipo === 'select') {
        return (
            <Select
                autoFocus variant="unstyled" size="xs" data={OPCIONES[col.campo]} value={edicion.texto} defaultDropdownOpened allowDeselect={false}
                comboboxProps={{ withinPortal: true, zIndex: 400, width: 'max-content', position: 'bottom-start' }}
                classNames={{ input: classes.editor }}
                onChange={(v) => onConfirmar(v, 'abajo')}
                onDropdownClose={onCancelar}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); onCancelar(); } }}
            />
        );
    }
    return (
        <TextInput
            ref={ref} autoFocus variant="unstyled" size="xs" inputMode={col.tipo === 'numero' ? 'numeric' : 'text'}
            defaultValue={edicion.texto} classNames={{ input: classes.editor }} styles={col.derecha ? { input: { textAlign: 'right' } } : undefined}
            onBlur={(e) => onConfirmar(e.currentTarget.value, null)}
            onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); onConfirmar(e.currentTarget.value, 'abajo'); }
                else if (e.key === 'Tab') { e.preventDefault(); onConfirmar(e.currentTarget.value, e.shiftKey ? 'izquierda' : 'derecha'); }
                else if (e.key === 'Escape') { e.preventDefault(); onCancelar(); }
            }}
        />
    );
}

// Hoja de cálculo de clientes. Se edita en la celda y cada cambio se guarda al instante.
// Flechas / Tab (mover) · Enter o F2 (editar) · escribir (reemplaza) · Esc (cancelar) · Supr (vaciar) · Ctrl+C (copiar) · Ctrl+Z (deshacer)
export default function ClientesGrid({ filas, columnas, permisos, orden, onOrden, onFicha, onAcceso }) {
    const queryClient = useQueryClient();
    const navegables = useMemo(() => columnas.filter((c) => !c.fija), [columnas]);
    const [activa, setActiva] = useState(null);      // { r, c } sobre `navegables`
    const [edicion, setEdicion] = useState(null);    // { r, c, texto, seleccionar, error }
    const [estados, setEstados] = useState({});      // `${id}:${campo}` -> { estado, mensaje }
    const [fotoDe, setFotoDe] = useState(null);
    const edicionRef = useRef(null);
    const contRef = useRef(null);
    const filasRef = useRef(filas);
    const historial = useRef([]);
    edicionRef.current = edicion;
    filasRef.current = filas;

    const editable = useCallback((col) => Boolean(col.campo) && permisos.editar && (!col.soloAdmin || permisos.editarCredito), [permisos]);

    const izquierda = useMemo(() => {
        let acumulado = 0;
        const mapa = {};
        columnas.forEach((c) => { if (c.sticky || c.key === 'imagen') { mapa[c.key] = acumulado; acumulado += c.ancho; } });
        return mapa;
    }, [columnas]);
    const anchoTotal = useMemo(() => columnas.reduce((s, c) => s + c.ancho, 0), [columnas]);

    useEffect(() => {
        setActiva((a) => (a ? { r: limitar(a.r, 0, Math.max(0, filas.length - 1)), c: limitar(a.c, 0, Math.max(0, navegables.length - 1)) } : a));
    }, [filas.length, navegables.length]);

    const enfocar = () => contRef.current?.focus({ preventScroll: true });
    const irA = useCallback((r, c) => {
        const rr = limitar(r, 0, filas.length - 1);
        const cc = limitar(c, 0, navegables.length - 1);
        setActiva({ r: rr, c: cc });
        requestAnimationFrame(() => contRef.current?.querySelector(`[data-r="${rr}"][data-c="${cc}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    }, [filas.length, navegables.length]);

    const marcar = useCallback((clave, estado, ms) => {
        setEstados((e) => ({ ...e, [clave]: estado }));
        if (ms) setTimeout(() => setEstados((e) => { const { [clave]: _, ...resto } = e; return resto; }), ms);
    }, []);

    const parchear = useCallback((id, cambio) => {
        queryClient.setQueryData(KEY, (d) => (d ? { ...d, clientes: d.clientes.map((c) => (c.id === id ? { ...c, ...cambio } : c)) } : d));
    }, [queryClient]);

    // Guarda UNA celda: se ve al instante (optimista) y, si el servidor la rechaza, vuelve al valor anterior
    const guardarCelda = useCallback(async (fila, campo, valor, { deHistorial = false } = {}) => {
        const antes = fila[campo] ?? null;
        if (antes === valor) return true;
        const clave = `${fila.id}:${campo}`;
        marcar(clave, { estado: 'guardando' });
        parchear(fila.id, { [campo]: valor });
        try {
            const res = await fetch(`/api/clientes/${fila.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [campo]: valor }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
            marcar(clave, { estado: 'ok' }, 1400);
            if (!deHistorial) historial.current.push({ id: fila.id, campo, antes });
            queryClient.invalidateQueries({ queryKey: ['cliente'] });
            return true;
        } catch (error) {
            parchear(fila.id, { [campo]: antes });
            marcar(clave, { estado: 'error', mensaje: error.message }, 5000);
            notifications.show({ color: 'red', title: 'No se guardó', message: `${fila.nombre || fila.identificacion}: ${error.message}` });
            return false;
        }
    }, [marcar, parchear, queryClient]);

    const deshacer = useCallback(async () => {
        const ultima = historial.current.pop();
        if (!ultima) return;
        const fila = filasRef.current.find((f) => f.id === ultima.id);
        if (fila && await guardarCelda(fila, ultima.campo, ultima.antes, { deHistorial: true })) notifications.show({ color: 'gray', message: `Deshecho: ${fila.nombre || fila.identificacion}`, autoClose: 2000 });
    }, [guardarCelda]);

    const iniciarEdicion = (r, c, texto) => {
        const col = navegables[c];
        if (!col || !filas[r] || !editable(col)) return;
        setEdicion({ r, c, texto: texto ?? textoEdicion(filas[r], col), seleccionar: texto === undefined });
    };
    const cancelar = () => { edicionRef.current = null; setEdicion(null); enfocar(); };

    // direccion: 'abajo' | 'derecha' | 'izquierda' | null (clic fuera)
    const confirmar = (crudo, direccion) => {
        const ed = edicionRef.current;
        if (!ed) return;
        const col = navegables[ed.c];
        const fila = filas[ed.r];
        const v = validarCampoCliente(col.campo, crudo);
        if (!v.ok) {
            if (direccion === null) return cancelar();          // clic fuera con valor inválido: se descarta
            return setEdicion({ ...ed, error: v.error });       // Enter/Tab: sigue editando y explica el motivo
        }
        edicionRef.current = null;
        setEdicion(null);
        guardarCelda(fila, col.campo, col.campo === 'identificacion' ? v.valor.toUpperCase() : v.valor);
        if (direccion === 'abajo') irA(ed.r + 1, ed.c);
        if (direccion === 'derecha') irA(ed.r, ed.c + 1);
        if (direccion === 'izquierda') irA(ed.r, ed.c - 1);
        enfocar();
    };

    const onKeyDown = (e) => {
        if (edicionRef.current || !activa) return;
        const { r, c } = activa;
        const mod = e.ctrlKey || e.metaKey;
        const tecla = e.key;
        const ir = (dr, dc) => { e.preventDefault(); irA(r + dr, c + dc); };

        if (tecla === 'ArrowDown') ir(1, 0);
        else if (tecla === 'ArrowUp') ir(-1, 0);
        else if (tecla === 'ArrowRight') ir(0, 1);
        else if (tecla === 'ArrowLeft') ir(0, -1);
        else if (tecla === 'Tab') ir(0, e.shiftKey ? -1 : 1);
        else if (tecla === 'PageDown') ir(10, 0);
        else if (tecla === 'PageUp') ir(-10, 0);
        else if (tecla === 'Home') { e.preventDefault(); irA(mod ? 0 : r, 0); }
        else if (tecla === 'End') { e.preventDefault(); irA(mod ? filas.length - 1 : r, navegables.length - 1); }
        else if (tecla === 'Enter' || tecla === 'F2') { e.preventDefault(); iniciarEdicion(r, c); }
        else if ((tecla === 'Delete' || tecla === 'Backspace') && editable(navegables[c])) {
            const col = navegables[c];
            if (col.tipo === 'texto' && validarCampoCliente(col.campo, '').ok) { e.preventDefault(); guardarCelda(filas[r], col.campo, null); }
        } else if (mod && tecla.toLowerCase() === 'z') { e.preventDefault(); deshacer(); }
        else if (mod && tecla.toLowerCase() === 'c') { const v = filas[r][navegables[c].campo ?? navegables[c].key]; navigator.clipboard?.writeText(v === null || v === undefined ? '' : String(v)); }
        else if (!mod && !e.altKey && tecla.length === 1 && navegables[c]?.tipo !== 'select') { e.preventDefault(); iniciarEdicion(r, c, tecla); }
    };

    const contenido = (fila, col) => {
        switch (col.key) {
            case 'imagen':
                return (
                    <UnstyledButton onClick={() => setFotoDe(fila)} aria-label="Ver o cambiar la imagen" style={{ display: 'block' }}>
                        <Avatar src={fila.imagen ? `${BLOB}/${fila.imagen}` : null} alt="" size={30} radius="xl" styles={{ image: { objectFit: 'contain' } }}>{(fila.nombre || fila.identificacion || '?').charAt(0).toUpperCase()}</Avatar>
                    </UnstyledButton>
                );
            case 'nombre': return fila.nombre || <Text span size="xs" c="dimmed">Sin nombre</Text>;
            case 'esContribuyenteEspecial': return fila.esContribuyenteEspecial ? <Badge size="xs" variant="light" color="grape">Especial</Badge> : <Text span size="xs" c="dimmed">No</Text>;
            case 'retencionIvaPorDefecto': return fila.esContribuyenteEspecial ? `${fila.retencionIvaPorDefecto}%` : <span className={classes.noAplica}>—</span>;
            case 'creditosActivos': {
                if (!(fila.maxPedidosCredito > 0) || !(fila.diasCredito > 0)) return <Text span size="xs" c="dimmed">Sin crédito</Text>;
                const lleno = fila.creditosActivos >= fila.maxPedidosCredito;
                return <Text span size="xs" fw={lleno ? 800 : 500} c={lleno ? 'orange.8' : undefined}>{fila.creditosActivos} / {fila.maxPedidosCredito}</Text>;
            }
            case 'compras': return fila.compras === null ? '' : fmtUsd(fila.compras);
            case 'saldo': return fila.saldo > 0 ? <Badge color="orange" variant="light" size="sm">{fmtUsd(fila.saldo)}</Badge> : <span className={classes.noAplica}>—</span>;
            case 'pedidos': return fila.pedidos ?? '';
            case 'ultimaCompra': return fmtFecha(fila.ultimaCompra) || <span className={classes.noAplica}>—</span>;
            case 'usuario': return fila.usuario ? <Badge color="teal" variant="light" size="sm" tt="none">{fila.usuario}</Badge> : <Badge color="gray" variant="outline" size="sm">Sin acceso</Badge>;
            case 'acciones':
                return (
                    <Menu position="bottom-end" withinPortal shadow="md">
                        <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label="Acciones"><IconDotsVertical size={16} /></ActionIcon></Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item leftSection={<IconEye size={14} />} onClick={() => onFicha(fila.id)}>Ver ficha</Menu.Item>
                            {permisos.editar && <Menu.Item leftSection={<IconKey size={14} />} onClick={() => onAcceso(fila)}>{fila.usuario ? 'Restablecer contraseña' : 'Crear acceso B2B'}</Menu.Item>}
                            {telefonoWhatsapp(fila.telefono) && <Menu.Item component="a" href={`https://wa.me/${telefonoWhatsapp(fila.telefono)}`} target="_blank" leftSection={<IconBrandWhatsapp size={14} />}>WhatsApp</Menu.Item>}
                        </Menu.Dropdown>
                    </Menu>
                );
            default: {
                const v = fila[col.campo];
                return v === null || v === undefined ? '' : String(v);
            }
        }
    };

    const iconoOrden = (col) => (orden.sort !== col.orden ? <IconArrowsSort size={12} opacity={0.4} /> : orden.dir === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />);

    return (
        <>
            <div ref={contRef} className={classes.contenedor} tabIndex={0} role="grid" aria-rowcount={filas.length} onKeyDown={onKeyDown}>
                <table className={classes.tabla} style={{ width: anchoTotal, minWidth: '100%' }}>
                    <colgroup>{columnas.map((c) => <col key={c.key} style={{ width: c.ancho }} />)}</colgroup>
                    <thead>
                        <tr>
                            {columnas.map((col) => (
                                <th
                                    key={col.key} title={col.ayuda}
                                    className={cls(classes.th, col.orden && classes.thOrden, orden.sort === col.orden && classes.thActivo, izquierda[col.key] !== undefined && classes.fija)}
                                    style={{ left: izquierda[col.key], textAlign: col.derecha ? 'right' : 'left' }}
                                    onClick={col.orden ? () => onOrden(col.orden) : undefined}
                                >
                                    <Group gap={4} wrap="nowrap" justify={col.derecha ? 'flex-end' : 'flex-start'}>{col.label}{col.orden && iconoOrden(col)}</Group>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filas.length === 0 && <tr><td colSpan={columnas.length}><Box p="xl" ta="center"><Text c="dimmed">No hay clientes con esos filtros.</Text></Box></td></tr>}
                        {filas.map((fila, r) => (
                            <tr key={fila.id} className={classes.fila}>
                                {columnas.map((col) => {
                                    const c = navegables.indexOf(col);
                                    const esActiva = activa?.r === r && activa?.c === c;
                                    const editando = edicion?.r === r && edicion?.c === c;
                                    const puede = c >= 0 && editable(col);
                                    const estado = puede ? estados[`${fila.id}:${col.campo}`] : undefined;
                                    return (
                                        <td
                                            key={col.key} role="gridcell" data-r={r} data-c={c}
                                            data-activa={esActiva || undefined} data-editando={editando || undefined} data-estado={estado?.estado} title={estado?.mensaje}
                                            className={cls(classes.td, col.derecha && classes.derecha, !puede && classes.solo, izquierda[col.key] !== undefined && classes.fija)}
                                            style={{ left: izquierda[col.key] }}
                                            onMouseDown={c >= 0 ? () => { setActiva({ r, c }); if (!edicionRef.current) setTimeout(enfocar, 0); } : undefined}
                                            onDoubleClick={puede ? () => iniciarEdicion(r, c) : undefined}
                                        >
                                            {editando
                                                ? <>
                                                    <Editor col={col} edicion={edicion} onConfirmar={confirmar} onCancelar={cancelar} />
                                                    {edicion.error && <div className={classes.errorEdicion}>{edicion.error}</div>}
                                                </>
                                                : contenido(fila, col)}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <FotoClienteModal
                cliente={fotoDe ? (filas.find((f) => f.id === fotoDe.id) || fotoDe) : null} puedeEditar={permisos.editar}
                onCerrar={() => setFotoDe(null)} onCambiar={(nombre) => guardarCelda(fotoDe, 'imagen', nombre)}
            />
        </>
    );
}
