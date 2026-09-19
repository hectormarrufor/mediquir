# Respaldo de la base de datos

Respaldo comprimido de la base (Aiven PostgreSQL) que se guarda **en este equipo**, con rotación. Corre desde Windows,
así que no le afecta el límite de 10 segundos de Vercel. No necesita `pg_dump`: es Node puro.

## Qué guarda
Un archivo `mediquir_AAAAMMDD_HHMMSS.json.gz` con el **esquema completo** (tipos, secuencias, tablas, restricciones e
índices) y **todas las filas**, más su suma de comprobación (`.sha256`). Se lee todo en una sola transacción de solo
lectura, así que el respaldo es consistente aunque entren ventas mientras se hace. Tras crearlo se verifica solo.

- Carpeta por defecto: `C:\Users\<tu usuario>\Respaldos\Mediquir` (cámbiala con la variable `BACKUP_DIR`).
- Rotación: 7 diarios, 4 semanales y 12 mensuales (`BACKUP_DIARIOS`, `BACKUP_SEMANALES`, `BACKUP_MENSUALES`).
- Bitácora: `respaldo.log` en la misma carpeta.

## Uso
```
npm run respaldo             # respaldo completo + rotación
npm run respaldo:verificar   # comprueba que el último respaldo se puede leer y está completo
npm run respaldo:keepalive   # una consulta (evita que la base se apague por inactividad)
```

## Automático (Windows)
```
powershell -ExecutionPolicy Bypass -File scripts\respaldo\programar.ps1
```
Crea dos tareas con tu usuario (sin permisos de administrador): el respaldo diario a las 02:00 (si el equipo estaba
apagado, se hace al encenderlo) y un *keepalive* cada 4 horas. Para quitarlas: `... programar.ps1 -Desinstalar`.

## Restaurar
Siempre prueba primero en un esquema aparte (no toca nada de lo real):
```
node scripts\respaldo\restaurar.js "<archivo.json.gz>" --esquema restauracion
```
Restaurar de verdad en una base vacía (o con tablas vacías; nunca borra ni pisa datos):
```
node scripts\respaldo\restaurar.js "<archivo.json.gz>" --esquema public --confirmar
```
Verificado contra la base real: las 36 tablas, las secuencias, las restricciones y los índices quedan idénticos.

## Limitaciones (dilo con franqueza)
- **Un respaldo en el mismo equipo no es un respaldo completo**: si se daña o roba el equipo, se pierde. Copia la carpeta
  a un disco externo o a una nube personal de vez en cuando.
- **No sé cuánto tiempo de inactividad tolera Aiven antes de apagar la base gratuita.** El keepalive cada 4 horas
  ayuda, pero solo funciona con el equipo encendido; los crons diarios de Vercel también consultan la base.
- Pensado para bases pequeñas (hoy 12 MB): carga los datos en memoria. Si crece a cientos de MB, conviene `pg_dump`.
- No respalda roles, extensiones ni permisos del servidor (solo el esquema `public`).
