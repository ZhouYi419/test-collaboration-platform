param(
    [ValidateSet('all', 'chrome', 'edge', 'firefox')]
    [string]$Suite = 'all'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot '.venv/Scripts/python.exe'
$runId = [guid]::NewGuid().ToString('N').Substring(0, 8)
$reportRoot = Join-Path $projectRoot ".pytest_cache/browser-$runId"
$matrix = @(
    @{ Name = 'chrome'; Browser = 'chromium'; Channel = 'chrome'; File = 'test_issue_lifecycle.py'; Viewport = '1440x900' }
    @{ Name = 'edge'; Browser = 'chromium'; Channel = 'msedge'; File = 'test_narrow_verification.py'; Viewport = '390x844' }
    @{ Name = 'firefox'; Browser = 'firefox'; File = 'test_query_navigation.py'; Viewport = '1440x900' }
)

$result = 0
Push-Location (Join-Path $projectRoot 'backend')
try {
    foreach ($entry in $matrix) {
        if ($Suite -ne 'all' -and $entry.Name -ne $Suite) { continue }
        $report = Join-Path $reportRoot $entry.Name
        New-Item -ItemType Directory -Path $report -Force | Out-Null
        $channel = @()
        if ($entry.Channel) { $channel = @('--browser-channel', $entry.Channel) }
        Write-Host "[$($entry.Name) $($entry.Viewport)] $report"
        & $python -m pytest -q "../e2e/$($entry.File)" --browser $entry.Browser @channel `
            --screenshot only-on-failure --tracing retain-on-failure --output "$report/evidence" `
            --basetemp "$report/tmp" --junitxml "$report/results.xml" -o "junit_suite_name=$($entry.Name)-$($entry.Viewport)"
        if ($LASTEXITCODE -ne 0) { $result = $LASTEXITCODE }
    }
} finally {
    Pop-Location
}
exit $result
