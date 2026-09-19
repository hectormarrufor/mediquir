'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Group, Text } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react';
import { CAMPOS, CAMPOS_GRUPO, parseNumero, validarCampo } from '@/app/constants/inventarioCampos';
import { editableEn, estadoDe, resolverOpcion, textoEdicion, valorDe } from '../_lib/columnas';
import CeldaEditor from './CeldaEditor';
import { renderCelda } from './renderCelda';
import classes from './grid.module.css';

const limitar = (n, min, max) => Math.max(min, Math.min(max, n));
const cls = (...c) => c.filter(Boolean).join(' ');
const specsDe = (edit) => (edit.tabla === 'grupo' ? CAMPOS_GRUPO : CAMPOS);

// Hoja de cálculo de inventario. Navegación y edición por teclado como Excel:
// flechas / Tab (mover) · Enter o F2 (editar) · escribir (reemplaza) · Esc (cancelar) · Supr (vaciar, si se permite)
// Ctrl+C (copiar celda) · Ctrl+V (pegar una celda o un bloque copiado de Excel) · Ctrl+Z (deshacer)
export default function InventarioGrid({
    items, columnas, opciones, puedeEditar, estados, orden, onOrden,
    onEditar, onPegarBloque, onDeshacer, onFicha, onEliminar, onFoto, onToggleGrupo, cargando,
    onAncho, onRestablecerAncho, onMoverColumna,
}) {
    const [sobre, setSobre] = useState(null); // columna sobre la que se está arrastrando otra
    const navegables = useMemo(() => columnas.filter((c) => !c.fija), [columnas]);
    const [activa, setActiva] = useState(null);       // { r, c } sobre `navegables`
    const [edicion, setEdicion] = useState(null);     // { r, c, texto, seleccionar, error }
    const edicionRef = useRef(null);
    const contRef = useRef(null);
    edicionRef.current = edicion;

    // Posición "left" de las columnas fijas (foto + código + producto)
    const izquierda = useMemo(() => {
        let acumulado = 0;
        const mapa = {};
        columnas.forEach((c) => { if (c.sticky || c.key === 'imagen') { mapa[c.key] = acumulado; acumulado += c.ancho; } });
        return mapa;
    }, [columnas]);
    const anchoTotal = useMemo(() => columnas.reduce((s, c) => s + c.ancho, 0), [columnas]);

    // Al cambiar de página la celda activa se reubica dentro de los límites
    useEffect(() => {
        setActiva((a) => (a ? { r: limitar(a.r, 0, Math.max(0, items.length - 1)), c: limitar(a.c, 0, Math.max(0, navegables.length - 1)) } : a));
    }, [items.length, navegables.length]);

    const enfocar = () => contRef.current?.focus({ preventScroll: true });

    const irA = useCallback((r, c) => {
        const rr = limitar(r, 0, items.length - 1);
        const cc = limitar(c, 0, navegables.length - 1);
        setActiva({ r: rr, c: cc });
        requestAnimationFrame(() => contRef.current?.querySelector(`[data-r="${rr}"][data-c="${cc}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    }, [items.length, navegables.length]);

    const iniciarEdicion = (r, c, texto) => {
        const col = navegables[c];
        const item = items[r];
        const edit = item && col && puedeEditar ? editableEn(item, col) : null;
        if (!edit) return;
        let base = '';
        if (edit.tabla === 'grupo') base = col.key === 'nombre' ? item.grupo.nombre : String(item.grupo.stockMinimoGlobal ?? 0);
        else if (col.tipo === 'numero') base = textoEdicion(valorDe(item.fila, col));
        else if (col.tipo !== 'tags' && col.tipo !== 'select') base = String(item.fila[col.campo] ?? '');
        setEdicion({ r, c, texto: texto ?? base, seleccionar: texto === undefined });
    };

    const cancelar = () => { edicionRef.current = null; setEdicion(null); enfocar(); };

    // direccion: 'abajo' | 'derecha' | 'izquierda' | null (clic fuera)
    const confirmar = (crudo, direccion) => {
        const ed = edicionRef.current;
        if (!ed) return; // ya se confirmó (evita doble envío entre Enter y blur)
        const col = navegables[ed.c];
        const item = items[ed.r];
        const edit = editableEn(item, col);

        // Las columnas calculadas (costo por unidad, por bulto...) se convierten al campo real que se guarda
        let valor = crudo;
        let error = null;
        if (edit.virtual) {
            const n = parseNumero(crudo);
            valor = Number.isFinite(n) ? edit.virtual.aReal(n, item.fila) : null;
            if (valor === null) error = 'Debe ser un número';
        }
        const v = error ? { ok: false, error } : validarCampo(edit.campo, valor, specsDe(edit));

        if (!v.ok) {
            if (direccion === null) return cancelar(); // clic fuera con valor inválido: se descarta
            return setEdicion({ ...ed, error: v.error }); // Enter/Tab: sigue editando y explica el motivo
        }
        edicionRef.current = null;
        setEdicion(null);
        onEditar(item, edit, v.valor);
        if (direccion === 'abajo') irA(ed.r + 1, ed.c);
        if (direccion === 'derecha') irA(ed.r, ed.c + 1);
        if (direccion === 'izquierda') irA(ed.r, ed.c - 1);
        enfocar();
    };

    const copiar = () => {
        if (!activa) return;
        const item = items[activa.r];
        const col = navegables[activa.c];
        const valor = item.k === 'grupo' ? (col.key === 'nombre' ? item.grupo.nombre : col.key === 'stockMinimo' ? item.grupo.stockMinimoGlobal : '') : valorDe(item.fila, col);
        navigator.clipboard?.writeText(valor === null || valor === undefined ? '' : String(valor).replace('.', ','));
    };

    // Pegar desde Excel: una celda o un bloque que empieza en la celda activa (solo columnas reales de productos)
    const pegar = (e) => {
        if (edicionRef.current || !activa || !puedeEditar) return;
        e.preventDefault();
        const texto = e.clipboardData.getData('text').replace(/\r/g, '').replace(/\n$/, '');
        if (!texto) return;
        const matriz = texto.split('\n').map((l) => l.split('\t'));
        const cambiosPorFila = [];
        const problemas = [];
        let celdas = 0;
        let omitidas = 0;

        matriz.forEach((valores, i) => {
            const item = items[activa.r + i];
            if (!item) return;
            if (item.k === 'grupo') { omitidas += 1; return; }
            const fila = item.fila;
            const cambios = {};
            valores.forEach((txt, j) => {
                const col = navegables[activa.c + j];
                const edit = col && editableEn(item, col);
                if (!edit || edit.virtual || col.tipo === 'tags') return;
                const crudo = col.tipo === 'select' ? resolverOpcion(col, txt, opciones) : txt;
                if (crudo === null) { problemas.push(`Fila ${activa.r + i + 1} · ${col.label}: "${txt}" no existe`); return; }
                const v = validarCampo(edit.campo, crudo);
                if (!v.ok) { problemas.push(`Fila ${activa.r + i + 1} · ${col.label}: ${v.error}`); return; }
                if (v.valor !== (fila[edit.campo] ?? null)) { cambios[edit.campo] = v.valor; celdas += 1; }
            });
            if (Object.keys(cambios).length) cambiosPorFila.push({ fila, cambios });
        });

        if (omitidas) problemas.push(`${omitidas} fila(s) de grupo se omiten (edítalas una a una)`);

        // Una sola celda: se trata como una edición normal (optimista y deshacible)
        if (celdas === 1 && problemas.length === 0) {
            const { fila, cambios } = cambiosPorFila[0];
            const campo = Object.keys(cambios)[0];
            const col = navegables.find((c) => c.campo === campo);
            return onEditar({ k: 'simple', fila }, { tabla: 'producto', campo, virtual: undefined, col }, cambios[campo]);
        }
        const lote = cambiosPorFila.map(({ fila, cambios }) => ({ id: fila.id, cambios, ...('stockAlmacen' in cambios ? { esperado: { stockAlmacen: fila.stockAlmacen } } : {}) }));
        onPegarBloque(lote, problemas, celdas);
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
        else if (tecla === 'End') { e.preventDefault(); irA(mod ? items.length - 1 : r, navegables.length - 1); }
        else if (tecla === 'Enter' || tecla === 'F2') { e.preventDefault(); iniciarEdicion(r, c); }
        else if ((tecla === 'Delete' || tecla === 'Backspace') && puedeEditar) {
            const edit = editableEn(items[r], navegables[c]);
            if (edit && !edit.virtual && validarCampo(edit.campo, '', specsDe(edit)).ok) { e.preventDefault(); onEditar(items[r], edit, null); }
        } else if (mod && tecla.toLowerCase() === 'z') { e.preventDefault(); onDeshacer(); }
        else if (mod && tecla.toLowerCase() === 'c') copiar();
        else if (!mod && !e.altKey && tecla.length === 1) { e.preventDefault(); iniciarEdicion(r, c, tecla); }
    };

    // Cambiar el ancho arrastrando el borde derecho del título (doble clic = ancho original)
    const iniciarAncho = (e, col) => {
        e.preventDefault();
        e.stopPropagation();
        const x0 = e.clientX;
        const w0 = col.ancho;
        const mover = (ev) => onAncho(col.key, limitar(Math.round(w0 + ev.clientX - x0), 50, 900));
        const soltar = () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); document.body.style.cursor = ''; };
        document.body.style.cursor = 'col-resize';
        window.addEventListener('mousemove', mover);
        window.addEventListener('mouseup', soltar);
    };
    const movible = (col) => !col.fija && !col.sticky;

    const iconoOrden = (col) => (orden.sort !== col.orden ? <IconArrowsSort size={12} opacity={0.4} /> : orden.dir === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />);
    const ctx = { onFoto, onToggleGrupo, onFicha, onEliminar, puedeEditar };

    const estadoFila = (item) => (item.k === 'grupo' ? item.grupo.estado : item.k === 'hijo' ? 'hijo' : estadoDe(item.fila.stockAlmacen, item.fila.stockMinimo));
    const claveEstado = (item, campo) => (item.k === 'grupo' ? `g${item.grupo.id}:${campo}` : `p${item.fila.id}:${campo}`);

    return (
        <div ref={contRef} className={cls(classes.contenedor, cargando && classes.cargando)} tabIndex={0} role="grid" aria-rowcount={items.length} onKeyDown={onKeyDown} onPaste={pegar}>
            <table className={classes.tabla} style={{ width: anchoTotal, minWidth: '100%' }}>
                <colgroup>{columnas.map((c) => <col key={c.key} style={{ width: c.ancho }} />)}</colgroup>
                <thead>
                    <tr>
                        {columnas.map((col) => (
                            <th
                                key={col.key}
                                title={col.ayuda}
                                className={cls(classes.th, col.orden && classes.thOrden, orden.sort === col.orden && classes.thActivo, izquierda[col.key] !== undefined && classes.fija, sobre === col.key && classes.thDestino)}
                                style={{ left: izquierda[col.key], textAlign: col.derecha ? 'right' : 'left' }}
                                onClick={col.orden ? () => onOrden(col.orden) : undefined}
                                draggable={movible(col)}
                                onDragStart={movible(col) ? (e) => { e.dataTransfer.setData('text/plain', col.key); e.dataTransfer.effectAllowed = 'move'; } : undefined}
                                onDragOver={movible(col) ? (e) => { e.preventDefault(); if (sobre !== col.key) setSobre(col.key); } : undefined}
                                onDragLeave={() => setSobre((s) => (s === col.key ? null : s))}
                                onDrop={movible(col) ? (e) => { e.preventDefault(); setSobre(null); onMoverColumna(e.dataTransfer.getData('text/plain'), col.key); } : undefined}
                                onDragEnd={() => setSobre(null)}
                                aria-sort={orden.sort === col.orden ? (orden.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                            >
                                <Group gap={4} wrap="nowrap" justify={col.derecha ? 'flex-end' : 'flex-start'}>{col.label}{col.orden && iconoOrden(col)}</Group>
                                {col.key !== 'imagen' && (
                                    <span className={classes.resize} onMouseDown={(e) => iniciarAncho(e, col)} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => { e.stopPropagation(); onRestablecerAncho(col.key); }} title="Arrastra para cambiar el ancho · doble clic para restablecer" />
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {items.length === 0 && (
                        <tr><td colSpan={columnas.length}><Box p="xl" ta="center"><Text c="dimmed">No hay productos que coincidan con los filtros.</Text></Box></td></tr>
                    )}
                    {items.map((item, r) => (
                        <tr key={item.key} className={cls(classes.fila, item.k === 'grupo' && classes.filaGrupo)} data-stock={estadoFila(item)}>
                            {columnas.map((col) => {
                                const c = navegables.indexOf(col);
                                const esActiva = activa?.r === r && activa?.c === c;
                                const editandoEsta = edicion?.r === r && edicion?.c === c;
                                const edit = c >= 0 && puedeEditar ? editableEn(item, col) : null;
                                const estado = edit ? estados[claveEstado(item, edit.campo)] : undefined;
                                return (
                                    <td
                                        key={col.key}
                                        role="gridcell"
                                        data-r={r}
                                        data-c={c}
                                        data-activa={esActiva || undefined}
                                        data-editando={editandoEsta || undefined}
                                        data-estado={estado?.estado}
                                        title={estado?.mensaje}
                                        className={cls(classes.td, col.derecha && classes.derecha, !edit && classes.solo, izquierda[col.key] !== undefined && classes.fija)}
                                        style={{ left: izquierda[col.key] }}
                                        onMouseDown={c >= 0 ? () => { setActiva({ r, c }); if (!edicionRef.current) setTimeout(enfocar, 0); } : undefined}
                                        onDoubleClick={edit ? () => iniciarEdicion(r, c) : undefined}
                                    >
                                        {editandoEsta
                                            ? <>
                                                <CeldaEditor col={col} fila={item.fila} opciones={opciones} edicion={edicion} onConfirmar={confirmar} onCancelar={cancelar} />
                                                {edicion.error && <div className={classes.errorEdicion}>{edicion.error}</div>}
                                            </>
                                            : renderCelda(item, col, ctx)}
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
