# dsh-graphify

> Give DeepSeek Harness a current, local map of your codebase.

`dsh-graphify` connects [Graphify](https://github.com/Graphify-Labs/graphify)'s code knowledge graph to DeepSeek Harness (DSH). It helps an agent move from a question to the relevant symbols, dependencies, architectural communities, and change impact without treating a repository as an unstructured pile of files.

![dsh-graphify connects DeepSeek Harness to a Graphify knowledge graph](assets/dsh-graphify-overview.png)

## Why use it?

Graphify is the local graph engine; `dsh-graphify` is the DSH-native layer that makes it practical in an agent session.

| With a raw code search workflow | With dsh-graphify |
| --- | --- |
| The agent repeatedly guesses paths, greps, and reads broad files. | The agent can start from symbols, dependency paths, communities, and graph-backed project context. |
| A graph can silently describe an older checkout. | Freshness checks identify stale graphs and can warn or safely run an incremental code update. |
| Every graph capability is exposed, even when a smaller model needs only navigation. | Compact mode provides six focused tools for local 20B–30B models; full mode exposes the complete set. |
| MCP setup and failures are separate from the DSH session. | The plugin resolves the active session project, manages the Graphify process, and provides `graphify_status` for diagnosis. |

This is not a claim that a graph replaces source reading or tests. It gives the agent a reliable starting map, so it can spend its context budget on the code that matters.

## Install and use it

### Before you start

You need a working DSH profile, Node.js 22.18 or later, Python 3.10 or later, and [`uv`](https://docs.astral.sh/uv/). The plugin is tested on macOS and Ubuntu Linux; Windows is not yet verified.

### 1. Add the plugin to your DSH profile

```sh
dsh plugin --profile <profile> add dsh-graphify
```

Replace `<profile>` with the profile you normally use to run DSH. Installing from
this repository works the same way and pins a commit rather than a registry
release:

```sh
dsh plugin --profile <profile> add github:vviLab/dsh-graphify-plugin
```

The bundle activates itself; you do not need to hand-edit a Cordis configuration
for the default setup. `lib/` ships prebuilt in the repository, so a git install
runs the same code a release does.

### 2. Install the local Graphify runtime

```sh
uv tool install 'graphifyy[mcp,openai]==0.9.57'
```

Zero-install works too: with only `uv` on `PATH` (which also provides `uvx`) and
no `graphify` at all, the plugin runs Graphify through
`uvx --from 'graphifyy[...]'`, which assembles a throwaway environment instead of
installing anything. `uvx` never reads the session project, so a repository
holding `pyproject.toml` is left untouched; when `uvx` is missing from `PATH` the
same command runs as `uv tool run --from ...`.

The `openai` extra is not optional for a semantic build: `graphifyy` imports its
LLM SDK lazily, so a runtime without it parses code and then fails every
semantic chunk with `the 'openai' package is required for this backend`. Add
`anthropic` instead of `openai` when the backend is `claude`. The plugin's own
`uvx` fallback asks for the extra matching the selected backend, so this manual
install is only needed when you want a pinned tool on `PATH`.

If Graphify is unavailable, DSH can still start. Ask for `graphify_status` after
installing it; the plugin discovers the runtime on the next check or tool call,
without a DSH restart. With no installed runtime, the plugin can also fall back
to `uvx --from 'graphifyy==<version>'`, which is what `graphifyVersion` pins;
the MCP side runs the package's `graphify-mcp` entry point the same way.

### 3. Build a graph for a repository

Start DSH from the repository you want to explore:

```sh
cd /path/to/your/repository
dsh --profile <profile>
```

Then, in the DSH conversation, run:

```text
/graphify
```

The command performs a full build and writes `graphify-out/graph.json` in that repository. Semantic extraction runs per document, so build a code repository rather than a directory that also holds downloads, exports, or media: point `/graphify build <path>` at the subdirectory, add a `.graphifyignore` (gitignore syntax) for vendored trees, or pass `--code-only` to skip documents, papers, and images entirely. Check the result with:

```text
graphify_status
```

### 4. Ask architectural questions

Try requests that benefit from relationships instead of filename matching:

```text
What are this repository's entry points and the most connected modules?
```

```text
Before I change this interface, show the dependency path to its callers and summarize the likely blast radius.
```

```text
Which community owns authentication, and where does it connect to the API layer?
```

## Pick a mode

The default `full` mode exposes the complete Graphify capability set, including communities, god nodes, and pull-request impact. Use it when your model has ample tool-selection capacity or you need those specialist queries.

For local 20B–30B models, use `compact`. It registers six high-frequency tools: status, graph query, node inspection, neighbours, shortest path, and the session-scoped graph resource. Fewer choices help smaller models use the graph consistently.

Add an override only when you need one:

```yaml
- insert:
    - id: dsh-graphify
      name: dsh-graphify
      config:
        toolMode: compact
        freshness:
          mode: warn
```

`freshness.mode` is `warn` by default. Choose `auto` when you want the plugin to coalesce safe incremental updates before a query; choose `off` only when you deliberately accept a static graph. A full `/graphify` build is required after documentation or other non-code changes, because incremental Graphify updates cover code extraction only.

## What the plugin adds

- **Session-aware project resolution:** graph requests follow the active DSH workspace. Model-invoked access outside that workspace is blocked by default.
- **Guidance that matches the session:** the system prompt section states whether this session's project actually has a graph, and names `/graphify build` when it does not. `compact` shortens the same section by dropping the specialist-tool lines, so the prose never names a tool the mode does not register.
- **Freshness you can inspect:** `graphify_status` reports the resolved project, graph path, runtime availability, connection state, and whether the graph matches the indexed source state.
- **Safe update policy:** incremental updates run only for changes the plugin can prove are code-only; otherwise it keeps the graph marked stale and asks for a full build.
- **DSH-native operation:** `/graphify` builds or updates the receiving session's project and shows its durable result in DSH Web.
- **Credentials that stay put:** semantic extraction resolves an LLM key from the DSH credential store, then the launching environment, then an optional write-only literal, and hands it to Graphify under the variable the chosen backend reads.
- **Resilient local runtime:** the plugin discovers Graphify automatically and reconnects after unexpected MCP-process exits.

## Common tasks

| Goal | In DSH |
| --- | --- |
| Build or fully refresh the graph | `/graphify` or `/graphify build` |
| Update changed code files | `/graphify update` |
| Diagnose installation, project selection, or stale data | `graphify_status` |
| Find a symbol and related architecture | Ask the agent to query the graph, then inspect the returned nodes and paths. |
| Analyse a risky change | Ask for dependents, shortest paths, communities, or PR impact before editing. |

`/graphify update` is intentionally conservative. Run `/graphify` after changes to Markdown, package metadata, configuration, or any other non-code source that should be represented in the graph.

## Let semantic extraction use an LLM key

Graphify indexes code with a local AST pass that needs no credentials. Documents, papers, and images go through an LLM instead, so a build over a documentation-heavy tree stops with:

```text
error: no LLM API key found (8351 doc/paper/image file(s) need semantic extraction).
```

The plugin resolves that key itself, in this order:

1. **The DSH credential store.** `apiKeyEnv` (default `DEEPSEEK_API_KEY`) is looked up through `ctx.credentials`, so a key already saved for a DSH model provider is reused without copying it anywhere.
2. **The launching environment.** If the store has no value, the same variable name is read from the process that started DSH.
3. **A literal key typed on the plugin's own page.** `apiKey` is declared with `role('secret')`, so DSH masks it and never sends a stored value back to the browser.

The resolved key is exported to the Graphify subprocess under the variable its backend reads (`DEEPSEEK_API_KEY` for `deepseek`, `GEMINI_API_KEY` for `gemini`, and so on), which keeps Graphify's own auto-detection from routing the extraction to a different provider on a machine with several keys set.

### Configure it from the plugin's page

The section lives on the plugin's own page rather than in a separate settings
tab. That page is where DSH already describes an installed package — its source,
version, update, and uninstall — and it renders a `plugins.bundle.config` slot,
keyed by package name, for the plugin's own configuration. This plugin fills
that slot, so its settings sit beside the thing they configure; the tabs under
Plugins belong to cross-plugin features such as the market and the plugin
manager.

The section is registered only while the Host serves the `dsh-graphify` settings
namespace, so a deployment still running an older build of this plugin shows no
empty form.

Open **Settings → Plugins → Installed plugins → dsh-graphify** (label wording
follows your UI locale; the section sits above **Source** and the version row).
It edits two controls and stages them until **Save**:

| Control | Meaning |
| --- | --- |
| Credential reference | Names the key in the DSH credential store. Default `DEEPSEEK_API_KEY`; `GEMINI_API_KEY`, `MOONSHOT_API_KEY`, `ANTHROPIC_API_KEY`, and `OPENAI_API_KEY` select the other backends. |
| API key | Optional literal, write-only. The stored value is redacted from every response, and a blank draft writes nothing, so it is never clobbered by accident. |

A third field, `backend`, exists in the configuration schema but is not a
control: `auto` infers the backend from the reference, and a deployment can pin
it in `cordis.patch.yml` when inference is not what it wants. Each field is
`volatile`, so an edit applies to the next build without restarting DSH.

`graphify_status` reports which backend and which source the next build would
use, never the key itself:

```text
• LLM Key: deepseek via DEEPSEEK_API_KEY (credentials)
• LLM Key: key not configured (auto); semantic extraction needs one, or pass /graphify build --code-only
```

### Keep the key out of the repository

Nothing here needs a key in version control, and a DSH profile is not a
repository:

- **Prefer the credential store.** Set the key once for a DSH model provider (or
  add it to the credential store directly) and let `apiKeyEnv` name it. The
  literal `apiKey` control exists for quick trials; it writes into the profile's
  configuration, where it stays on disk in plain text.
- **Never commit a key.** `cordis.patch.yml` is part of the published package, so
  a literal written there would ship with the plugin and live in git history.
  Keep `apiKey` out of it: an override needs `apiKeyEnv`, not a value.
- **Profiles live outside the workspace.** The real settings file is
  `~/.dsh/profiles/<profile>/cordis.patch.yml`. If you copy profile state into a
  repository for backup, exclude it — and add `.dsh/`, `graphify-out/`, and
  `.env*` to `.gitignore` in the repositories you scan.
- **Test fixtures use fake values.** Strings such as `sk-env-probe` in the test
  suite are deliberately not real credentials.

A secret that reaches a remote has to be rotated; rewriting history is not
enough on its own. GitHub's secret scanning and push protection are enabled on
this repository, so a push containing a recognized credential is blocked before
it lands.

## Configuration reference

The defaults work for most single-repository sessions. These are the settings
users commonly change:

| Setting | Default | Use it when |
| --- | --- | --- |
| `toolMode` | `full` | Set `compact` for focused navigation with smaller local models. |
| `freshness.mode` | `warn` | Set `auto` for safe pre-query code updates, or `off` for an intentionally static graph. |
| `graphifyVersion` | unset | Pin the Graphify version used by automatic `uv` fallback. |
| `graphPath` | auto-detected | Point to a non-standard `graph.json` location. |
| `cwd` | active session project | Supply a fallback project directory when a session has no workspace. |
| `allowExternalProjects` | `false` | Allow model tools to access projects beyond the session workspace. |
| `toolPrefix` | empty | Avoid tool-name collisions in a larger DSH profile. |
| `backend` | `auto` | Target a specific LLM backend instead of inferring it from `apiKeyEnv`. |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | Point semantic extraction at another credential reference. |
| `apiKey` | unset | Type a key directly on the plugin's page instead of using the credential store. |

Deployments that manage Graphify themselves (a pinned binary, a custom MCP
server, a wrapper that sets its own environment) reach for these instead:

| Setting | Default | Meaning |
| --- | --- | --- |
| `cliCommand` / `cliArgs` | unset | Executable and leading arguments for `/graphify`, overriding discovery. |
| `command` / `args` | `auto` | MCP server executable and arguments; `auto` discovers Graphify. |
| `autoDetect` | `true` | Detect `graphify-out/graph.json` in the workspace automatically. |
| `enablePromptSection` | `true` | Register the system-prompt guidance section. |
| `timeoutMs` | `60000` | Per-tool-call timeout. |
| `freshness.updateTimeoutMs` | `120000` | Maximum wait for an incremental update before a query. |
| `reconnect.*` | enabled, 500 ms → 30 s, 10 attempts | Backoff for an unexpectedly exited MCP process. |

See [`src/config.ts`](src/config.ts) for the complete, typed schema and defaults.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| `graphify_status` says the runtime is unavailable | Run the `uv tool install` command above, then run `graphify_status` again. |
| No graph is found | Start DSH in the repository and run `/graphify`. |
| The graph is stale after docs or configuration edits | Run `/graphify` for a full build. |
| The wrong project is selected | Start DSH from the intended repository, or configure `cwd` or `graphPath`. |
| A model needs another checkout | Keep the default isolation where possible; otherwise set `allowExternalProjects: true` deliberately. |
| The plugin's page shows no configuration section | The Host is serving the settings namespace only after a restart: restart DSH once, then reload the page. A deployment whose Web client composes no settings surface registers nothing and says nothing. |
| A build still reports `no LLM API key found` | Run `graphify_status` and read the `LLM Key:` line. `key not configured` means neither the credential reference, the launching environment, nor the literal holds one; set it on the plugin's page or export the variable before starting DSH. |
| `graphify_status` shows a backend you did not choose | `auto` infers it from the reference name; set `backend` explicitly in `cordis.patch.yml` when a machine has several keys. |
| A documentation-heavy build stops on images | Only `gemini`, `kimi`, `claude`, and `openai` extract images; `deepseek` leaves image nodes out. Use `--code-only` when images do not matter. |
| The zero-install runtime fails with `no executable found for entry point` | `graphify-mcp` only exists in recent `graphifyy` releases. Pin `graphifyVersion: 0.9.57` or newer, or install a runtime and point `command`/`cliCommand` at it. |
| Every semantic chunk fails with `the 'openai' package is required for this backend` | The runtime that ran the build has no LLM SDK. Install one that does: `uv tool install 'graphifyy[mcp,openai]==0.9.57' --force` (or `mcp,anthropic` for the claude backend), then rerun `graphify_status` to confirm the runtime source. |

## Compatibility and development

The package supports `@deepseek-ai/cordis` `>=4.0.4 <5`, is tested against
DeepSeek Harness `0.2.0-rc.2` and the `0.2.1` release-candidate channel (this
checkout was exercised on `0.2.1-rc.4`), and is tested with Graphify `0.9.57`
(live contract and schema-drift checks also pass on `0.9.90`). It ships a
prebuilt DSH bundle — `lib/` is committed, so a git install needs no build step
— and can be developed locally with:

```sh
pnpm run typecheck
pnpm run build
pnpm test
pnpm run test:drift
```

Run `pnpm run build` before committing: `tsc` regenerates the host half in
`lib/` and `tsdown` regenerates `lib/graphify-client.js`, and both are part of
what a profile loads.

Use `GRAPHIFY_E2E=1 pnpm run test:e2e` to exercise a live local Graphify installation. Contribution guidance is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Evidence and next steps

[BENCHMARK.md](BENCHMARK.md) defines the planned, reproducible evaluation of Graphify-assisted agents against the baseline. It is an experimental protocol, not performance results. For Graphify's graph engine, supported languages, and upstream CLI documentation, visit [Graphify](https://github.com/Graphify-Labs/graphify).
