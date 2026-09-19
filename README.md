# pi fast-jev-compaction

Global pi extension that intercepts `session_before_compact` and uses the vendored
`tamaratran/fast-jev-compaction` library instead of pi's default LLM summarizer.

## Config

Required:

```sh
export TYPESAFE_API_KEY=...
# or
export PI_FAST_JEV_API_KEY=...
```

Optional env vars:

- `PI_FAST_JEV_MODEL` default `jev-latest`
- `PI_FAST_JEV_BASE_URL`
- `PI_FAST_JEV_KEEP_THRESHOLD` default `0.2` (library default 0.5 drops every tool call on pi sessions)
- `PI_FAST_JEV_PRESERVE_RECENT_MESSAGES` default `6` (pins recent tool calls; 0 makes Jev drop everything)
- `PI_FAST_JEV_MAX_STATE_TOKENS` default `25000`
- `PI_FAST_JEV_MAX_REQUEST_TOKENS` default `30000`
- `PI_FAST_JEV_TRUNCATE_HEAD_CHARS` default `300`
- `PI_FAST_JEV_MIN_REDUCTION_RATIO` default `0.25` (falls back to pi default below this)

Reload pi with `/reload` after changing this extension.
