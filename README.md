# Rspack development-mode `rebuildModule` panic during watch

Minimal reproduction of a Rust panic in `@rspack/core@2.2.9`: calling
`compilation.rebuildModule` from the `finishModules` hook — the standard pattern for
plugins that rewrite module content late in the build (e.g. the glass-easel
miniprogram webpack plugin) — panics in **development** mode during a watch
incremental rebuild.

Related but not covered by [issue #9058](https://github.com/web-infra-dev/rspack/issues/9058) /
[issue #9778](https://github.com/web-infra-dev/rspack/issues/9778) and
[PR #16242](https://github.com/web-infra-dev/rspack/pull/16242) (the
`should have event sender` importModule panic): this repro still aborts on a local
build of the `fix/rebuild-module-import-module` branch, so it is a distinct defect.

## Reproduce

```bash
npm install
node repro.mjs
```

`repro.mjs` starts a watch build, then touches `src/dep.js` to trigger an
incremental rebuild. The plugin (`rspack.config.mjs`) rebuilds the entry module in
`finishModules`, exactly like real content-rewriting plugins do.

With `mode: 'development'` the process aborts:

```text
[repro] mode = development
[repro] build done, errors: 0
[repro] watching started
[repro] touched src/dep.js — waiting for incremental rebuild
Panic occurred at runtime
thread '<unnamed>' panicked at crates/rspack_core/src/module_graph/mod.rs:616:26:
Dependency with ID DependencyId(1) not found
```

Exit code 134 (abort). The panic cannot be caught from JS.

With `mode: 'production'` the same script survives:

```bash
MODE=production node repro.mjs
# [repro] survived the observation window — no panic
```

## Observed panic sites

Both assertions are stale graph references hit while a `rebuildModule` started
from `finishModules` runs concurrently with dev-mode graph bookkeeping:

- This repro (small graph):
  `module_graph/mod.rs:616` — `dependency_ref_by_id`, reached from
  `FlagDependencyExportsPlugin`'s parallel `finishModules` pass draining
  dependency IDs that the rebuild has already invalidated.
- The same plugin pattern in a larger real build (the glass-easel miniprogram
  plugin, ~250 modules) panics instead at
  `compilation/build_module_graph/graph_updater/repair/process_dependencies.rs:76`
  — `module_by_identifier(...).expect("Module expected")` in the graph repair
  task, which dereferences a module identifier removed by the concurrent update.

Which assertion fires first depends on the module graph shape; the trigger is the
same: a `rebuildModule` re-entering graph building from `finishModules` while the
development-mode dependency/graph state is being drained.

Notably, webpack 5 exhibits the same re-entrancy hazard as a *caught* error:
`FlagDependencyExportsPlugin` reports `Invalid value used as weak map key` inside
`finishModules` during the rebuild, which webpack swallows.

## Environment

- `@rspack/core` / `@rspack/cli` 2.2.9 (also reproduces on a local build of the
  `fix/rebuild-module-import-module` branch)
- Node 26, macOS (arm64)

## Workaround

Run the watch build with `mode: 'production'` (verified stable). Development-mode
HMR is not available to plugins that rebuild modules in `finishModules`.
