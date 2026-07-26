$ErrorActionPreference = "Stop"

$Port = 3100
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$Host.UI.RawUI.WindowTitle = "정비루밍 - 영상용 로컬 실행"

function Write-Line([string]$Text, [string]$Color = "Gray") {
    Write-Host $Text -ForegroundColor $Color
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Line ""
    Write-Line "  [오류] Node.js가 설치되어 있지 않습니다." "Red"
    Write-Line "  https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요." "Yellow"
    Write-Line ""
    Read-Host "  엔터를 누르면 종료합니다"
    exit 1
}

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Write-Line ""
    Write-Line "  최초 실행입니다. 필요한 패키지를 설치합니다 (1~2분)..." "Cyan"
    Write-Line ""
    & npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Line ""
        Write-Line "  [오류] 패키지 설치에 실패했습니다." "Red"
        Read-Host "  엔터를 누르면 종료합니다"
        exit 1
    }
}

$base = "http://localhost:$Port"

Write-Line ""
Write-Line "  ==========================================" "DarkGray"
Write-Line "   영상용 로컬 서버 (온라인 서비스와 분리)" "White"
Write-Line "  ==========================================" "DarkGray"
Write-Line "   메인   : $base/" "Cyan"
Write-Line "   프론트 : $base/hk/front.html?entry=1" "Cyan"
Write-Line "   관리자 : $base/hk/admin.html?entry=1" "Cyan"
Write-Line ""
Write-Line "   종료하려면 이 창을 닫거나 Ctrl+C 를 누르세요." "Yellow"
Write-Line "  ==========================================" "DarkGray"
Write-Line ""

Start-Job -ScriptBlock {
    param($url)
    Start-Sleep -Seconds 3
    Start-Process $url
} -ArgumentList "$base/" | Out-Null

$env:PORT = "$Port"
& node server.js

Write-Line ""
Write-Line "  서버가 종료되었습니다." "Yellow"
Read-Host "  엔터를 누르면 창을 닫습니다"
