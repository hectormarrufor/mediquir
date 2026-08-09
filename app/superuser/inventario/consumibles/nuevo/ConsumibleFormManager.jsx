'use client';

import { useState } from 'react';
import { Select, Stack, Text, Alert, Paper, Group, SegmentedControl } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';

// Formularios específicos (Tus tablas existentes)
import FiltroForm from './FiltroForm'; 
import AceiteForm from './AceiteForm';
import NeumaticoForm from './NeumaticoForm';
import BateriaForm from './BateriaForm';
import SensorForm from './SensorForm';

// 🔥 IMPORTANTE: Necesitarás crear este componente para manejar pastillas, mangueras y el resto del JSONB
import RepuestoGenericoForm from './RepuestoGenericoForm'; 

// 🔥 DICCIONARIO INTELIGENTE CON METADATOS 🔥
const CATEGORIAS_AGRUPADAS = [
    {
        group: 'Rodamiento y Suspensión',
        items: [
            { value: 'neumatico', label: 'Neumático / Caucho', tipoDefecto: 'serializado' },
            { value: 'rolinera', label: 'Rolinera / Rodamiento', tipoDefecto: 'fungible' },
            { value: 'amortiguador', label: 'Amortiguador', tipoDefecto: 'serializado' },
            { value: 'ballesta', label: 'Hoja de Ballesta', tipoDefecto: 'fungible' },
            { value: 'buje', label: 'Buje', tipoDefecto: 'fungible' },
        ],
    },
    {
        group: 'Sistema de Frenos',
        items: [
            { value: 'pastillas de freno', label: 'Pastillas de Freno', tipoDefecto: 'fungible' },
            { value: 'bandas de freno', label: 'Bandas de Freno', tipoDefecto: 'fungible' },
            { value: 'zapatas', label: 'Zapatas', tipoDefecto: 'fungible' },
            { value: 'tambor', label: 'Tambor de Freno', tipoDefecto: 'serializado' },
            { value: 'disco de freno', label: 'Disco de Freno', tipoDefecto: 'serializado' },
            { value: 'valvula de aire', label: 'Válvula de Aire / Relé', tipoDefecto: 'serializado' },
            { value: 'pulmon de freno', label: 'Pulmón de Freno (Chamber)', tipoDefecto: 'serializado' },
        ],
    },
    {
        group: 'Líquidos y Filtros',
        items: [
            { value: 'aceite', label: 'Aceite Lubricante', tipoDefecto: 'fungible' },
            { value: 'gasoil', label: 'Combustible (Gasoil)', tipoDefecto: 'fungible' },
            { value: 'filtro de aceite', label: 'Filtro de Aceite', tipoDefecto: 'fungible' },
            { value: 'filtro de aire', label: 'Filtro de Aire', tipoDefecto: 'fungible' },
            { value: 'filtro de combustible', label: 'Filtro de Combustible', tipoDefecto: 'fungible' },
            { value: 'filtro de cabina', label: 'Filtro de Cabina', tipoDefecto: 'fungible' },
        ],
    },
    {
        group: 'Eléctrico y Electrónico',
        items: [
            { value: 'bateria', label: 'Batería', tipoDefecto: 'serializado' },
            { value: 'sensor', label: 'Sensor Eléctrico', tipoDefecto: 'serializado' },
            { value: 'bombillo', label: 'Bombillo / Iluminación', tipoDefecto: 'fungible' },
            { value: 'capacitador', label: 'Capacitador / Condensador', tipoDefecto: 'fungible' },
            { value: 'fusible', label: 'Fusible / Relé', tipoDefecto: 'fungible' },
        ],
    },
    {
        group: 'Motor y Transmisión',
        items: [
            { value: 'correa', label: 'Correa / Banda', tipoDefecto: 'fungible' },
            { value: 'manguera', label: 'Manguera', tipoDefecto: 'fungible' },
            { value: 'estopera', label: 'Estopera / Sello', tipoDefecto: 'fungible' },
            { value: 'empacadura', label: 'Empacadura', tipoDefecto: 'fungible' },
            { value: 'cruceta', label: 'Cruceta (Cardán)', tipoDefecto: 'fungible' },
        ],
    },
    {
        group: 'Otros',
        items: [
            { value: 'repuesto general', label: 'Repuesto General / Varios', tipoDefecto: 'fungible' },
            { value: 'consumible taller', label: 'Consumible de Taller (Grasa, Tirrajes)', tipoDefecto: 'fungible' },
        ]
    }
];

