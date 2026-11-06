import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';

// Lee la página del BCV. Devuelve la tasa Y su FECHA VALOR: el día en que esa tasa rige.
// Ojo: el BCV publica en la tarde la tasa del día siguiente (o del lunes, si es viernes), así que al leerla a las 6:00 p. m. la
// "Fecha Valor" es MAÑANA. Guardar esa tasa con la fecha de hoy hacía que el sistema usara la tasa un día antes de tiempo (y que la
// factura de hoy saliera con la tasa de mañana). Por eso la tasa se guarda SIEMPRE con su fecha valor.
export async function leerBcv() {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const { data: html } = await axios.get('https://www.bcv.org.ve/', { httpsAgent: agent, timeout: 15000 });
    const $ = cheerio.load(html);
    const parse = (selector) => {
        const texto = $(selector).first().text().trim();
        return parseFloat(texto.replace(/\./g, '').replace(',', '.')).toFixed(2);
    };
    const usd = parse('div#dolar .recuadrotsmc .centrado');
    const eur = parse('div#euro .recuadrotsmc .centrado');
    if (!(Number(usd) > 0)) throw new Error('No se pudo parsear el precio del Dólar BCV.');
    const fechaValor = /Fecha Valor:\s*<span[^>]*content="(\d{4}-\d{2}-\d{2})/i.exec(html)?.[1];
    if (!fechaValor) throw new Error('No se pudo leer la "Fecha Valor" de la página del BCV.');
    return { usd, eur, fechaValor };
}
