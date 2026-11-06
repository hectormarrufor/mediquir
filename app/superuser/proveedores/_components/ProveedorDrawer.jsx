'use client';

import React, { useEffect, useState } from 'react';
import { Button, Checkbox, Divider, Drawer, Group, NumberInput, Stack, Switch, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { IconDeviceFloppy } from '@tabler/icons-react';
import SelectorRetencion, { validarRetencion } from '@/app/components/admin/SelectorRetencion';
import { esSinRif, formatearIdentificacion, formatearTelefono } from '@/app/constants/identificacion';

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

const VACIO = { identificacion: '', nombre: '', telefono: '', email: '', direccion: '', notas: '', esContribuyenteEspecial: false, retencionIvaPorDefecto: null, activo: true,
    contactoNombre: '', contactoCargo: '', contactoTelefono: '', contactoEmail: '', maxCreditos: 3, diasCredito: 7 };

// Registrar un proveedor (proveedor = null) o cambiar sus datos. La retención de IVA NO viene marcada: hay que elegir 75 % o 100 %.
export default function ProveedorDrawer({ opened, onClose, proveedor = null, puedeEditar = true }) {
    const queryClient = useQueryClient();
    const [guardando, setGuardando] = useState(false);
    const editando = Boolean(proveedor);

    const form = useForm({
        initialValues: VACIO,
        validate: {
            identificacion: (v) => (formatearIdentificacion(v).valor ? null : 'RIF no válido. Ejemplo: J-12345678-9'),
            telefono: (v) => (!v || formatearTelefono(v).valor ? null : 'Usa 04141234567 o +57 3001234567'),
            contactoTelefono: (v) => (!v || formatearTelefono(v).valor ? null : 'Usa 04141234567 o +57 3001234567'),
            contactoEmail: (v) => (v && !/^\S+@\S+\.\S+$/.test(v) ? 'Correo inválido' : null),
            nombre: (v) => (String(v || '').trim().length < 2 ? 'Escribe la razón social' : null),
            email: (v) => (v && !/^\S+@\S+\.\S+$/.test(v) ? 'Correo inválido' : null),
            retencionIvaPorDefecto: validarRetencion,
        },
    });

    useEffect(() => {
        if (!opened) return;
        form.setValues(proveedor ? {
            identificacion: esSinRif(proveedor.identificacion) ? '' : (proveedor.identificacion || ''), // el RIF provisional no se muestra: hay que escribir el real
            nombre: proveedor.nombre || '',
            telefono: proveedor.telefono || '',
            email: proveedor.email || '',
            direccion: proveedor.direccion || '',
            notas: proveedor.notas || '',
            esContribuyenteEspecial: Boolean(proveedor.esContribuyenteEspecial),
            retencionIvaPorDefecto: [75, 100].includes(Number(proveedor.retencionIvaPorDefecto)) ? String(proveedor.retencionIvaPorDefecto) : null,
            activo: proveedor.activo !== false,
            contactoNombre: proveedor.contactoNombre || '',
            contactoCargo: proveedor.contactoCargo || '',
            contactoTelefono: proveedor.contactoTelefono || '',
            contactoEmail: proveedor.contactoEmail || '',
            maxCreditos: proveedor.maxCreditos ?? 3,
            diasCredito: proveedor.diasCredito ?? 7,
        } : VACIO);
        form.resetDirty();
        form.clearErrors();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, proveedor?.id]);

    const guardar = async (values) => {
        setGuardando(true);
        try {
            const cuerpo = {
                ...values,
                identificacion: formatearIdentificacion(values.identificacion).valor,
                email: values.email.trim() || null,
                retencionIvaPorDefecto: Number(values.retencionIvaPorDefecto),
            };
            if (!editando) delete cuerpo.activo;
            const guardado = await pedirJson(editando ? `/api/proveedores/${proveedor.id}` : '/api/proveedores', {
                method: editando ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
            });
            // La lista de proveedores y el selector del registro de compras
            queryClient.invalidateQueries({ queryKey: ['proveedores'] });
            queryClient.invalidateQueries({ queryKey: ['proveedores-compra'] });
            notifications.show({ color: 'teal', title: editando ? 'Proveedor actualizado' : 'Proveedor registrado', message: guardado.nombre });
            onClose();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message });
        } finally {
            setGuardando(false);
        }
    };

    const soloLectura = editando && !puedeEditar;

    return (
        <Drawer opened={opened} onClose={onClose} position="right" size="md" padding="lg"
            title={<Text fw={800} fz="lg">{editando ? (soloLectura ? 'Proveedor' : 'Cambiar proveedor') : 'Registrar proveedor'}</Text>}>
            <form onSubmit={form.onSubmit(guardar)}>
                <fieldset disabled={soloLectura} style={{ border: 0, padding: 0, margin: 0 }}>
                    <Stack gap="md">
                        <TextInput withAsterisk label="RIF" placeholder="J-12345678-9" data-autofocus
                            description={esSinRif(proveedor?.identificacion) ? 'Este proveedor está sin RIF: escribe el real para poder guardarlo' : undefined}
                            {...form.getInputProps('identificacion')} />
                        <TextInput withAsterisk label="Razón social" {...form.getInputProps('nombre')} />
                        <Group grow align="flex-start">
                            <TextInput label="Teléfono" placeholder="04141234567 o +573001234567" {...form.getInputProps('telefono')} />
                            <TextInput label="Correo" type="email" {...form.getInputProps('email')} />
                        </Group>
                        <Textarea label="Dirección fiscal" autosize minRows={2} {...form.getInputProps('direccion')} />

                        <Divider label="Persona de contacto" labelPosition="left" />
                        <Group grow align="flex-start">
                            <TextInput label="Nombre" {...form.getInputProps('contactoNombre')} />
                            <TextInput label="Cargo" placeholder="Ej: Jefe de compras" {...form.getInputProps('contactoCargo')} />
                        </Group>
                        <Group grow align="flex-start">
                            <TextInput label="Teléfono" placeholder="04141234567" {...form.getInputProps('contactoTelefono')} />
                            <TextInput label="Correo" type="email" {...form.getInputProps('contactoEmail')} />
                        </Group>

                        <Divider label="Crédito que nos da" labelPosition="left" />
                        <Group grow align="flex-start">
                            <NumberInput label="Créditos a la vez" description="Compras a crédito sin pagar. 0 = solo contado" min={0} max={100} allowDecimal={false} clampBehavior="strict" {...form.getInputProps('maxCreditos')} />
                            <NumberInput label="Días de crédito" description="Plazo de cada compra" min={0} max={365} allowDecimal={false} clampBehavior="strict" {...form.getInputProps('diasCredito')} />
                        </Group>

                        <Divider label="Retención de IVA" labelPosition="left" />
                        <SelectorRetencion
                            rif={form.values.identificacion} value={form.values.retencionIvaPorDefecto} error={form.errors.retencionIvaPorDefecto}
                            onChange={(v) => form.setFieldValue('retencionIvaPorDefecto', v)}
                            description="Lo que le retenemos del IVA en cada factura (se puede cambiar en una compra puntual). No viene marcado: elige uno."
                        />
                        <Checkbox label="Es contribuyente especial" {...form.getInputProps('esContribuyenteEspecial', { type: 'checkbox' })} />

                        <Textarea label="Notas internas" autosize minRows={2} {...form.getInputProps('notas')} />
                        {editando && (
                            <Switch color="teal" label="Activo" description="Un proveedor inactivo deja de salir al registrar compras; sus compras y cuentas se quedan como están."
                                {...form.getInputProps('activo', { type: 'checkbox' })} />
                        )}
                        {!soloLectura && (
                            <Button type="submit" loading={guardando} size="md" color="navy.9" leftSection={<IconDeviceFloppy size={18} />}>
                                {editando ? 'Guardar cambios' : 'Guardar proveedor'}
                            </Button>
                        )}
                    </Stack>
                </fieldset>
            </form>
        </Drawer>
    );
}
