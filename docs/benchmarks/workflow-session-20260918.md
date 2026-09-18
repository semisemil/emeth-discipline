# Astra Low Workflow 세션 비교

2026-09-18, SuperJSON Error 스택 직렬화, `gpt-6-astra` / `low`, normal 응답 모드, 조건별 1회.

## 결과

| 조건 | 외부 테스트 | 추가 진단 | API 환산 비용 | 시간 | 토큰 | 모델 요청 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Workflow | 196/196 | 7/14 | $1.990344 | 474.427초 | 638,632 | 19 |
| 한 세션 | 196/196 | 4/14 | $1.611168 | 402.834초 | 440,468 | 12 |

외부 테스트는 신규 요구 80개와 기존 회귀 116개다.

## 최초 요청만으로 한 세션 실행

두 조건 모두 `$emeth-discipline:figure-it-out`으로 시작한다. 한 세션 조건에서는 다음 요청을 추가했다.

```text
For this run, prepare and review the Design, then use $emeth-discipline:implement for that ready Design in this same session through implementation, verification, completion, and delivery. This overrides the workflow handoff: do not use start-implementation or create another session or agent.
```

## 추가 진단 14개

[진단 스크립트](superjson-probes.mjs)의 항목별 결과다.

| 검사 | Workflow | 한 세션 |
| --- | --- | --- |
| 파일명만 남기기: 루트 경로 | 통과 | 실패 |
| 파일명만 남기기: 상대 경로 | 실패 | 실패 |
| 파일명만 남기기: 공백 포함 경로 | 실패 | 실패 |
| 현재 작업 경로와 중간 문자열 구분 | 실패 | 실패 |
| CR 줄바꿈 프레임 분리 | 통과 | 통과 |
| 수신자 속성 허용 목록 유지 | 실패 | 실패 |
| 옵션 생략 시 AggregateError 기존 동작 | 실패 | 통과 |
| 일반 Error의 허용된 errors 필드 보존 | 통과 | 실패 |
| 등록 Error 클래스와 추가 필드 보존 | 통과 | 실패 |
| cause와 별도 필드의 동일 참조 보존 | 실패 | 실패 |
| 직렬화 호출 간 간섭 방지 | 통과 | 실패 |
| 등록 Box 내부와 외부의 동일 참조 보존 | 통과 | 실패 |
| custom serializer 메시지 가림 | 실패 | 통과 |
| 다른 인스턴스의 cause 타입 복원 | 통과 | 통과 |

## 비용과 비교 한계

기록된 단가는 일반 입력 $10/M, 캐시 입력 $1/M, 출력 $50/M이다. 캐시 쓰기 토큰은 0이며 추론 토큰은 출력에 포함된다. 현재 구독 청구액이나 최신 가격 안내가 아닌 벤치마크의 고정 단가 환산이다.

Astra Core $0.929는 캐시 적중률을 보정한 비교용 값이다. Workflow 비용은 관측 사용량 그대로 계산했으므로 비용 기준을 구분한다.

[사용량, 소스 및 제출물 해시, 진단별 관측 결과](workflow-session-20260918.json)에 두 제출물을 식별할 근거를 남겼다.
