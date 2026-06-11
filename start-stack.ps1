param(
  [string]$QiushiDir = "D:\myProject\qiushiClawBot",
  [string]$HermesCompose = "\\wsl.localhost\Ubuntu-22.04\home\qinshiwei\hermes-agent\docker-compose.yml"
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Wait-Docker {
  Write-Step "Checking Docker Desktop"

  docker info *> $null
  if ($LASTEXITCODE -eq 0) {
    return
  }

  $dockerDesktop = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1

  if ($dockerDesktop) {
    Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
  }

  $deadline = (Get-Date).AddMinutes(3)
  do {
    Start-Sleep -Seconds 5
    docker info *> $null
    if ($LASTEXITCODE -eq 0) {
      return
    }
  } while ((Get-Date) -lt $deadline)

  throw "Docker daemon is not ready. Please open Docker Desktop, then run this script again."
}

function Require-Path($Path, $Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label not found: $Path"
  }
}

function Show-HttpStatus($Name, $Url) {
  $status = curl.exe -s -o NUL -w "%{http_code}" $Url
  Write-Host "$Name $Url -> $status"
}

Require-Path $QiushiDir "qiushiClawBot directory"
Require-Path (Join-Path $QiushiDir "docker-compose.all.yml") "qiushiClawBot compose file"
Require-Path $HermesCompose "Hermes compose file"

Wait-Docker

Write-Step "Starting Hermes gateway and dashboard"
docker compose -p hermes-agent -f $HermesCompose up -d gateway dashboard

Write-Step "Starting qiushiClawBot and gold"
docker compose --project-directory $QiushiDir -f "$QiushiDir\docker-compose.all.yml" up -d

Write-Step "Waiting for services"
Start-Sleep -Seconds 10

Write-Step "Container status"
docker compose -p hermes-agent -f $HermesCompose ps
docker compose --project-directory $QiushiDir -f "$QiushiDir\docker-compose.all.yml" ps

Write-Step "HTTP checks"
Show-HttpStatus "Hermes dashboard" "http://127.0.0.1:9119/"
Show-HttpStatus "qiushiClawBot health" "http://127.0.0.1:8711/health"
Show-HttpStatus "gold dashboard" "http://127.0.0.1:8787/"

Write-Host ""
Write-Host "Dashboards:" -ForegroundColor Green
Write-Host "  Hermes: http://127.0.0.1:9119"
Write-Host "  Gold:   http://127.0.0.1:8787"
Write-Host ""
Write-Host "Logs:" -ForegroundColor Green
Write-Host "  docker logs -f hermes"
Write-Host "  docker logs -f hermes-dashboard"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$QiushiDir\logs-all.ps1`""
