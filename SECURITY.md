# Security Policy

## Reporting a Vulnerability

Please report suspected vulnerabilities privately through GitHub's private vulnerability reporting flow for this repository.

If private vulnerability reporting is unavailable, open a minimal public issue asking for a maintainer security contact without including exploit details, affected tokens, reproduction steps, or proof-of-concept code.

## Supported Versions

This project is pre-1.0. Security fixes are expected to land on the default branch and be released through the normal package publishing workflow.

## Maintainer Security Automation

This repository includes file-based configuration for:

- Renovate dependency updates with a 7-day release-age cool-down.
- pnpm install-time release-age checks with `minimumReleaseAge: 10080`.
- Pull request dependency review for vulnerable dependency additions.
- CodeQL JavaScript/TypeScript scanning.
- OSV dependency vulnerability scanning.
- zizmor GitHub Actions static analysis.
- OpenSSF Scorecard.
- Socket GitHub app repository configuration.

Maintainers should also enable these repository or organization settings in GitHub:

- Dependency graph.
- Dependabot alerts.
- Dependabot security updates.
- Secret scanning and push protection.
- Private vulnerability reporting.
- Branch protection or repository rulesets requiring the security checks that should block merges.

For Socket, install the Socket GitHub app and set the organization cool-down policy for `recentlyPublished` packages to 7 days with an error action for pull request checks. The committed `socket.yml` enables this repository for Socket PR alerts, but the release-age threshold is configured in Socket's dashboard.
