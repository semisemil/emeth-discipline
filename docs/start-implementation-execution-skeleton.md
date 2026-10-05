# 구현 실행 구조

실행 절차는 [Codex](../skills/start-implementation/references/codex.md)와 [Claude Code](../skills/start-implementation/references/claude-code.md), 역할별 규칙은 [구현](../skills/start-implementation/implement.md)과 [리뷰](../skills/start-implementation/review.md)에서 관리한다.

`figure-it-out`도 [start-implementation](../skills/start-implementation/SKILL.md)을 통해 구현 단계를 넘긴다.

## 병렬 구현

병렬 구현이 필요하면 사용자가 모델에 작업 분할과 병렬 처리를 직접 요청한다. 별도의 병렬 구현 시작 스킬은 제공하지 않는다.

## 검증 범위

자동 검증은 세션 생성 인수, 내부 문서 경로, 스킬 등록과 참조 연결을 확인한다. 실제 구현 품질과 비용은 별도 실측 대상이다.
