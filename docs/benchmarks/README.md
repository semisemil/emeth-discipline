# Emeth Discipline 벤치마크

SuperJSON의 Error 스택 직렬화 작업을 같은 요구 사항으로 실행한 결과입니다.

- **None**: 플러그인 미사용
- **Core**: 플러그인 활성화
- **Workflow**: [`$emeth-discipline:figure-it-out`](../../skills/figure-it-out/SKILL.md) 호출

| 모델 | 조건 | 공식 외부 검사 | 추가 진단 | 시간 | 비교용 추정 비용 |
| --- | --- | ---: | ---: | ---: | ---: |
| 6 Astra low | None | 196/196 | 3/14 | 4분 57초 | $0.973 |
| 6 Astra low | Core | 196/196 | 5/14 | 4분 23초 | $0.929 |
| 6 Astra low | Workflow | 196/196 | 7/14 | 7분 54초 | $1.990 |
| 6 Astra low | Workflow (한 세션) | 196/196 | 4/14 | 6분 43초 | $1.611 |
| 5.6 Sol Med | None | 196/196 | 5/14 | 14분 55초 | $1.396 |
| 5.6 Sol Med | Core | 196/196 | 4/14 | 8분 36초 | $1.027 |
| 5.6 Sol Med | Workflow | 196/196 | 8/14 | 12분 48초 | $1.647 |
| 6 Sol Med | None | 196/196 | 6/14 | 7분 46초 | $0.375 |
| 6 Sol Med | Core | 196/196 | 5/14 | 9분 10초 | $0.415 |
| 6 Sol Med | Workflow | 196/196 | 4/14 | 12분 10초 | $1.142 |

공식 외부 검사는 신규 80개와 회귀 116개입니다. 추가 진단은 별도 14개 항목입니다. 각 행은 1회 측정 결과입니다.

[기존 모델의 원시 측정 데이터](results.json)

[6 Astra low Workflow 측정 상세](workflow-session-20260918.md)

## Workflow 비용

API 단가 기준 추정 비용입니다.

| 단계 | 6 Astra low | 5.6 Sol Med |
| --- | ---: | ---: |
| 준비 세션 | $0.743 | $0.580 |
| 구현 및 검증 세션 | $1.248 | $1.066 |
| **합계** | **$1.990** | **$1.647** |

## WebAgent와 SubAgent 비용

같은 두 작업을 위임했을 때의 API 단가 기준 추정 비용입니다.

| 작업 | SubAgent | WebAgent |
| --- | ---: | ---: |
| 코드 검토 | $0.486 | $0.167 |
| 작업 배치 | $0.319 | $0.168 |

[측정 상세](webagent-sol-comparison.md)
