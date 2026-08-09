// components/tesoreria/ModalCrearCuentaBancaria.jsx
'use client';

import React, { useEffect, useState } from 'react';
import {
    Modal, Button, Group, TextInput, Select, Textarea, Stack, Box, Grid,
    NumberInput
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconBuildingBank, IconCreditCard, IconCurrencyDollar, IconNotes, IconPhoneCall, IconUser, IconId } from '@tabler/icons-react';

export function ModalCrearCuentaBancaria({ onCuentaCreada, children }) {
    const [opened, { open, close }] = useDisclosure(false);
    const [loading, setLoading] = useState(false);

    const form = useForm({
        initialValues: {
            nombreBanco: '',
            numeroCuenta: '',
            tipoCuenta: '',
            moneda: 'VES',
            saldoActual: 0.0,
            titularRazonSocial: '', // Nuevo campo
            titularIdentificacion: '', // Nuevo campo
            pagoMovil: '', // Campo para Pago Móvil
        },
        validate: {
            nombreBanco: (value) => (value ? null : 'El nombre del banco es requerido'),
            numeroCuenta: (value) => (value ? null : 'El número de cuenta es requerido'),
            tipoCuenta: (value) => (value ? null : 'El tipo de cuenta es requerido'),
            moneda: (value) => (value ? null : 'La moneda es requerida'),
            saldoActual: (value) => (value >= 0 ? null : 'El saldo actual no puede ser negativo'),
            titularRazonSocial: (value) => (value ? null : 'La razón social del titular es requerida'), // Nueva validación
            titularIdentificacion: (value) => { // Nueva validación con RegEx
                if (!value) return 'La identificación del titular es requerida';
                // Regex para V-12345678, J-12345678-9, etc.
                if (!/^[VEJGP]-\d{6,9}(-?\d)?$/.test(value)) {
                    return 'Formato de identificación inválido (Ej: V-12345678 o J-12345678-9)';
                }
                return null;
            },
            pagoMovil: (value) => { // Nueva validación para Pago Móvil
                if (!value) return null; // Opcional, si no se ingresa, no hay error
                // Regex para números de teléfono venezolanos con prefijos específicos
                if (!/^(0412|0422|0414|0424|0416|0426)\d{7}$/.test(value)) {
                    return 'Número de Pago Móvil inválido (Ej: 04121234567)';
                }
                return null;
            },
        },
    });

    useEffect(() => {
        form.setValues(
            {
                nombreBanco: 'Banco de Venezuela',
                numeroCuenta: '01020304050607080910',
                tipoCuenta: 'Corriente',
                moneda: 'VES',
                saldoActual: 100.0,
                titularRazonSocial: 'WR WELL SERVICES, C.A', // Nuevo campo
                titularIdentificacion: 'J-49052349-5', // Nuevo campo
                pagoMovil: '04121234567', // Campo para Pago Móvil
            },
        )
    }, [])


    const handleSubmit = async (values) => {
        setLoading(true);
        try {
            const response = await fetch('/api/tesoreria/cuentas-bancarias', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...values,
                    saldoActual: parseFloat(values.saldoActual),
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Error al crear la cuenta bancaria');
            }

            const nuevaCuenta = await response.json();
            notifications.show({
                title: 'Cuenta Creada',
                message: `La cuenta "${nuevaCuenta.nombreBanco} - ${nuevaCuenta.numeroCuenta}" ha sido creada exitosamente.`,
                color: 'green',
            });
            form.reset();
            close();
            if (onCuentaCreada) {
                onCuentaCreada(nuevaCuenta);
            }
        } catch (error) {
            console.error('Error al crear cuenta bancaria:', error);
            notifications.show({
                title: 'Error',
                message: error.message || 'No se pudo crear la cuenta bancaria.',
                color: 'red',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {React.cloneElement(children, { onClick: open })}

            <Modal opened={opened} onClose={close} title="Registrar Nueva Cuenta Bancaria" size="lg" my={80} centered>
                <Box component="form" onSubmit={form.onSubmit(handleSubmit)}>
                    <Stack>
                        <Grid>
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <TextInput
                                    label="Nombre del Banco"
                                    placeholder="Ej. Banco de Venezuela"
                                    required
                                    leftSection={<IconBuildingBank size={18} />}
                                    {...form.getInputProps('nombreBanco')}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <TextInput
                                    label="Número de Cuenta"
                                    placeholder="Ej. 01020304050607080910"
                                    required
                                    leftSection={<IconCreditCard size={18} />}
                                    {...form.getInputProps('numeroCuenta')}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <Select
                                    label="Tipo de Cuenta"
                                    placeholder="Selecciona el tipo"
                                    data={['Corriente', 'Ahorros', 'Dólares', 'Euros']}
                                    required
                                    {...form.getInputProps('tipoCuenta')}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <Select
                                    label="Moneda"
                                    placeholder="Selecciona la moneda"
                                    data={['USD', 'VES']} // Puedes añadir más si es necesario
                                    required
                                    {...form.getInputProps('moneda')}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <NumberInput
                                    label="Saldo Inicial"
                                    placeholder="0.00"
                                    prefix={form.values.moneda === "VES" ? "Bs. " : "USD. "}
                                    decimalScale={2}
                                    fixedDecimalScale
                                    min={0}
                                    thousandSeparator="."
                                    decimalSeparator=","
                                    required
                                    {...form.getInputProps('saldoActual')}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <TextInput
                                    label="Razón Social / Nombre del Titular"
                                    placeholder="Ej. Mi Empresa C.A. o Juan Pérez"
                                    required
                                    leftSection={<IconUser size={18} />}
                                    {...form.getInputProps('titularRazonSocial')}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <TextInput
                                    label="Identificación del Titular"
                                    placeholder="Ej. V-12345678 o J-12345678-9"
                                    required
                                    leftSection={<IconId size={18} />}
                                    {...form.getInputProps('titularIdentificacion')}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <TextInput
                                    label="Número de Teléfono Pago Móvil (Opcional)"
                                    placeholder="Ej. 04121234567"
                                    leftSection={<IconPhoneCall size={18} />}
                                    {...form.getInputProps('pagoMovil')}
                                />
                            </Grid.Col>
                            
                        </Grid>
                    </Stack>

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={close}>
                            Cancelar
                        </Button>
                        <Button type="submit" loading={loading}>
                            Guardar Cuenta
                        </Button>
                    </Group>
                </Box>
            </Modal>
        </>
    );
}