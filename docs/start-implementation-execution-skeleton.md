# 구현 실행 구조

`start-implementation`은 준비된 Design을 입력으로 pstack의 구현 절차를 현재 대화에서 실행한다.
기준 원본은 pstack 0.15.25, 커밋 `6f131f137de64fdaf928278c0fd9ecec520ccbee`다.

## 진입과 조율

[figure-it-out](../plugins/emeth-discipline/skills/figure-it-out/SKILL.md)은 Design 준비, `tenet-me` 검토, [start-implementation](../plugins/emeth-discipline/skills/start-implementation/SKILL.md) 실행을 조율한다.
`start-implementation`은 Design 문서 묶음을 읽고 작업에 맞는 절차를 선택한다.
원본처럼 큰 변경이나 장시간 자율 작업은 좁은 절차에 맞더라도 내부 large-change 절차로 보낸다.
현재 대화가 계획, 위임, 결과 검토와 검증을 담당한다.
조사와 코드 작성은 호스트의 하위 에이전트 도구를 사용한다.

| 작업 | 원본 절차 | 주요 실행 |
| --- | --- | --- |
| 기능 개발 | Feature | 코드 이해, 병렬 설계 탐색, 작업 분할, 구현 위임, 실제 결과 검증 |
| 버그 수정 | Bug fix | 재현, 원인 가설 검증, 수정 계획과 구현 위임, 같은 조건에서 재검증 |
| 리팩터링 | Refactoring | 기존 동작 고정, 목표 구조 설정, 작은 단계의 구조 변경, 동작 동등성 검증 |

원칙 목록, 하위 에이전트 조율, 호스트 도구 대응과 작업 선택은 원본처럼 [start-implementation](../plugins/emeth-discipline/skills/start-implementation/SKILL.md) 한 문서에 둔다.
구현 위임자는 [원본에서 가져온 역할 프롬프트](../plugins/emeth-discipline/references/pstack/implementation-prompt.md)를 전달받는다.
모델과 추론 수준은 [모델 선택 기준](../plugins/emeth-discipline/references/pstack/model-routing.md)을 따른다.
ensemble과 challenge는 GPT6.1 Sol을 사용하고 작업에 맞는 추론 수준을 선택한다.

## 구현 구성 요소

각 절차는 필요한 구성 요소를 참조한다.

| 참조 문서 | 역할 |
| --- | --- |
| [blueprint](../plugins/emeth-discipline/skills/start-implementation/references/blueprint.md) | Design을 입력으로 구현 구조 구체화와 구현 |
| [impact-analysis](../plugins/emeth-discipline/skills/start-implementation/references/impact-analysis.md) | 변경 영향과 핵심 안전 전제 확인 |
| [regression-test](../plugins/emeth-discipline/skills/start-implementation/references/regression-test.md) | 원본 적용 조건에 해당하는 버그의 수정 전 재현 |
| [challenge](../plugins/emeth-discipline/skills/start-implementation/references/challenge.md) | 구현 결과의 독립 검토와 결과 종합 |

공개 스킬 [ensemble](../plugins/emeth-discipline/skills/ensemble/SKILL.md)은 독립 후보 생성, 비교와 합성을 담당한다.
[code-exploration](../plugins/emeth-discipline/skills/code-exploration/SKILL.md)은 how, why, teach 모드로 코드 이해를 담당한다.
원본 절차에서 이 기능을 호출하는 지점도 해당 스킬에 연결한다.

## 출처와 검증

원본의 출처와 MIT 허가문은 [THIRD_PARTY_NOTICES.md](../plugins/emeth-discipline/THIRD_PARTY_NOTICES.md)에 둔다.
통합 파일의 원본 대응과 변경하지 않은 참조의 해시는 [테스트 자료](../tests/fixtures/pstack-import.json)에 둔다.
이 자료는 설치본의 참조 연결, 원본 참조 보존과 라이선스를 검증하며, 최적화한 프롬프트의 본문을 과거 치환 이력에 고정하지 않는다.

```text
node --test --test-concurrency=1 tests/pstack-integration.test.js tests/implementation-skills.test.js tests/figure-it-out.test.js tests/subagent-completion.test.js
```

이 검사는 패키지와 실행 계약의 구조를 확인한다.
실제 모델의 작업 선택, 품질, 시간과 비용은 별도 실행으로 측정한다.
