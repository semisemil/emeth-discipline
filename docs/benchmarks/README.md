# Emeth 벤치마크

SuperJSON의 Error 스택 직렬화 작업을 같은 요구 사항으로 실행한 결과입니다.

- **None**: 플러그인과 스킬 및 훅 비활성화
- **Core**: Emeth 활성화, 명시적인 스킬 호출 없음
- **Workflow**: [`/emeth-discipline:figure-it-out`](../../plugins/emeth-discipline/skills/figure-it-out/SKILL.md) 호출

| 모델 | 조건 | 공식 외부 검사 | 추가 진단 | 시간 | 비교용 추정 비용 |
| --- | --- | ---: | ---: | ---: | ---: |
| 6 Astra low | None | 196/196 | 4.7/14 | 3분 36초 | $0.975 |
| 6 Astra low | Core | 196/196 | 6.3/14 | 4분 37초 | $1.318 |
| 6 Astra low | Workflow | 195.7/196 | 10.0/14 | 10분 27초 | $5.320 |
| 6.1 Sol medium | None | 195.0/196 | 6.3/14 | 6분 21초 | $0.330 |
| 6.1 Sol medium | Core | 195.7/196 | 6.7/14 | 7분 23초 | $0.345 |
| 6.1 Sol medium | Workflow | 196/196 | 6.7/14 | 9분 27초 | $0.803 |

모든 수치는 2026-10-25에 모델과 조건별로 3회 실행한 평균이며, 실패한 실행도 포함합니다.

## 측정 조건

같은 기준 코드와 과제 원문을 사용했습니다.
None과 Core의 입력은 동일하며, Workflow만 앞에 스킬 호출을 붙였습니다.
사전 검증과 외부 채점은 측정 시간과 비용에서 제외했습니다.
비용은 부모와 하위 작업의 사용량을 합산한 API 단가 기준 추정치이며, 실제 청구액이 아닙니다.

[원본 데이터](superjson.json)

## None 대비 증가 배율

| 모델 | Core 비용 | Workflow 비용 | Core 시간 | Workflow 시간 |
| --- | ---: | ---: | ---: | ---: |
| 6 Astra low | 1.35배 | 5.46배 | 1.28배 | 2.90배 |
| 6.1 Sol medium | 1.05배 | 2.43배 | 1.16배 | 1.49배 |

각 배율은 조건별 3회 평균을 같은 모델의 None 평균으로 나눈 값입니다.

## 회차별 결과

| 모델 | 조건 | 회차 | 공식 외부 검사 | 추가 진단 | 시간 | 비교용 추정 비용 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 6 Astra low | None | 1 | 196/196 | 7/14 | 3분 52초 | $1.031 |
| 6 Astra low | None | 2 | 196/196 | 4/14 | 3분 26초 | $0.963 |
| 6 Astra low | None | 3 | 196/196 | 3/14 | 3분 31초 | $0.930 |
| 6 Astra low | Core | 1 | 196/196 | 7/14 | 5분 27초 | $1.525 |
| 6 Astra low | Core | 2 | 196/196 | 7/14 | 4분 13초 | $1.252 |
| 6 Astra low | Core | 3 | 196/196 | 5/14 | 4분 10초 | $1.177 |
| 6 Astra low | Workflow | 1 | 195/196 | 11/14 | 10분 59초 | $5.945 |
| 6 Astra low | Workflow | 2 | 196/196 | 9/14 | 10분 33초 | $4.882 |
| 6 Astra low | Workflow | 3 | 196/196 | 10/14 | 9분 51초 | $5.132 |
| 6.1 Sol medium | None | 1 | 194/196 | 7/14 | 7분 25초 | $0.416 |
| 6.1 Sol medium | None | 2 | 196/196 | 6/14 | 5분 34초 | $0.260 |
| 6.1 Sol medium | None | 3 | 195/196 | 6/14 | 6분 4초 | $0.313 |
| 6.1 Sol medium | Core | 1 | 196/196 | 6/14 | 6분 1초 | $0.335 |
| 6.1 Sol medium | Core | 2 | 195/196 | 8/14 | 7분 11초 | $0.333 |
| 6.1 Sol medium | Core | 3 | 196/196 | 6/14 | 8분 57초 | $0.368 |
| 6.1 Sol medium | Workflow | 1 | 196/196 | 7/14 | 9분 58초 | $0.866 |
| 6.1 Sol medium | Workflow | 2 | 196/196 | 8/14 | 12분 20초 | $0.942 |
| 6.1 Sol medium | Workflow | 3 | 196/196 | 5/14 | 6분 1초 | $0.600 |

## 공식 검사 실패

실패한 실행은 제외하거나 수정본으로 대체하지 않았습니다.

- 6 Astra low Workflow 1회차: 195/196
  - src/error-stack.test.ts: Error Stack – redactPaths > string mode applies redactPaths, then maxStackLines, then stripInternalFrames

- 6.1 Sol medium None 1회차: 194/196
  - [p2p] src/error-stack.test.ts: Error Stack – additional public API behavior > deep cause serialization stops cleanly on circular cause chains
  - [f2p] src/error-stack.test.ts: Error Stack – redactPaths > string mode applies redactPaths, then maxStackLines, then stripInternalFrames

- 6.1 Sol medium None 3회차: 195/196
  - [f2p] src/error-stack.test.ts: Error Stack – additional public API behavior > sanitizeMessage is NOT applied to cause errors that fail classFilter

- 6.1 Sol medium Core 2회차: 195/196
  - [f2p] src/error-stack.test.ts: Error Stack – redactPaths > string mode applies redactPaths, then maxStackLines, then stripInternalFrames
