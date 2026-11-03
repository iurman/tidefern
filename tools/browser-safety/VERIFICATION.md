# Browser isolation verification

**Status: Operational**

Verified November 2, 2026, on the existing Bazzite host Podman through its Flatpak bridge. No host packages or production services were changed.

- Guard regression suite: 7 passed, including all observed vulnerable browser versions, sandbox bypass options, missing executables, endpoint restrictions and tracked source coverage.
- Isolated runner smoke: passed in 14.0 seconds, including the image cache/build path and container cleanup.
- Actual browser: Debian Chromium 156.0.8078.73. Chromium reported active PID namespaces, network namespaces and Seccomp-BPF sandboxing.
- Real browser checks: local HTTP fixture, button interaction, PNG screenshot, rejection of an unapproved host port, and a connection attempting to replace the executable and turn sandboxing off. The gateway retained the approved options.
- Runtime inspection: no filesystem mounts. The runner stops and removes its own container after the command.
- Package commands: `browser:isolated` and `browser:check` in `apps/web/package.json`.
- Tooling lint and the typed Playwright adapter check passed. The Node guard checks also run in a dedicated GitHub Actions job without installing project dependencies.
- Node checks use the explicit `.checks.mjs` filename so application Vitest suites do not collect them.

The smoke runs only synthetic local HTML. It does not certify the entire application's journeys, databases, production service, Firefox/WebKit, headed display or visual baselines. Existing application fixtures and setup remain required. The Chromium service has ordinary outbound networking; it is not a LAN egress firewall.

The existing Playwright configuration loads and complete test collection passes; that collection check does not execute application journeys.

The root package entrypoint and database-free port 3001 are included. The exact root package command passed the isolated browser smoke locally.

Draft review: https://github.com/iurman/tidefern/pull/113

Latest main was integrated before handoff, preserving upstream application changes. The new byte-budget browser also uses the isolated helper; Lighthouse rejects a local Chromium below the security floor.

The full 385-case CI run exposed trace scratch exhaustion, remote-download path assumptions, retained sequential keyboard focus between route walks and Next's empty icon fingerprint keys. QA now reads the export stream directly, resets the keyboard starting point before preserving every Tab/skip-link assertion and accepts only empty fingerprint keys on the three static icon routes; health and arbitrary query data remain rejected. A real isolated probe resets focus and retains/deletes 768 MiB of synthetic downloads without host mounts, exceeding the former scratch limit. The suite has a 3 GiB tmpfs inside a 5 GiB memory limit and reports scratch usage on failure. Privacy regression, type and scoped lint checks pass before the full CI rerun.

The full integrated suite passes 381 cases with four mobile route sweeps failing because axe retains skip-link focus between light and dark audits. Resetting focus to the document body before each independent theme audit clears that transient header overlap. The complete real public-route 390px sweep passes locally in both themes with all axe, keyboard, menu and reflow assertions, and a production build/scoped lint pass. No product style or accessibility assertion changed.
