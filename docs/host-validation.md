# Codex 검증

검증 대상은 같은 `plugins/emeth-discipline/` 원본과 설치본이다.
스킬 등록, 훅에서 전달한 지침, 작업 요청, 대시보드 실행을 Codex의 실제 로더·실행 경로에서 확인한다.
외부 모델 경계에는 결정적인 모의 응답을 사용하므로 계정이나 API 비용이 필요하지 않다.

| 검사 | 확인 내용 |
| --- | --- |
| 설치·스킬 등록 | 실제 CLI로 로컬 마켓플레이스 설치, app-server에서 스킬 15개 확인 |
| 지침 전달 | 정상 해시 승인 후 실제 턴의 모델 요청에 전체 공통 규칙·번호 안내·선택한 스킬 본문 포함 |
| worker 요청 | 공통 테스트에서 구현 요청의 Design·모델·추론·프로젝트 설정 확인 |
| 대시보드 | 실제 Codex SessionStart 후 서버 중지 상태 확인, 명시적 열기로 시작 후 상태 API와 세 화면 HTTP 응답 확인 |
| 호출 제한 | CLI가 등록한 훅 3개와 초기 미승인 상태 확인 |

## 실행

저장소 루트에서 공통 회귀 테스트를 실행한다.
테스트 전용 XDG 디렉터리로 상태를 분리한다.
고정 포트 검사에는 비어 있는 `127.0.0.1:43127`이 필요하다.

```bash
task_config=$(mktemp -d /tmp/emeth-test-config.XXXXXX)
trap 'rm -rf "$task_config"' EXIT
XDG_CONFIG_HOME="$task_config" npm test
```

Codex CLI가 설치된 환경에서 native 검증을 실행한다.
CLI 경로를 인자로 줄 수도 있다.
Windows에서 인자가 없으면 PATH에 있는 `codex.cmd`가 실행하는 npm 패키지의 `bin/codex.js`를 현재 Node로 실행한다.

```bash
node scripts/check-codex.mjs
```

검사는 임시 Codex 설정에서 플러그인을 설치한다.
설치 파일을 원본과 비교하고, 등록된 command 훅을 확인한 뒤 그 훅의 현재 해시에 대해서만 정상 trust 설정을 저장한다.
훅 승인이나 sandbox를 우회하는 옵션은 사용하지 않는다.
app-server의 실제 턴을 로컬 Responses 모의 서버에 연결해 전달된 요청을 검사한다.
사용자의 Codex 설정과 인증 파일은 변경하지 않는다.
검사는 임시 등록·설정과 상태를 사용하고 자신이 시작한 대시보드를 종료한다.

## 확인 범위

Codex CLI 0.159.2에서 Linux 검증을 통과했다.
실제 외부 모델이 설계·구현 작업을 끝내는 동작, Windows native 실행은 이 검사로 검증하지 않는다.
