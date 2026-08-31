# update-catalog.ps1
#
# Run once a day (via Task Scheduler) on the library PC. Regenerates
# catalog.json from Miriam.mdb and pushes it to GitHub -- that push alone
# is what makes the live site update (see .github/workflows/deploy.yml,
# which rebuilds and redeploys on every push to main).
#
# Does NOT touch node/npm/the build -- that all happens on GitHub's side.
# This machine only needs Python (with pyodbc) and Git.

param(
    [string]$MdbPath = "C:\Miriam\Miriam.mdb"
)

$ErrorActionPreference = "Stop"
Set-Location -Path (Join-Path $PSScriptRoot "..")

Write-Host "Extracting catalog from $MdbPath ..."
python extract_miriam.py $MdbPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "extract_miriam.py failed -- not pushing anything."
    exit 1
}

git add catalog.json
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "catalog.json unchanged -- nothing to push."
    exit 0
}

$today = Get-Date -Format "yyyy-MM-dd"
git commit -m "Automated catalog update $today"
git push origin main
Write-Host "Pushed updated catalog.json -- site will redeploy automatically."
