# Databricks Analytics & System Tables

Databricks can provide product events, usage and billing events, experiment exposures and outcomes, warehouse telemetry, dbt lineage, and exploratory notebooks.
Discover the actual warehouse, catalog, database, schemas, tables and columns before querying: names and conventions are organization-specific.
Use `SHOW TABLES` and `DESCRIBE TABLE` against discovered schemas and tables.

Use the Databricks SQL MCP's `execute_sql_read_only`; if it returns a `statement_id`, poll with `poll_sql_result` instead of rerunning the query.
Bound event queries by their timestamp and `system.query.history` by `start_time`, normally to about 30 days on either side of the change.
System tables can include `system.query.history`, `system.compute.warehouses`, `system.billing.*` and `system.access.audit`; verify availability.

Prefer a verified typed, deduplicated dbt model to raw events when available.
Model names may follow `stg_<source>_<event_name_with_underscores>`; discover the actual model and columns rather than assuming the convention.
Models may expose `_timestamp`, `_id`, `_auth_id`, `_request_id`, `event_name`, typed `properties_<name>` and client context fields.
Raw events can contain duplicates and untyped `properties_json`; use them when a model is absent, a historical property is missing, or the model's refresh lag excludes recent events, and deduplicate by the actual event ID.

## Evidence patterns

- Daily event counts around the change can show a launch or deprecation; check for instrumentation changes before interpreting a volume shift as user behavior.
- Pre-change distributions such as median, p99 and maximum can inform a threshold investigation.
- Experiment exposure and outcome tables can show variant counts or a ship decision for the relevant flag.
- Filter query history by table or symbol and time; duration, bytes read and query counts can inform migration, backfill or performance questions.
- A relevant dbt model's repository history is a cross-source lead for the source-control investigator.
- A decline in error-classifying events after a defensive change is circumstantial evidence, not proof of cause.

A missing historical window due to retention or model creation is a coverage gap, not a zero-activity result.
SQL MCP cannot query Databricks notebooks; identify a suspected notebook rationale as a gap.

## What to return

For each relevant finding, provide its type, fully qualified table, exact query, time window, compact numeric summary, relationship to the change date and evidence strength.
Return counts, percentiles and first/last-seen timestamps where relevant, not raw rows.
