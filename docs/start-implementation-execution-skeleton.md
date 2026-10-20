# 구현 실행 구조

`start-implementation`은 검토한 Design과 사용자 요구사항을 바탕으로 구현을 진행한다.
pstack 0.15.25, 커밋 `6f131f137de64fdaf928278c0fd9ecec520ccbee`에서 가져온 절차를 Emeth의 설계, 실행과 검증 흐름에 연결한다.

## 작업에 따른 실행 흐름

현재 대화가 설계 선택, 코드 구현, 통합과 최종 검증을 맡는다.
[실행 흐름 선택 기준](../plugins/emeth-discipline/skills/start-implementation/SKILL.md#implementation-workflow)에 따라 설계 탐색 전에 흐름을 선택한다.
간단함은 파일 수보다 요구사항의 상호작용과 독립 테스트의 필요성으로 판단한다.

| 흐름 | 적용 대상 | 설계와 구현 | 독립 역할 |
| --- | --- | --- | --- |
| 통합 소유자 | 범위가 좁고 요구 결과와 주변 계약을 직접 확인하기 쉬운 작업 | 후보 설계 둘을 현재 대화가 비교하고 선택한 뒤 구현과 검증 | 검토자 한 명이 완성된 구현과 후보 설계를 검토 |
| 구현 소유권 유지 | 그 외 작업. 여러 요구사항, 상태 전이나 통합 계약의 상호작용을 독립 테스트로 확인 | 후보 설계 둘과 독립 심사자 한 명의 비교를 거쳐 설계를 확정한 뒤 현재 대화가 구현 | 새 테스트 작성자가 요구 원문과 기존 동작에서 기대 결과를 도출하며 병렬 작업 |

통합 소유자는 최종 검토의 중요 지적을 수정하고 같은 검토자에게 영향을 받는 부분의 재검토를 받는다.
구현 소유권 유지는 독립 테스트를 통합하고 요구사항과 기존 동작에 맞춰 문제를 해결한 뒤 전체 결과를 검증한다.
두 흐름 모두 관련 코드와 조건이 같은 기존 근거와 검증 결과를 재사용한다.

## 진입과 작업별 절차

[figure-it-out](../plugins/emeth-discipline/skills/figure-it-out/SKILL.md)은 실행 흐름 선택, Design 준비, `tenet-me` 검토와 [start-implementation](../plugins/emeth-discipline/skills/start-implementation/SKILL.md)을 조율한다.
이미 검토한 Design과 유효한 산출물은 이어서 사용한다.

| 작업 | 절차가 보존하는 검증 |
| --- | --- |
| 기능 개발 | 요구 결과와 기존 공개 계약을 실제 빌드 산출물에서 확인 |
| 버그 수정 | 실행 증거로 원인을 확인하고 같은 재현 조건에서 수정 결과 확인 |
| 리팩터링 | 변경 전 동작을 고정하고 실제 산출물의 동등성 확인 |
| 큰 변경 | 작업별 단계를 구성하고 각 단계와 전체 결과를 검증 |

작업별 절차는 선택한 흐름의 구현 소유권과 독립 역할을 유지한다.
설계가 계속 대립할 때는 [challenge](../plugins/emeth-discipline/skills/start-implementation/references/challenge.md)로 검토한다.

## 역할과 인계

[ensemble](../plugins/emeth-discipline/skills/ensemble/SKILL.md)은 독립 후보 둘의 생성, 비교와 합성 및 독립 검토를 담당한다.
호출한 실행 흐름이 검토 시점과 대상을 정한다.
[blueprint](../plugins/emeth-discipline/skills/start-implementation/references/blueprint.md)는 필요한 구현 경계와 결정만 구체화한다.
[구현 위임 프롬프트](../plugins/emeth-discipline/references/pstack/implementation-prompt.md)는 분리할 수 있는 구현 또는 검증 산출물에 적용한다.

역할별 전달문에는 해당 역할의 계약과 작업에 필요한 원문, 근거와 담당 경로를 전달한다.
일반 진행사항은 최종 결과에 모으고, 다른 작업에 필요한 산출물이나 총괄의 판단이 필요한 문제는 즉시 전달한다.
복구 범위와 중단 조건은 배정할 때 정한다.
완료 대기는 [호스트의 완료 처리](../plugins/emeth-discipline/skills/rules/codex.md#subagent-completion)를 사용한다.

## 출처와 검증

원본의 출처와 MIT 허가문은 [THIRD_PARTY_NOTICES.md](../plugins/emeth-discipline/THIRD_PARTY_NOTICES.md)에 둔다.
통합 파일의 원본 대응과 변경하지 않은 참조의 해시는 [테스트 자료](../tests/fixtures/pstack-import.json)에 둔다.
이 자료는 설치본의 참조 연결, 원본 참조 보존과 라이선스를 검증하며, 최적화한 프롬프트의 본문을 과거 치환 이력에 고정하지 않는다.

```text
node --test --test-concurrency=1 tests/pstack-integration.test.js tests/implementation-skills.test.js tests/figure-it-out.test.js tests/subagent-completion.test.js
```

이 검사는 패키지와 실행 계약의 구조를 확인한다.
실제 모델의 작업 선택, 품질, 시간과 비용은 별도 실행으로 측정한다.
