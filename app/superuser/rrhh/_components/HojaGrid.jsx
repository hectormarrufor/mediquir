'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Group, Select, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react';
import classes from '../../inventario/productos/_components/grid.module.css';

const limitar = (n, min, max) => Math.max(min, Math.min(max, n));
const cls = (...c) => c.filter(Boolean).join(' ');

// Texto de una celda para el editor / el portapapeles
const textoDe = (fila, col) => {
    const v = fila[col.campo ?? col.key];
    return v === null || v === undefined ? '' : String(v);
};

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
                autoFocus variant="unstyled" size="xs" data={col.opciones} value={edicion.texto} defaultDropdownOpened allowDeselect={Boolean(col.vaciable)}
                comboboxProps={{ withinPortal: true, zIndex: 400, width: 'max-content', position: 'bottom-start' }}
                classNames={{ input: classes.editor }}
                onChange={(v) => onConfirmar(v ?? '', 'abajo')}
                onDropdownClose={onCancelar}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); onCancelar(); } }}
            />
        );
    }
    return (
        <TextInput
            ref={ref} autoFocus variant="unstyled" size="xs" inputMode={col.tipo === 'numero' ? 'decimal' : 'text'}
            type={col.tipo === 'fecha' ? 'date' : 'text'}
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

// Validación por defecto de lo que se teclea. Cada columna puede traer la suya (`validar`).
function validar(col, crudo) {
    if (col.validar) return col.validar(crudo);
    const t = String(crudo ?? '').trim();
    if (col.tipo === 'numero') {
        if (t === '') return { ok: true, valor: null };
        const n = Number(t.replace(',', '.'));
        return Number.isFinite(n) && n >= 0 ? { ok: true, valor: n } : { ok: false, error: 'Escribe un número válido' };
    }
    if (t === '' && col.requerido) return { ok: false, error: 'No puede quedar vacío' };
    return { ok: true, valor: t === '' ? null : t };
}

// Hoja de cálculo reutilizable para RR. HH.: celda activa, edición en línea y guardado celda por celda.
//   Flechas / Tab (mover) · Enter o F2 (editar) · escribir (reemplaza) · Esc (cancelar) · Supr (vaciar) · Ctrl+C (copiar) · Ctrl+Z (deshacer)
//   columnas: { key, label, ancho, tipo: texto|numero|fecha|select|derivada|imagen|acciones, campo?, orden?, sticky?, fija?, derecha?, opciones?, requerido?, validar?, ayuda? }
//   guardar(fila, col, valor) -> Promise (debe lanzar Error si el servidor lo rechaza)
//   render(fila, col) -> nodo, o undefined para usar el texto tal cual
export default function HojaGrid({ filas, columnas, editable = false, orden, onOrden, guardar, render, vacio = 'No hay registros con esos filtros.', onAbrir }) {
    const navegables = useMemo(() => columnas.filter((c) => !c.fija), [columnas]);
    const [activa, setActiva] = useState(null);
    const [edicion, setEdicion] = useState(null);
    const [estados, setEstados] = useState({});
    const edicionRef = useRef(null);
    const contRef = useRef(null);
    const filasRef = useRef(filas);
    const historial = useRef([]);
    edicionRef.current = edicion;
    filasRef.current = filas;

    const puedeEditar = useCallback((col) => editable && ['texto', 'numero', 'fecha', 'select'].includes(col.tipo) && Boolean(col.campo) && !col.soloLectura, [editable]);

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

    const guardarCelda = useCallback(async (fila, col, valor, { deHistorial = false } = {}) => {
        const antes = fila[col.campo] ?? null;
        if ((antes ?? '') === (valor ?? '')) return true;
        const clave = `${fila.id}:${col.campo}`;
        marcar(clave, { estado: 'guardando' });
        try {
            await guardar(fila, col, valor);
            marcar(clave, { estado: 'ok' }, 1400);
            if (!deHistorial) historial.current.push({ id: fila.id, col, antes });
            return true;
        } catch (error) {
            marcar(clave, { estado: 'error', mensaje: error.message }, 5000);
            notifications.show({ color: 'red', title: 'No se guardó', message: error.message });
            return false;
        }
    }, [guardar, marcar]);

    const deshacer = useCallback(async () => {
        const ultima = historial.current.pop();
        if (!ultima) return;
        const fila = filasRef.current.find((f) => f.id === ultima.id);
        if (fila && await guardarCelda(fila, ultima.col, ultima.antes, { deHistorial: true })) notifications.show({ color: 'gray', message: 'Cambio deshecho', autoClose: 1800 });
    }, [guardarCelda]);

    const iniciarEdicion = (r, c, texto) => {
        const col = navegables[c];
        if (!col || !filas[r] || !puedeEditar(col)) return;
        setEdicion({ r, c, texto: texto ?? textoDe(filas[r], col), seleccionar: texto === undefined });
    };
    const cancelar = () => { edicionRef.current = null; setEdicion(null); enfocar(); };

    // direccion: 'abajo' | 'derecha' | 'izquierda' | null (clic fuera)
    const confirmar = (crudo, direccion) => {
        const ed = edicionRef.current;
        if (!ed) return;
        const col = navegables[ed.c];
        const v = validar(col, crudo);
        if (!v.ok) {
            if (direccion === null) return cancelar();
            return setEdicion({ ...ed, error: v.error });
        }
        edicionRef.current = null;
        setEdicion(null);
        guardarCelda(filas[ed.r], col, v.valor);
        if (direccion === 'abajo') irA(ed.r + 1, ed.c);
        if (direccion === 'derecha') irA(ed.r, ed.c + 1);
        if (direccion === 'izquierda') irA(ed.r, ed.c - 1);
        enfocar();
    };

    const onKeyDown = (e) => {
        if (edicionRef.current || !activa) return;
        const { r, c } = activa;
        const mod = e.ctrlKey || e.metaKey;
        const t = e.key;
        const ir = (dr, dc) => { e.preventDefault(); irA(r + dr, c + dc); };
        if (t === 'ArrowDown') ir(1, 0);
        else if (t === 'ArrowUp') ir(-1, 0);
        else if (t === 'ArrowRight') ir(0, 1);
        else if (t === 'ArrowLeft') ir(0, -1);
        else if (t === 'Tab') ir(0, e.shiftKey ? -1 : 1);
        else if (t === 'PageDown') ir(10, 0);
        else if (t === 'PageUp') ir(-10, 0);
        else if (t === 'Home') { e.preventDefault(); irA(mod ? 0 : r, 0); }
        else if (t === 'End') { e.preventDefault(); irA(mod ? filas.length - 1 : r, navegables.length - 1); }
        else if (t === 'Enter' || t === 'F2') { e.preventDefault(); iniciarEdicion(r, c); }
        else if ((t === 'Delete' || t === 'Backspace') && puedeEditar(navegables[c])) {
            const col = navegables[c];
            if (col.tipo !== 'select' && !col.requerido) { e.preventDefault(); guardarCelda(filas[r], col, null); }
        } else if (mod && t.toLowerCase() === 'z') { e.preventDefault(); deshacer(); }
        else if (mod && t.toLowerCase() === 'c') navigator.clipboard?.writeText(textoDe(filas[r], navegables[c]));
        else if (!mod && !e.altKey && t.length === 1 && puedeEditar(navegables[c]) && !['select', 'fecha'].includes(navegables[c].tipo)) { e.preventDefault(); iniciarEdicion(r, c, t); }
    };

    const iconoOrden = (col) => (orden.sort !== col.orden ? <IconArrowsSort size={12} opacity={0.4} /> : orden.dir === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />);

    return (
        <div ref={contRef} className={classes.contenedor} style={{ maxHeight: 'calc(100vh - 330px)' }} tabIndex={0} role="grid" aria-rowcount={filas.length} onKeyDown={onKeyDown}>
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
                    {filas.length === 0 && <tr><td colSpan={columnas.length}><Box p="xl" ta="center"><Text c="dimmed">{vacio}</Text></Box></td></tr>}
                    {filas.map((fila, r) => (
                        <tr key={fila.id} className={classes.fila} data-inactivo={fila.inactivo || undefined} style={fila.inactivo ? { opacity: 0.6 } : undefined}>
                            {columnas.map((col) => {
                                const c = navegables.indexOf(col);
                                const esActiva = activa?.r === r && activa?.c === c;
                                const editando = edicion?.r === r && edicion?.c === c;
                                const puede = c >= 0 && puedeEditar(col);
                                const estado = puede ? estados[`${fila.id}:${col.campo}`] : undefined;
                                const custom = render?.(fila, col);
                                return (
                                    <td
                                        key={col.key} role="gridcell" data-r={r} data-c={c}
                                        data-activa={esActiva || undefined} data-editando={editando || undefined} data-estado={estado?.estado} title={estado?.mensaje}
                                        className={cls(classes.td, col.derecha && classes.derecha, !puede && classes.solo, izquierda[col.key] !== undefined && classes.fija)}
                                        style={{ left: izquierda[col.key] }}
                                        onMouseDown={c >= 0 ? () => { setActiva({ r, c }); if (!edicionRef.current) setTimeout(enfocar, 0); } : undefined}
                                        onDoubleClick={puede ? () => iniciarEdicion(r, c) : (col.abre && onAbrir ? () => onAbrir(fila) : undefined)}
                                    >
                                        {editando
                                            ? <>
                                                <Editor col={col} edicion={edicion} onConfirmar={confirmar} onCancelar={cancelar} />
                                                {edicion.error && <div className={classes.errorEdicion}>{edicion.error}</div>}
                                            </>
                                            : (custom !== undefined ? custom : textoDe(fila, col))}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
