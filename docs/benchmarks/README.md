# Emeth 벤치마크

DeepSWE 벤치마크 과제 1종 — 플러그인 적용 조건별 품질, 시간, 비용 비교

- **None**: 플러그인 미사용
- **Core**: 플러그인 활성화, 명시적인 스킬 호출 없음
- **Workflow**: [`/emeth-discipline:figure-it-out`](../../plugins/emeth-discipline/skills/figure-it-out/SKILL.md) 호출
- **Lite**: [`/emeth-discipline:figure-it-out-lite`](../../plugins/emeth-discipline/skills/figure-it-out-lite/SKILL.md) 호출

| 모델 | 조건 | 공식 외부 검사 | 추가 진단 | 시간 | 비교용 추정 비용 |
| --- | --- | ---: | ---: | ---: | ---: |
| 6.2 Astra Light | None | 195.3/196 | 8.7/14 | 4분 29초 | $0.658 |
| 6.2 Astra Light | Core | 194.3/196 | 9/14 | 3분 57초 | $0.737 |
| 6.2 Astra Light | Workflow | 195/196 | 10.3/14 | 5분 22초 | $2.420 |
| 6.2 Astra Light | Lite | 195/196 | 10/14 | 7분 19초 | $1.756 |
| 6.2 Sol medium | None | 195.7/196 | 10.3/14 | 7분 42초 | $0.412 |
| 6.2 Sol medium | Core | 195.3/196 | 10.7/14 | 7분 44초 | $0.396 |
| 6.2 Sol medium | Workflow | 196/196 | 11/14 | 13분 56초 | $1.918 |
| 6.2 Sol medium | Lite | 195.3/196 | 10.7/14 | 10분 54초 | $0.819 |
| 6.1 Terra high | None | 195/196 | 4.3/14 | 3분 43초 | $0.101 |
| 6.1 Terra high | Core | 195.7/196 | 4.7/14 | 3분 19초 | $0.086 |
| 6.1 Terra high | Workflow | 195.3/196 | 6/14 | 7분 31초 | $0.394 |
| 6.1 Terra medium | None | 191.7/196 | 4/14 | 2분 41초 | $0.076 |
| 6.1 Terra medium | Core | 195.7/196 | 4.3/14 | 2분 56초 | $0.095 |
| 6.1 Terra medium | Workflow | 195.7/196 | 6.3/14 | 6분 41초 | $0.383 |
| 6.1 Terra medium | Lite | 195/196 | 5/14 | 4분 39초 | $0.165 |
| Opus 5.5 medium | None | 195/196 | 6.3/14 | 5분 39초 | $1.372 |
| Opus 5.5 medium | Core | 194.3/196 | 6.7/14 | 6분 52초 | $1.684 |
| Opus 5.5 medium | Workflow | 194.7/196 | 5.7/14 | 19분 15초 | $3.761 |
| Sonnet 5.5 medium | None | 195.3/196 | 6.3/14 | 4분 0초 | $0.574 |
| Sonnet 5.5 medium | Core | 195.7/196 | 6.3/14 | 4분 38초 | $0.639 |
| Sonnet 5.5 medium | Workflow | 195.3/196 | 7.7/14 | 7분 13초 | $1.463 |
| Fable 5.2 medium | None | 194.3/196 | 7/14 | 6분 47초 | $3.096 |
| Fable 5.2 medium | Core | 194.7/196 | 7.3/14 | 6분 20초 | $2.889 |
| Fable 5.2 medium | Workflow | 194.7/196 | 8.3/14 | 13분 31초 | $9.495 |
| 6 Astra low | None | 196/196 | 4.3/14 | 4분 38초 | $1.110 |
| 6 Astra low | Core | 196/196 | 4/14 | 4분 56초 | $1.276 |
| 6 Astra low | Workflow | 195.7/196 | 8.3/14 | 11분 14초 | $5.351 |
| 6.1 Sol medium | None | 195.7/196 | 4/14 | 6분 20초 | $0.272 |
| 6.1 Sol medium | Core | 195/196 | 7.7/14 | 6분 46초 | $0.364 |
| 6.1 Sol medium | Workflow | 195.7/196 | 9/14 | 14분 56초 | $1.386 |

