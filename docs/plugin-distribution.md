# 플러그인 배포

개발 원본은 저장소 루트의 기존 위치에서 관리한다.
Codex와 Claude Code 마켓플레이스는 `plugins/emeth-discipline/`을 설치 대상으로 사용한다.
배포본은 생성 파일이며 직접 수정하지 않는다.

## 배포 파일

`scripts/build-plugin.js`는 다음 파일만 배포 폴더에 복사한다.

| 대상 | 포함 내용 |
| --- | --- |
| 매니페스트 | `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json` |
| 실행 파일과 자원 | `assets/`, `dashboard/`, `hooks/`, `lib/`, `skills/`, `writers/` |
| 사용자 문서 | `README.md`, `LICENSE` |

`AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`는 선택한 폴더 안에서도 제외한다.
배포본 README의 개발 문서 링크는 GitHub의 원본 문서를 가리킨다.

## 수정과 배포

원본 파일과 두 매니페스트의 버전을 수정한 뒤 `npm run build:plugin`으로 배포본을 갱신한다.
원본과 생성된 배포본을 함께 커밋한다.
`npm test`는 배포본의 파일과 내용이 원본에 맞는지 확인하고, 배포본만 복사한 환경에서 훅, 문서 도구와 대시보드를 실행한다.
배포본에 누락, 변경 또는 추가 파일이 있으면 검증이 실패한다.

마켓플레이스 목록은 저장소 루트에서 유지하며 플러그인 배포본에 포함하지 않는다.
기존 설치도 마켓플레이스 갱신 후 같은 플러그인 이름으로 새 배포 폴더를 사용한다.
