# 구현 실행 구조

`start-implementation`이 준비된 계약을 구현 컨텍스트에 전달한다. `implement.md`는 공용 내부 절차 문서다.

## Codex 실행

[start-implementation](../skills/start-implementation/SKILL.md)은 모델과 추론 수준을 정하고 현재 프로젝트에 새 작업을 만든다. 새 작업은 절대 경로로 전달받은 [implement.md](../skills/start-implementation/implement.md)를 읽고 계약의 구현, 검증, 완료와 전달을 책임진다. 준비된 Design과 지원되는 기존 Spec을 받는다.

## Claude Code 실행

[Claude 절차](../skills/start-implementation/references/claude-code.md)는 `prepare-launch.js --host claude`로 계약의 준비 상태를 확인하고, 반환된 인수로 Agent 도구의 하위 에이전트를 한 번 실행한다. 하위 에이전트는 현재 프로젝트 폴더에서 [implement.md](../skills/start-implementation/implement.md)를 읽고 구현, 검증, 완료를 책임지며 결과는 호출한 세션에 돌아온다. 모델은 사용자가 지정한 Claude 모델을 쓰고, 지정하지 않으면 현재 세션 모델을 상속한다. 추론 강도는 호출마다 지정할 수 없어 현재 세션 설정을 따른다. `figure-it-out`은 같은 절차로 구현 단계를 넘긴다.

## 병렬 구현

병렬 구현이 필요하면 사용자가 모델에 작업 분할과 병렬 처리를 직접 요청한다. 별도의 병렬 구현 시작 스킬은 제공하지 않는다.

## 검증 범위

자동 검증은 세션 생성 인수, 내부 문서 경로, 스킬 등록과 참조 연결을 확인한다. 실제 구현 품질과 비용은 별도 실측 대상이다.
