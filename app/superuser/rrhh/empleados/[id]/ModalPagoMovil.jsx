import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Modal, Select, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import '@mantine/dates/styles.css';
import { AsyncCatalogComboBox } from "@/app/components/CatalogCombobox";



export default function ModalPagoMovil({ opened, onClose, onCreated, tipoEntidad, entidadId }) {
    const router = useRouter?.() ?? null;

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const form = useForm({
        initialValues: {
            nombreBanco: "",
            titularCuenta: "",
            ceculaCuenta: "",
            numeroPagoMovil: "",
            tipoEntidad: tipoEntidad,
            entidadId: entidadId,
        },
    });


    const handleSubmit = async () => {

        const payload = {
            ...form.values,
        };
        setSubmitting(true);

        try {

            const res = await fetch(`/api/tesoreria/pago-movil`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Error al crear pago móvil");
            }
            notifications.show({
                title: "Pago Movil creado exitosamente",
                color: "green",
            });
            onCreated();
            onClose();
        } catch (err) {
            console.error(err);
            notifications.show({
                title: "Error al crear Pago Movil",
                message: err.message,
                color: "red",
            });

        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Modal
            opened={opened}
            centered
            onClose={onClose}
            title={`Crear Pago Movil para ${tipoEntidad}`}
            size="lg"
        >

            <Box component="form" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>

                <AsyncCatalogComboBox
                    label="Banco"
                    placeholder="Seleccione o cree un banco"
                    catalogo="bancos"
                    fieldKey="nombreBanco"
                    form={form}
                />
                <TextInput
                    label="Titular"
                    placeholder="Nombre del titular de la cuenta"
                    {...form.getInputProps("titularCuenta")}
                    mt={15}
                />
                <TextInput
                    label="Cedula de Cuenta"
                    placeholder="Ingrese el Cedula de cuenta"
                    {...form.getInputProps("cedulaCuenta")}
                    mt={15}
                />
                <TextInput
                    label="Pago Móvil (Número de Teléfono)"
                    placeholder="Ingrese el número de teléfono para Pago Móvil"
                    {...form.getInputProps("numeroPagoMovil")}
                    mt={15}
                />

                <Box mt={20} display="flex" justifyContent="flex-end">
                    <Button onClick={onClose} disabled={submitting} style={{ marginRight: 10 }}>
                        Cancelar
                    </Button>
                    <Button type="submit" loading={submitting}>
                        {submitting ? "Creando..." : "Crear hora"}
                    </Button>
                </Box>
            </Box>



            {error && (
                <div style={{ marginTop: 12, color: "white", background: "#d9534f", padding: 8, borderRadius: 6 }}>
                    {error}
                </div>
            )}

        </Modal>
    );
}