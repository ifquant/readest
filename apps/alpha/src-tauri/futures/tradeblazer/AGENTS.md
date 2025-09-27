# Repository Guidelines

## Project Structure & Module Organization
The compiler lives in `src/`, split by pipeline stage: `lexer.rs`, `parser.rs`, `ast.rs`, `semantic.rs`, and `interpreter.rs`, with `lib.rs` exposing the API and `main.rs` powering the CLI. Integration specs are under `tests/`; load fixtures from `examples/support/` to keep scenarios reproducible. Example strategies, prototypes, and benchmarking helpers stay in `examples/`. Architectural notes land in `docs/`; stash ad-hoc performance captures in `bench/` and drop the file once incorporated into docs.

## Build, Test, and Development Commands
- `cargo check` — verify the crate graph quickly; run before every branch push.
- `cargo fmt` / `cargo fmt -- --check` — apply and confirm rustfmt compliance.
- `cargo clippy --all-targets` — lint across lib, bin, and tests; treat warnings as defects.
- `cargo test` — execute unit and integration suites; append `-- --nocapture` for debugging output.
- `cargo run -- examples/simple_strategy.tb` — smoke-test the CLI end-to-end.
- `cargo bench` — profile guarded micro-benches; capture findings in `bench/`.

## Coding Style & Naming Conventions
Stick to Rust 2021 defaults with 4-space indentation. Favor `snake_case` functions and locals, `UpperCamelCase` types, and `SCREAMING_SNAKE_CASE` constants. Keep modules singular (`lexer`, not `lexers`). Prefer expressive helpers over abbreviations, and leave targeted comments when intent is non-obvious.

## Testing Guidelines
Follow the patterns in `tests/simple_cases.rs`: table-driven loops, descriptive test names, and fixture modules pulled via `#[path = "../examples/support/..."]`. For new semantics or flags, pair positive and negative cases. Document unusually slow tests in `examples/README_TESTS.md`, and regenerate fixtures instead of inlining large strings.

## Commit & Pull Request Guidelines
Write concise, imperative commit titles (e.g., `fix: guard null token`). Bundle related changes together and mention issue IDs when closing tickets. PRs should explain the change, why it matters, and how it was validated (`cargo check`, `cargo clippy`, `cargo test`, etc.). Attach benchmarks or traces when performance shifts. Request review from maintainers familiar with the touched modules and ensure CI is green before merge.

## Security & Configuration Tips
Never commit secrets or generated traces that contain proprietary data. Prefer environment variables or `.env` (gitignored) for API keys. Document any new feature flags or config knobs in `docs/` so downstream agents can reproduce builds.
