<#
.SYNOPSIS
    Idempotent setup for atlassian-local-mcp on Windows.
    Safe to run multiple times.

.DESCRIPTION
    1. Installs npm dependencies.
    2. Creates .env from .env.example if missing and opens it.
    3. Writes a start-mcp.bat shortcut next to the repo.
    4. Adds ATLASSIAN_MCP_DIR to user PATH (if not already set).

.EXAMPLE
    .\setup\setup.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path $PSScriptRoot -Parent

Write-Host "`n=== atlassian-local-mcp setup ===" -ForegroundColor Cyan

# ── 1. Check Node.js ────────────────────────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js not found. Install it from https://nodejs.org (>= 18) and re-run."
    exit 1
}
$nodeVersion = node --version
Write-Host "[OK] Node.js $nodeVersion"

# ── 2. Install dependencies ─────────────────────────────────────────────────────
Write-Host "`n[1/4] Installing npm dependencies..."
Push-Location $RepoRoot
npm install --silent
Pop-Location
Write-Host "[OK] Dependencies installed"

# ── 3. Create .env from example ─────────────────────────────────────────────────
$envFile    = Join-Path $RepoRoot ".env"
$envExample = Join-Path $RepoRoot ".env.example"

if (-not (Test-Path $envFile)) {
    Write-Host "`n[2/4] Creating .env from .env.example..."
    Copy-Item $envExample $envFile
    Write-Host "[OK] .env created — opening in Notepad to fill in credentials..."
    Start-Process notepad.exe $envFile
    Write-Host "      Fill in JIRA_HOST, JIRA_EMAIL, JIRA_TOKEN, BITBUCKET_WORKSPACE and save."
    Read-Host  "      Press Enter when done"
} else {
    Write-Host "[OK] .env already exists — skipping"
}

# ── 4. Write start-mcp.bat shortcut ─────────────────────────────────────────────
$batPath = Join-Path $RepoRoot "start-mcp.bat"
if (-not (Test-Path $batPath)) {
    Write-Host "`n[3/4] Writing start-mcp.bat shortcut..."
    $batContent = "@echo off`r`ncd /d `"%~dp0`"`r`nnode server.js`r`n"
    [System.IO.File]::WriteAllText($batPath, $batContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[OK] start-mcp.bat created"
} else {
    Write-Host "[OK] start-mcp.bat already exists — skipping"
}

# ── 5. Add ATLASSIAN_MCP_DIR to user PATH ────────────────────────────────────────
Write-Host "`n[4/4] Checking PATH..."
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notlike "*atlassian-local-mcp*") {
    [Environment]::SetEnvironmentVariable(
        "PATH",
        "$userPath;$RepoRoot",
        "User"
    )
    [Environment]::SetEnvironmentVariable("ATLASSIAN_MCP_DIR", $RepoRoot, "User")
    Write-Host "[OK] ATLASSIAN_MCP_DIR added to user environment (restart shell to take effect)"
} else {
    Write-Host "[OK] Already in PATH — skipping"
}

Write-Host "`n=== Setup complete! ===" -ForegroundColor Green
Write-Host "To start the MCP server:"
Write-Host "  cd $RepoRoot"
Write-Host "  npm start"
Write-Host ""
Write-Host "To inject agents.md into a repo:"
Write-Host "  .\setup\inject-agents.ps1 -RepoPath C:\path\to\your-repo"
