# Run in PowerShell. Requires winget; installer elevation may be requested by Windows.
$ErrorActionPreference = 'Stop'
Write-Host 'Install Node.js 24 LTS, PostgreSQL 17 and MongoDB Community Server 8 from their official native installers.'
Write-Host 'Official downloads: https://nodejs.org/en/download | https://www.postgresql.org/download/windows/ | https://www.mongodb.com/try/download/community'
Write-Host 'Add the Node, PostgreSQL bin, MongoDB Server bin, and mongosh directories to your user PATH.'
Write-Host 'Prefer unstarted services for new project-owned clusters. Existing services are left untouched by setup.'
Write-Host 'For an existing PostgreSQL service, set PG_ADMIN_URL in .env. For existing MongoDB authentication, set MONGO_ADMIN_URL.'
foreach ($Tool in @('git','node','npm','psql','mongod','mongosh')) {
  $Command = Get-Command $Tool -ErrorAction SilentlyContinue
  if ($Command) { Write-Host "$Tool -> $($Command.Source)" } else { Write-Warning "$Tool missing from PATH" }
}
Write-Host 'After installation: npm install; npm run setup:local; npm run dev'
