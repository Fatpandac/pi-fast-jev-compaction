# pi fast-jev-compaction

Global pi extension that intercepts `session_before_compact` and uses
[`tamaratran/fast-jev-compaction`](https://github.com/tamaratran/fast-jev-compaction)
as a git submodule instead of pi's default LLM summarizer.

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

## Upstream

`vendor/fast-jev-compaction` is a git submodule pinned to a specific upstream commit.
It is never modified — all pi-specific behaviour lives in `index.ts`.

Verify upstream is untouched:

```sh
git status --porcelain      # empty means upstream is clean
git submodule status
```

Fresh clone / after pulling:

```sh
git submodule update --init
cd vendor/fast-jev-compaction && npm install && npm run build
```

Bump upstream deliberately:

```sh
cd vendor/fast-jev-compaction
git fetch && git checkout <new-commit> && npm install && npm run build
cd ../.. && git add vendor/fast-jev-compaction && git commit -m "bump fast-jev-compaction"
```

Re-measure `keepThreshold` after a bump — the default is calibrated against Jev's score
distribution, not an upstream constant.

## Credits and license

This is an independent pi adapter for
[`tamaratran/fast-jev-compaction`](https://github.com/tamaratran/fast-jev-compaction).
It is not affiliated with or endorsed by the upstream project.

The upstream project is Copyright (c) 2025 and licensed under the
[MIT License](vendor/fast-jev-compaction/LICENSE). Its source and complete license
notice are preserved unchanged in the `vendor/fast-jev-compaction` submodule.
All pi-specific integration code lives outside that submodule.
