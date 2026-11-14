# Instrucciones del proyecto

## ⛔ NUNCA hacer push sin autorización (lo primero)
- **NUNCA, NUNCA hacer `git push` sin que Hector lo autorice expresamente en ese momento.** Cada push a `main` despliega en producción.
- Después de cada cambio, solo **commit local**: acumular commits. No subir hasta que Hector diga «sube» (entonces un solo push con todos los commits acumulados).
- Una autorización de push vale una sola vez: no se extiende a los cambios siguientes.

## Git
- Firmar siempre los commits como `Hector <hectormmarrufor@gmail.com>`. Git no tiene identidad configurada en esta máquina, así que pasarla en el comando:
  `git -c user.name=Hector -c user.email=hectormmarrufor@gmail.com commit ...`
- Mensajes de commit en español, siguiendo el estilo del historial.
