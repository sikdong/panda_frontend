# AGENT Rules

- Do not insert the literal `r`n token into code. Use actual newlines only (LF/CRLF).
- Skip running `npm run build`.
- Any file that may include Korean text (`.html`, `.js`, `.jsx`, `.css`, `.md`) must be saved as UTF-8.
- Prefer `apply_patch` for edits. Do not use overwrite commands that can change encoding (for example `Set-Content` or `Out-File`) unless explicitly required.
- After editing files that contain Korean text, immediately reopen and verify the Korean strings are intact.
