# Emeth

Emeth는 Codex가 요청받은 작업 범위를 끝까지 지키고, 직접 확인한 결과를 바탕으로 완료 여부를 보고하도록 돕는 플러그인입니다.

작업이 길어지면 처음 요청의 세부 조건을 빠뜨리거나, 확인하지 않은 부분까지 끝났다고 보고하기 쉽습니다. 대화 중 발견한 버그나 후속 작업도 다음 작업으로 이어지지 않고 잊히곤 합니다. Emeth는 대화에 적용할 공통 기준과 작업별 스킬, 프로젝트에 남는 기록으로 이런 누락을 줄입니다.

## ✨ 주요 기능

- **대화와 결과물 품질 관리**: 요청한 범위와 수정 권한을 지키고, 확인한 근거를 바탕으로 결과를 보고합니다.
- **기획부터 구현까지**: 아이디어를 기획서와 구현 명세로 정리하고, 구현·검증으로 이어갑니다.
- **리팩터링과 코드 이식 검증**: 실제 구조가 바뀌었는지, 원본 동작이 보존됐는지 확인합니다.
- **프로젝트 기록 관리**: 이슈, 기획서, 구현 명세를 파일로 남겨 다음 작업에서 참고합니다.
- **아키텍처 관리**: 프로젝트 구조와 설계 결정, 운영 제약을 기록·갱신하고 설계·구현·검토에 활용합니다.
- **통합 대시보드**: 여러 프로젝트의 작업 기록과 아키텍처 문서를 로컬 웹 화면에서 확인합니다.

## 📊 벤치마크

SuperJSON의 Error 스택 직렬화 작업을 같은 요구 사항으로 실행한 결과입니다.

- **None**: 플러그인 미사용
- **Core**: 플러그인 활성화
- **Workflow**: [`$emeth-discipline:figure-it-out`](skills/figure-it-out/SKILL.md) 호출

| 모델 | 조건 | 공식 외부 검사 | 추가 진단 | 시간 | 비교용 추정 비용 |
| --- | --- | ---: | ---: | ---: | ---: |
| 6 Astra low | None | 196/196 | 3/14 | 4분 57초 | $0.973 |
| 6 Astra low | Core | 196/196 | 5/14 | 4분 23초 | $0.929 |
| 6 Astra low | Workflow | 196/196 | 7/14 | 7분 54초 | $1.990 |
| 6 Astra low | Workflow (한 세션) | 196/196 | 4/14 | 6분 43초 | $1.611 |
| 5.6 Sol Med | None | 196/196 | 5/14 | 14분 55초 | $1.396 |
| 5.6 Sol Med | Core | 196/196 | 4/14 | 8분 36초 | $1.027 |
| 5.6 Sol Med | Workflow | 196/196 | 8/14 | 12분 48초 | $1.647 |
| 6 Sol Med | None | 196/196 | 6/14 | 7분 46초 | $0.375 |
| 6 Sol Med | Core | 196/196 | 5/14 | 9분 10초 | $0.415 |
| 6 Sol Med | Workflow | 196/196 | 4/14 | 12분 10초 | $1.142 |

[측정 상세](docs/benchmarks/README.md)

### WebAgent와 SubAgent 비용

같은 두 작업을 위임했을 때의 API 단가 기준 추정 비용입니다.

| 작업 | SubAgent | WebAgent |
| --- | ---: | ---: |
| 코드 검토 | $0.486 | $0.167 |
| 작업 배치 | $0.319 | $0.168 |

[측정 상세](docs/benchmarks/webagent-sol-comparison.md)

## 📦 설치

### Codex CLI에서 설치

`emeth-discipline` 마켓플레이스를 추가한 다음 Emeth 플러그인을 설치합니다.

```bash
codex plugin marketplace add semisemil/emeth-discipline
codex plugin add emeth-discipline@emeth-discipline
codex
```
Codex가 열리면 다음 순서로 마무리합니다.

1. `/hooks`를 엽니다.
2. Emeth의 `SessionStart`, `SubagentStart`, `UserPromptSubmit` 훅을 확인하고 승인합니다.
3. 새 작업을 시작합니다.

