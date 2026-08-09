import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Modal, Select, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import '@mantine/dates/styles.css';
import { AsyncCatalogComboBox } from "@/app/components/CatalogCombobox";



export default function ModalCuentaBancaria({ opened, onClose, onCreated, tipoEntidad, entidadId }) {
    const router = useRouter?.() ?? null;

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const form = useForm({
        initialValues: {
            nombreBanco: "",
            titularCuenta: "",
            cedulaCuenta: "",
            numeroCuenta: "",
            tipoCuenta: "",
            moneda: "VES",
            saldoActual: 0,
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
            const url = (tipoEntidad === "propia")  ?
                `/api/tesoreria/cuentas-bancarias` :
                `/api/tesoreria/cuentas-terceros`

            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Error al crear cuenta");
            }
            notifications.show({
                title: "Cuenta creada exitosamente",
                color: "green",
            });
            onCreated();
            onClose();
        } catch (err) {
            console.error(err);
            notifications.show({
                title: "Error al crear cuenta",
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
            title={`Crear cuenta ${tipoEntidad === "propia" ? "propia" : `para ${tipoEntidad}`} `}
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
                    label="Cédula del Titular para Pago Móvil"
                    placeholder="Ingrese la cédula del titular para Pago Móvil"
                    {...form.getInputProps("cedulaCuenta")}
                    mt={15}
                />

                <TextInput
                    label="Número de Cuenta"
                    placeholder="Ingrese el número de cuenta"
                    {...form.getInputProps("numeroCuenta")}
                    mt={15}
                />
                <Select
                    label="Tipo de Cuenta"
                    placeholder="Seleccione el tipo de cuenta"
                    data={["Corriente", "Ahorros"]}
                    {...form.getInputProps("tipoCuenta")}
                    mt={15}
                />
                <Select
                    label="Moneda"
                    placeholder="Seleccione la moneda"
                    data={["VES", "USD", "EUR"]}
                    {...form.getInputProps("moneda")}
                    mt={15}
                />
                {tipoEntidad === "propia" && <TextInput
                    label="Saldo Actual"
                    placeholder="Ingrese el saldo actual"
                    type="number"
                    {...form.getInputProps("saldoActual")}
                    mt={15}
                />}
     
                



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