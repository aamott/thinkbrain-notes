<#
.SYNOPSIS
    Set the default Codex CLI profile in the user-level config.

.DESCRIPTION
    Updates $HOME\.codex\config.toml so Codex starts with the selected profile
    by default. This is the setting Zed's Codex ACP integration should inherit,
    because external agents own their native configuration.

.EXAMPLE
    .\scripts\set-codex-default-profile.ps1

.EXAMPLE
    .\scripts\set-codex-default-profile.ps1 -Profile safe
#>

[CmdletBinding()]
param(
    [ValidateSet("safe", "fast", "readonly", "full")]
    [string]$Profile = "fast",

    [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

$codexDir = Join-Path $HOME ".codex"
$configPath = Join-Path $codexDir "config.toml"

if (-not (Test-Path $configPath)) {
    throw "Codex config not found at $configPath. Run scripts/setup-codex-config.ps1 first."
}

if (-not $NoBackup) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupPath = "$configPath.$timestamp.profile-change.bak"
    Copy-Item -Path $configPath -Destination $backupPath -Force
    Write-Host "Backed up existing config to: $backupPath"
}

$text = Get-Content -Raw -Path $configPath
$profileLine = "profile = `"$Profile`""

if ($text -match '(?m)^profile\s*=') {
    $text = [regex]::Replace($text, '(?m)^profile\s*=.*$', $profileLine, 1)
} else {
    $text = [regex]::Replace($text, '(?m)^(model\s*=.*)$', "`$1`r`n$profileLine", 1)
}

Set-Content -Path $configPath -Value $text -Encoding UTF8

Write-Host "Set Codex default profile to: $Profile"
Write-Host "Updated: $configPath"
