// Zonas donde la tienda ofrece delivery propio. Dentro de Venezuela pero fuera de ellas se hace envío nacional por Zoom con cobro a
// destino (el cliente paga el flete al recibir; la tesorería de la tienda no interviene). Fuera de Venezuela no se envía.
export const ZONAS_DELIVERY = ['Ciudad Ojeda', 'Lagunillas', 'Cabimas'];

export const UBICACION = { ZONA: 'ZONA', NACIONAL: 'NACIONAL', FUERA_PAIS: 'FUERA_PAIS' };

const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const CLAVES = ZONAS_DELIVERY.map(normalizar);
const TIPOS_LUGAR = ['locality', 'sublocality', 'administrative_area_level_2', 'administrative_area_level_3'];

// `resultados` = respuesta del Geocoder inverso de Google Maps -> ZONA (delivery), NACIONAL (resto de Venezuela) o FUERA_PAIS
export function clasificarUbicacion(resultados) {
    let enVenezuela = false;
    for (const r of resultados || []) {
        for (const c of r.address_components || []) {
            if (c.types?.includes('country') && c.short_name === 'VE') enVenezuela = true;
            if (!c.types?.some((t) => TIPOS_LUGAR.includes(t))) continue;
            if (CLAVES.some((z) => normalizar(c.long_name).includes(z))) return UBICACION.ZONA;
        }
    }
    return enVenezuela ? UBICACION.NACIONAL : UBICACION.FUERA_PAIS;
}