수치는 조건별 3회 평균이며, 6.1 Terra medium의 Lite는 기존 1회 측정값입니다. 검사에 실패한 실행도 포함합니다.

## 측정 조건

같은 기준 코드와 과제 원문을 사용했습니다.
GPT는 Codex에서, Claude는 Claude Code의 auto 권한 모드에서 실행했습니다.
None과 Core의 사용자 입력은 동일하며, Workflow와 Lite는 입력 앞에 해당 스킬 호출을 붙였습니다.
Workflow와 Lite의 하위 역할은 부모와 같은 모델과 추론 수준으로 고정했습니다.
6.2 Astra의 Light는 Codex의 `low` 설정입니다.
2026-11-03 측정에서 설정이 달랐던 6회는 비교표에서 제외하고 [원본 데이터](superjson.json)에 별도로 기록했습니다.
사전 검증과 외부 채점은 측정 시간과 비용에서 제외했습니다.
비용은 부모와 하위 작업의 사용량을 합산한 API 단가 기준 추정치이며, 실제 청구액이 아닙니다.

[원본 데이터](superjson.json)

## None 대비 증가 배율

| 모델 | Core 비용 | Workflow 비용 | Core 시간 | Workflow 시간 |
| --- | ---: | ---: | ---: | ---: |
| 6.2 Astra Light | 1.12배 | 3.68배 | 0.88배 | 1.20배 |
| 6.2 Sol medium | 0.96배 | 4.65배 | 1.00배 | 1.81배 |
| 6.1 Terra high | 0.86배 | 3.90배 | 0.89배 | 2.03배 |
| 6.1 Terra medium | 1.26배 | 5.07배 | 1.09배 | 2.48배 |
| Opus 5.5 medium | 1.23배 | 2.74배 | 1.22배 | 3.41배 |
| Sonnet 5.5 medium | 1.11배 | 2.55배 | 1.16배 | 1.81배 |
| Fable 5.2 medium | 0.93배 | 3.07배 | 0.94배 | 1.99배 |
| 6 Astra low | 1.15배 | 4.82배 | 1.07배 | 2.43배 |
| 6.1 Sol medium | 1.34배 | 5.10배 | 1.07배 | 2.36배 |

각 배율은 조건별 평균을 같은 모델과 추론 수준의 None 평균으로 나눈 값입니다.

## Lite 비용과 시간 비교

| 모델 | None 대비 비용 | Workflow 대비 비용 | None 대비 시간 | Workflow 대비 시간 |
| --- | ---: | ---: | ---: | ---: |
| 6.2 Astra Light | 2.67배 | 0.73배 | 1.63배 | 1.36배 |
| 6.2 Sol medium | 1.99배 | 0.43배 | 1.42배 | 0.78배 |
| 6.1 Terra medium | 2.18배 | 0.43배 | 1.73배 | 0.70배 |

각 배율은 Lite 측정값을 같은 모델과 추론 수준의 비교 조건 평균으로 나눈 값입니다. 반복 횟수는 위의 측정값 설명과 같습니다.

## 회차별 결과

