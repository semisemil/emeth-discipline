# Datadog Telemetry

Datadog can provide runtime evidence from metrics, monitors, dashboards, APM spans and traces, logs, incidents and notebooks.
Use the Datadog MCP tools relevant to the question:

| Evidence | Tools and relevant details |
|---|---|
| Service ownership and dependencies | `search_datadog_services`, `search_datadog_service_dependencies` |
| Dashboards and monitors | `search_datadog_dashboards`, `search_datadog_monitors`; retain relevant queries and thresholds |
| Metrics | `search_datadog_metrics`, `get_datadog_metric_context`, `get_datadog_metric`; retain units, tags and time-series context |
| Logs | `search_datadog_logs` with `use_log_patterns=true`; `analyze_datadog_logs` for counts |
| APM | `aggregate_spans`, `search_datadog_spans`, `get_datadog_trace` |
| Incidents | `search_datadog_incidents`, `get_datadog_incident`; investigate incidents around defensive code changes |

Bound telemetry searches by service, tags and the relevant time window, such as 30 days around a change.
A matching threshold, error pattern, metric trajectory or incident may bear on the question; check neighboring changes before attributing a correlated change to a particular PR.
Renamed or deleted metrics and retention limits can make historical telemetry unavailable; report this as a coverage gap, not a null result.

## What to return

For each relevant item, provide its type, title, link or identifier, owner or author and dates, the relevant condition, query or quote, and its relevance and evidence strength.
