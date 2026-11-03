# Emeth 벤치마크

SuperJSON의 Error 스택 직렬화 작업을 같은 요구 사항으로 실행한 결과입니다.

- **None**: 플러그인과 스킬 및 훅 비활성화
- **Core**: Emeth 활성화, 명시적인 스킬 호출 없음
- **Workflow**: [`/emeth-discipline:figure-it-out`](../../plugins/emeth-discipline/skills/figure-it-out/SKILL.md) 호출

| 모델 | 조건 | 공식 외부 검사 | 추가 진단 | 시간 | 비교용 추정 비용 |
| --- | --- | ---: | ---: | ---: | ---: |
| 6 Astra low | None | 196/196 | 4.3/14 | 4분 38초 | $1.110 |
| 6 Astra low | Core | 196/196 | 4.0/14 | 4분 56초 | $1.276 |
| 6 Astra low | Workflow | 195.7/196 | 8.3/14 | 11분 14초 | $5.351 |
| 6.1 Sol medium | None | 195.7/196 | 4.0/14 | 6분 20초 | $0.272 |
| 6.1 Sol medium | Core | 195.0/196 | 7.7/14 | 6분 46초 | $0.364 |
| 6.1 Sol medium | Workflow | 196/196 | 10.0/14 | 13분 39초 | $1.325 |
| 6.1 Terra medium | None | 191.7/196 | 4.0/14 | 2분 41초 | $0.076 |
| 6.1 Terra medium | Core | 195.7/196 | 4.3/14 | 2분 56초 | $0.095 |
| 6.1 Terra medium | Workflow | 196/196 | 5.3/14 | 6분 43초 | $0.330 |
| 6.1 Terra high | None | 195.0/196 | 4.3/14 | 3분 43초 | $0.101 |
| 6.1 Terra high | Core | 195.7/196 | 4.7/14 | 3분 19초 | $0.086 |
| 6.1 Terra high | Workflow | 195.7/196 | 4.0/14 | 6분 49초 | $0.340 |
| Sonnet 5.5 medium | None | 195.3/196 | 6.3/14 | 4분 0초 | $0.574 |
| Sonnet 5.5 medium | Core | 195.7/196 | 6.3/14 | 4분 38초 | $0.639 |
| Sonnet 5.5 medium | Workflow | 195.3/196 | 7.7/14 | 7분 13초 | $1.463 |
| Opus 5.5 medium | None | 195.0/196 | 6.3/14 | 5분 39초 | $1.372 |
| Opus 5.5 medium | Core | 194.3/196 | 6.7/14 | 6분 52초 | $1.684 |
| Opus 5.5 medium | Workflow | 194.7/196 | 5.7/14 | 19분 15초 | $3.761 |

모든 수치는 모델과 조건별로 3회 실행한 평균이며, 검사에 실패한 실행도 포함합니다.

## 측정 조건

측정 버전은 Emeth 0.25.0(`1e54785`)입니다.
같은 기준 코드와 과제 원문을 사용했습니다.
GPT는 Codex에서, Claude는 Claude Code의 auto 권한 모드에서 실행했습니다.
None과 Core의 사용자 입력은 동일하며, Workflow 입력 앞에만 스킬 호출을 붙였습니다.
Workflow의 하위 역할은 부모와 같은 모델과 추론 수준으로 고정했습니다.
설정이 다른 6회는 비교표에서 제외하고 [원본 데이터](superjson.json)에 별도로 기록했습니다.
사전 검증과 외부 채점은 측정 시간과 비용에서 제외했습니다.
비용은 부모와 하위 작업의 사용량을 합산한 API 단가 기준 추정치이며, 실제 청구액이 아닙니다.

[원본 데이터](superjson.json)

## None 대비 증가 배율

| 모델 | Core 비용 | Workflow 비용 | Core 시간 | Workflow 시간 |
| --- | ---: | ---: | ---: | ---: |
| 6 Astra low | 1.15배 | 4.82배 | 1.07배 | 2.43배 |
| 6.1 Sol medium | 1.34배 | 4.87배 | 1.07배 | 2.15배 |
| 6.1 Terra medium | 1.26배 | 4.37배 | 1.09배 | 2.50배 |
| 6.1 Terra high | 0.86배 | 3.36배 | 0.89배 | 1.84배 |
| Sonnet 5.5 medium | 1.11배 | 2.55배 | 1.16배 | 1.81배 |
| Opus 5.5 medium | 1.23배 | 2.74배 | 1.22배 | 3.41배 |

각 배율은 조건별 3회 평균을 같은 모델의 None 평균으로 나눈 값입니다.

## 회차별 결과

