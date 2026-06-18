<#
.SYNOPSIS
    Set Codex service tier in the user-level config.

.DESCRIPTION
    Updates $HOME\.codex\config.toml to use a minimal default mode:
      - fast  -> service_tier = "fast"
      - safe  -> service_tier = "flex"

    This script intentionally avoids pinning model/reasoning/verbosity.

.EXAMPLE
    .\scripts\set-codex-default-profile.ps1 -Profile fast

.EXAMPLE
    .\scripts\set-codex-default-profile.ps1 -Profile safe
#>

[CmdletBinding()]
param(
    [ValidateSet("safe", "fast")]
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

function Set-TomlScalar {
    param(
        [string]$InputText,
        [string]$Key,
        [string]$Value
    )

    $line = "$Key = `"$Value`""
    if ($InputText -match "(?m)^$([regex]::Escape($Key))\s*=") {
        return [regex]::Replace($InputText, "(?m)^$([regex]::Escape($Key))\s*=.*$", $line, 1)
    }

    return "$line`r`n$InputText"
}

$serviceTier = if ($Profile -eq "fast") { "fast" } else { "flex" }

# Remove deprecated profile selector and tuning keys so Codex uses built-in defaults.
$text = [regex]::Replace($text, '(?m)^profile\s*=.*\r?\n?', '')
$text = [regex]::Replace($text, '(?m)^model\s*=.*\r?\n?', '')
$text = [regex]::Replace($text, '(?m)^model_reasoning_effort\s*=.*\r?\n?', '')
$text = [regex]::Replace($text, '(?m)^model_verbosity\s*=.*\r?\n?', '')

$text = Set-TomlScalar $text "service_tier" $serviceTier

Set-Content -Path $configPath -Value $text -Encoding UTF8

Write-Host "Set Codex mode: $Profile"
Write-Host "service_tier = $serviceTier"
Write-Host "Updated: $configPath"
