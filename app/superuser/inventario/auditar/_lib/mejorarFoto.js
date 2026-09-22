// Mejora de fotos tomadas en el local, TODO en el navegador (nada sale a servicios de pago ni de terceros con la foto):
//   1) "Sin fondo": un modelo de segmentación (U²-Net pequeño, licencia libre, /public/models/u2netp.onnx) recorta el producto y lo pone sobre blanco.
//   2) "Ajustada": sin quitar el fondo; solo cuadra la foto, tal como viene (sin tocar brillo ni contraste: forzarlo quemaba la foto).
// Ambas se recomprimen a ~100 kB (JPEG) para no cargar de más el Blob ni la tienda.
// El motor onnxruntime-web se descarga de jsDelivr solo cuando se usa (no engrosa la app).

const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
const MODELO = '/models/u2netp.onnx';
const S = 320; // tamaño de entrada del modelo
let ortPromesa = null;
let sesionPromesa = null;

function cargarOrt() {
    if (typeof window === 'undefined') return Promise.reject(new Error('Solo en el navegador'));
    if (window.ort) return Promise.resolve(window.ort);
    ortPromesa ??= new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `${ORT_BASE}ort.min.js`;
        s.onload = () => { window.ort.env.wasm.wasmPaths = ORT_BASE; window.ort.env.wasm.numThreads = 1; resolve(window.ort); };
        s.onerror = () => { ortPromesa = null; reject(new Error('No se pudo cargar el motor de recorte (¿sin internet?)')); };
        document.head.appendChild(s);
    });
    return ortPromesa;
}

async function sesion() {
    const ort = await cargarOrt();
    sesionPromesa ??= ort.InferenceSession.create(MODELO, { executionProviders: ['wasm'] }).catch((e) => { sesionPromesa = null; throw e; });
    return sesionPromesa;
}

const nuevoCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

// Foto -> canvas (respeta la rotación del teléfono) con el lado mayor limitado
export async function cargarCanvas(archivo, maxLado = 1400) {
    let bmp;
    try { bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' }); }
    catch {
        bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(archivo); });
    }
    const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
    const k = Math.min(1, maxLado / Math.max(w, h));
    const c = nuevoCanvas(w * k, h * k);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); // PNG con transparencia -> blanco
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
}

// JPEG de ~objetivoKB: baja la calidad y, si hace falta, el tamaño
export async function aJpeg(canvas, objetivoKB = 100) {
    let c = canvas, ultimo = null;
    for (let vuelta = 0; vuelta < 5; vuelta++) {
        for (const q of [0.9, 0.82, 0.74, 0.66, 0.58, 0.5]) {
            ultimo = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
            if (ultimo.size <= objetivoKB * 1024) return ultimo;
        }
        const n = nuevoCanvas(c.width * 0.82, c.height * 0.82);
        n.getContext('2d').drawImage(c, 0, 0, n.width, n.height);
        c = n;
    }
    return ultimo;
}

// Cuadra la imagen sobre un lienzo blanco cuadrado
function cuadrar(src, x, y, w, h, lado) {
    const k = Math.min(lado / w, lado / h);
    const out = nuevoCanvas(lado, lado);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lado, lado);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, x, y, w, h, (lado - w * k) / 2, (lado - h * k) / 2, w * k, h * k);
    return out;
}

