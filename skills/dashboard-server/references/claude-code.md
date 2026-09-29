# Dashboard write-access recovery in Claude Code

Reuse the dashboard directory reported by the failed operation. Otherwise resolve it from this plugin:

```text
node -e "console.log(require(process.argv[1]).getDashboardConfigDir())" <plugin-root>/dashboard/registry.js
```

Claude Code blocks writes outside the working directory only when its command sandbox is enabled; Codex configuration does not control it.
When the failed command ran inside that sandbox, retry only the registration command below once outside the sandbox through the Bash tool's sandbox bypass, which asks the user for approval.
Do not edit Claude Code settings to widen access unless the user asks; if the user wants a lasting fix, name the resolved directory as the path to allow for sandbox writes.
If the bypass is unavailable or denied, report registration as pending with the directory and observed error.

```text
node <plugin-root>/dashboard/register-project.js register --project-root <absolute-project-root>
```

Registration is complete only on `registered` or `no-op`.
If the command already ran outside the sandbox, report the remaining filesystem or lock error instead of treating every `EPERM` or `EACCES` as a sandbox failure.