대시보드 최초 등록에는 프로젝트 밖의 저장 폴더에 쓰기 권한이 필요합니다. [저장 위치와 권한 설정](#대시보드-저장-위치와-권한-설정)을 참고하세요.

## 🚀 빠르게 사용하기

### 기존 저장 폴더 자동 이전

업데이트 후 프로젝트에서 작업을 시작하거나 기록 기능에 처음 접근하면 기존 `.proofline/`을 `.emeth/`로 자동 이전합니다. 이슈와 설계 문서, 아키텍처 연결을 보존하고, 이전한 폴더 안의 Markdown과 JSON에 저장된 `.proofline/` 경로도 갱신합니다. 작업별 응답 모드는 플러그인 데이터의 `proofline-mode/`에서 `rules-mode/`로 이전합니다.

기존 폴더가 없는 프로젝트에는 이전 작업으로 폴더를 만들지 않습니다. 이전 중 실패하면 다음 접근에서 재시도합니다. 기존 폴더와 새 폴더가 모두 있으면 덮어쓰거나 병합하지 않고 충돌을 보고합니다.

### 기본 지침과 응답 모드

Emeth의 `Rules` 스킬에 담긴 기본 지침은 새 작업을 시작하거나 `/clear`, `/compact`를 실행할 때 자동으로 불러옵니다. 기존 작업을 재개할 때(`resume`)는 공통 기준을 다시 불러오지 않지만, 대시보드 서버 확인과 아키텍처 메모리 연결 훅은 실행됩니다. 하위 에이전트에도 `SubagentStart` 훅으로 공통 기준을 전달합니다.

특정 요청에 공통 기준을 명시하려면 스킬 이름을 적으세요.

```text
$emeth-discipline:rules
이 문서를 처음 읽는 사람도 이해할 수 있게 고쳐줘.
```

응답 모드를 바꾸려면 프롬프트의 첫 내용 줄에 다음 명령을 적습니다.

| 명령 | 동작 |
| --- | --- |
| `$emeth-discipline` | 현재 모드와 기본 모드 확인 |
| `$emeth-discipline normal` | 자연스러운 일반 문장으로 응답 |
| `$emeth-discipline focus` | 필요한 맥락과 프로젝트 공통 용어, ASD-STE100 명료성 원칙으로 사용자 언어에 맞게 응답 |
| `$emeth-discipline core` | 기술적 정확성을 유지하면서 최대한 짧게 응답 |
| `$emeth-discipline default` | 새 작업에 적용할 기본 모드 확인 |
| `$emeth-discipline default <mode>` | 기본 모드를 저장하고 현재 작업에도 적용 |

`Rules`는 공통 규칙을 담은 스킬이고, `core`는 응답 모드 이름입니다. 초기 기본 모드는 `normal`입니다. 현재 모드는 작업별로 저장되며, 모드를 바꿔도 공통 품질 기준은 유지됩니다.

### 작업에 맞는 스킬 사용하기

일부 스킬은 Codex가 작업에 맞춰 불러오고, 기획·구현 시작처럼 직접 호출해야 하는 스킬도 있습니다. 적용할 기준을 분명히 하고 싶다면 아래처럼 스킬 이름을 적으세요.

책임이나 호출 구조를 바꾸는 리팩터링:
```text
$emeth-discipline:refactor-proof
사용자 설정 저장 책임을 서비스 계층으로 옮겨줘.
```
원본 동작을 그대로 유지해야 하는 코드 이식:
```text
$emeth-discipline:exact-port
이 원본 구현을 대상 프로젝트로 동작 변경 없이 옮겨줘.
```
ChatGPT Chat에 조사 요청:
```text
$emeth-discipline:webagent
이 설계를 ChatGPT Chat의 Sol에 검토받고, 지적 사항을 확인해 줘.
```

## 🧩 포함된 스킬

### 공통 규칙과 작업 관리

공통 품질 기준, 작업 검증, 이슈 기록과 대시보드를 담당합니다.

| 스킬 | 이런 때 사용합니다 | 하는 일 |
| --- | --- | --- |
| `$emeth-discipline:rules` | 대화와 결과물 전반 | 자연스러운 문장, 요청 범위, 수정 권한, 판단 근거 확인 |
| `$emeth-discipline:scope-integrity` | 규모가 크거나 위험하고 여러 단계로 진행되는 작업 | 요청한 목표·필수 조건·완료 기준 유지, 임의 누락·축소 방지 |
| `$emeth-discipline:refactor-proof` | 책임, 의존 관계, 호출 구조, 상태 흐름을 바꾸는 리팩터링 | 실제 구조 변경과 기존 동작 보존 여부 검증 |
| `$emeth-discipline:exact-port` | 원본 동작을 그대로 옮겨야 하는 코드 이식 | 원본과 대상 비교, 사용자에게 승인받은 차이와 미확인 부분 기록 |
| `$emeth-discipline:issue-ledger` | 버그나 후속 작업을 프로젝트에 남길 때 | 현재 상태, 다음 조치, 완료 조건, 결정과 검증 근거 기록 |
| `$emeth-discipline:webagent` | ChatGPT Chat에 독립적인 검토·조사를 위임할 때 | 새 대화 생성과 기존 대화 재사용, 응답 대기와 결과 회수 |
| `$emeth-discipline:dashboard-server` | 통합 대시보드를 이용할 때 | 현재 프로젝트 등록, 실행 중인 대시보드 열기·상태 확인·종료 |

### Architecture

프로젝트 구조와 주요 결정을 문서로 남기고, 개발 중 참고하거나 갱신합니다.

| 스킬 | 이런 때 사용합니다 | 하는 일 |
| --- | --- | --- |
| `$emeth-discipline:architecture-memory-init` | 기존 프로젝트 전반을 먼저 분석하고 싶을 때 | 코드와 기존 문서를 바탕으로 구조·제약·결정 정리 |
| `$emeth-discipline:architecture-memory` | 프로젝트 배경을 참고하거나 새로 결정한 내용을 남길 때 | 관련 문서 검색, 사용자 결정과 운영 환경 기록 |
| `$emeth-discipline:architecture-memory-update` | 커밋된 코드 변경을 아키텍처 문서에 반영할 때 | 마지막 확인 커밋 이후의 변경 검토와 문서 갱신 |

### Workflow

기획부터 기술 설계까지 하나의 Design으로 발전시키고, 검토와 구현으로 이어갑니다.

| 스킬 | 이런 때 사용합니다 | 하는 일 |
| --- | --- | --- |
| `$emeth-discipline:development-design` | 현재 아이디어를 설계로 발전시키거나 설계를 수정할 때 | 설명·구조 비교·초안·질문으로 기획과 기술 설계를 함께 완성 |
| `$emeth-discipline:tenet-me` | 설계나 구현이 요구 결과를 보장하는지 검토할 때 | 결과에서 필요한 조건과 근거를 역추적하고, 발견한 빈틈을 정방향 사례로 확인 |
| `$emeth-discipline:figure-it-out` | 필요한 설계부터 구현까지 맡길 때 | Design 준비와 검토 후 구현 작업 생성, 요청하면 현재 세션에서 구현 |
| `$emeth-discipline:start-implementation` | 준비된 설계의 구현을 새 작업에서 시작할 때 | 모델과 추론 수준을 정하고 현재 프로젝트 폴더에 새 작업 생성 |
| `$emeth-discipline:start-parallel-implementation` | 작업 분할과 선택적 병렬 구현을 사용할 때 | Design의 작업을 나누고 병렬 위임과 시드 재사용이 가능한 새 작업 생성 |

## 🔁 기획부터 구현까지

**Design**은 목적·범위·선택한 구조와 이유부터 정확한 동작·실패 처리·기대 결과까지 담는 단일 설계 원본입니다.

```text
$emeth-discipline:development-design
작업이 끝나면 사용자에게 알림을 보내고 싶어. 여기까지 생각했는데 구조와 실패 처리까지 같이 설계해줘.
```

이미 정한 기획은 재사용하고, 필요한 부분에 설명·비교·초안·질문을 사용합니다.
설계부터 구현까지 맡기려면 다음과 같이 요청합니다.

```text
$emeth-discipline:figure-it-out
사용자 알림 설정 개선을 설계부터 구현과 검증까지 완료해줘.
```

현재 작업에서 필요한 설계를 준비하고, `tenet-me`로 요구 결과의 보장 조건과 근거를 역추적합니다. `start-implementation`은 설계 문서를 새 구현 작업에 전달하고,
새 작업이 내부 `implement.md` 절차에 따라 해당 계약을 읽어 구현·검증합니다. 구현 중 전제가 달라지면 같은 작업에서 영향을 받는 설계만 수정하며, 중요한 사용자 선택은 확인합니다.

```text
$emeth-discipline:tenet-me DESIGN-0001
$emeth-discipline:start-implementation DESIGN-0001
```

위 명령은 각각 별도로 호출합니다. 작업 분할과 선택적 병렬 구현을 사용하려면 다음 시작 스킬을 선택합니다.

```text
$emeth-discipline:start-parallel-implementation DESIGN-0001
```

모델은 [모델 선택 기준](skills/start-implementation/assets/model-routing.md)과 사용자 설정·실행 환경의 제한에 따라 정합니다.

### 한 세션에서 진행하기

별도 구현 작업을 만들지 않고 현재 세션에서 끝내려면 최초 요청에 진행 방식을 명시합니다.

```text
$emeth-discipline:figure-it-out
사용자 알림 설정 개선을 설계부터 구현까지 완료해줘.
Design을 준비하고 검토한 뒤, start-implementation의 implement.md를 읽고 준비된 Design에 적용해
현재 세션에서 구현부터 완료 처리와 결과 보고까지 진행해줘.
새 세션이나 하위 에이전트는 만들지 마.
```

`development-design`만 요청하면 설계에서 끝납니다. 설계부터 같은 세션의 구현까지 원한다면 구현 절차도 함께 명시할 수 있습니다.

```text
$emeth-discipline:development-design
사용자 알림 설정 개선을 설계해줘.
Design이 준비되면 $emeth-discipline:tenet-me로 검토하고,
중요한 결정이 해결되면 start-implementation의 implement.md를 읽고 현재 세션에서 구현과 완료 처리까지 진행해줘.
새 세션이나 하위 에이전트는 만들지 마.
```


## 🗂️ 이슈 기록

`issue-ledger`는 버그, 일반 작업, 기능, 조사, 문서화, 유지보수 항목을 프로젝트에 저장합니다.

```text
$emeth-discipline:issue-ledger
설정 파일 호환성 문제를 이슈로 등록해줘.
```

```text
$emeth-discipline:issue-ledger
PL-0012의 진행 상황과 확인 근거를 갱신해줘.
```

처음 이슈를 등록하면 다음 구조가 만들어집니다.

```text
.emeth/
  STATE.md
  issues/
    PL-0001.json
```

이슈마다 JSON 파일 하나에 현재 상태, 다음 조치, 완료 조건, 결정과 검증 근거를 저장합니다. 상세 로그나 실험 보고서는 별도 파일로 연결합니다.
Design은 `.emeth/designs/<DESIGN-ID>-<이름>/DESIGN.md`에 저장합니다. 이슈를 지정하면 관련 작업을 연결할 수 있습니다.

## 🏛️ 아키텍처 메모리

아키텍처 메모리는 프로젝트 구조, 운영 환경, 제약, 주요 결정과 그 이유를 Markdown 문서로 관리합니다. 첫 Design 저장부터 작은 Memory가 시작됩니다. 기존 프로젝트 전반의 분석이 필요하면 선택적으로 init을 요청합니다.

```text
$emeth-discipline:architecture-memory-init
이 프로젝트의 아키텍처 메모리를 만들어줘.
```

기본 위치는 `docs/architecture/`입니다. 코드·기존 문서·현재 대화를 바탕으로 프로젝트 구조와 설계 결정, 운영 제약을 정리합니다.

첫 Design 저장 또는 초기화에 성공하면 `.emeth/architecture.json`에 문서 위치를 저장합니다. 이후 이 연결이 있는 프로젝트에서만 훅을 통해 메모리 스킬을 안내합니다. 개발 판단에 필요한 부분을 검색해 읽고, 앞으로도 참고할 결정이나 운영 정보가 생기면 관련 문서에 반영합니다. 일반 프로젝트 대화의 중요한 맥락도 기록합니다. 출처·범위·확정 여부를 보존하고, 읽기 전용 또는 기록 금지 요청에서는 문서를 수정하지 않습니다. 프로젝트 설정의 `enabled: false`나 비활성 Memory도 유지합니다.

커밋된 코드 변경을 문서에 반영하려면 별도로 갱신을 요청합니다.

```text
$emeth-discipline:architecture-memory-update
마지막으로 확인한 커밋 이후의 변경 사항을 아키텍처 문서에 반영해줘.
```

마지막으로 확인한 커밋 이후의 변경을 반영합니다.

Design의 상태만 바꿀 때는 Memory 연결 상태를 조회하며 초기화를 재시도하지 않습니다. 초기화 실패를 해결한 뒤 Design을 다시 저장하거나 Memory 초기화를 명시적으로 실행하면 연결을 재시도할 수 있습니다.

훅을 지원하지 않는 환경에서는 `architecture-memory`를 직접 호출할 수 있습니다.

## 🖥️ 통합 대시보드

대시보드는 `127.0.0.1`에서 실행되는 로컬 서버입니다. 홈(`/`)에서 작업 기록(`/dashboard`)과 아키텍처 문서(`/architecture`)를 선택하고, 등록된 프로젝트를 전환해 볼 수 있습니다. 아키텍처 화면은 문서와 마지막 확인 커밋, Mermaid 다이어그램을 읽기 전용으로 표시합니다.

이슈·Design 또는 기존 문서를 저장하거나 아키텍처 메모리를 초기화하면 해당 프로젝트를 등록합니다. 서버는 `SessionStart` 훅이 상태를 확인해 시작합니다. 별도 서버 패키지를 설치할 필요는 없습니다.

| 명령 | 동작 |
| --- | --- |
| `$emeth-discipline:dashboard-server add` | 현재 폴더에 `.emeth/`이 있으면 프로젝트 등록 |
| `$emeth-discipline:dashboard-server open` | 실행 중인 서버를 확인하고 대시보드 열기. 서버가 중지되어 있으면 시작하지 않음 |
| `$emeth-discipline:dashboard-server status` | 실행 주소, 서버 식별 정보, 버전 또는 중지 원인 확인 |
| `$emeth-discipline:dashboard-server stop` | 실행 상태와 실제 서버가 일치하는지 확인한 뒤 종료. 프로젝트 등록은 유지 |

프로젝트가 목록에 없으면 해당 프로젝트 폴더에서 `add`를 호출하세요. 이 명령은 프로젝트 파일을 새로 만들거나 다른 폴더를 검색하지 않습니다.

### 대시보드 저장 위치와 권한 설정

프로젝트 목록과 서버 상태는 공용 폴더에 저장합니다.
Windows에서는 `%APPDATA%\emeth\dashboard`를 사용합니다.
다른 운영체제에서는 `$XDG_CONFIG_HOME/emeth/dashboard`를 사용하며, `XDG_CONFIG_HOME`이 없으면 `~/.config/emeth/dashboard`를 사용합니다.

등록 코드는 필요한 저장소를 자동으로 만들고, 이미 등록된 프로젝트는 `no-op`으로 처리합니다.
등록 결과가 `registered` 또는 `no-op`이면 추가 설정 확인 없이 완료합니다.
실제 권한 오류가 발생하면 Codex가 쓰기 권한을 확인하고, 필요하면 안내 후 사용자 `config.toml` 또는 권한 프로필을 수정합니다.
변경된 권한이 현재 작업에 반영되지 않으면 새 Codex 작업에서 등록을 재시도하세요.
권한 설정이 끝나지 않아도 이미 저장한 프로젝트 문서는 유지됩니다.

권한 오류(`EPERM`, `EACCES`)가 나거나 수동 설정이 필요하면 [상세 설정 절차](skills/dashboard-server/references/sandbox-setup.md)를 참고하세요.



## ✅ 개발 검증

저장소 루트에서 전체 테스트를 실행합니다. 별도 패키지 설치는 필요하지 않습니다.

```bash
npm test
```

## 라이선스

[MIT](LICENSE)
