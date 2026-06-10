param(
  [string]$ProjectDir = "D:\myProject\qiushiClawBot"
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

Wait-Docker

Write-Step "Stopping split containers if they exist"
$splitGold = docker ps -aq --filter "name=^/gold-price-watch$"
if ($splitGold) {
  docker rm -f gold-price-watch | Out-Null
}
docker compose --project-directory $ProjectDir down

Write-Step "Starting qiushiClawBot and gold in one container"
docker compose --project-directory $ProjectDir -f "$ProjectDir\docker-compose.all.yml" up -d --build

Write-Step "Status"
docker compose --project-directory $ProjectDir -f "$ProjectDir\docker-compose.all.yml" ps

Write-Host ""
Write-Host "qiushiClawBot: http://127.0.0.1:8711/health" -ForegroundColor Green
Write-Host "gold dashboard: http://127.0.0.1:8787" -ForegroundColor Green
Write-Host ""
Write-Host "Logs:"
Write-Host "  docker compose --project-directory `"$ProjectDir`" -f `"$ProjectDir\docker-compose.all.yml`" logs -f"
