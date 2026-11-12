// Tema de Mantine para la tienda pública. Se aplica con <MantineThemeProvider> alrededor de la portada y hereda el tema del
// sistema (theme.js): aquí solo va lo que cambia de cara al cliente. El panel del personal no se entera.
//   · Color principal: el azul de la marca (en el sistema es el mostaza), así botones, pasos del pago, casillas y campos
//     activos salen en azul con texto blanco.
//   · Botones y títulos en minúsculas normales (en el sistema van en mayúsculas).
//   · Campos blancos con borde y esquinas más amplias; modales y cajones con el mismo lenguaje de las tarjetas.
// La tipografía no va aquí: Mantine la toma de una variable CSS, que la portada cambia mientras está abierta (ver LandingMediquir).
const campo = {
    defaultProps: { variant: 'default', radius: 12, size: 'md' },
    styles: {
        input: { backgroundColor: '#fff', border: '1px solid var(--mq-line-2)', color: 'var(--mq-ink)' },
        label: { fontWeight: 650, color: 'var(--mq-ink)', marginBottom: 4 },
    },
};

const hoja = {
    header: { backgroundColor: '#fff', borderBottom: '1px solid var(--mq-line)', paddingBottom: 14, minHeight: 60 },
    title: { fontWeight: 740, fontSize: '1.2rem', fontStretch: '92%', letterSpacing: '-0.01em', color: 'var(--mq-ink)' },
    close: { borderRadius: 999, color: 'var(--mq-ink-2)', width: 36, height: 36 },
};

export const temaTienda = {
    primaryColor: 'brand',
    components: {
        Button: {
            defaultProps: { radius: 12, fw: 650, size: 'md' },
            styles: { root: { textTransform: 'none', letterSpacing: 0 } },
        },
        ActionIcon: { defaultProps: { radius: 'xl' } },
        Title: {
            styles: { root: { color: 'var(--mq-ink)', textTransform: 'none', display: 'block', paddingBottom: 0, letterSpacing: '-0.01em' } },
        },
        Input: campo,
        TextInput: campo,
        NumberInput: campo,
        Select: campo,
        Textarea: campo,
        SegmentedControl: { defaultProps: { radius: 12 } },
        Badge: { defaultProps: { tt: 'none', fw: 650 } },
        Alert: { defaultProps: { radius: 14 } },
        Modal: {
            defaultProps: { radius: 24, shadow: 'xl', overlayProps: { color: '#071634', backgroundOpacity: 0.55, blur: 6 } },
            classNames: { content: 'tienda-hoja' },
            styles: { ...hoja, body: { paddingTop: 16 } },
        },
        Drawer: {
            defaultProps: { overlayProps: { color: '#071634', backgroundOpacity: 0.55, blur: 6 } },
            classNames: { content: 'tienda-hoja' },
            styles: { ...hoja, body: { paddingTop: 16 } },
        },
    },
};
