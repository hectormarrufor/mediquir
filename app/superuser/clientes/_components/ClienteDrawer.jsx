'use client';

import React, { useState } from 'react';
import { Button, Checkbox, Divider, Drawer, Group, Select, Stack, Switch, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { IconDeviceFloppy } from '@tabler/icons-react';

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

// Alta rápida de un cliente. Opcionalmente crea de una vez su acceso al portal B2B (devuelve las credenciales para mostrarlas).
export default function ClienteDrawer({ opened, onClose, onCreado }) {
    const queryClient = useQueryClient();
    const [guardando, setGuardando] = useState(false);
    const [crearAcceso, setCrearAcceso] = useState(true);

    const form = useForm({
        initialValues: { identificacion: '', nombre: '', telefono: '', email: '', direccion: '', notas: '', esContribuyenteEspecial: false, retencionIvaPorDefecto: '75' },
        validate: {
            identificacion: (v) => (v.trim().length < 4 ? 'Indica el RIF o la cédula' : null),
            nombre: (v) => (v.trim().length < 2 ? 'Indica el nombre o la razón social' : null),
            email: (v) => (v && !/^\S+@\S+\.\S+$/.test(v) ? 'Correo inválido' : null),
        },
    });

    const guardar = async (values) => {
        setGuardando(true);
        try {
            const cliente = await pedirJson('/api/clientes', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...values,
                    identificacion: values.identificacion.trim().toUpperCase(),
                    email: values.email.trim() || null,
                    retencionIvaPorDefecto: Number(values.retencionIvaPorDefecto),
                }),
            });
            let credenciales = null;
            if (crearAcceso) {
                try {
                    credenciales = await pedirJson(`/api/clientes/${cliente.id}/acceso`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'CREAR' }) });
                } catch (e) {
                    notifications.show({ color: 'orange', title: 'Cliente creado, pero sin acceso', message: `${e.message}. Puedes crearlo después desde la lista.` });
                }
            }
            queryClient.invalidateQueries({ queryKey: ['clientes'] });
            notifications.show({ color: 'teal', title: 'Cliente registrado', message: cliente.nombre || cliente.identificacion });
            form.reset();
            onCreado?.(cliente, credenciales);
            onClose();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message });
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Drawer opened={opened} onClose={onClose} position="right" size="md" title={<Text fw={800} fz="lg">Registrar cliente</Text>} padding="lg">
            <form onSubmit={form.onSubmit(guardar)}>
                <Stack gap="md">
                    <TextInput withAsterisk label="RIF o cédula" placeholder="J-12345678-9 · V-12345678" data-autofocus {...form.getInputProps('identificacion')} />
                    <TextInput withAsterisk label="Nombre o razón social" {...form.getInputProps('nombre')} />
                    <Group grow align="flex-start">
                        <TextInput label="Teléfono" placeholder="0414-1234567" {...form.getInputProps('telefono')} />
                        <TextInput label="Correo" type="email" {...form.getInputProps('email')} />
                    </Group>
                    <Textarea label="Dirección fiscal" autosize minRows={2} {...form.getInputProps('direccion')} />
                    <Switch color="brand.6" label="Contribuyente especial" description="Aplica retención de IVA" {...form.getInputProps('esContribuyenteEspecial', { type: 'checkbox' })} />
                    {form.values.esContribuyenteEspecial && (
                        <Select label="Retención de IVA" data={[{ value: '75', label: '75%' }, { value: '100', label: '100%' }]} allowDeselect={false} {...form.getInputProps('retencionIvaPorDefecto')} />
                    )}
                    <Textarea label="Notas internas" autosize minRows={2} {...form.getInputProps('notas')} />
                    <Divider />
                    <Checkbox checked={crearAcceso} onChange={(e) => setCrearAcceso(e.currentTarget.checked)}
                        label="Crear también su acceso al portal B2B" description="Genera usuario y clave temporal para enviársela por WhatsApp." />
                    <Button type="submit" loading={guardando} size="md" color="navy.9" leftSection={<IconDeviceFloppy size={18} />}>Guardar cliente</Button>
                </Stack>
            </form>
        </Drawer>
    );
}
