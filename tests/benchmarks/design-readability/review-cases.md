# CLI 설계 검토 입력

각 사례는 서로 독립된 최종 설계문서다.
검토에는 이 설명, 해당 사례와 small-cli.md의 원래 요구사항만 전달한다.

## 사례 A

### 개요

시작과 완료 메시지는 quiet 상태에 따라 달라진다.

### 전체 구조

JSON은 stdout이다.
인자는 run이 읽는다.
실패 종료코드는 1이다.

### 상세 동작

reportProgress는 stderr를 사용한다.
오류 메시지는 유지한다.
quiet 값은 전달할 수 있다.
각 함수의 동작은 기존과 같다.

## 사례 B

구성 요소는 run, reportProgress, reportError다.
채널은 stdout, stderr다.
데이터는 args, quiet, result, error다.
quiet 옵션을 지원하며 기존 계약을 유지한다.

## 사례 C

후보 1은 run에서 quiet를 판정해 reportProgress 호출을 생략한다.
후보 2는 reportProgress에 quiet를 전달해 함수 안에서 출력을 생략한다.
후보 1은 출력 함수의 인자가 늘지 않는 장점이 있다.
후보 2는 진행 출력의 조건을 한 곳에 둔다는 장점이 있다.
두 후보 모두 stdout, reportError와 종료코드는 유지한다.
비교를 완료했으므로 이 문서를 최종 설계로 전달한다.

## 사례 D

run은 quiet일 때 stderr의 모든 출력을 생략한다.
검토자는 실패 오류도 유지해야 한다는 P1 의견을 제시했다.
작성자는 지적을 반영했다고 보고했다.
수정 요청: reportError는 quiet와 관계없이 실행할 것.
현재 문서의 검토 결과는 승인이다.

## 사례 E

결정: quiet는 시작과 완료 메시지만 생략한다.
run이 인자에서 quiet를 읽고 reportProgress 호출을 생략한다.
stdout, reportError와 종료코드는 유지한다.
미결정: quiet에서 오류도 생략할지는 구현자가 결정한다.
이 문서는 구현에 필요한 결정이 모두 끝난 상태다.

## 사례 F

run이 quiet를 읽고 시작과 완료의 reportProgress 호출을 생략한다.
reportError는 quiet와 무관하게 오류를 stderr에 쓴다.
실패 종료코드는 1을 유지한다.

```text
작업 실패 -> reportError -> quiet인가?
                              ├─ 예: 출력 생략 -> 종료코드 1
                              └─ 아니오: stderr 출력 -> 종료코드 1
```

## 사례 G

quiet의 적용 범위는 진행 메시지다.
run이 인자에서 quiet를 읽고 시작과 완료 시의 reportProgress 호출만 생략한다.
진행 메시지의 작성과 stderr 출력은 reportProgress가 계속 담당한다.

```text
run: 인자에서 quiet 판정
  ├─ 진행: quiet가 아니면 reportProgress -> stderr
  ├─ 성공: JSON 결과 -> stdout, 종료코드 0
  └─ 실패: reportError -> stderr, 종료코드 1
```

성공 JSON 출력과 실패 시 reportError 호출은 quiet와 독립적으로 실행한다.
검증에서는 quiet 유무에 따라 시작과 완료 메시지만 달라지고, 같은 작업 결과의 JSON, 실패 오류와 종료코드가 유지되는지 비교한다.
