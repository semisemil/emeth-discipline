# State

This directory stores project-local Emeth Discipline state.

Source of truth:

- `.emeth/issues/*.json` (Issue Ledger v2)
- `.emeth/issues/*.md` (legacy read compatibility)

## Local dashboard

Emeth Discipline의 통합 작업 대시보드는 플러그인 소유의 `http://127.0.0.1:43127` 로컬 서버에서 이 프로젝트의 Issue, Design과 기존 Plan, Spec 원본을 읽습니다.

`dashboard-server add`로 현재 프로젝트를 등록하고 `dashboard-server open`으로 대시보드를 엽니다.
`open`은 필요하면 서버를 시작합니다.
`/emeth-discipline:dashboard-server open` 형식으로 호출합니다.
서버 상태 확인과 종료는 각각 `status`, `stop`을 사용합니다.

새 Emeth Discipline 기록은 프로젝트별 `.emeth/dashboard/`를 만들거나 갱신하지 않습니다. 기존 `.emeth/dashboard/`가 있으면 그대로 보존되지만 새 기능과 지원 진입점은 통합 로컬 서버입니다.
