$files = @(
    'bulk-replace.js',
    'commands\dashboard.js',
    'commands\broadcast.js',
    'commands\betatester.js',
    'commands\version.js',
    'commands\userlanguage.js',
    'commands\premium-role.js',
    'commands\lifetime-premium.js',
    'commands\status.js',
    'commands\github-commits.js',
    'commands\restart.js',
    'index.js',
    'replace-branding.js',
    'email-notifications.js',
    'README.md',
    'dm-notifications.js',
    'panel.js',
    'public\markdown.css',
    'public\css\app.css',
    'public\js\app\tickets.js',
    'public\js\app\state.js',
    'public\js\app\panel.js',
    'public\js\app\main.js',
    'public\js\app\api.js'
)

$count = 0
foreach ($file in $files) {
    $fullPath = Join-Path $PSScriptRoot $file
    if (Test-Path $fullPath) {
        $content = Get-Content $fullPath -Raw
        $newContent = $content -replace 'TRS Tickets', 'Quantix Tickets'
        if ($content -ne $newContent) {
            Set-Content -Path $fullPath -Value $newContent -NoNewline
            $count++
            Write-Host "✅ $file"
        }
    } else {
        Write-Host "❌ Datei nicht gefunden: $file"
    }
}

Write-Host "`n✨ Fertig! $count Dateien aktualisiert."