| 모델 | 조건 | 회차 | 공식 외부 검사 | 추가 진단 | 시간 | 비교용 추정 비용 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 6.2 Astra Light | None | 1 | 195/196 | 9/14 | 4분 33초 | $0.700 |
| 6.2 Astra Light | None | 2 | 195/196 | 9/14 | 5분 5초 | $0.624 |
| 6.2 Astra Light | None | 3 | 196/196 | 8/14 | 3분 49초 | $0.651 |
| 6.2 Astra Light | Core | 1 | 195/196 | 8/14 | 4분 21초 | $0.822 |
| 6.2 Astra Light | Core | 2 | 194/196 | 10/14 | 3분 24초 | $0.677 |
| 6.2 Astra Light | Core | 3 | 194/196 | 9/14 | 4분 5초 | $0.712 |
| 6.2 Astra Light | Workflow | 1 | 195/196 | 11/14 | 5분 26초 | $1.866 |
| 6.2 Astra Light | Workflow | 2 | 195/196 | 10/14 | 5분 54초 | $2.776 |
| 6.2 Astra Light | Workflow | 3 | 195/196 | 10/14 | 4분 45초 | $2.617 |
| 6.2 Astra Light | Lite | 1 | 194/196 | 10/14 | 8분 23초 | $2.058 |
| 6.2 Astra Light | Lite | 2 | 196/196 | 10/14 | 6분 40초 | $1.618 |
| 6.2 Astra Light | Lite | 3 | 195/196 | 10/14 | 6분 54초 | $1.590 |
| 6.2 Sol medium | None | 1 | 196/196 | 11/14 | 7분 25초 | $0.343 |
| 6.2 Sol medium | None | 2 | 195/196 | 9/14 | 8분 5초 | $0.420 |
| 6.2 Sol medium | None | 3 | 196/196 | 11/14 | 7분 35초 | $0.474 |
| 6.2 Sol medium | Core | 1 | 196/196 | 11/14 | 8분 3초 | $0.409 |
| 6.2 Sol medium | Core | 2 | 195/196 | 11/14 | 7분 3초 | $0.375 |
| 6.2 Sol medium | Core | 3 | 195/196 | 10/14 | 8분 5초 | $0.403 |
| 6.2 Sol medium | Workflow | 1 | 196/196 | 10/14 | 14분 13초 | $1.723 |
| 6.2 Sol medium | Workflow | 2 | 196/196 | 11/14 | 12분 46초 | $1.897 |
| 6.2 Sol medium | Workflow | 3 | 196/196 | 12/14 | 14분 49초 | $2.135 |
| 6.2 Sol medium | Lite | 1 | 195/196 | 11/14 | 11분 2초 | $0.789 |
| 6.2 Sol medium | Lite | 2 | 195/196 | 11/14 | 11분 28초 | $0.795 |
| 6.2 Sol medium | Lite | 3 | 196/196 | 10/14 | 10분 11초 | $0.873 |
| 6.1 Terra high | None | 1 | 195/196 | 4/14 | 3분 27초 | $0.088 |
| 6.1 Terra high | None | 2 | 195/196 | 5/14 | 4분 6초 | $0.094 |
| 6.1 Terra high | None | 3 | 195/196 | 4/14 | 3분 35초 | $0.122 |
| 6.1 Terra high | Core | 1 | 196/196 | 5/14 | 3분 8초 | $0.084 |
| 6.1 Terra high | Core | 2 | 196/196 | 4/14 | 3분 40초 | $0.094 |
| 6.1 Terra high | Core | 3 | 195/196 | 5/14 | 3분 7초 | $0.082 |
| 6.1 Terra high | Workflow | 1 | 196/196 | 6/14 | 6분 38초 | $0.415 |
| 6.1 Terra high | Workflow | 2 | 195/196 | 6/14 | 9분 16초 | $0.283 |
| 6.1 Terra high | Workflow | 3 | 195/196 | 6/14 | 6분 39초 | $0.485 |
| 6.1 Terra medium | None | 1 | 195/196 | 4/14 | 2분 50초 | $0.084 |
| 6.1 Terra medium | None | 2 | 184/196 | 4/14 | 2분 27초 | $0.068 |
| 6.1 Terra medium | None | 3 | 196/196 | 4/14 | 2분 47초 | $0.074 |
| 6.1 Terra medium | Core | 1 | 196/196 | 3/14 | 2분 47초 | $0.102 |
| 6.1 Terra medium | Core | 2 | 196/196 | 5/14 | 2분 3초 | $0.060 |
| 6.1 Terra medium | Core | 3 | 195/196 | 5/14 | 3분 59초 | $0.123 |
| 6.1 Terra medium | Workflow | 1 | 196/196 | 6/14 | 6분 30초 | $0.378 |
| 6.1 Terra medium | Workflow | 2 | 196/196 | 7/14 | 8분 2초 | $0.466 |
| 6.1 Terra medium | Workflow | 3 | 195/196 | 6/14 | 5분 30초 | $0.305 |
| 6.1 Terra medium | Lite | 1 | 195/196 | 5/14 | 4분 39초 | $0.165 |
| Opus 5.5 medium | None | 1 | 195/196 | 7/14 | 5분 2초 | $1.404 |
| Opus 5.5 medium | None | 2 | 196/196 | 6/14 | 6분 27초 | $1.417 |
| Opus 5.5 medium | None | 3 | 194/196 | 6/14 | 5분 27초 | $1.296 |
| Opus 5.5 medium | Core | 1 | 195/196 | 7/14 | 6분 2초 | $1.697 |
| Opus 5.5 medium | Core | 2 | 195/196 | 6/14 | 6분 44초 | $1.685 |
| Opus 5.5 medium | Core | 3 | 193/196 | 7/14 | 7분 50초 | $1.669 |
| Opus 5.5 medium | Workflow | 1 | 194/196 | 6/14 | 20분 14초 | $3.651 |
| Opus 5.5 medium | Workflow | 2 | 195/196 | 6/14 | 29분 22초 | $4.255 |
| Opus 5.5 medium | Workflow | 3 | 195/196 | 5/14 | 8분 10초 | $3.377 |
| Sonnet 5.5 medium | None | 1 | 196/196 | 6/14 | 3분 49초 | $0.630 |
| Sonnet 5.5 medium | None | 2 | 195/196 | 6/14 | 3분 42초 | $0.540 |
| Sonnet 5.5 medium | None | 3 | 195/196 | 7/14 | 4분 28초 | $0.551 |
| Sonnet 5.5 medium | Core | 1 | 195/196 | 6/14 | 4분 34초 | $0.628 |
| Sonnet 5.5 medium | Core | 2 | 196/196 | 7/14 | 3분 54초 | $0.589 |
| Sonnet 5.5 medium | Core | 3 | 196/196 | 6/14 | 5분 26초 | $0.700 |
| Sonnet 5.5 medium | Workflow | 1 | 195/196 | 9/14 | 9분 40초 | $1.866 |
| Sonnet 5.5 medium | Workflow | 2 | 196/196 | 7/14 | 6분 48초 | $1.700 |
| Sonnet 5.5 medium | Workflow | 3 | 195/196 | 7/14 | 5분 11초 | $0.821 |
| Fable 5.2 medium | None | 1 | 195/196 | 7/14 | 6분 55초 | $3.514 |
| Fable 5.2 medium | None | 2 | 194/196 | 7/14 | 6분 50초 | $2.962 |
| Fable 5.2 medium | None | 3 | 194/196 | 7/14 | 6분 34초 | $2.813 |
| Fable 5.2 medium | Core | 1 | 195/196 | 8/14 | 6분 39초 | $2.988 |
| Fable 5.2 medium | Core | 2 | 194/196 | 8/14 | 6분 23초 | $2.941 |
| Fable 5.2 medium | Core | 3 | 195/196 | 6/14 | 5분 59초 | $2.738 |
| Fable 5.2 medium | Workflow | 1 | 195/196 | 8/14 | 11분 14초 | $8.626 |
| Fable 5.2 medium | Workflow | 2 | 195/196 | 9/14 | 13분 51초 | $9.879 |
| Fable 5.2 medium | Workflow | 3 | 194/196 | 8/14 | 15분 27초 | $9.979 |
| 6 Astra low | None | 1 | 196/196 | 6/14 | 5분 24초 | $1.145 |
| 6 Astra low | None | 2 | 196/196 | 3/14 | 4분 18초 | $0.987 |
| 6 Astra low | None | 3 | 196/196 | 4/14 | 4분 11초 | $1.199 |
| 6 Astra low | Core | 1 | 196/196 | 3/14 | 4분 22초 | $1.099 |
| 6 Astra low | Core | 2 | 196/196 | 5/14 | 5분 15초 | $1.306 |
| 6 Astra low | Core | 3 | 196/196 | 4/14 | 5분 12초 | $1.424 |
| 6 Astra low | Workflow | 1 | 196/196 | 9/14 | 13분 30초 | $5.449 |
| 6 Astra low | Workflow | 2 | 196/196 | 6/14 | 6분 39초 | $3.869 |
| 6 Astra low | Workflow | 3 | 195/196 | 10/14 | 13분 34초 | $6.736 |
| 6.1 Sol medium | None | 1 | 195/196 | 4/14 | 6분 31초 | $0.276 |
| 6.1 Sol medium | None | 2 | 196/196 | 4/14 | 6분 3초 | $0.276 |
| 6.1 Sol medium | None | 3 | 196/196 | 4/14 | 6분 28초 | $0.265 |
| 6.1 Sol medium | Core | 1 | 195/196 | 8/14 | 6분 7초 | $0.279 |
| 6.1 Sol medium | Core | 2 | 194/196 | 7/14 | 5분 13초 | $0.411 |
| 6.1 Sol medium | Core | 3 | 196/196 | 8/14 | 8분 59초 | $0.401 |
| 6.1 Sol medium | Workflow | 1 | 195/196 | 8/14 | 16분 1초 | $1.401 |
| 6.1 Sol medium | Workflow | 2 | 196/196 | 9/14 | 14분 44초 | $1.323 |
| 6.1 Sol medium | Workflow | 3 | 196/196 | 10/14 | 14분 4초 | $1.435 |

