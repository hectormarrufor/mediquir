# Lee "Lista de Artículos vendidos y/o entregados" (PDF del sistema anterior) y lo guarda como JSON: una entrada por factura con sus renglones.
# Uso: python -I scripts/migraciones/lib/leer-ventas-pdf.py "<ruta al pdf>" "<salida.json>"
import fitz, json, re, sys
pdf, salida = sys.argv[1], sys.argv[2]
num = lambda s: float(s.replace('.', '').replace(',', '.'))
ES_NUM = re.compile(r'^-?\d{1,3}(\.\d{3})*,\d+$|^-?\d+,\d+$')
docs, actual = [], None
d = fitz.open(pdf)
for pg in range(len(d)):
    filas = {}
    for x0, y0, x1, y1, t, *_ in d[pg].get_text('words'):
        filas.setdefault(round(y0 / 3), []).append((x0, x1, t))
    for k in sorted(filas):
        w = sorted(filas[k])
        txt = ' '.join(t for _, _, t in w)
        if w[0][2] == 'FAC' and w[0][0] < 10 and len(w) > 2 and re.fullmatch(r'\d{8}', w[1][2]):
            resto = ' '.join(t for _, _, t in w[2:])
            m = re.match(r'(\S+)\s+-\s+(.*)$', resto)
            actual = {'doc': int(w[1][2]), 'pagina': pg + 1, 'rif': m.group(1) if m else None, 'cliente': (m.group(2) if m else resto).strip(), 'items': [], 'sub': None}
            docs.append(actual); continue
        if actual is None: continue
        if txt.startswith('SUB-TOTAL DOCUMENTO'):
            n = [(x1, t) for _, x1, t in w if ES_NUM.match(t)]
            f = lambda lo, hi: next((num(t) for x1, t in n if lo < x1 < hi), None)
            actual['sub'] = {'cant': f(380, 420), 'total': f(430, 500), 'devuelto': f(500, 600), 'crudo': [t for _, t in n]}
            continue
        # renglón: código (x<30) + descripción + precio + cantidad + total + devuelto
        if w[0][0] < 30 and re.fullmatch(r'[0-9A-Z]{3,8}', w[0][2]) and w[0][1] < 40:
            desc = ' '.join(t for x0, x1, t in w[1:] if 60 < x0 and x1 < 318 and not (ES_NUM.match(t) and x1 > 300))
            val = {}
            for x0, x1, t in w:
                if ES_NUM.match(t):
                    col = 'precio' if 300 < x1 < 365 else 'cant' if 365 < x1 < 425 else 'total' if 425 < x1 < 500 else 'devuelto' if x1 >= 500 else None
                    if col: val[col] = num(t)
            actual['items'].append({'codigo': w[0][2], 'desc': desc, **val})
json.dump(docs, open(salida, 'w', encoding='utf-8'), ensure_ascii=False)
print(len(docs), 'facturas', sum(len(x['items']) for x in docs), 'renglones')