| 모델 | 조건 | 회차 | 공식 외부 검사 | 추가 진단 | 시간 | 비교용 추정 비용 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
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
| 6.1 Sol medium | Workflow | 1 | 196/196 | 9/14 | 15분 7초 | $1.348 |
| 6.1 Sol medium | Workflow | 2 | 196/196 | 11/14 | 16분 6초 | $1.515 |
| 6.1 Sol medium | Workflow | 3 | 196/196 | 10/14 | 9분 45초 | $1.112 |
| 6.1 Terra medium | None | 1 | 195/196 | 4/14 | 2분 50초 | $0.084 |
| 6.1 Terra medium | None | 2 | 184/196 | 4/14 | 2분 27초 | $0.068 |
| 6.1 Terra medium | None | 3 | 196/196 | 4/14 | 2분 47초 | $0.074 |
| 6.1 Terra medium | Core | 1 | 196/196 | 3/14 | 2분 47초 | $0.102 |
| 6.1 Terra medium | Core | 2 | 196/196 | 5/14 | 2분 3초 | $0.060 |
| 6.1 Terra medium | Core | 3 | 195/196 | 5/14 | 3분 59초 | $0.123 |
| 6.1 Terra medium | Workflow | 1 | 196/196 | 3/14 | 5분 1초 | $0.294 |
| 6.1 Terra medium | Workflow | 2 | 196/196 | 7/14 | 8분 2초 | $0.342 |
| 6.1 Terra medium | Workflow | 3 | 196/196 | 6/14 | 7분 7초 | $0.354 |
| 6.1 Terra high | None | 1 | 195/196 | 4/14 | 3분 27초 | $0.088 |
| 6.1 Terra high | None | 2 | 195/196 | 5/14 | 4분 6초 | $0.094 |
| 6.1 Terra high | None | 3 | 195/196 | 4/14 | 3분 35초 | $0.122 |
| 6.1 Terra high | Core | 1 | 196/196 | 5/14 | 3분 8초 | $0.084 |
| 6.1 Terra high | Core | 2 | 196/196 | 4/14 | 3분 40초 | $0.094 |
| 6.1 Terra high | Core | 3 | 195/196 | 5/14 | 3분 7초 | $0.082 |
| 6.1 Terra high | Workflow | 1 | 196/196 | 4/14 | 7분 46초 | $0.384 |
| 6.1 Terra high | Workflow | 2 | 196/196 | 4/14 | 6분 21초 | $0.284 |
| 6.1 Terra high | Workflow | 3 | 195/196 | 4/14 | 6분 21초 | $0.351 |
| Sonnet 5.5 medium | None | 1 | 196/196 | 6/14 | 3분 49초 | $0.630 |
| Sonnet 5.5 medium | None | 2 | 195/196 | 6/14 | 3분 42초 | $0.540 |
| Sonnet 5.5 medium | None | 3 | 195/196 | 7/14 | 4분 28초 | $0.551 |
| Sonnet 5.5 medium | Core | 1 | 195/196 | 6/14 | 4분 34초 | $0.628 |
| Sonnet 5.5 medium | Core | 2 | 196/196 | 7/14 | 3분 54초 | $0.589 |
| Sonnet 5.5 medium | Core | 3 | 196/196 | 6/14 | 5분 26초 | $0.700 |
| Sonnet 5.5 medium | Workflow | 1 | 195/196 | 9/14 | 9분 40초 | $1.866 |
| Sonnet 5.5 medium | Workflow | 2 | 196/196 | 7/14 | 6분 48초 | $1.700 |
| Sonnet 5.5 medium | Workflow | 3 | 195/196 | 7/14 | 5분 11초 | $0.821 |
| Opus 5.5 medium | None | 1 | 195/196 | 7/14 | 5분 2초 | $1.404 |
| Opus 5.5 medium | None | 2 | 196/196 | 6/14 | 6분 27초 | $1.417 |
| Opus 5.5 medium | None | 3 | 194/196 | 6/14 | 5분 27초 | $1.296 |
| Opus 5.5 medium | Core | 1 | 195/196 | 7/14 | 6분 2초 | $1.697 |
| Opus 5.5 medium | Core | 2 | 195/196 | 6/14 | 6분 44초 | $1.685 |
| Opus 5.5 medium | Core | 3 | 193/196 | 7/14 | 7분 50초 | $1.669 |
| Opus 5.5 medium | Workflow | 1 | 194/196 | 6/14 | 20분 14초 | $3.651 |
| Opus 5.5 medium | Workflow | 2 | 195/196 | 6/14 | 29분 22초 | $4.255 |
| Opus 5.5 medium | Workflow | 3 | 195/196 | 5/14 | 8분 10초 | $3.377 |

## 공식 검사 실패

아래 실행은 수정본으로 대체하지 않고 평균에 포함했습니다.

- 6 Astra low Workflow 3회차: 195/196
- 6.1 Sol medium None 1회차: 195/196
- 6.1 Sol medium Core 1회차: 195/196
- 6.1 Sol medium Core 2회차: 194/196
- 6.1 Terra medium None 1회차: 195/196
- 6.1 Terra medium None 2회차: 184/196
- 6.1 Terra medium Core 3회차: 195/196
- 6.1 Terra high None 1회차: 195/196
- 6.1 Terra high None 2회차: 195/196
- 6.1 Terra high None 3회차: 195/196
- 6.1 Terra high Core 3회차: 195/196
- 6.1 Terra high Workflow 3회차: 195/196
- Sonnet 5.5 medium None 2회차: 195/196
- Sonnet 5.5 medium None 3회차: 195/196
- Sonnet 5.5 medium Core 1회차: 195/196
- Sonnet 5.5 medium Workflow 1회차: 195/196
- Sonnet 5.5 medium Workflow 3회차: 195/196
- Opus 5.5 medium None 1회차: 195/196
- Opus 5.5 medium None 3회차: 194/196
- Opus 5.5 medium Core 1회차: 195/196
- Opus 5.5 medium Core 2회차: 195/196
- Opus 5.5 medium Core 3회차: 193/196
- Opus 5.5 medium Workflow 1회차: 194/196
- Opus 5.5 medium Workflow 2회차: 195/196
- Opus 5.5 medium Workflow 3회차: 195/196

검사별 기록은 [원본 데이터](superjson.json)의 각 실행 경로에서 확인할 수 있습니다.
