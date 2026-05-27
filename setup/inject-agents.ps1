<#
.SYNOPSIS
    Injects agents.md into a target Git repo and adds it to git exclude (never committed).
    Idempotent — safe to run multiple times.

.PARAMETER RepoPath
    Absolute path to the target Git repository root.

.EXAMPLE
    .\setup\inject-agents.ps1 -RepoPath C:\dev\my-company\my-service
    .\setup\inject-agents.ps1 -RepoPath .   # current directory
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$RepoPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoPath   = Resolve-Path $RepoPath
$RepoRoot   = Split-Path $PSScriptRoot -Parent
$Template   = Join-Path $RepoRoot "agents\agents-template.md"
$AgentsDir  = Join-Path $RepoPath ".agents"
$AgentsFile = Join-Path $AgentsDir "agents.md"
$GitExclude = Join-Path $RepoPath ".git\info\exclude"

Write-Host "`n=== inject-agents ===" -ForegroundColor Cyan
Write-Host "Target repo : $RepoPath"

# ── Validate target is a git repo ───────────────────────────────────────────────
if (-not (Test-Path (Join-Path $RepoPath ".git"))) {
    Write-Error "Not a git repository: $RepoPath"
    exit 1
}

# ── Create .agents/ dir ─────────────────────────────────────────────────────────
if (-not (Test-Path $AgentsDir)) {
    New-Item -ItemType Directory -Path $AgentsDir | Out-Null
    Write-Host "[OK] Created .agents/"
}

# ── Copy agents-template.md → .agents/agents.md ─────────────────────────────────
$enc = [System.Text.UTF8Encoding]::new($false)

if (-not (Test-Path $AgentsFile)) {
    $content = [System.IO.File]::ReadAllText($Template, $enc)
    [System.IO.File]::WriteAllText($AgentsFile, $content, $enc)
    Write-Host "[OK] Created .agents/agents.md"
} else {
    Write-Host "[--] .agents/agents.md already exists — skipping (to overwrite, delete it first)"
}

# ── Add entries to .git/info/exclude ────────────────────────────────────────────
$excludeEntries = @(
    ".agents/agents.md",
    ".agents/",
    ".env",
    "mcp.info"
)

# Ensure .git/info/ directory exists
$gitInfoDir = Join-Path $RepoPath ".git\info"
if (-not (Test-Path $gitInfoDir)) {
    New-Item -ItemType Directory -Path $gitInfoDir | Out-Null
}

# Read or create exclude file
$excludeContent = ""
if (Test-Path $GitExclude) {
    $excludeContent = [System.IO.File]::ReadAllText($GitExclude, $enc)
} else {
    $excludeContent = "# git ls-files --others --exclude-from=.git/info/exclude`n# Lines that start with '#' are comments.`n"
}

$changed = $false
foreach ($entry in $excludeEntries) {
    if ($excludeContent -notmatch [regex]::Escape($entry)) {
        $excludeContent = $excludeContent.TrimEnd() + "`n$entry`n"
        $changed = $true
        Write-Host "[OK] Added to git exclude: $entry"
    } else {
        Write-Host "[--] Already in git exclude: $entry"
    }
}

if ($changed) {
    [System.IO.File]::WriteAllText($GitExclude, $excludeContent, $enc)
}

Write-Host "`n=== Done! ===" -ForegroundColor Green
Write-Host ".agents/agents.md is local-only and will NOT be committed."
Write-Host ""
Write-Host "Start the MCP server before using AI agents:"
Write-Host "  cd $RepoRoot && npm start"
