# Emeth

**Codex와 Claude Code용 AI 개발 플러그인**

작업 지침, 개발 워크플로, 프로젝트 메모리, 통합 대시보드

## ✨ 주요 기능

- **대화와 결과물 품질 관리**: 요청한 범위와 수정 권한을 지키고, 확인한 근거를 바탕으로 결과를 보고합니다.
- **요청에 맞는 작업 흐름**: 조사, 설계, 테스트, 구현과 벤치마크에 필요한 절차를 선택하고 완료까지 조율합니다.
- **코드 이해와 후보 비교**: 코드 구조와 실행 흐름을 관계도로 보여주고, 동작과 설계 이유를 설명하며, 독립 후보를 비교해 결과를 개선합니다.
- **리팩터링과 코드 이식 검증**: 실제 구조가 바뀌었는지, 원본 동작이 보존됐는지 확인합니다.
- **프로젝트 기록 관리**: 이슈, 기획서, 구현 명세를 파일로 남겨 다음 작업에서 참고합니다.
- **아키텍처 관리**: 프로젝트 구조와 설계 결정, 운영 제약을 기록하고 갱신하며 설계, 구현, 검토에 활용합니다.
- **통합 대시보드**: 여러 프로젝트의 작업 현황과 문서를 한곳에서 확인합니다.

## 📊 벤치마크

DeepSWE 벤치마크 과제 1종 — 플러그인 적용 조건별 품질, 시간, 비용 비교

- **None**: 플러그인 미사용
- **Core**: 플러그인 활성화, 명시적인 스킬 호출 없음
- **Workflow**: figure-it-out 호출
- **Lite**: figure-it-out-lite 호출

| 모델 | 조건 | 공식 외부 검사 | 추가 진단 | 시간 | 비교용 추정 비용 |
| --- | --- | ---: | ---: | ---: | ---: |
| 6.2 Astra Light | None | 195.3/196 | 8.7/14 | 4분 29초 | $0.658 |
| 6.2 Astra Light | Core | 194.3/196 | 9/14 | 3분 57초 | $0.737 |
| 6.2 Astra Light | Workflow | 195/196 | 10.3/14 | 5분 22초 | $2.420 |
| 6.2 Astra Light | Lite | 195/196 | 10/14 | 7분 19초 | $1.756 |
| 6.2 Sol medium | None | 195.7/196 | 10.3/14 | 7분 42초 | $0.412 |
| 6.2 Sol medium | Core | 195.3/196 | 10.7/14 | 7분 44초 | $0.396 |
| 6.2 Sol medium | Workflow | 196/196 | 11/14 | 13분 56초 | $1.918 |
| 6.2 Sol medium | Lite | 195.3/196 | 10.7/14 | 10분 54초 | $0.819 |
| 6.1 Terra medium | None | 191.7/196 | 4/14 | 2분 41초 | $0.076 |
| 6.1 Terra medium | Core | 195.7/196 | 4.3/14 | 2분 56초 | $0.095 |
| 6.1 Terra medium | Workflow | 195.7/196 | 6.3/14 | 6분 41초 | $0.383 |
| 6.1 Terra medium | Lite | 195/196 | 5/14 | 4분 39초 | $0.165 |
| Opus 5.5 medium | None | 195/196 | 6.3/14 | 5분 39초 | $1.372 |
| Opus 5.5 medium | Core | 194.3/196 | 6.7/14 | 6분 52초 | $1.684 |
| Opus 5.5 medium | Workflow | 194.7/196 | 5.7/14 | 19분 15초 | $3.761 |
| Sonnet 5.5 medium | None | 195.3/196 | 6.3/14 | 4분 0초 | $0.574 |
| Sonnet 5.5 medium | Core | 195.7/196 | 6.3/14 | 4분 38초 | $0.639 |
| Sonnet 5.5 medium | Workflow | 195.3/196 | 7.7/14 | 7분 13초 | $1.463 |

[평가 항목과 회차별 결과](docs/benchmarks/README.md) / [원본 데이터](docs/benchmarks/superjson.json)

## 📦 설치

### Codex CLI에서 설치
```bash
codex plugin marketplace add semisemil/emeth-discipline
codex plugin add emeth-discipline@emeth-discipline
```

사용자 설정 파일 `~/.codex/config.toml`에 다음 설정을 추가합니다.
Windows의 기본 경로는 `%USERPROFILE%\.codex\config.toml`입니다.

```toml
[features]
incremental_tools = true

[features.multi_agent_v2]
enabled = true
preserve_fork_prefix = true
```
설정을 저장한 뒤 Codex를 시작합니다.
```bash
codex
```

Codex가 열리면 다음 순서로 마무리합니다.

