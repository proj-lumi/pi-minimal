# Pi minimal maintenance

- This is a personal Pi 1.x package, loaded directly from this Git repository. Keep one extension and zero installed runtime dependencies; use Pi-provided TypeBox and Node built-ins.
- Modes are instructions, not separate agents. No automatic model routing, background LLM calls, mandatory diagrams, or quiz panels. Exploration has no unsolicited tests. Exam practice follows source assessments.
- Progress is evidence, never a claim of permanent mastery. Preserve branch-aware restoration, separate user-turn checks, transfer, and delayed retrieval. Do not bypass user choices to skip or pause.
- Models stay within explicit openai-codex families. No fallback to other providers. Numeric release ordering and opt-out/pinning must remain tested.
- Read the installed Pi docs before changing extension APIs. Run `node --test --test-concurrency=1 test/*.test.mjs`; tests use the installed Pi loader and do not need API requests or package installation.
- Test against temporary agent directories. Do not commit credentials, lesson answers, session logs, private archives, or package dependencies. Configuration snapshots in config/*.example.json are secret-free reference copies, not automatically applied.
- Ask before changing personal settings, shell startup, workflow defaults, or paid services. Keep rollback documented. Never edit Pi's installed source to make this extension work.
