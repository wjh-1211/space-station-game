# Project Engineering Rules

- Keep one current implementation. When an iteration replaces code, assets, tests, scripts, or configuration, delete the superseded version in the same change.
- Use stable names for current runtime assets and tools. Do not accumulate `v2`, `v3`, `old`, `legacy`, or backup copies in source-controlled paths.
- Do not add defensive fallback implementations, silent recovery, placeholder scenes, or duplicate code paths. Required asset failures must fail visibly with an actionable error.
- Validate real external boundaries such as user input, network responses, and file formats. Do not add speculative guards for internal invariants already enforced by types and ownership.
- Do not ship greybox or placeholder geometry as a completed scene. Interior scenes must be based on reviewed video frames and public source material.
- Update callers, tests, documentation, and generated-asset paths together so the repository always reflects the latest runnable state.
