'use client';

import React, { useEffect, useRef, useState } from 'react';

// Celda que se edita como en Excel: al hacer clic (o llegar con Tab) se vuelve un campo, Enter o salir de la celda guarda, Esc cancela.
//   tipo: 'texto' | 'numero' | 'fecha' | 'opciones' (con `opciones: [{ value, label }]`)
//   onGuardar(nuevoValor): puede ser async; si falla (lanza error) la celda vuelve a su valor anterior
//   formato(valor): cómo se ve cuando no se está editando
export default function CeldaEditable({ valor, tipo = 'texto', opciones = [], onGuardar, formato, align = 'left', placeholder = '', disabled = false, color, negrita = false, ancho }) {
    const [editando, setEditando] = useState(false);
    const [v, setV] = useState('');
    const [guardando, setGuardando] = useState(false);
    const ref = useRef(null);
    const cancelado = useRef(false);

    useEffect(() => {
        if (!editando) return;
        cancelado.current = false;
        setV(valor === null || valor === undefined ? '' : String(valor));
        const id = setTimeout(() => { ref.current?.focus(); ref.current?.select?.(); }, 0);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editando]);

    const salir = async () => {
        setEditando(false);
        if (cancelado.current) return;
        let nuevo = v;
        if (tipo === 'numero') nuevo = v === '' ? null : Number(String(v).replace(',', '.'));
        if (tipo === 'numero' && nuevo !== null && !Number.isFinite(nuevo)) return;
        const igual = tipo === 'numero' ? (nuevo === null ? (valor === null || valor === undefined) : Number(valor) === nuevo) : String(nuevo ?? '') === String(valor ?? '');
        if (igual) return;
        setGuardando(true);
        try { await onGuardar(nuevo); } catch { /* el que llama ya avisó el error */ } finally { setGuardando(false); }
    };

    const alinear = { textAlign: align };
    if (disabled) return <div style={{ padding: '3px 6px', minHeight: 26, ...alinear, color }}>{formato ? formato(valor) : (valor ?? '')}</div>;

    if (!editando) {
        const texto = formato ? formato(valor) : (valor ?? '');
        return (
            <div
                role="button" tabIndex={0} title="Clic para editar"
                onClick={() => setEditando(true)} onFocus={() => setEditando(true)}
                style={{ padding: '3px 6px', minHeight: 26, cursor: 'text', borderRadius: 3, opacity: guardando ? 0.5 : 1, fontWeight: negrita ? 700 : undefined, color, minWidth: ancho, ...alinear }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,139,230,0.08)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
                {texto === '' || texto === null ? <span style={{ opacity: 0.35 }}>{placeholder || '—'}</span> : texto}
            </div>
        );
    }

    const estilo = { width: '100%', minWidth: ancho || 70, padding: '2px 5px', border: '2px solid #228be6', borderRadius: 3, font: 'inherit', background: '#fff', color: '#000', outline: 'none', ...alinear };
    const teclas = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { cancelado.current = true; e.currentTarget.blur(); }
    };
    if (tipo === 'opciones') {
        return (
            <select ref={ref} value={v} style={estilo} onChange={(e) => setV(e.target.value)} onBlur={salir} onKeyDown={teclas}>
                {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        );
    }
    return (
        <input
            ref={ref} value={v} type={tipo === 'fecha' ? 'date' : 'text'} inputMode={tipo === 'numero' ? 'decimal' : undefined}
            style={estilo} onChange={(e) => setV(e.target.value)} onBlur={salir} onKeyDown={teclas}
        />
    );
}
