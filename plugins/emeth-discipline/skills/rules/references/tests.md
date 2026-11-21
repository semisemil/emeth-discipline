# Tests

- Choose cases by requested observable outcomes or concrete defects, not parameter, branch or combination enumeration.
- Derive expectations from requirements, contracts or worked examples, independently of implementation; assert required results or effects so incorrect behavior fails.
- For a defect, confirm the test fails before the fix.
- Exercise behavior through public interfaces, independently of private structure or incidental calls; mock only external boundaries, and keep the behavior under test running in real code.
