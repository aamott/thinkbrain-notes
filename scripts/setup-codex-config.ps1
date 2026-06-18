<#
.SYNOPSIS
    Create or update a minimal OpenAI Codex CLI config for this project.

.DESCRIPTION
    Writes a minimal Codex config to $HOME\.codex\config.toml with:
      - service tier (default: fast)
      - approval policy
      - sandbox mode
      - optional workspace-write network access
      - trusted project entry

    Intentionally does NOT pin model/reasoning/verbosity so Codex can adopt
    newer defaults over time.

.EXAMPLE
    .\scripts\setup-codex-config.ps1 -Force

.EXAMPLE
    .\scripts\setup-codex-config.ps1 -ServiceTier flex -Force
#>

[CmdletBinding()]
param(
    [ValidateSet("fast", "flex")]
    [string]$ServiceTier = "fast",

    [ValidateSet("on-request", "never", "untrusted")]
    [string]$ApprovalPolicy = "on-request",

    [ValidateSet("read-only", "workspace-write", "danger-full-access")]
    [string]$SandboxMode = "workspace-write",

    [string]$ProjectPath = "E:\offline-projects\note-app",

    [switch]$EnableNetwork,

    [switch]$NoBackup,

    [switch]$Force
)

$ErrorActionPreference = "Stop"

$codexDir = Join-Path $HOME ".codex"
$configPath = Join-Path $codexDir "config.toml"

if (-not (Test-Path $codexDir)) {
    New-Item -ItemType Directory -Force -Path $codexDir | Out-Null
}

if ((Test-Path $configPath) -and -not $NoBackup) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupPath = "$configPath.$timestamp.bak"
    Copy-Item -Path $configPath -Destination $backupPath -Force
    Write-Host "Backed up existing config to: $backupPath"
}

if ((Test-Path $configPath) -and -not $Force) {
    Write-Host "An existing Codex config was found at: $configPath"
    Write-Host "It has been backed up. Use -Force to overwrite it."
    exit 0
}

$networkValue = if ($EnableNetwork) { "true" } else { "false" }
$escapedProjectPath = $ProjectPath -replace "'", "''"

$config = @"
service_tier = "$ServiceTier"
approval_policy = "$ApprovalPolicy"
sandbox_mode = "$SandboxMode"

[sandbox_workspace_write]
network_access = $networkValue

[projects.'$escapedProjectPath']
trust_level = "trusted"
"@

Set-Content -Path $configPath -Value $config -Encoding UTF8

Write-Host "Wrote minimal Codex config to: $configPath"
Write-Host "Service tier: $ServiceTier"
Write-Host "Approval policy: $ApprovalPolicy"
Write-Host "Sandbox mode: $SandboxMode"
Write-Host "Network access in workspace-write: $networkValue"
Write-Host "Project trusted: $ProjectPath"
