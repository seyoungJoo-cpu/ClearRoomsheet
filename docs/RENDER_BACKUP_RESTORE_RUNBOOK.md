# makeroom: Render 운영 백업·복구·보안 배포 체크리스트

## 현재 제약
- Render: makeroom (Oregon, srv-d8nsg23tqb8s73di0j10). GitHub main 자동 배포 설정.
- 코드에서 `sync-state.json`, `push-subs.json`, `.vapid-keys.json`, `.push-vapid-marker.txt`, `close-day-archives/`를 앱 디렉터리에 저장함.
- Render 영구 디스크가 확인되지 않음. 지금 main 병합/재시작/디스크 생성하면 데이터 유실 위험.
- ChatGPT에 연결된 Render 관리 기능으로는 실제 인스턴스 Shell/SSH 실행이나 파일 전송을 할 수 없음.

## A. 운영 인스턴스에서 백업하기 (IT/개인정보 담당 승인 필요)
1. PAD 업로드와 직원의 오더/채팅/객실 수정 작업을 일시 정지한다.
2. Render 대시보드의 **makeroom > Shell** 또는 실제 운영 인스턴스로 SSH 연결. 임시(ephemeral) SSH가 아니어야 함.
3. 이 PR의 `scripts/render-live-backup.sh`를 검토하고, SCP로 `/tmp`에 전송한다. **이 스크립트를 추가하려고 서버를 재배포하면 안 됨.**
4. 운영 Shell에서 다음을 실행한다:
```bash
bash /tmp/render-live-backup.sh "$HOME"
```
5. `sync-state.json`을 JSON으로 검증하고, SHA256 전후 일치 여부와 tar 백업 검사를 통과했는지 확인한다. 내용은 화면이나 로그에 출력하지 않는다.
6. 백업 경로와 SHA256만 메모한다. 오류라면 여기서 중지한다.
7. 환경변수에 설정된 VAPID 및 기타 운영 비밀값은 Render 대시보드에서 회사 승인 비밀 저장소로 별도 보관한다. 실제 값은 GitHub/채팅에 공유하지 않는다.

## B. 백업을 안전한 저장소로 이동
회사에서 승인한 컴퓨터에서 OpenSSH를 설정하고 아래 형태로 복사한다. `/actual/...`과 파일명은 A 단계의 출력으로 교체한다.
```powershell
scp -s srv-d8nsg23tqb8s73di0j10@ssh.oregon.render.com:/actual/backup/filename.tar.gz "C:\CompanyApprovedEncryptedBackup\"
Get-FileHash "C:\CompanyApprovedEncryptedBackup\filename.tar.gz" -Algorithm SHA256
```
Render Shell에서 출력한 SHA256과 PC에서 측정한 SHA256이 같아야 한다. 회사의 암호화 저장소에 제한된 권한으로 보관한다.
원본을 수정하지 않는 격리 시험 환경에서 tar 파일의 JSON 검증과 추출·복구 검사를 실시한다.

## C. 디스크 마이그레이션 (백업과 복구 검증 **후에만**)
1. Render Dashboard > makeroom > Disks 에서 영구 디스크를 `/var/data`에 연결한다. **디스크 추가 자체가 새 배포를 유발함.**
2. PAD 및 직원 입력을 중지한 유지보수 상태를 유지한다.
3. 검증한 tar를 새 운영 인스턴스로 안전하게 전송하고, 새 디스크의 `/var/data` 안에 복원한다. 권한 및 파일 소유자를 점검한다.
4. 환경변수 `MAKEROOM_DATA_DIR=/var/data`를 설정한다. 환경변수 변경도 배포를 유발할 수 있다.
5. 디스크에 `sync-state.json` 및 필요한 상태 파일이 실제로 들어 있고 JSON 내용이 유효한지 확인한다.

## D. 코드 배포
- 준비된 Draft PR: https://github.com/seyoungJoo-cpu/ClearRoomsheet/pull/1
- CI 통과 및 가짜 데이터 스테이징 검사 확인 후 승인된 유지보수 시간에 PR을 병합한다.
- main 병합 시 Render 자동 배포되므로 추가 수동 재배포를 트리거하지 않는다.
- `/health`, 홈/HK/인벤토리, 오더, 3초 동기화, PAD 업로드, XML 파일, 푸시, 마감 기록 및 승인된 재시작 후 상태 유지까지 확인한다.
- 기능 장애 시 코드 롤백과 백업 데이터 복구를 분리해 진행한다. 코드 롤백으로 데이터는 복원되지 않는다.

## 중요
- 브라우저에 하드코딩된 로그인 비밀번호 및 서버 역할별 권한은 이번 최소 호환 패치에서 해결되지 않는다.
- 공개 저장소의 비밀번호 노출·이력 검토와 비밀번호 교체가 필요하다.
- 국외 Render 서버에 OPERA 데이터를 저장하는 행위에 사내 보안/개인정보 승인이 필요하다.
- 이 문서는 운영 백업이 실행되었다는 증빙이 아니다.
