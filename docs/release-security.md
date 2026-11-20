# Widget release security

## Current controls

- Workflow actions are pinned to full upstream commit SHAs, including pnpm setup v4.4.0. Update them only in reviewed PRs. The pinned R2 action runs its committed bundle. Pinning fixes the action code; it does not certify the code is safe.
- Direct dependencies match the versions already resolved by `pnpm-lock.yaml`; the locked packages and snapshots are unchanged. Both workflows use `pnpm install --frozen-lockfile --ignore-scripts` and build explicitly. The existing developer install-script allowlist is not used in CI.
- CI verifies Node 24.22.1 and pnpm 10.18.0 against the checked-in pins. The two workflows do not share a dependency cache.
- Main pushes automatically release. Pull requests build and verify the downloaded artifact but cannot deploy. The build has no R2 secrets. The verification job does not install application dependencies or execute the application bundle. Only the main-push R2 step receives those credentials.
- GitHub retains the whole build and a SHA-256 file inventory tied to the commit. A separate job checks the expected manifest digest, commit, file hashes and inventory. The manifest stays with the GitHub artifact and is not published to the CDN. These checks confirm transfer integrity, not independent authorization or protection from a compromised build.

## Recovery and limits

Artifacts are retained for 90 days, subject to repository limits. Keep a known-good full artifact before expiry. Never roll back only `chat.js`: lazy chunks and the independently loaded PII runtime and models must match. Check the manifest against its recorded digest and restore the full artifact through an authorized deployment. Existing mutable CDN uploads can still be partial on failure. This PR does not add atomic promotion, automatic rollback, independent approval, or new GitHub/R2 settings.

A later design can put all assets under an immutable release prefix, verify the whole upload and promote a small stable pointer last. Rollback should promote a previously verified release without rebuilding it. Retain older assets for clients with cached entry points and test cache behavior, SRI/CORS and promotion failures before changing embed URLs.
