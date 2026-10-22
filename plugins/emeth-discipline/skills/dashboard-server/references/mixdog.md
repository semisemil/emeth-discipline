# Dashboard write access in Mixdog

Preserve the saved Issue, Design, or Memory; report a registration failure separately.
Read Mixdog's active shell/filesystem policy and inspect the actual failed path before changing permissions.
The dashboard uses `%APPDATA%/emeth/dashboard` on Windows and `$XDG_CONFIG_HOME/emeth/dashboard` or `~/.config/emeth/dashboard` elsewhere.
Use an existing writable configuration location or the supported `XDG_CONFIG_HOME` override on non-Windows systems, and use the same setting for later dashboard commands.
Request permission only when the active runtime requires it for the necessary path.
Do not write a Codex `config.toml` or disable Mixdog's protection to resolve a Mixdog error.
After resolving the specific access failure, retry the failed dashboard command.
Registration completes on `registered` or `no-op`; opening completes on `opened`.
