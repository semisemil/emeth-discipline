# 구현 실행 구조

`start-implementation`은 검토한 Design과 사용자 요구사항을 바탕으로 구현을 진행한다.
pstack 0.15.25, 커밋 `6f131f137de64fdaf928278c0fd9ecec520ccbee`에서 가져온 절차를 Emeth의 설계, 실행과 검증 흐름에 연결한다.

## 작업에 따른 실행 흐름

현재 대화가 설계 선택, 코드 구현, 통합과 최종 검증을 맡는다.
사용자가 실행 흐름을 명시하면 해당 흐름을 사용한다.
[실행 흐름 선택 기준](../plugins/emeth-discipline/skills/start-implementation/SKILL.md#implementation-workflow)에 따라 변경 대상 경로를 조사한 뒤 설계 탐색 전에 검증 흐름을 선택한다.
처리 단계의 상호작용, 상태 전환과 실행 순서, 표현이나 연동 경계의 호환 규칙이 달라지는지로 독립 검증의 필요성을 판단한다.
기존 처리 단계나 상태가 있다는 사실 자체는 흐름을 정하지 않는다.
같은 작업 계약에서는 선택을 유지하고, 새 동작 근거나 합의된 요구사항이 분류를 바꾸면 재평가한다.

| 흐름 | 적용 대상 | 설계와 구현 | 독립 역할 |
| --- | --- | --- | --- |
| 구현과 테스트 통합형 (Combined implementation and tests) | 독립 검증 조건에 해당하지 않고 요구 결과와 보존할 기존 동작의 근거가 있는 변경 | 현재 대화가 설계를 선택하고 구현과 테스트 작성 | 검토자 한 명이 완성된 구현을 검토 |
| 구현과 테스트 분리형 (Separate implementation and tests) | 처리 단계의 상호작용, 상태 전환과 실행 순서 또는 표현 및 연동 경계의 호환 규칙을 도입하거나 변경 | 독립 설계 검토를 거쳐 현재 대화가 구현 | 구현 전 검토자 한 명과 별도 테스트 작성자가 원문 및 기존 동작에 근거해 검증 |

내부 구조를 새로 선택하거나 변경하는 작업은 [blueprint](../plugins/emeth-discipline/skills/start-implementation/references/blueprint.md#phase-b-sketch)에 따라 독립 설계 후보 둘을 생성하고 비교한 뒤 설계를 선택한다.
이미 선정된 구체적 설계를 적용하거나 기존 형태를 기계적으로 따르는 작업은, 해당 내부 결정이 정해져 있음을 보이는 출처와 유효한 비교 결과를 근거로 재사용한다.
Sketch 시작 시 후보 생성과 설계 재사용 중 어느 경로를 택하는지, 미결 내부 결정 또는 재사용 근거와 함께 밝힌다.
후보가 없어도 선택한 흐름의 검토와 테스트 작성 역할은 유지한다.

실제 구현 후보의 비교가 남은 구현 선택을 해결하는 데 도움이 되면, [구현 후보 비교](../plugins/emeth-discipline/skills/start-implementation/SKILL.md#implementation-candidates)를 선택해 필요한 범위만 ensemble로 비교한다.
관찰만으로 결정할 수 있는 문제는 분리된 실험으로 확인하고, 구현 후보는 실제 코드에 통합할 산출물을 만든다.
선택한 검증 흐름과 구현 소유권은 유지한다.

통합 소유자는 최종 검토의 중요 지적을 수정하고 같은 검토자에게 영향을 받는 부분의 재검토를 받는다.
구현 소유권 유지는 독립 테스트를 통합하고 요구사항과 기존 동작에 맞춰 문제를 해결한 뒤 전체 결과를 검증한다.
두 흐름 모두 관련 코드와 조건이 같은 기존 근거와 검증 결과를 재사용한다.

## 진입과 작업별 절차

[figure-it-out](../plugins/emeth-discipline/skills/figure-it-out/SKILL.md)은 요청한 산출물에 맞춰 조사, 아키텍처 협의, Design 작성, 검토, 테스트, 측정과 구현 흐름을 선택하고 조합한다.
각 흐름은 요청한 결과와 범위에서 완료한다.
테스트와 측정은 기존 프로젝트 도구를 활용하는 figure-it-out의 상세 절차를 따른다.
구현 요청에서는 실행 흐름 선택, Design 준비, `tenet-me` 검토와 [start-implementation](../plugins/emeth-discipline/skills/start-implementation/SKILL.md)을 조율한다.
이미 검토한 Design과 유효한 산출물은 이어서 사용한다.
구현은 사용자 요청과 이후 합의에서 허용한 범위에서 시작하며, 선택한 흐름의 필수 설계 검토를 먼저 마친다.
사용자가 설계 확인 단계를 요청했다면 선택한 설계와 주요 영향 및 장단점을 제시하고 명시적인 구현 승인을 기다린다.

| 작업 | 절차가 보존하는 검증 |
| --- | --- |
| 기능 개발 | 요구 결과와 기존 공개 계약을 실제 빌드 산출물에서 확인 |
| 버그 수정 | 실행 증거로 원인을 확인하고 같은 재현 조건에서 수정 결과 확인 |
| 리팩터링 | 변경 전 동작을 고정하고 실제 산출물의 동등성 확인 |
| 큰 변경 | 작업별 단계를 구성하고 각 단계와 전체 결과를 검증 |

작업별 절차는 선택한 흐름의 구현 소유권과 독립 역할을 유지한다.
설계가 계속 대립할 때는 [challenge](../plugins/emeth-discipline/skills/start-implementation/references/challenge.md)로 검토한다.

## 역할과 인계

[ensemble](../plugins/emeth-discipline/skills/ensemble/SKILL.md)은 독립 후보의 생성, 비교와 합성 및 독립 검토를 담당한다.
후보는 기본 2개로 시작하고 여러 설계 방향을 다루면 늘린다.
구현 요청에서는 호출한 실행 흐름이 검토 시점과 대상을 정한다.
설계 전용 요청이나 요청된 설계 확인 단계에서는 후보 유무와 관계없이 선택된 설계를 전달하거나 구현하기 전에 독립 검토한다.
검토 경계와 후보 없는 검토의 공통 계약은 [ensemble의 독립 검토](../plugins/emeth-discipline/skills/ensemble/SKILL.md#independent-review)에 둔다.
[blueprint](../plugins/emeth-discipline/skills/start-implementation/references/blueprint.md)는 목표, 합의된 제약과 관련 근거에서 필요한 설계 경계와 결정을 구체화한다.
필요한 기존 동작과 구조의 근거가 부족하면 how, 판단에 필요한 역사적 이유의 근거가 부족하면 why를 연결하며 유효한 조사 결과는 재사용한다.
Ground를 마치기 전에 총괄은 how와 why 각각의 실행, 재사용 또는 생략 상태와 근거를 대화에 명시한다.
architecture-coop과 blueprint는 후보를 사용할 때 [공통 설계 탐색](../plugins/emeth-discipline/references/design-exploration.md)을 배정과 종합에 적용한다.
각 후보는 같은 설계 과제와 사실에서 열린 선택을 독립적으로 조사하고 전체 과제를 해결하는 설계를 제시하며, 서로의 조사 결과를 종합에 활용한다.
[구현 위임 프롬프트](../plugins/emeth-discipline/references/pstack/implementation-prompt.md)는 분리할 수 있는 구현 또는 검증 산출물에 적용한다.

역할별 전달문에는 해당 역할의 계약과 작업에 필요한 원문, 근거와 담당 경로를 전달한다.
일반 진행사항은 최종 결과에 모으고, 다른 작업에 필요한 산출물이나 총괄의 판단이 필요한 문제는 즉시 전달한다.
복구 범위와 중단 조건은 배정할 때 정한다.
완료 전달은 호스트의 기본 기능을 사용한다.
Codex 서브에이전트는 호스트의 완료 기능으로 결과를 반환한다.
사용자가 별도 채팅의 결과를 요청하면 요청 채팅이 [완료 전달 지침](../plugins/emeth-discipline/skills/rules/references/codex-subagent-completion.md)에 따라 최종 응답을 회수한다.

## 요청 원문과 번호 안내

`lib/document-number.js`는 issue-ledger와 development-design의 직접 호출에 다음 문서 번호를 안내한다.
`lib/request-source.js`는 Codex의 figure-it-out, development-design과 start-implementation 호출 원문을 번호 안내와 독립적으로 보존한다.
실제 Design 생성 시에는 document-writer가 번호를 계산한다.

## 출처와 검증

원본의 출처와 MIT 허가문은 [THIRD_PARTY_NOTICES.md](../plugins/emeth-discipline/THIRD_PARTY_NOTICES.md)에 둔다.
다음 명령은 스킬 호출 메타데이터와 설치 패키지의 훅 및 문서 명령을 검증한다.

```text
node --test --test-concurrency=1 tests/plugin-package.test.js
```

실제 모델의 작업 선택, 품질, 시간과 비용은 별도 실행으로 측정한다.
