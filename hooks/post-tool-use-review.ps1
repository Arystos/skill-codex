# codex-bridge: PostToolUse hook for auto-review suggestions (Windows PowerShell)
# Triggered after Write/Edit tool usage in Claude Code

$input = $input | ConvertFrom-Json -ErrorAction SilentlyContinue
$toolName = $input.tool_name

# Only trigger for write/edit tools
if ($toolName -notin @("Write", "Edit", "MultiEdit", "NotebookEdit")) {
    exit 0
}

# Skip if inside a bridge call
if ($env:CODEX_BRIDGE_DEPTH) {
    exit 0
}

# Check git repo
try {
    git rev-parse --is-inside-work-tree 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { exit 0 }
} catch {
    exit 0
}

# Get change stats
$changedFiles = git diff --name-only 2>$null
$changedCount = ($changedFiles | Measure-Object -Line).Lines
$stat = git diff --stat 2>$null | Select-Object -Last 1
$totalLines = 0
if ($stat -match "(\d+) insertion") { $totalLines += [int]$Matches[1] }
if ($stat -match "(\d+) deletion") { $totalLines += [int]$Matches[1] }

# Check security paths
$securityHit = $false
$keywords = @("auth", "security", "crypto", "password", "secret", "token")
foreach ($keyword in $keywords) {
    if ($changedFiles -match $keyword) {
        $securityHit = $true
        break
    }
}

# Suggest review
if ($securityHit) {
    Write-Output "[codex-bridge] Security-sensitive files modified. Consider running /codex-review before committing."
} elseif ($changedCount -ge 3 -or $totalLines -ge 100) {
    Write-Output "[codex-bridge] Significant changes detected ($changedCount files, ~$totalLines lines). Consider running /codex-review."
}

exit 0
