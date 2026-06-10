param(
  [string]$QiushiDir = "D:\myProject\qiushiClawBot",
  [string]$GoldDir = "D:\myProject\gold",
  [string]$GoldContainer = "gold-price-watch",
  [int]$GoldPort = 8787,
  [int]$QiushiPort = 8711
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

function Test-PathOrThrow($Path, $Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label not found: $Path"
  }
}

Test-PathOrThrow $QiushiDir "qiushiClawBot directory"
Test-PathOrThrow $GoldDir "gold directory"
Test-PathOrThrow (Join-Path $QiushiDir "docker-compose.yml") "qiushiClawBot docker-compose.yml"
Test-PathOrThrow (Join-Path $GoldDir "package.json") "gold package.json"

Wait-Docker

Write-Step "Starting qiushiClawBot"
Push-Location $QiushiDir
try {
  docker compose up -d --build
} finally {
  Pop-Location
}

Write-Step "Starting gold dashboard"
$existingGold = docker ps -aq --filter "name=^/$GoldContainer$"
if ($existingGold) {
  docker rm -f $GoldContainer | Out-Null
}

$goldEnv = Join-Path $GoldDir ".env"
$envArgs = @()
if (Test-Path $goldEnv) {
  $envArgs = @("--env-file", $goldEnv)
}

docker run -d `
  --name $GoldContainer `
  --restart unless-stopped `
  @envArgs `
  -e "WEB_HOST=0.0.0.0" `
  -e "WEB_PORT=$GoldPort" `
  -e "WECHAT_FORWARDER_URL=http://host.docker.internal:$QiushiPort/send" `
  -p "${GoldPort}:${GoldPort}" `
  -v "${GoldDir}:/app" `
  -w /app `
  node:20-alpine `
  npm run web | Out-Null

Write-Step "Status"
docker compose --project-directory $QiushiDir ps
docker ps --filter "name=^/$GoldContainer$" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host ""
Write-Host "qiushiClawBot: http://127.0.0.1:$QiushiPort/health" -ForegroundColor Green
Write-Host "gold dashboard: http://127.0.0.1:$GoldPort" -ForegroundColor Green
Write-Host ""
Write-Host "Logs:"
Write-Host "  docker compose --project-directory `"$QiushiDir`" logs -f"
Write-Host "  docker logs -f $GoldContainer"
