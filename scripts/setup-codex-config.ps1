<#
.SYNOPSIS
    Create or update an OpenAI Codex CLI config for this project.

.DESCRIPTION
    Writes a standard Codex CLI config to $HOME\.codex\config.toml with:
      - workspace-write sandbox by default
      - on-request approvals by default
      - network access disabled by default
      - trusted project entry for this repository
      - safe, fast, readonly, and full profiles

    If an existing config is present, it is backed up unless -NoBackup is used.

.EXAMPLE
    .\scripts\setup-codex-config.ps1

.EXAMPLE
    .\scripts\setup-codex-config.ps1 -EnableNetwork

.EXAMPLE
    .\scripts\setup-codex-config.ps1 -DefaultProfile fast
#>

[CmdletBinding()]
param(
    [string]$Model = "gpt-5-codex",

    [ValidateSet("on-request", "never", "untrusted")]
    [string]$ApprovalPolicy = "on-request",

    [ValidateSet("read-only", "workspace-write", "danger-full-access")]
    [string]$SandboxMode = "workspace-write",

    [ValidateSet("safe", "fast", "readonly", "full")]
    [string]$DefaultProfile = "fast",

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
model = "$Model"
profile = "$DefaultProfile"
approval_policy = "$ApprovalPolicy"
sandbox_mode = "$SandboxMode"
model_reasoning_effort = "medium"
model_verbosity = "medium"

[sandbox_workspace_write]
network_access = $networkValue

[projects.'$escapedProjectPath']
trust_level = "trusted"

[profiles.safe]
approval_policy = "on-request"
sandbox_mode = "workspace-write"
model_reasoning_effort = "medium"
model_verbosity = "medium"

[profiles.safe.sandbox_workspace_write]
network_access = $networkValue

[profiles.fast]
service_tier = "fast"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
model_reasoning_effort = "low"
model_verbosity = "low"

[profiles.fast.sandbox_workspace_write]
network_access = $networkValue

[profiles.readonly]
approval_policy = "on-request"
sandbox_mode = "read-only"
model_reasoning_effort = "medium"
model_verbosity = "medium"

[profiles.full]
approval_policy = "on-request"
sandbox_mode = "danger-full-access"
model_reasoning_effort = "high"
model_verbosity = "medium"
"@

Set-Content -Path $configPath -Value $config -Encoding UTF8

$profileFiles = @{
    "safe.config.toml" = @"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
model_reasoning_effort = "medium"
model_verbosity = "medium"

[sandbox_workspace_write]
network_access = $networkValue
"@
    "fast.config.toml" = @"
service_tier = "fast"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
model_reasoning_effort = "low"
model_verbosity = "low"

[sandbox_workspace_write]
network_access = $networkValue
"@
    "readonly.config.toml" = @"
approval_policy = "on-request"
sandbox_mode = "read-only"
model_reasoning_effort = "medium"
model_verbosity = "medium"
"@
    "full.config.toml" = @"
approval_policy = "on-request"
sandbox_mode = "danger-full-access"
model_reasoning_effort = "high"
model_verbosity = "medium"
"@
}

foreach ($profileFile in $profileFiles.GetEnumerator()) {
    Set-Content -Path (Join-Path $codexDir $profileFile.Key) -Value $profileFile.Value -Encoding UTF8
}

Write-Host "Wrote Codex config to: $configPath"
Write-Host "Project trusted: $ProjectPath"
Write-Host "Default approval policy: $ApprovalPolicy"
Write-Host "Default sandbox mode: $SandboxMode"
Write-Host "Default profile: $DefaultProfile"
Write-Host "Network access in workspace-write: $networkValue"
Write-Host ""
Write-Host "Available profiles:"
Write-Host "  codex --profile safe"
Write-Host "  codex --profile fast"
Write-Host "  codex --profile readonly"
Write-Host "  codex --profile full"
