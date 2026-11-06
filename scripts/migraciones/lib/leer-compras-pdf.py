# Lee el "Libro de Compras" (PDF del sistema anterior) y lo guarda como JSON: una entrada por línea (FAC = factura de compra, RET = comprobante de retención).
# Uso: python -I scripts/migraciones/lib/leer-compras-pdf.py "<ruta al pdf>" "<salida.json>"
import fitz, json, re, sys
pdf, salida = sys.argv[1], sys.argv[2]
num = lambda s: float(s.replace('.', '').replace(',', '.'))
ES_NUM = re.compile(r'^-?\d{1,3}(\.\d{3})*,\d+$|^-?\d+,\d+$')
ES_FECHA = re.compile(r'^\d{2}/\d{2}/\d{4}$')
d = fitz.open(pdf)
lineas = []
for pg in range(len(d)):
    palabras = [(round(x0), round(x1), round(y0), t) for x0, y0, x1, y1, t, *_ in d[pg].get_text('words')]
    # una operación empieza con su fecha de emisión (x ~ 32); el número de operación pasa a '***' después del 2021
    inicios = sorted(y for x0, x1, y, t in palabras if 28 <= x0 <= 36 and ES_FECHA.match(t))
    for i, y in enumerate(inicios):
        fin = inicios[i + 1] - 4 if i + 1 < len(inicios) else 10 ** 6
        w = sorted([p for p in palabras if y - 4 <= p[2] < fin and p[2] > 80], key=lambda p: (p[0]))
        if not w: continue
        fila = {'pagina': pg + 1, 'op': next((int(t) for x0, x1, yy, t in w if x0 < 14 and t.isdigit()), None)}
        fila['fecha'] = next((t for x0, x1, yy, t in w if ES_FECHA.match(t)), None)
        fila['rif'] = next((t for x0, x1, yy, t in w if 70 <= x0 <= 78 and re.match(r'^[A-Z]-?\d', t)), None)
        fila['nombre'] = ' '.join(t for x0, x1, yy, t in w if 115 <= x0 < 340 and abs(yy - y) <= 4)
        fila['tipo'] = next((t for x0, x1, yy, t in w if 345 <= x0 <= 352 and t in ('FAC', 'RET', 'N/C', 'N/D', 'NCR', 'NDB')), None)
        fila['trans'] = next((t for x0, x1, yy, t in w if 520 <= x0 <= 528 and re.fullmatch(r'\d{2}', t)), None)
        nums = [(x1, t) for x0, x1, yy, t in w if ES_NUM.match(t) and x0 > 540]
        if fila['tipo'] == 'RET':
            fila['comprobante'] = next((t for x0, x1, yy, t in w if 360 <= x0 <= 370 and re.fullmatch(r'\d{14}', t)), None)
            fila['factura'] = next((t for x0, x1, yy, t in w if 424 <= x0 <= 436), None)
            fila['retenido'] = next((num(t) for x1, t in nums if 735 <= x1 <= 750), None)
        else:
            fila['factura'] = next((t for x0, x1, yy, t in w if 366 <= x0 <= 372 and 345 < x0 and t not in ('FAC',)), None)
            fila['control'] = next((t for x0, x1, yy, t in w if 468 <= x0 <= 476), None)
            fila['total'] = next((num(t) for x1, t in nums if 596 <= x1 <= 610), None)
            fila['base'] = next((num(t) for x1, t in nums if 660 <= x1 <= 675), None)
            fila['exento'] = next((num(t) for x1, t in nums if 828 <= x1 <= 840), None)
            fila['crudo'] = [t for x1, t in nums]
        lineas.append(fila)
json.dump(lineas, open(salida, 'w', encoding='utf-8'), ensure_ascii=False)
print(len(lineas), 'líneas:', sum(1 for l in lineas if l['tipo'] == 'FAC'), 'facturas,', sum(1 for l in lineas if l['tipo'] == 'RET'), 'retenciones')
