$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$Host.UI.RawUI.WindowTitle = "정비루밍 - 영상용 데이터 초기화"

Write-Host ""
Write-Host "  로컬 서버에 저장된 데이터(sync-state.json)를 삭제합니다." -ForegroundColor White
Write-Host "  온라인 서비스 데이터에는 영향이 없습니다." -ForegroundColor Gray
Write-Host ""
Write-Host "  ※ 서버가 실행 중이면 먼저 종료하세요." -ForegroundColor Yellow
Write-Host ""

$answer = Read-Host "  초기화할까요? (Y/N)"
if ($answer -notmatch "^[Yy]") {
    Write-Host "  취소했습니다." -ForegroundColor Gray
    Read-Host "  엔터를 누르면 종료합니다"
    exit 0
}

$stateFile = Join-Path $Root "sync-state.json"
if (Test-Path $stateFile) {
    Remove-Item $stateFile -Force
    Write-Host "  초기화 완료." -ForegroundColor Green
} else {
    Write-Host "  삭제할 데이터가 없습니다." -ForegroundColor Gray
}

Write-Host ""
Read-Host "  엔터를 누르면 종료합니다"
