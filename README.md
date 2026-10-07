# Pi Minimal

**Four workflows. Six explicit model slots. No extra agents.**

My personal [Pi](https://pi.dev) 1.x setup, built around **GPT Codex + OpenCode Go** for coding, curious exploration, exam preparation, and everyday help—without turning every conversation into a lesson.

This is an opinionated setup for how I work and learn, not a universal model ranking or framework. I'm sharing the extension, prompts, and reference configs so others can copy what fits and adapt the rest.

- **Choose the workflow:** focused coding, open-ended study, assessment-matched practice, or direct general help.
- **Choose the model:** two provider banks with fast, balanced, and deep slots. No automatic routing or cross-provider fallback.
- **Track evidence, not “mastery”:** exam progress requires independent answers, transfer, and later retrieval.
- **Keep it small:** one extension, no installed runtime dependencies, no build step, no background model calls, and no custom quiz UI.

## Make it yours

- Start with [`config/models.json`](config/models.json) for my GPT/Go model families, thinking defaults, and fast/balanced/deep roles. Adjust these to models available in your own catalog and accounts.
- Adapt [`modes/`](modes/) to your coding, learning, and assessment preferences.
- Use [`config/settings.example.json`](config/settings.example.json) and [`config/global-instructions.example.md`](config/global-instructions.example.md) as references, not drop-in replacements for your settings.
- Keep your credentials, personal notes, and session history outside this repository. The optional STT config is a reference for a separate voice extension, not a bundled feature.

## A typical session

Illustrative commands, not a recorded model conversation:

```text
/study Explain how HTTP caching works
/coding Fix the cache invalidation bug in this repository
/brain gpt deep
/exam Practice caching questions using this past paper
/progress
/general Help me draft a short email
```

Study mode does not launch unsolicited quizzes. Exam mode follows supplied course material and assessment examples. Switching modes changes instructions, not agents; ordinary tools remain available.

## Get started

Requires an existing **Pi 1.x** installation and **Node.js 22.19+**. Authenticate your chosen provider through Pi's `/login`. Provider subscriptions, quotas, and charges are separate from this package.

From a local checkout, try the extension for one session:

```sh
pi -e /absolute/path/to/pi-minimal
```

To keep it enabled, run:

```sh
pi install /absolute/path/to/pi-minimal
```

This adds the local package to Pi's settings; it loads directly from the checkout. No `npm install` or build is needed. Review extension code before loading it: extensions execute with your user's permissions.

Start a fresh session after installation to avoid mixing earlier workflow instructions with the new ones. Example settings are references only—do not replace your personal settings wholesale.

## Commands

| Command | What it does |
| --- | --- |
| `/study [topic]` | Explore with examples; no unsolicited tests |
| `/exam [course/topic]` | Prepare using actual sources and assessment formats |
| `/coding [task]` | Make focused, maintainable changes |
| `/general [task]` | Get direct help without a teaching or setup workflow |
| `/brain` | Pick a model bank and slot |
| `/brain go deep` | Explicitly select the Go deep slot |
| `/brain gpt deep xhigh` | Request a thinking level, if supported |
| `/progress` | Show exam evidence without a model call |

Mode commands use the current bank: `opencode-go` stays Go; otherwise GPT is selected. Study, exam, and coding request balanced; general requests fast. A command without a topic only changes mode and waits for your next message. Mode commands reset model/thinking to their slot defaults; use `/brain` or native `/thinking` afterward to override.

`pi --workflow study` selects initial instructions without overriding native model/thinking flags or resumed model selection. Plain startup uses general mode and leaves native model selection intact. Missing models or authentication produce a message, never a cross-provider fallback.

## Explicit model selection

[`config/models.json`](config/models.json) defines two banks, each with fast, balanced, and deep roles:

| Bank | Provider | Slots |
| --- | --- | --- |
| GPT | `openai-codex` | fast · balanced · deep |
| Go | `opencode-go` | fast · balanced · deep |

These are configurable roles, not measured capability rankings. `/brain` resolves the latest available matching model when you invoke it and reports the actual thinking level. Image support and supported reasoning levels vary by model.

An optional [local launch wrapper](docs/model-sync.md) reconciles the managed model scope against Pi's cached catalog. It compares numeric releases correctly, supports pinning and opt-out, and never switches a running conversation in the background. It makes no network requests or hosted-model calls.

No Zen/OpenRouter fallback is configured. Local provider selection cannot prevent provider-side overage billing; review your plan and any “Use balance” setting separately. Catalog updates may change availability, cost, or behavior.

## Exam progress that means something

The `exam_progress` tool is active only in exam mode. It records evidence on the current Pi session branch:

1. One correct answer remains **practice**.
2. Two independent answers on separate learner turns, including a new-situation **transfer** problem, can become **ready**.
3. A later unhinted retrieval after another concept or at least ten minutes can become **retained**.

Repeated tasks do not add independent evidence. Hints or errors reopen practice; skipping never fabricates success. **Ready is not mastered, and retained is not permanent mastery.** The learner can deepen, move on, skip, or pause.

The extension enforces evidence-counting and delay rules, not grading correctness. The current model evaluates answers—there is no separate grader call.

Use `/resume` to continue the same course session. Tree navigation restores the selected branch; compaction leaves evidence entries intact. New sessions have separate progress. Keep different courses in separate sessions, or request a portable checkpoint before switching.

## Instructions and boundaries

- [`modes/`](modes/) contains the four editable workflows. Only the selected mode enters the prompt.
- Coding, study, and exam also receive [`project-setup.md`](modes/project-setup.md), which asks for missing project purpose before creating project instructions.
- General mode filters directory context files from structured context, keeping user-level context. It does not erase history, block file reads, or disable other extensions.
- Global `~/.pi/agent/AGENTS.md` holds personal preferences; project `AGENTS.md` files hold local conventions and sources. Example global instructions are [provided separately](config/global-instructions.example.md), not applied automatically.

Modes are **prompt guidance, not security sandboxes**. Model compliance, source quality, and grading quality still matter. `/reload` reloads edits; a fresh session avoids old instructions remaining in the transcript. `--no-session` disables persistence, not context loading.

## Development

```sh
node --test --test-concurrency=1 test/*.test.mjs
```

Tests use Node's test runner and the installed Pi loader, with temporary agent directories and no hosted-model requests. The integration harness locates the SDK by following `pi` on `PATH`. If your installation uses a standalone launcher and reports “Cannot locate the installed Pi SDK,” prepend the installed release's `node_modules/.bin` directory to `PATH` for the test command.

| Path | Responsibility |
| --- | --- |
| `extensions/minimal.ts` | Commands, prompt selection, branch restoration, exam tool |
| `modes/` | Workflow instructions and shared project setup |
| `lib/progress.mjs` | Deterministic evidence rules |
| `lib/models.mjs` | Model-family selection and scope reconciliation |
| `scripts/sync-models.mjs`, `bin/pi-minimal` | Optional local launch preflight |
| `config/*.example.*` | Reference configuration; never auto-applied |
| `test/` | Logic and installed-loader integration checks |

Coverage includes numeric model ordering, provider boundaries, pinning, invalid catalogs, idempotent writes, context filtering, tool activation, branch restoration, and evidence rules. Tests do not establish teaching quality, provider latency, or full interactive-terminal behavior.

## Remove or roll back

Run `pi remove /absolute/path/to/pi-minimal` using the source you installed, then start a new session. For a one-session `-e` trial, simply omit the flag next time.

If you enabled the optional wrapper, stop invoking it. If you manually changed personal settings, restore only the relevant fields from your own backup after reviewing later edits. Removing the package does not undo settings previously written by model sync, delete session history, revoke credentials, or cancel provider subscriptions.

## License

[MIT](LICENSE) © 2026 Miguel Luis Jumawan. You can copy, modify, and redistribute this code and configuration while retaining the copyright and license notice. Provider accounts, subscriptions, model access, and third-party software remain subject to their own terms.
