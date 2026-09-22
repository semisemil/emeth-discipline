# 구현 실행 구조

두 시작 스킬 중 사용할 흐름을 선택한다. `implement.md`와 `design-slice.md`는 내부 절차 문서다.

## 기존 방식

[start-implementation](../skills/start-implementation/SKILL.md)은 모델과 추론 수준을 정하고 현재 프로젝트에 새 작업을 만든다. 새 작업은 절대 경로로 전달받은 [implement.md](../skills/start-implementation/implement.md)를 읽고 계약의 구현, 검증, 완료와 전달을 책임진다. 준비된 Design과 지원되는 기존 Spec을 받는다.

## 작업 분할과 선택적 병렬 구현

[start-parallel-implementation](../skills/start-parallel-implementation/SKILL.md)은 [design-slice.md](../skills/start-parallel-implementation/design-slice.md)에 따라 Design의 작업을 나눈 뒤 새 작업을 만든다. 새 작업은 [implement.md](../skills/start-parallel-implementation/implement.md)에 따라 직접 구현하거나 별도 작업 세션에 독립된 작업을 병렬 위임한다. 전체 담당 세션은 할 일이 없으면 턴을 종료하고, 작업 세션이 보내는 결과 메시지로 재개하여 통합한다. 공통 문서를 반복 사용할 때만 시드 세션을 준비하며, 포크는 시드의 모델을 유지하고 필요하면 추론 강도만 조정한다.

## 검증 범위

자동 검증은 세션 생성 인수, 내부 문서 경로, 스킬 등록과 참조 연결을 확인한다. 실제 구현 품질과 비용은 별도 실측 대상이다.
