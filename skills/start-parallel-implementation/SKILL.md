---
name: start-parallel-implementation
description: Split a ready Design into work and launch a new implementation task with selective parallel delegation and reusable seed context. Explicit invocation only.
---

# Start Parallel Implementation

Design의 착수 가능 여부를 확인하고 [작업 분할](design-slice.md)을 따른다.

`create_thread`로 현재 프로젝트에 기본 시드를 만든다. 사용자 지정이 없으면 현재 모델과 추론 강도를 유지한다.
Design의 절대 경로를 전달하고, 읽기가 끝나면 `send_message_to_thread`로 현재 세션에 알린 뒤 턴을 종료하도록 지시한다.

기본 시드의 읽기 턴이 완료되면 해당 시드를 `fork_thread`로 포크하여 전체 담당 세션을 만든다. 기본 시드 원본은 그대로 둔다.
전체 담당 세션에 `send_message_to_thread`로 [implement.md](implement.md)의 절대 경로와 Design ID를 전달한다. 작업자와 작업용 시드도 기본 시드에서 포크할 수 있도록 기본 시드 ID를 함께 전달한다.

생성한 전체 담당 세션을 보고한다. 이후 구현과 최종 보고는 해당 세션이 맡는다.