// Función utilitaria para buscar el tipo por defecto
const obtenerTipoDefecto = (categoriaSeleccionada) => {
    for (const grupo of CATEGORIAS_AGRUPADAS) {
        const item = grupo.items.find(i => i.value === categoriaSeleccionada);
        if (item) return item.tipoDefecto;
    }
    return 'fungible'; // Fallback por seguridad
};

export default function ConsumibleFormManager({ 
    onSuccess, 
    onCancel,  
    defaultType = null 
}) {
    const [categoria, setCategoria] = useState(defaultType);
    const [naturaleza, setNaturaleza] = useState('fungible'); // 'fungible' o 'serializado'

    // Interceptor: Cuando eligen la pieza, calculamos la naturaleza
    const handleCategoriaChange = (valorSeleccionado) => {
        setCategoria(valorSeleccionado);
        if (valorSeleccionado) {
            const tipoSugerido = obtenerTipoDefecto(valorSeleccionado);
            setNaturaleza(tipoSugerido);
        }
    };

    // Enrutador inteligente de formularios
    const renderForm = () => {
        if (!categoria) {
            return (
                <Alert icon={<IconInfoCircle size={16}/>} title="Seleccione una Categoría" color="blue" variant="light">
                    Selecciona qué tipo de repuesto vas a registrar para cargar el formulario correcto.
                </Alert>
            );
        }

        // Pasamos la naturaleza y la categoría al hijo para que la adjunte al Payload del POST
        const childProps = { onSuccess, onCancel, categoria, naturaleza }; 

        // Enrutamos según la selección
        if (categoria === 'aceite') return <AceiteForm {...childProps} />;
        if (categoria === 'neumatico') return <NeumaticoForm {...childProps} />;
        if (categoria === 'bateria') return <BateriaForm {...childProps} />;
        if (categoria === 'sensor') return <SensorForm {...childProps} />;
        
        // Agrupamos todos los filtros al mismo formulario de filtros
        if (categoria.startsWith('filtro')) return <FiltroForm {...childProps} />;

        // 🔥 TODO LO DEMÁS VA AL FORMULARIO GENÉRICO 🔥
        // (Pastillas, bandas, mangueras, tambores, etc.)
        // Este form deberá usar el campo `datosTecnicos` de Sequelize.
        return <RepuestoGenericoForm {...childProps} />;
    };

    return (
        <Stack gap="lg">
            <Select
                label="Tipo / Categoría de Repuesto"
                placeholder="Buscar repuesto... Ej: Neumático"
                data={CATEGORIAS_AGRUPADAS}
                value={categoria}
                onChange={handleCategoriaChange}
                clearable
                searchable
                nothingFoundMessage="No se encontró esta categoría"
                withAsterisk
            />

            {categoria && (
                <Paper withBorder p="sm" bg="gray.0" radius="md">
                    <Group justify="space-between" align="center">
                        <div>
                            <Text size="sm" fw={700}>Naturaleza del Inventario</Text>
                            <Text size="xs" c="dimmed" maw={300}>
                                {naturaleza === 'serializado' 
                                    ? 'Control individual. Deberás ingresar los seriales únicos al cargar stock.' 
                                    : 'Control por volumen. Se despacha a granel o por cantidad genérica.'}
                            </Text>
                        </div>
                        
                        <SegmentedControl
                            data={[
                                { label: 'Fungible', value: 'fungible' },
                                { label: 'Serializado', value: 'serializado' }
                            ]}
                            color={naturaleza === 'serializado' ? 'orange' : 'blue'}
                            value={naturaleza}
                            onChange={setNaturaleza}
                        />
                    </Group>
                </Paper>
            )}

            {renderForm()}
        </Stack>
    );
}