## 공식 검사 실패

아래 실행은 수정본으로 대체하지 않고 평균에 포함했습니다.

- 6.2 Astra Light None 1회차: 195/196
- 6.2 Astra Light None 2회차: 195/196
- 6.2 Astra Light Core 1회차: 195/196
- 6.2 Astra Light Core 2회차: 194/196
- 6.2 Astra Light Core 3회차: 194/196
- 6.2 Astra Light Workflow 1회차: 195/196
- 6.2 Astra Light Workflow 2회차: 195/196
- 6.2 Astra Light Workflow 3회차: 195/196
- 6.2 Astra Light Lite 1회차: 194/196
- 6.2 Astra Light Lite 3회차: 195/196
- 6.2 Sol medium None 2회차: 195/196
- 6.2 Sol medium Core 2회차: 195/196
- 6.2 Sol medium Core 3회차: 195/196
- 6.2 Sol medium Lite 1회차: 195/196
- 6.2 Sol medium Lite 2회차: 195/196
- 6.1 Terra high None 1회차: 195/196
- 6.1 Terra high None 2회차: 195/196
- 6.1 Terra high None 3회차: 195/196
- 6.1 Terra high Core 3회차: 195/196
- 6.1 Terra high Workflow 2회차: 195/196
- 6.1 Terra high Workflow 3회차: 195/196
- 6.1 Terra medium None 1회차: 195/196
- 6.1 Terra medium None 2회차: 184/196
- 6.1 Terra medium Core 3회차: 195/196
- 6.1 Terra medium Workflow 3회차: 195/196
- 6.1 Terra medium Lite 1회차: 195/196
- Opus 5.5 medium None 1회차: 195/196
- Opus 5.5 medium None 3회차: 194/196
- Opus 5.5 medium Core 1회차: 195/196
- Opus 5.5 medium Core 2회차: 195/196
- Opus 5.5 medium Core 3회차: 193/196
- Opus 5.5 medium Workflow 1회차: 194/196
- Opus 5.5 medium Workflow 2회차: 195/196
- Opus 5.5 medium Workflow 3회차: 195/196
- Sonnet 5.5 medium None 2회차: 195/196
- Sonnet 5.5 medium None 3회차: 195/196
- Sonnet 5.5 medium Core 1회차: 195/196
- Sonnet 5.5 medium Workflow 1회차: 195/196
- Sonnet 5.5 medium Workflow 3회차: 195/196
- Fable 5.2 medium None 1회차: 195/196
- Fable 5.2 medium None 2회차: 194/196
- Fable 5.2 medium None 3회차: 194/196
- Fable 5.2 medium Core 1회차: 195/196
- Fable 5.2 medium Core 2회차: 194/196
- Fable 5.2 medium Core 3회차: 195/196
- Fable 5.2 medium Workflow 1회차: 195/196
- Fable 5.2 medium Workflow 2회차: 195/196
- Fable 5.2 medium Workflow 3회차: 194/196
- 6 Astra low Workflow 3회차: 195/196
- 6.1 Sol medium None 1회차: 195/196
- 6.1 Sol medium Core 1회차: 195/196
- 6.1 Sol medium Core 2회차: 194/196
- 6.1 Sol medium Workflow 1회차: 195/196

검사별 기록은 [원본 데이터](superjson.json)의 각 실행 경로에서 확인할 수 있습니다.
