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

For example, replace `<profile>` with the profile you normally use to run DSH. The bundle activates itself; you do not need to hand-edit a Cordis configuration for the default setup.

### 2. Install the local Graphify runtime

```sh
uv tool install 'graphifyy[mcp]==0.9.57'
```

If Graphify is unavailable, DSH can still start. Ask for `graphify_status` after installing it; the plugin discovers the runtime on the next check or tool call, without a DSH restart.

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

The command performs a full build and writes `graphify-out/graph.json` in that repository. Check the result with:

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
3. **A literal key typed into the plugin settings form.** `apiKey` is declared with `role('secret')`, so DSH masks it and never sends a stored value back to the browser.

The resolved key is exported to the Graphify subprocess under the variable its backend reads (`DEEPSEEK_API_KEY` for `deepseek`, `GEMINI_API_KEY` for `gemini`, and so on), which keeps Graphify's own auto-detection from routing the extraction to a different provider on a machine with several keys set.

### Configure it in Settings → Plugins → dsh-graphify

The section lives on the plugin's own page rather than in a separate settings
tab, because that page is where DSH already shows an installed package: its
source, version, update, and uninstall, plus a `plugins.bundle.config` slot the
plugin manager renders a configuration section into, keyed by package name. The
plugin fills that slot, so its configuration sits beside the thing it
configures; the Plugins tabs themselves belong to cross-plugin features (the
market, the plugin manager).

The section is registered only while the Host serves the `dsh-graphify` settings
namespace, so a deployment running an older build of this plugin shows no empty
form.

Open **设置 → 插件 → 已安装插件 → dsh-graphify** and the section appears above
源代码/来源信息. It edits two controls and stages them until **Save**:

| Control | Meaning |
| --- | --- |
| Credential reference | Names the key in the DSH credential store. Default `DEEPSEEK_API_KEY`; `GEMINI_API_KEY`, `MOONSHOT_API_KEY`, `ANTHROPIC_API_KEY`, and `OPENAI_API_KEY` select the other backends. |
| API key | Optional literal, write-only. The stored value is redacted from every response, and a blank draft writes nothing, so it is never clobbered by accident. |

A third field, `backend`, exists in the configuration schema but is not a
control: `auto` infers the backend from the reference, and a deployment can pin
it in `cordis.patch.yml` when inference is not what it wants.

Each field is `volatile`, so an edit applies to the next build without
restarting DSH. The literal written by the second control is stored in the
profile's configuration, so the credential store stays the better home for a
long-lived key.

`graphify_status` reports which backend and source the next build would use, never the key itself.

## Configuration reference

The defaults work for most single-repository sessions. These are the settings users commonly change:

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
| `apiKey` | unset | Type a key directly in the plugin settings form instead of using the credential store. |

See [`src/config.ts`](src/config.ts) for the complete, typed configuration schema and defaults.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| `graphify_status` says the runtime is unavailable | Run the `uv tool install` command above, then run `graphify_status` again. |
| No graph is found | Start DSH in the repository and run `/graphify`. |
| The graph is stale after docs or configuration edits | Run `/graphify` for a full build. |
| The wrong project is selected | Start DSH from the intended repository, or configure `cwd` or `graphPath`. |
| A model needs another checkout | Keep the default isolation where possible; otherwise set `allowExternalProjects: true` deliberately. |

## Compatibility and development

The package supports `@deepseek-ai/cordis` `>=4.0.4 <5`, is tested against DeepSeek Harness `0.2.0-rc.2` (and the `0.2.1-alpha` channel), and is tested with Graphify `0.9.57` (live contract and schema-drift checks also pass on `0.9.90`). It ships a prebuilt DSH bundle and can be developed locally with:

```sh
pnpm run typecheck
pnpm run build
pnpm test
pnpm run test:drift
```

Use `GRAPHIFY_E2E=1 pnpm run test:e2e` to exercise a live local Graphify installation. Contribution guidance is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Evidence and next steps

[BENCHMARK.md](BENCHMARK.md) defines the planned, reproducible evaluation of Graphify-assisted agents against the baseline. It is an experimental protocol, not performance results. For Graphify's graph engine, supported languages, and upstream CLI documentation, visit [Graphify](https://github.com/Graphify-Labs/graphify).
