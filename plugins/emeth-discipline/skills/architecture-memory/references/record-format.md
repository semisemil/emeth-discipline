# Section routing and state

Use the document language for headings/prose. Place one routing comment directly below a level-2 heading; omit unused fields:

```markdown
## 공장 단말의 오프라인 운용
<!-- am: {"id":"AM-terminal-offline","paths":["src/terminal"],"terms":["현장 단말","키오스크","kiosk","offline"],"links":["AM-terminal-power"]} -->

**confirmed/current**

현장 단말은 망 점검 중에도 접수를 계속해야 한다. 조회 결과는 마지막 동기화 시점과 함께 표시한다.

근거: 사용자, 2026-09-05 망 점검 설명.
적용 범위: 공장 접수 단말. 사무실 관리 화면에는 이 요구를 적용하지 않는다.
```

`id` is stable and unique. `paths` contains normalized repository-relative file/directory prefixes; `terms` holds actual domain vocabulary and aliases. `links` declares required accompanying section IDs, all of which must exist. Ordinary Markdown links are optional navigation. Reserve `always: true` for short constraints affecting every architecture-dependent task. Put shared document prerequisites before its first level-2 heading so each read includes them.

Use a standalone `**confidence/lifecycle**` line. Confidence: `confirmed`, `inferred`, `proposed`, `unknown`. Lifecycle: `current`, `planned`, `historical`. `confirmed/planned` records an accepted target without asserting implementation. `confirmed/current` needs evidence for the wording; a user's reported fact remains attributed. If a table mixes states, put each state and evidence beside its claim instead of confirming the whole section. Missing labels mean unclassified.
