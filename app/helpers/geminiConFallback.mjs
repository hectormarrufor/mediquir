// TODA llamada a Gemini de la app pasa por aquí: se intenta con un modelo y, si no responde (cuota gratuita agotada,
// saturado, sin acceso), se prueba con el siguiente hasta agotar las opciones gratuitas. Cada modelo tiene su PROPIA
// cuota diaria. Nunca se reintenta un 429 sobre el mismo modelo (gasta cuota).
//
// Probado con la llave real (2026-09-30): "gemini-2.5-flash-lite" y "gemini-2.0-flash*" dan 404 (no disponibles para esta
// cuenta); los alias "-latest" sí responden; "flash-lite-latest" rechaza thinkingConfig (400), por eso va por modelo.
// Si Google habilita otros modelos gratuitos, basta agregarlos a MODELOS.
import { GoogleGenerativeAI } from "@google/generative-ai";

export const MODELOS = [
    { nombre: "gemini-2.5-flash", sinPensar: true },
    { nombre: "gemini-flash-latest", sinPensar: true },
    { nombre: "gemini-flash-lite-latest", sinPensar: false },
];

const resumenError = (e) => {
    const m = String(e?.message || e);
    if (e?.status === 429) return "cuota gratuita agotada";
    if (e?.status === 404) return "modelo no disponible para esta llave";
    if (e?.status === 503) return "modelo saturado";
    return m.replace(/\[GoogleGenerativeAI Error\]: Error fetching from \S+: /, "").slice(0, 120);
};

/**
 * @param {Array|string} partes  prompt (y archivos inlineData) tal como se le pasan a generateContent
 * @param {{ json?: boolean, sinPensar?: boolean, timeout?: number }} [o]
 *   json: pide respuesta JSON directa (temperatura 0). sinPensar: sin "razonamiento" donde el modelo lo permite (más rápido).
 * @returns {Promise<{ texto: string, modelo: string }>}
 * Si ningún modelo responde lanza un Error con .status (429 si fue por cuota) y .intentos = [{ modelo, estado, motivo }].
 */
export async function generarConFallback(partes, { json = false, sinPensar = true, timeout = 40000 } = {}) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("API Key de Google no configurada");
    const genAI = new GoogleGenerativeAI(apiKey);

    const intentos = [];
    for (const m of MODELOS) {
        const generationConfig = {};
        if (json) { generationConfig.temperature = 0; generationConfig.responseMimeType = "application/json"; }
        if (sinPensar && m.sinPensar) generationConfig.thinkingConfig = { thinkingBudget: 0 };
        const model = genAI.getGenerativeModel({ model: m.nombre, generationConfig }, { timeout });

        for (let intento = 1; intento <= 2; intento++) {
            try {
                const result = await model.generateContent(partes);
                const texto = result.response.text();
                if (intentos.length) console.warn("Gemini: respondió", m.nombre, "tras fallar:", JSON.stringify(intentos));
                return { texto, modelo: m.nombre };
            } catch (error) {
                // 503 (saturado) se reintenta una vez con el mismo modelo
                if (error?.status === 503 && intento === 1) { await new Promise((r) => setTimeout(r, 2500)); continue; }
                intentos.push({ modelo: m.nombre, estado: error?.status || null, motivo: resumenError(error) });
                break;
            }
        }
    }
    console.error("Gemini: ningún modelo respondió:", JSON.stringify(intentos));
    const cuota = intentos.length > 0 && intentos.every((i) => i.estado === 429 || i.estado === 404);
    const e = new Error(cuota ? "Se agotó el uso gratuito de la IA por hoy." : "La IA no pudo responder ahora mismo.");
    e.status = cuota ? 429 : 502;
    e.intentos = intentos;
    throw e;
}

/** Texto para mostrar al usuario con el detalle de qué pasó con cada modelo. */
export const detalleIntentos = (e) => (e?.intentos?.length ? ` (${e.intentos.map((i) => `${i.modelo}: ${i.motivo}`).join(" · ")})` : "");
