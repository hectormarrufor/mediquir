# Instrucciones del proyecto (Mediquir)

## ⛔ NUNCA ejecutar `yarn build` / `next build` sin que Hector lo pida
- **NO correr `yarn build` después de cada cambio.** Se pierde mucho tiempo.
- Solo ejecutar `yarn build` cuando Hector lo solicite expresamente.

## ⛔ NUNCA hacer `git push` sin autorización
- **NUNCA hacer `git push` sin autorización expresa de Hector en ese momento.** Cada push a `main` despliega en producción.
- Después de cada cambio, hacer solo **commit local** y acumular commits hasta que Hector diga «sube» (entonces hacer un solo push).
- Cada autorización de push vale una sola vez; no se extiende a cambios posteriores.

## Git
- Mensajes de commit en español, siguiendo el estilo descriptivo del historial (`Área: descripción breve`).
- La identidad de Git (`Hector <hectormmarrufor@gmail.com>`) ya está configurada en el repositorio/máquina; no hace falta pasar `-c user.name` ni `-c user.email`.

## Entorno
- Stack: Next.js (App Router), Mantine, Sequelize.
- Gestor de paquetes: `yarn` (`yarn.lock` presente).
- Sistema operativo: Windows (PowerShell).
