// Migración aditiva: módulo de tareas renovado.
//   Tareas.subtareas        -> lista de pasos [{ id, texto, hecha }] (checklist)
//   Tareas.completadaAt     -> cuándo se completó
//   Tareas.completadaPorId  -> quién la completó
//   Tareas.iniciadaAt       -> cuándo pasó a "En Progreso" por primera vez
//   Tareas.recordadaEl      -> último día (Caracas) en que el cron le recordó su vencimiento al responsable (para no repetir avisos)
//   TareaComentarios        -> conversación y bitácora de cada tarea (tipo COMENTARIO o ACTIVIDAD)
// Se puede ejecutar varias veces.   node scripts/migraciones/tareas-v2.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Tareas"
            ADD COLUMN IF NOT EXISTS "subtareas" jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS "completadaAt" timestamp NULL,
            ADD COLUMN IF NOT EXISTS "completadaPorId" integer NULL,
            ADD COLUMN IF NOT EXISTS "iniciadaAt" timestamp NULL,
            ADD COLUMN IF NOT EXISTS "recordadaEl" date NULL`);
        await db.query(`CREATE TABLE IF NOT EXISTS "TareaComentarios" (
            "id" serial PRIMARY KEY,
            "tareaId" integer NOT NULL REFERENCES "Tareas"("id") ON DELETE CASCADE,
            "usuarioId" integer NULL,
            "tipo" varchar(12) NOT NULL DEFAULT 'COMENTARIO',
            "texto" text NOT NULL,
            "createdAt" timestamp NOT NULL DEFAULT now(),
            "updatedAt" timestamp NOT NULL DEFAULT now()
        )`);
        await db.query(`CREATE INDEX IF NOT EXISTS "TareaComentarios_tarea" ON "TareaComentarios" ("tareaId", "createdAt")`);
        await db.query('COMMIT');
        console.log('Migración lista: Tareas (subtareas, completadaAt, completadaPorId, iniciadaAt, recordadaEl) y TareaComentarios');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
