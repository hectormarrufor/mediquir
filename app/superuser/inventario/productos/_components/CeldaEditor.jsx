'use client';

import React, { useEffect, useRef } from 'react';
import { Select, TagsInput, TextInput } from '@mantine/core';
import classes from './grid.module.css';
import { opcionesDe } from '../_lib/columnas';

// Editor que reemplaza el contenido de la celda mientras se edita. Es "no controlado": el texto vive en el
// propio input, así que teclear no vuelve a pintar la hoja completa.
//   Enter  -> confirma y baja       Tab / Shift+Tab -> confirma y avanza / retrocede
//   Esc    -> cancela               Clic fuera      -> confirma (como Excel)
export default function CeldaEditor({ col, fila, opciones, edicion, onConfirmar, onCancelar }) {
    const ref = useRef(null);
    const valorRef = useRef(null); // etiquetas elegidas (el editor de etiquetas no es controlado)

    // Al empezar escribiendo, el cursor va al final; con F2 / doble clic se selecciona todo
    useEffect(() => {
        const el = ref.current;
        if (!el || col.tipo === 'select' || col.tipo === 'tags') return;
        if (edicion.seleccionar) el.select();
        else el.setSelectionRange(el.value.length, el.value.length);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (col.tipo === 'tags') {
        // Enter añade la etiqueta escrita; Ctrl+Enter, Tab o clic fuera guardan; Esc cancela
        return (
            <TagsInput
                autoFocus
                variant="unstyled"
                size="xs"
                data={(opciones?.tags || []).map((t) => t.nombre)}
                defaultValue={(fila.tags || []).map((t) => t.nombre)}
                defaultDropdownOpened
                comboboxProps={{ withinPortal: true, zIndex: 400, width: 'max-content', position: 'bottom-start' }}
                classNames={{ input: classes.editor }}
                placeholder="Añadir etiqueta…"
                onChange={(v) => { valorRef.current = v; }}
                onBlur={() => onConfirmar(valorRef.current ?? (fila.tags || []).map((t) => t.nombre), null)}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Escape') { e.preventDefault(); onCancelar(); }
                    else if (e.key === 'Tab') { e.preventDefault(); onConfirmar(valorRef.current ?? (fila.tags || []).map((t) => t.nombre), e.shiftKey ? 'izquierda' : 'derecha'); }
                    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onConfirmar(valorRef.current ?? (fila.tags || []).map((t) => t.nombre), 'abajo'); }
                }}
            />
        );
    }

    if (col.tipo === 'select') {
        const actual = fila[col.campo] === null || fila[col.campo] === undefined ? null : String(fila[col.campo]);
        return (
            <Select
                autoFocus
                searchable
                clearable={col.campo === 'grupoEquivalenciaId'}
                variant="unstyled"
                size="xs"
                data={opcionesDe(col, opciones)}
                value={actual}
                defaultDropdownOpened
                comboboxProps={{ withinPortal: true, zIndex: 400, width: 'max-content', position: 'bottom-start' }}
                classNames={{ input: classes.editor }}
                placeholder="Buscar…"
                onChange={(v) => onConfirmar(v ?? '', 'abajo')}
                onDropdownClose={onCancelar}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); onCancelar(); }
                }}
            />
        );
    }

    return (
        <TextInput
            ref={ref}
            autoFocus
            variant="unstyled"
            size="xs"
            inputMode={col.tipo === 'numero' ? 'decimal' : 'text'}
            defaultValue={edicion.texto}
            classNames={{ input: classes.editor }}
            styles={col.derecha ? { input: { textAlign: 'right' } } : undefined}
            onBlur={(e) => onConfirmar(e.currentTarget.value, null)}
            onKeyDown={(e) => {
                e.stopPropagation(); // el contenedor de la hoja no debe procesar estas teclas
                if (e.key === 'Enter') { e.preventDefault(); onConfirmar(e.currentTarget.value, 'abajo'); }
                else if (e.key === 'Tab') { e.preventDefault(); onConfirmar(e.currentTarget.value, e.shiftKey ? 'izquierda' : 'derecha'); }
                else if (e.key === 'Escape') { e.preventDefault(); onCancelar(); }
            }}
        />
    );
}