const suave = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// Máscara del producto (0..1) del tamaño de la imagen
async function mascara(canvas) {
    const ort = await cargarOrt();
    const sess = await sesion();
    const pequeno = nuevoCanvas(S, S);
    pequeno.getContext('2d').drawImage(canvas, 0, 0, S, S);
    const d = pequeno.getContext('2d').getImageData(0, 0, S, S).data;
    let max = 1;
    for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i], d[i + 1], d[i + 2]);
    const media = [0.485, 0.456, 0.406], desv = [0.229, 0.224, 0.225];
    const f = new Float32Array(3 * S * S);
    for (let p = 0; p < S * S; p++) for (let ch = 0; ch < 3; ch++) f[ch * S * S + p] = (d[p * 4 + ch] / max - media[ch]) / desv[ch];
    const salida = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, S, S]) });
    const m = salida[sess.outputNames[0]].data;
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < m.length; i++) { if (m[i] < mn) mn = m[i]; if (m[i] > mx) mx = m[i]; }
    // Se lleva la máscara al tamaño de la foto reescalándola como imagen (interpolación suave)
    const mc = nuevoCanvas(S, S);
    const mimg = mc.getContext('2d').createImageData(S, S);
    for (let i = 0; i < m.length; i++) { const v = Math.round(255 * ((m[i] - mn) / (mx - mn || 1))); mimg.data[i * 4] = v; mimg.data[i * 4 + 1] = v; mimg.data[i * 4 + 2] = v; mimg.data[i * 4 + 3] = 255; }
    mc.getContext('2d').putImageData(mimg, 0, 0);
    const grande = nuevoCanvas(canvas.width, canvas.height);
    const gctx = grande.getContext('2d');
    gctx.imageSmoothingQuality = 'high';
    gctx.drawImage(mc, 0, 0, canvas.width, canvas.height);
    const g = gctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const out = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < out.length; i++) out[i] = g[i * 4] / 255;
    return out;
}

// Producto recortado sobre fondo blanco, cuadrado y centrado. { canvas, ok, motivo }
export async function quitarFondo(canvas, lado = 900) {
    const { width: W, height: H } = canvas;
    const m = await mascara(canvas);
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, W, H);
    const px = img.data;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, dentro = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, mv = m[i];
        if (mv > 0.3) { dentro++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        const a = suave(0.08, 0.4, mv); // umbral bajo: conserva plásticos y bordes translúcidos
        px[i * 4] = 255 + (px[i * 4] - 255) * a; px[i * 4 + 1] = 255 + (px[i * 4 + 1] - 255) * a; px[i * 4 + 2] = 255 + (px[i * 4 + 2] - 255) * a; px[i * 4 + 3] = 255;
    }
    const fraccion = dentro / (W * H);
    if (fraccion < 0.02 || fraccion > 0.97) return { ok: false, motivo: fraccion < 0.02 ? 'No se distinguió el producto' : 'No se distinguió el fondo' };
    const limpio = nuevoCanvas(W, H);
    limpio.getContext('2d').putImageData(img, 0, 0);
    const margen = Math.round(Math.max(x1 - x0, y1 - y0) * 0.07);
    const cx0 = Math.max(0, x0 - margen), cy0 = Math.max(0, y0 - margen), cx1 = Math.min(W, x1 + margen), cy1 = Math.min(H, y1 + margen);
    return { ok: true, canvas: cuadrar(limpio, cx0, cy0, cx1 - cx0, cy1 - cy0, lado) };
}

// Sin quitar el fondo: solo cuadra y centra la foto tal como viene, sin tocar brillo ni contraste
export function ajustada(canvas, lado = 900) {
    return cuadrar(canvas, 0, 0, canvas.width, canvas.height, lado);
}

// Procesa la foto y devuelve las dos opciones para que la persona elija
export async function procesarFoto(archivo, alProgreso = () => {}) {
    alProgreso('Leyendo la foto…');
    const base = await cargarCanvas(archivo);
    const resultado = { simple: null, quitado: null, aviso: '' };
    alProgreso('Ajustando…');
    resultado.simple = await aJpeg(ajustada(base));
    try {
        alProgreso('Quitando el fondo (la primera vez baja el modelo, unos segundos)…');
        const q = await quitarFondo(cargarCopia(base));
        if (q.ok) resultado.quitado = await aJpeg(q.canvas);
        else resultado.aviso = q.motivo;
    } catch (e) {
        resultado.aviso = e.message || 'No se pudo quitar el fondo';
    }
    return resultado;
}

function cargarCopia(c) { const n = nuevoCanvas(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); return n; }
