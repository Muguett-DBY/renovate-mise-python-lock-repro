# Renovate: mise Python sidecar mismatch

Minimal reproduction for [Renovate discussion #47328](https://github.com/renovatebot/renovate/discussions/47328).

## Current behavior

Ansible uses `version = "latest"` in `mise.toml`, with version 14.4.0 and its Python dependency graph committed in `mise.lock` and `.mise/locks`.
Renovate selects 14.5.0 and edits the lockfile version, then `mise lock ansible` fails:

```text
Python lock does not match the requested tool; run `mise lock --bump ansible`
```

The included Renovate configuration restricts the reproduction to the Ansible 14.5.0 update.
Cowsay 6.0 is an unrelated tool used to check that its lock entry and sidecars stay unchanged.

## Expected behavior

Renovate should regenerate the Python sidecar at the selected 14.5.0 version and return both the main lockfile and changed sidecars as artifacts.
The configured `latest` selector and Cowsay files should remain unchanged.

## Reproduce

Requirements: Git, Python 3.11+, Node 24, mise 2026.10.17 and uv on `PATH`.
Prepare a Renovate source checkout with its pinned pnpm and `pnpm install --frozen-lockfile`.

From a clone of this repository:

```sh
python reproduce.py --renovate /path/to/renovate
```

To exercise Renovate's safe-mode path as well:

```sh
python reproduce.py --renovate /path/to/renovate --safe
```

The script creates a new temporary checkout, isolates mise and uv state, calls Renovate's real `updateLockedDependency()` and `updateArtifacts()`, and invokes the actual mise binary. It does not create GitHub PRs or require a token. It retains its checkout and JSON receipt for inspection. Use `--node /path/to/node` or `--output /path/to/fresh-output` if needed.

On unpatched Renovate `4ebd20e`, the script exits 1 and the receipt contains the Python lock mismatch. With the proposed manager fix, it exits 0, returns `mise.lock`, `pyproject.toml` and `uv.lock`, and verifies the unrelated tool and configuration are unchanged.

These runs were verified on Windows, with Node 24.22.1, mise 2026.10.17 and uv 0.13.5. Linux platform lock entries are present; this is not a claim that the hosted Linux Mend job was replayed.

The fixture and verification scripts were prepared with Codex (GPT-6). The generated Python metadata and locks refer to public PyPI packages.
