# 플러그인 배포

플러그인 원본은 `plugins/emeth-discipline/`에서 직접 수정한다.
Codex와 Claude Code 마켓플레이스는 `plugins/emeth-discipline/`을 설치 대상으로 사용한다.
별도의 복사본이나 빌드 과정은 없다.

## 파일 위치

| 대상 | 위치 |
| --- | --- |
| 매니페스트 | 플러그인 폴더의 `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json` |
| 실행 파일과 자원 | 플러그인 폴더의 `assets/`, `dashboard/`, `hooks/`, `lib/`, `skills/`, `writers/` |
| 마켓플레이스 목록 | 저장소 루트의 `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json` |
| 사용자 안내, 개발 문서와 테스트 | 저장소 루트의 `README.md`, `docs/`, `tests/` |

`AGENTS.md`, `CLAUDE.md`, `CONTEXT.md` 등 저장소 지침 파일은 플러그인 폴더에 두지 않는다.
플러그인 폴더의 `LICENSE`는 설치본에 제공하는 라이선스이다.

## 수정과 배포

플러그인 원본을 수정하고 `npm test`로 검증한 뒤 커밋한다.
버전을 올릴 때는 플러그인 폴더에 있는 두 매니페스트를 함께 수정한다.
테스트는 같은 원본을 참조하며, 플러그인 폴더만 복사한 환경에서 훅, 문서 도구와 대시보드도 실행한다.

마켓플레이스 목록은 저장소 루트에서 유지하며 플러그인 배포본에 포함하지 않는다.
기존 설치도 마켓플레이스 갱신 후 같은 플러그인 이름으로 이 폴더를 사용한다.
