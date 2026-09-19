import React from 'react';
import { ActionIcon, Avatar, Badge, Group, Menu, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconDotsVertical, IconEdit, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { formatearNumero, margen, valorDe, valorInventario } from '../_lib/columnas';
import classes from './grid.module.css';

const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;
const ETIQUETA = { agotado: 'Agotado', bajo: 'Bajo mínimo', ok: 'Óptimo' };
const COLOR = { agotado: 'red', bajo: 'orange', ok: 'teal' };

// Foto efectiva: la del producto o, si no tiene, la de su marca
export const imagenDe = (fila) => (fila.imagen ? `${BLOB}/${fila.imagen}` : fila.marca?.imagen ? `${BLOB}/${fila.marca.imagen}` : null);

function Foto({ src, letra, onClick, radius = 'sm', titulo }) {
    return (
        <UnstyledButton onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label="Ver o cambiar la foto" title={titulo} style={{ display: 'block' }}>
            <Avatar src={src} alt="" size={30} radius={radius} imageProps={{ loading: 'lazy' }} styles={{ image: { objectFit: 'contain' } }}>{letra}</Avatar>
        </UnstyledButton>
    );
}

// Contenido de una celda según el tipo de fila (padre de grupo, hermano o producto suelto)
export function renderCelda(item, col, ctx) {
    if (item.k === 'grupo') return celdaGrupo(item, col, ctx);
    const fila = item.fila;

    switch (col.key) {
        case 'imagen': {
            const propia = Boolean(fila.imagen);
            return <Foto src={imagenDe(fila)} letra={fila.nombre?.charAt(0)} onClick={() => ctx.onFoto(item)} titulo={propia ? 'Foto del producto' : fila.marca?.imagen ? 'Foto de la marca (el producto no tiene foto propia)' : 'Sin foto'} />;
        }
        case 'nombre':
            // El nombre puede no caber en la columna: al pasar el ratón se ve completo
            return (
                <Tooltip label={fila.nombre} multiline w={340} openDelay={250} withArrow position="bottom-start">
                    {item.k === 'hijo' ? <span className={classes.hijoNombre}>{fila.nombre}</span> : <span>{fila.nombre}</span>}
                </Tooltip>
            );
        case 'stockAlmacen': return <span className={classes.stock}>{formatearNumero(fila.stockAlmacen, col)}</span>;
        case 'stockMinimo':
            return item.k === 'hijo'
                ? <span title="Este producto pertenece a un grupo: el mínimo se define en la fila del grupo" style={{ color: 'var(--mantine-color-gray-5)' }}>—</span>
                : formatearNumero(fila.stockMinimo, col);
        case 'grupoEquivalenciaId':
            return fila.grupo ? <Text span size="xs" c="dimmed">{fila.grupo.nombre}</Text> : <Text span c="dimmed" size="xs">—</Text>;
        case 'margen': {
            const m = margen(fila);
            if (m === null) return '';
            return <span className={m >= 0.3 ? classes.margenAlto : m < 0.1 ? classes.margenBajo : undefined}>{(m * 100).toFixed(0)}%</span>;
        }
        case 'valor': return valorInventario(fila).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        case 'unidadesPorCaja':
        case 'cajasPorBulto':
            return fila[col.campo] > 0 ? formatearNumero(fila[col.campo], col) : <span className={classes.noAplica}>—</span>;
        case 'unidadesPorBulto':
            return <span title={fila.unidadesPorCaja > 0 ? `${fila.cajasPorBulto ?? 1} cajas × ${fila.unidadesPorCaja} und` : 'Unidades del bulto, sin cajas'}>{formatearNumero(fila.unidadesPorBulto, col)}</span>;
        case 'tags':
            return fila.tags?.length
                ? <Group gap={4} wrap="nowrap">{fila.tags.slice(0, 2).map((t) => <Badge key={t.id} size="xs" color="gray" variant="light" tt="lowercase">{t.nombre}</Badge>)}{fila.tags.length > 2 && <Text span size="xs" c="dimmed">+{fila.tags.length - 2}</Text>}</Group>
                : <span className={classes.noAplica}>—</span>;
        case 'updatedAt': return <Text span size="xs" c="dimmed">{dayjs(fila.updatedAt).format('DD/MM/YY HH:mm')}</Text>;
        case 'acciones':
            return (
                <Menu position="bottom-end" withinPortal shadow="md">
                    <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label="Acciones"><IconDotsVertical size={16} /></ActionIcon></Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => ctx.onFicha(fila.id)}>Editar ficha completa</Menu.Item>
                        {ctx.puedeEditar && <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => ctx.onEliminar(fila)}>Eliminar</Menu.Item>}
                    </Menu.Dropdown>
                </Menu>
            );
        default: {
            if (col.tipo === 'numero') return formatearNumero(valorDe(fila, col), col);
            if (col.tipo === 'select') return col.ver(fila) ?? '';
            return fila[col.campo] ?? '';
        }
    }
}

function celdaGrupo(item, col, ctx) {
    const g = item.grupo;
    switch (col.key) {
        case 'imagen':
            return <Foto src={g.imagen ? `${BLOB}/${g.imagen}` : null} letra={g.nombre?.charAt(0)} radius="md" onClick={() => ctx.onFoto(item)} titulo="Foto del grupo" />;
        case 'codigo':
            return <Badge size="xs" variant="light" color="teal">Grupo</Badge>;
        case 'nombre':
            return (
                <Group gap={6} wrap="nowrap">
                    <ActionIcon size="sm" variant="subtle" color="gray" onClick={(e) => { e.stopPropagation(); ctx.onToggleGrupo(g.id); }} aria-label={item.cerrado ? 'Expandir grupo' : 'Contraer grupo'}>
                        {item.cerrado ? <IconChevronRight size={16} /> : <IconChevronDown size={16} />}
                    </ActionIcon>
                    <Tooltip label={g.nombre} multiline w={340} openDelay={250} withArrow position="bottom-start"><span className={classes.grupoNombre}>{g.nombre}</span></Tooltip>
                    <Text span size="xs" c="dimmed">{item.nHijos === g.nProductos ? g.nProductos : `${item.nHijos}/${g.nProductos}`}</Text>
                </Group>
            );
        case 'categoriaId': return g.categoria || '';
        case 'grupoEquivalenciaId':
            return <Badge size="xs" variant="filled" color={COLOR[g.estado]}>{ETIQUETA[g.estado]}</Badge>;
        case 'stockAlmacen':
            return <span className={classes.stock} title={`Suma de los ${g.nProductos} productos del grupo`}>{formatearNumero(g.stockTotal, col)}</span>;
        case 'stockMinimo':
            return <span title="Stock mínimo del grupo">{formatearNumero(g.stockMinimoGlobal, col)}</span>;
        default: return '';
    }
}
