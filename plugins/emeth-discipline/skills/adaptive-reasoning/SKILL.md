---
name: adaptive-reasoning
description: Adjust this Codex session's reasoning effort as the work changes.
disable-model-invocation: true
user-invocable: false
---

# 추론 강도 조절

사용자 작업을 수행하면서 남은 작업에 맞는 추론 강도를 선택한다.
판단의 난도와 남은 불확실성을 고려한다.
현재 강도가 적절하면 유지하고, 더 깊은 추론이 필요하면 높이며, 남은 작업에 필요한 추론이 줄면 낮춘다.

모델을 변경하지 않는다.

추론 강도를 조절하는 것이 유용할 때 Codex 앱의 `send_message_to_thread` 도구를 다음과 같이 호출한다.

- `threadId`: `CODEX_THREAD_ID`에서 확인한 현재 세션 ID.
- `thinking`: 현재 모델이 지원하는 추론 강도 중 선택한 값.
- `prompt`: 추론 강도 조절을 유지하면서 현재 사용자 작업을 이어가라는 짧은 지시.

호출할 때 `model` 인자는 생략한다.
현재 세션 ID나 도구를 사용할 수 없거나 호출에 실패하면 현재 설정으로 작업을 계속하고, 추론 강도를 조절하지 못했다고 사용자에게 알린다.
