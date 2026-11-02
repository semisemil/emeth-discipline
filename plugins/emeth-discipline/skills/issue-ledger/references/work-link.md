# 연결 작업

연결 이슈는 작업 대상 `PL-*`와 문서의 `related_issues`다.
알려진 연결은 `show`로 확인하고, 연결이 없으면 [../SKILL.md: Record](../SKILL.md#record)에 따라 기존 이슈를 찾거나 등록한다.
지명된 이슈가 없으면 해당 연결과 상태 변경을 보류하고 필요한 판단을 확인한다.
완료된 이슈와 같은 목표를 계속하는 요청이면 이슈를 먼저 재개한 뒤 연결한다.
취소 또는 대체된 이슈는 취소 범위와 대체 대상을 확인해 이번 요청의 이슈를 선택한다.
그 연결에 의존하지 않는 허용된 작업은 계속한다.

Design과 기존 Plan 또는 Spec의 `related_issues`에 이슈 ID를 저장한 뒤 이슈를 연결한다.
같은 경계에서 근거와 진행 상태도 갱신한다면 다음 연산을 `update`의 `batch.operations`에 넣는다.
최종 상태 변경보다 연결을 먼저 배치한다.

```json
{"type":"link_work","work":{"kind":"design","id":"DESIGN-0001","location":".emeth/designs/DESIGN-0001-example/DESIGN.md"}}
```

`update`는 모든 문서의 역링크, 근거와 최종 상태를 검증한 뒤 한 번 저장한다.
실패하면 원래 이슈 바이트를 보존한다.
연결만 바꿀 때는 기존 `link-work` 명령을 사용할 수 있으며 같은 입력은 `no-op`이다.
해당 명령의 옵션은 `link-work --help`, 일괄 갱신의 계약은 [v2-operations.md: CLI](v2-operations.md#cli)에 둔다.

Design 또는 기존 Spec과 연결된 구현은 그 문서의 계약을 기준으로 한다.
요청과 계약이 다르면 `development-design`으로 맞춘다.
연결 문서가 없는 구현은 이번 요청의 허용 범위에서 계속한다.
준비 때 확인한 근거는 재사용한다.
이슈 선등록 후, 한 대화에서 끝나는 짧은 변경의 문서 연결과 진행 상태는 최종 검증 결과와 함께 갱신한다.
검토, 의존 작업, 주요 진척 또는 인계에 필요한 기록은 해당 시점에 갱신한다.

최종 통과 뒤 증거 계약으로 해결을 판단한다.
미충족 조건이 있으면 활성 상태를 유지한다.
분할 계획은 Design과 연결하고 대응된 마일스톤만 갱신한다.
독립 결과는 [../SKILL.md: Boundaries](../SKILL.md#boundaries)에 따라 기록한다.
