'use client';

import React from 'react';
import { ActionIcon, Menu } from '@mantine/core';
import { IconBrandWhatsapp, IconDotsVertical, IconEdit, IconEye, IconKey, IconPhone, IconTrash, IconUserPlus } from '@tabler/icons-react';
import { normalizarWhatsApp } from '@/app/constants/contacto';

// Menú de acciones de un empleado (hoja y tarjeta móvil)
export default function AccionesEmpleado({ empleado, esAdmin, onFicha, onEditar, onUsuario, onEliminar }) {
    const wa = normalizarWhatsApp(empleado.telefono);
    return (
        <Menu position="bottom-end" withinPortal shadow="md" width={210}>
            <Menu.Target>
                <ActionIcon variant="subtle" color="gray" aria-label="Acciones" onClick={(e) => e.stopPropagation()}><IconDotsVertical size={16} /></ActionIcon>
            </Menu.Target>
            <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                <Menu.Item leftSection={<IconEye size={14} />} onClick={() => onFicha(empleado)}>Ver ficha</Menu.Item>
                <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => onEditar(empleado)}>Editar todos los datos</Menu.Item>
                {empleado.telefono && <Menu.Item component="a" href={`tel:${empleado.telefono}`} leftSection={<IconPhone size={14} />}>Llamar</Menu.Item>}
                {wa && <Menu.Item component="a" href={`https://wa.me/${wa}`} target="_blank" leftSection={<IconBrandWhatsapp size={14} />}>WhatsApp</Menu.Item>}
                {esAdmin && (
                    <>
                        <Menu.Divider />
                        <Menu.Item leftSection={empleado.usuario ? <IconKey size={14} /> : <IconUserPlus size={14} />} onClick={() => onUsuario(empleado)}>
                            {empleado.usuario ? 'Editar usuario' : 'Crear usuario'}
                        </Menu.Item>
                        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => onEliminar(empleado)}>Eliminar</Menu.Item>
                    </>
                )}
            </Menu.Dropdown>
        </Menu>
    );
}
