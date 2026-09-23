---
name: tenet-me
description: Review a Design, legacy plan, or implementation through backward prerequisite tracing and forward counterexamples. Use when explicitly invoked or figure-it-out owns the workflow.
---

# Tenet Me

## Anchor the outcomes

Derive required outcomes from source intent and accepted contracts, independently of the candidate flow and tests. For each, identify a final observation that distinguishes fulfillment from a plausible violation.

Read related Memory only when it affects a traced condition; stored assertions retain their original evidentiary limits.

## Trace backward

For each outcome, trace necessary conditions, including omitted ones, backward through inputs, prior state, ordering, and dependencies. Identify what establishes each condition, when, and under which contract or evidence. End at supported initial conditions, external contracts, or explicit evidence boundaries, including unverified environmental assumptions.

Conditions must hold through the final observation across applicable paths, including relevant failures, retries, and reused state. Separate necessary conditions from replaceable mechanisms.

For example, if a completion notice promises durable storage, trace it back to evidence that storage is committed before the notice. A callback meaning only request acceptance leaves that guarantee unsupported.

An observed result alone does not establish its prerequisites; citing a claim back through Memory adds no evidence.

## Check gaps forward

For each suspected gap, trace a concrete input or state allowed by the contract and evidence forward to the final observation. A supported scenario violating a required outcome establishes a defect; insufficient evidence leaves an unresolved condition with a stated way to settle it.

Before implementation, assess proposed transitions and whether expected observations distinguish violations; future code and test results are not missing evidence. After implementation, distinguish code-inferred failures from failures observed in execution.

## Return the findings

Report material findings: affected outcome, broken or unsupported condition, sources, established forward scenario, and needed resolution. Keep the full trace internal; state the reviewed scope and unresolved limits.

Finish when every required outcome reaches supported conditions or explicit evidence boundaries and no material investigation or user decision remains actionable.