1. `/hooks`를 엽니다.
2. Emeth의 `SessionStart`, `SubagentStart`, `UserPromptSubmit` 훅을 확인하고 승인합니다.
3. 새 작업을 시작합니다.

대시보드 최초 등록에는 프로젝트 밖의 저장 폴더에 쓰기 권한이 필요합니다. [저장 위치와 권한 설정](#대시보드-저장-위치와-권한-설정)을 참고하세요.

### Claude Code에서 설치

Claude Code에서 마켓플레이스를 추가한 다음 플러그인을 설치합니다.

```text
/plugin marketplace add semisemil/emeth-discipline
/plugin install emeth-discipline@emeth-discipline
```

## 🚀 빠르게 사용하기

기본 지침은 새 작업에 자동으로 적용됩니다.

### 작업 맡기기

`figure-it-out`에 목표와 원하는 결과를 전달하면 필요한 설계, 구현과 검증을 조율합니다.

```text
/emeth-discipline:figure-it-out 파일 업로드 실패 원인을 찾아 수정하고 검증해 줘
```

조사나 설계만 필요하면 요청에 범위를 적으세요.

### 기존 프로젝트 파악하기
코드와 기존 문서를 바탕으로 프로젝트 구조와 주요 결정을 정리합니다.

```text
/emeth-discipline:architecture-memory-init
```

### 코드 구조와 실행 흐름 보기

코드 구조와 실행 흐름을 관계도로 확인합니다.

```text
/emeth-discipline:map code 파일 저장 기능의 호출과 이벤트 흐름을 보여 줘
```

## 🧩 포함된 스킬

### 공통 규칙과 작업 관리

| 스킬 | 사용처 | 작업 |
| --- | --- | --- |
| `/emeth-discipline:rules` | 기본 적용 | 요청 범위와 근거에 따른 작업 및 완료 보고 |
| `/emeth-discipline:scope-integrity` | 복잡하거나 위험한 작업 | 요구사항과 완료 조건의 누락 방지 |
| `/emeth-discipline:slop-check` | 코드 정리와 검토 | 불필요한 코드와 관례 이탈 지적 |
| `/emeth-discipline:refactor-proof` | 구조를 바꾸는 리팩터링 | 구조 변경과 기존 동작 보존 검증 |
| `/emeth-discipline:verification-harness` | AI의 자체 검증 환경 구축과 보완 | 합의한 완료 기준을 확인하는 E2E 테스트 |
| `/emeth-discipline:exact-port` | 원본 동작을 유지하는 코드 이식 | 원본과의 일치 여부와 차이 확인 |
| `/emeth-discipline:issue-ledger` | 버그와 후속 작업 기록 | 상태와 다음 조치를 담은 이슈 |
| `/emeth-discipline:settings` | 설정 변경과 대시보드 이용 | 기록, 언어 설정과 대시보드 관리 |
| `/emeth-discipline:adaptive-reasoning` | 추론 강도 조절, Codex 전용 | 현재 모델에서 작업에 맞는 추론 강도 |

### 아키텍처

| 스킬 | 사용처 | 작업 |
| --- | --- | --- |
| `/emeth-discipline:architecture-coop` | 새 구조 설계와 기존 구조 개선 | 대화로 구체화한 아키텍처 |
| `/emeth-discipline:architecture-memory-init` | 기존 프로젝트 파악 | 구조와 주요 결정을 정리한 문서 |
| `/emeth-discipline:architecture-memory` | 프로젝트 맥락 조회와 기록 | 관련 문서 검색과 결정 기록 |
| `/emeth-discipline:architecture-memory-update` | 코드 변경 후 문서 갱신 | 변경 사항을 반영한 아키텍처 문서 |
| `/emeth-discipline:architecture-memory-maintain` | 문서 중복과 복잡성 정리 | 찾기 쉽게 재구성한 문서 |

### 워크플로

| 스킬 | 사용처 | 작업 |
| --- | --- | --- |
| `/emeth-discipline:clarify-request` | 막연한 요청 구체화 | 목표와 완료 기준을 담은 작업 지시서 |
| `/emeth-discipline:development-design` | 개발 설계 작성과 수정 | 설계와 검증 기준을 담은 문서 묶음(Design) |
| `/emeth-discipline:tenet-me` | 설계와 구현 검토 | 요구 결과를 막는 빈틈과 반례 |
| `/emeth-discipline:sharpen` | 전문 분야의 판단이 필요한 작업 | 전문가의 방법과 도구를 적용한 결과 |
| `/emeth-discipline:figure-it-out` | 작업 전체를 맡길 때 | 요청에 맞는 절차 선택과 완료 조율 |
| `/emeth-discipline:figure-it-out-lite` | 위임 비용 절감, 실험판 | 설계와 검토를 유지하는 경량 워크플로 |
| `/emeth-discipline:start-implementation` | 준비된 설계 구현 | 구현과 검증을 마친 변경 사항 |

### 코드 이해와 후보 비교

| 스킬 | 사용처 | 작업 |
| --- | --- | --- |
| `/emeth-discipline:code-exploration` | 코드 이해와 학습 | 동작 방식과 설계 이유 설명 |
| `/emeth-discipline:map` | 코드와 시스템 구조 파악 | `code`: 코드 관계도, `architecture`: 전체 구조도 |
| `/emeth-discipline:work-trace` | 작업 과정과 판단 근거 확인 | 탐색, 검증과 결론의 관계도 |
| `/emeth-discipline:ensemble` | 여러 설계와 구현 후보 비교 | 후보 평가와 장점을 합친 결과 |

관계도는 Graph Viewer가 연결되어 있으면 그래프 탭에, 없으면 답변에 Mermaid로 표시합니다.

## 🗂️ 이슈 기록

**이슈 자동 등록과 관련 Design 자동 갱신은 기본 비활성화**입니다.
직접 요청한 기록 작업과 워크플로의 필수 문서 작업은 설정과 관계없이 수행합니다.

자동 기록은 다음 명령으로 켜고 끕니다.

```text
/emeth-discipline:settings work-records on
/emeth-discipline:settings work-records off
/emeth-discipline:settings status
```

프로젝트별 자동 기록 설정이 전역 설정보다 우선하며, 변경은 새 대화나 컨텍스트 재구성 시 반영됩니다.

```text
/emeth-discipline:issue-ledger
설정 파일 호환성 문제를 이슈로 등록해줘.
```

```text
/emeth-discipline:issue-ledger
PL-0012의 진행 상황과 확인 근거를 갱신해줘.
```

### 문서 저장 경로

기본 저장 위치는 다음과 같습니다.

| 문서 | 위치 |
| --- | --- |
| 아키텍처 | `docs/architecture/` 또는 이미 연결한 폴더 |
| 개발 설계 | `.emeth/designs/` |
| 이슈 | `.emeth/issues/` |

아키텍처와 개발 설계를 다른 폴더에 저장하려면 프로젝트의 `.emeth/documents.json`에 경로를 지정하세요.

```json
{
  "schema_version": 1,
  "root": "D:/Obsidian/projects/my-project"
}
```

이 예시는 지정한 폴더 아래의 architecture/와 designs/에 각각 저장합니다.
각 폴더를 따로 정하려면 `root` 대신 `architecture`와 `designs`에 경로를 지정하세요.
상대 경로는 프로젝트 폴더를 기준으로 합니다.
기존 문서는 직접 옮긴 뒤 설정을 바꾸세요.

## 🏛️ 아키텍처 메모리

프로젝트 구조와 운영 제약, 주요 결정과 그 이유를 문서로 남겨 다음 작업에서 참고합니다.

첫 Design 저장 시 관련 맥락을 기록합니다. 기존 프로젝트 전체를 정리하려면 [초기화 스킬](#기존-프로젝트-파악하기)을 호출하세요.
연결된 문서는 대화에서 참고하고 갱신하며, 커밋 후에도 갱신 필요 여부를 확인합니다.

## 🖥️ 통합 대시보드

여러 프로젝트의 작업 현황, 검토할 결과와 프로젝트 문서를 한곳에서 확인합니다.

에이전트에게 “대시보드 열어 줘”라고 요청하거나 다음 명령을 실행하세요.

```text
/emeth-discipline:settings dashboard open
```

작업 수신함 기록은 기본적으로 꺼져 있습니다. `/emeth-discipline:settings inbox on`으로 켤 수 있습니다.
목록에 없는 프로젝트는 초기화 후 `/emeth-discipline:settings dashboard add`로 등록하세요.

### 대시보드 저장 위치와 권한 설정

대시보드 데이터는 프로젝트 밖의 사용자별 공용 폴더에 저장합니다.
프로젝트 등록 중 권한 오류가 나면 [상세 설정 절차](plugins/emeth-discipline/skills/settings/references/sandbox-setup.md)를 참고하세요.

## ✅ 개발 검증

저장소 루트에서 전체 테스트를 실행합니다. 별도 패키지 설치는 필요하지 않습니다.

```bash
npm test
```

Codex의 실제 로더, 훅, 요청 전달, 대시보드 경로를 검증하는 명령은 [호스트 검증](docs/host-validation.md)을 참고하세요.

## 라이선스

[MIT](LICENSE)
