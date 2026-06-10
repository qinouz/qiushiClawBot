param(
  [string]$ProjectDir = "D:\myProject\qiushiClawBot"
)

$ErrorActionPreference = "Stop"

docker compose --project-directory $ProjectDir -f "$ProjectDir\docker-compose.all.yml" logs -f --tail=200 qiushi-gold
