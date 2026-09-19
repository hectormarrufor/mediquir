<#
  Programa (o quita) los respaldos automáticos en el Programador de tareas de Windows.

    powershell -ExecutionPolicy Bypass -File scripts\respaldo\programar.ps1                 # respaldo diario 02:00 + keepalive cada 4 h
    powershell -ExecutionPolicy Bypass -File scripts\respaldo\programar.ps1 -Hora 23:30     # otra hora
    powershell -ExecutionPolicy Bypass -File scripts\respaldo\programar.ps1 -Desinstalar    # quita ambas tareas

  Las tareas corren con TU usuario (no piden contraseña ni permisos de administrador).
  "StartWhenAvailable": si el equipo estaba apagado a la hora del respaldo, se hace en cuanto se enciende.
#>
param(
    [string]$Hora = '02:00',
    [int]$CadaHorasKeepalive = 4,
    [switch]$Desinstalar
)

$ErrorActionPreference = 'Stop'
$nombreRespaldo = 'Mediquir - Respaldo de base de datos'
$nombreKeepalive = 'Mediquir - Keepalive de base de datos'

if ($Desinstalar) {
    foreach ($n in @($nombreRespaldo, $nombreKeepalive)) {
        if (Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $n -Confirm:$false; Write-Host "Quitada: $n" }
    }
    return
}

$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $raiz 'scripts\respaldo\respaldar.js'
if (-not (Test-Path (Join-Path $raiz '.env'))) { throw "No encuentro el archivo .env en $raiz" }

$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

# 1) Respaldo diario
$accion = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" -WorkingDirectory $raiz
Register-ScheduledTask -TaskName $nombreRespaldo -Action $accion -Trigger (New-ScheduledTaskTrigger -Daily -At $Hora) -Settings $ajustes -Force `
    -Description 'Respaldo comprimido de la base de datos con rotación (7 diarios, 4 semanales, 12 mensuales).' | Out-Null
Write-Host "Respaldo diario programado a las $Hora"

# 2) Keepalive: una consulta cada N horas para que la base gratuita no se apague por inactividad
$accionKA = New-ScheduledTaskAction -Execute $node -Argument "`"$script`" --keepalive" -WorkingDirectory $raiz
$disparador = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Hours $CadaHorasKeepalive)
Register-ScheduledTask -TaskName $nombreKeepalive -Action $accionKA -Trigger $disparador -Settings $ajustes -Force `
    -Description 'Consulta mínima para mantener despierta la base de datos.' | Out-Null
Write-Host "Keepalive programado cada $CadaHorasKeepalive horas"

Write-Host ''
Write-Host "Los respaldos se guardan en: $(if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $env:USERPROFILE 'Respaldos\Mediquir' })"
Write-Host 'Para probarlo ya:  node scripts\respaldo\respaldar.js'
