# Widget release security

## Current controls

- Actions are pinned to full upstream commit SHAs. Update them only in reviewed PRs. On 2026-11-17, `git ls-remote` resolved checkout v4, setup-node v4, upload/download-artifact v4 and r2-upload-action latest to the hashes in the workflows. The upload action's pinned `action.yml` runs its committed `dist/index.js` (no composite action or runtime package installation). Pinning freezes that code; it does not certify it is harmless.
- Exact direct dependencies match the existing lockfile versions, with no transitive upgrades. Keep `package-lock.json` committed; releases use `npm ci`, which fails on lock/manifest disagreement. `.npmrc` disables lifecycle scripts and saves exact versions. Run build commands explicitly. Do not broadly re-enable install scripts to address one package: inspect and approve the specific required step.
- Node 24.22.1 is pinned in `.node-version`; the official Node distribution bundles npm 11.19.1, which CI checks. No floating global npm installation is performed.
- Main pushes still automatically release. PRs test and build but cannot enter the deploy job. The build receives no R2 secrets; the deploy job installs no application dependencies and runs no bundled application code.
- The retained GitHub artifact includes the whole build and a SHA-256 file manifest tied to the commit. A separate runner verifies the manifest digest passed from the build job, identity, file inventory and file hashes before upload. This detects accidental substitution/corruption. It is **not independent approval** of a compromised build or repository.

## Recovery and next phase

Artifacts are retained for 90 days, subject to GitHub's repository retention limits. Save a known-good complete artifact before expiry. Do not roll back only `chat.js`: chunks and the separately loaded PII runtime/models must match too. Verify the manifest against the recorded digest, review the full artifact, then restore the full release through an authorized deployment. No new automatic rollback or account-setting changes are included here. Existing uploads to mutable CDN paths remain non-atomic and a failed upload may be partial.

The next release-format change should put **all** entry, chunk and PII runtime/model assets under an immutable `/releases/<commit>-<run>/` prefix, adjust every runtime URL to that release, upload/verify everything first, then promote a small stable entry/pointer last. Rolling back should promote a previously verified release, never rebuild it. Retain older releases for clients with cached entries. Design and test CDN cache semantics, SRI/CORS for opt-in pinned embeds, recovery and promotion failure before rollout. This PR deliberately does not change embed URLs or runtime vendor integrations.

## Independent deployment authorization

SHA pinning and separated jobs do not stop someone with repository administration from changing workflows or abusing repository secrets. GitHub environment reviewers add a useful human gate, but remain in the GitHub trust domain and may be bypassable by administrators depending on settings. For a real second boundary, remove live-CDN credentials from GitHub and have an independently controlled promotion service verify the source/build identity and artifact digest plus external approval before publishing. GitHub can keep automatically building and submitting releases. A fully automatic independent policy check is not the same as a human second approval.

Protected environments, branch rules, credential scope/rotation, external approvals and R2 object-lock settings must be separately configured and verified; this PR neither changes them nor claims they exist. Checksums/provenance do not establish that a release is free from malicious code.
