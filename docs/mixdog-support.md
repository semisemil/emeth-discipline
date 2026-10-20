# Mixdog 연동

이 연동은 Mixdog `main`의 `f5b8dc9d4c06985133b8181f78718a61c6856b99` 소스 계약을 기준으로 한다.
Emeth 원본은 `plugins/emeth-discipline/`에 있으며 Codex, Claude Code와 같은 파일을 사용한다.
Mixdog을 개발 의존성으로 추가하거나 플러그인 소스를 별도로 복사해 유지하지 않는다.

## 설치와 배포 경로

Mixdog Plugins에는 로컬 `<저장소>/plugins/emeth-discipline`을 등록한다.
Mixdog의 매니페스트 로더는 등록 루트의 `.codex-plugin/plugin.json` 또는 `plugin.json`만 읽는다.
현재 Git 설치는 저장소 루트를 그대로 등록하며 Codex/Claude 마켓플레이스의 하위 폴더 경로를 해석하지 않는다.
따라서 `semisemil/emeth-discipline` 또는 Git URL만 등록하는 방식은 이 배포 구조에서 지원되지 않는다.
저장소를 복제하거나 최신화한 뒤 플러그인 하위 폴더를 등록하고 Refresh metadata를 실행한다.

## 실행 계약

| 영역 | 연동 |
| --- | --- |
| 스킬 | Mixdog 기본 플러그인 로더가 `skills/`를 읽음. 17개 스킬의 선택 조건은 `when_to_use` 또는 원본 `description`에서 제공 |
| 훅 | 플러그인 폴더의 `.mixdog/hooks.json`. `node`와 인자 배열을 사용해 Windows/POSIX 경로 처리 |
| 호스트 식별 | `MIXDOG_PLUGIN_ROOT`/`MIXDOG_PLUGIN_DATA`를 Claude 호환 변수보다 우선 |
| 상태·로그 | `MIXDOG_PLUGIN_DATA`, fallback은 Mixdog data/log 경로. Codex와 Claude 상태 경로 유지 |
| 공통 규칙 | Codex와 같은 언어·권한·근거 규칙 및 Mixdog의 스킬·도구 절차 적용 |
| 세션 시작 | 규칙·아키텍처 연결 안내·스토리지 이전과 공통 대시보드 시작. resume은 규칙 재주입 생략 |
| 사용자 요청 | 규칙 복구·아키텍처 안내·명시 문서 요청의 다음 번호 안내 |
| 하위 에이전트 | `PreToolUse`가 `agent` spawn의 context에 규칙 추가. prompt·file·tag·cwd와 기존 context 보존 |
| 구현 작업 | `start-implementation`이 현재 대화에서 Design을 읽고 Feature, Bug fix, Refactoring 중 해당 절차를 실행. 작업의 복잡도에 따라 실행 흐름을 선택하고 현재 대화가 구현과 통합을 소유하며, 독립 설계와 검증 산출물은 `agent`로 위임 |
| 모델과 추론 | Mixdog workflow agent의 설정된 route 사용. spawn에 미지원 필드를 보내지 않음 |
| 기록·대시보드 | 기존 문서 도구, 저장 형식과 HTTP 서버를 공통으로 사용 |

하위 에이전트 규칙 주입은 재실행 시 같은 규칙을 중복 추가하지 않는다.
`send`, `close`, `cancel`, `read`, `status` 등의 요청이나 다른 도구는 수정하지 않는다.
플러그인 토글을 끄면 Mixdog 로더가 스킬과 훅을 제거한다.
사용자가 비활성화한 훅·스킬이나 동명 사용자 스킬의 우선순위를 우회하지 않는다.

## Codex와의 차이

Mixdog의 `SubagentStart`는 비동기로 dispatch하고 반환 context를 worker에 넣지 않으므로 표준 `agent` spawn을 실행 전에 보완한다.
이 경로를 거치지 않는 내부 자동 worker에는 같은 주입을 보장하지 않는다.
`PostCompact` 반환 context도 현재 대화에 삽입되지 않는다.
다음 사용자 요청에서 규칙이 복구되지만, 압축 직후 같은 턴을 계속할 때는 `rules`를 다시 불러와야 한다.

Mixdog은 Codex/Claude의 호출 제한 메타데이터를 강제하지 않는다.
명시 호출 전용 조건은 선택 트리거와 본문에서 전달한다.
하위 작업에는 Mixdog의 workflow agent와 해당 route를 사용한다.
모델과 추론 설정은 실행 중인 `agent` 스키마와 route 설정 절차에 맞춘다.

WebAgent는 [전용 절차](../plugins/emeth-discipline/skills/webagent/references/mixdog.md)에 따라 native `browser` 도구로 ChatGPT Chat을 조작한다.
Codex의 Node Browser 관리 객체와 자동 checkpoint API는 이 경로에 없으며 요청 상태는 Mixdog 작업에서 관리한다.
데스크톱 브라우저 연결과 로그인한 계정이 필요한 실제 대화 전송은 로더·훅 검증만으로 확인되지 않는다.

## 검증

저장소 루트에서 `npm test`를 실행한다.
테스트는 Mixdog 호스트 식별, 훅 CLI의 규칙·번호 출력, worker 입력 보존, 구현 절차의 참조 연결과 분리 설치본을 검증한다.
대시보드를 실행 중인 개발 환경에서는 새 XDG 디렉터리로 테스트 상태를 분리한다.

실제 Mixdog 소스의 로더·훅 실행기로 검증하려면 해당 소스 체크아웃과 runtime 의존성이 준비된 환경에서 실행한다.

```bash
node scripts/check-mixdog.mjs /absolute/path/to/mixdog
```

이 검사는 임시 플러그인 복사본을 등록한다.
17개 스킬과 트리거, 구현 스킬 본문, 세션·사용자 훅, `agent` 입력 수정과 실제 스키마, native 세션 기록과 worker 실행기로의 입력 전달, 대시보드 상태 API·세 화면, 플러그인 비활성화를 확인한다.
외부 모델 호출이나 계정은 사용하지 않는다.
검사에서 시작한 대시보드는 종료하고 임시 상태를 삭제한다.
Codex에서도 같은 설치본을 검증하는 방법과 외부 경계를 대체한 범위는 [호스트 검증](host-validation.md)을 참고한다.
