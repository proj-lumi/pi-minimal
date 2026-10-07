# Optional model-scope sync

The extension works without a shell wrapper. Use this only if you want the six managed model slots reflected in Pi's saved cycling scope.

## Run explicitly

After reviewing and backing up your Pi settings, invoke the wrapper from any project directory:

```sh
/absolute/path/to/pi-minimal/bin/pi-minimal
```

It runs a local metadata reconciliation before launching the unmodified Pi executable. It does not install the extension; [load the package first](../README.md#get-started). No shell startup changes are required.

The wrapper finds Pi on `PATH`. Set `PI_MINIMAL_REAL_PI` to an absolute Pi executable path if needed. Administrative and information-only invocations bypass sync.

## What changes

[`config/models.json`](../config/models.json) is the source of truth. The resolver:

- Reads `models-store.json` and `settings.json` under `PI_CODING_AGENT_DIR`, or `~/.pi/agent` by default.
- Selects the latest known matching family using anchored patterns with captured numeric versions (`6.10 > 6.9`).
- Replaces managed scope IDs and thinking defaults, preserving unrelated settings and extra manually added models.
- Excludes other suffixes unless explicitly configured and never crosses providers.
- Preserves settings if a required slot is missing or metadata is invalid.
- Writes only when changed, using atomic rename and an optimistic concurrent-edit check.

There are no network requests, credentials, polling, background model calls, or mid-session switches. Avoid editing settings while starting multiple Pi processes: the concurrent-edit check is not a global transaction lock.

## Freshness and overrides

Pi maintains its own catalog. Metadata refreshed during startup becomes available to the wrapper on the following launch. To refresh explicitly, run `pi update --models`, then start the wrapper again. That command may access the network; it updates model metadata, not packages.

Launching Pi directly bypasses sync. The extension still loads with the last saved scope, and `/brain` resolves against the running registry when explicitly invoked. Native `--models` flags and trusted project settings retain their precedence. `/reload` is not a guarantee of replacing the running scope; restart after scope changes.

Add a `"pin"` field containing an exact model ID to a slot to freeze it. Set `"autoScope": false` to stop saved-scope rewrites and use native `/scoped-models` instead. With automatic sync on, changes to managed IDs/thinking defaults are regenerated; unrelated entries remain intact. Renamed families require reviewed pattern changes.

## Rollback

Stop invoking the wrapper, or set `autoScope` to `false` in this checkout's config. This prevents future rewrites but does not restore earlier settings. To restore an earlier scope, review your backup and restore only the relevant settings fields, preserving unrelated later changes.
