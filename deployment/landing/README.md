# Landing VPS operator

Local source only. Nothing in this directory installs, uploads, reloads Caddy,
or changes the VPS until a separately authorized operator runs the documented
commands on that host.

## Build and upload

Start from the reviewed landing commit and choose a UTC deployment identity:

```sh
SOURCE_SHA=$(git rev-parse HEAD)
DEPLOYMENT_ID="landing-${SOURCE_SHA}-$(date -u +%Y%m%d%H%M%S)"
node deployment/landing/package-release.mjs "$PWD/out" "$SOURCE_SHA" "$DEPLOYMENT_ID"
```

Upload the three generated files to `/home/auth-deploy/uploads` as
`auth-deploy`, retaining mode `0600`. Upload, installation, routing and deploy
are distinct authorized transitions.

## One-time root installation

Review the three source files and `operator-checksums.sha256`, then as root:

```sh
deployment/landing/install-operator.sh deployment/landing/operator-checksums.sha256
```

The installer validates exact checksums, stages the operator and sudoers file,
validates sudoers, and restores the previous bytes if installation fails. It
does not deploy the landing or reload a service.

## Prepare, route and activate

As `auth-deploy`, after separate authorization for each mutation:

```sh
ARCHIVE="/home/auth-deploy/uploads/the-bot-landing-${DEPLOYMENT_ID}.tar.gz"
ARCHIVE_SHA=$(cut -d' ' -f1 "${ARCHIVE}.sha256")
sudo /usr/local/sbin/deploy-the-bot-landing preflight "$ARCHIVE" "$SOURCE_SHA" "$ARCHIVE_SHA" "$DEPLOYMENT_ID"
sudo /usr/local/sbin/deploy-the-bot-landing prepare "$ARCHIVE" "$SOURCE_SHA" "$ARCHIVE_SHA" "$DEPLOYMENT_ID"
sudo /usr/local/sbin/deploy-the-bot-landing routing "$DEPLOYMENT_ID"
sudo /usr/local/sbin/deploy-the-bot-landing deploy "$DEPLOYMENT_ID"
```

`routing` is intentionally explicit. Its first invocation accepts only the reviewed
Caddyfile SHA `f17b0bed053548f13e4e96f6c8e51d83e5d93f1eddcc404b26e4c0a9aab1615d`,
adds only `/site.webmanifest`, `/assets/brand/*`, `/schools`, and `/schools/*`,
validates and reloads only Caddy, then checks the public root, Auth and AVITO.
It retains an exact root-only backup and restores/reloads it on any failure.
Later releases still require the explicit `routing` command, but it performs a
read-only reuse check against the root-only recorded routed hash and does not
reload Caddy again.

## Current landing HTML policy

The separately authorized, one-purpose transition for the current deployed
landing is:

```sh
sudo /usr/local/sbin/deploy-the-bot-landing html-policy \
  landing-c3abfb3ee76616c9c85313aa958dd5b88a6592a8-20260918100401
```

`html-policy` accepts only that deployment, source
`c3abfb3ee76616c9c85313aa958dd5b88a6592a8`, and the reviewed routed Caddyfile
SHA `60b10991eb32235fc9b462c4d7aadd923b795ad3df774b476ca8a1389594df9a`.
It adds an exact `308` redirect from `/release.html` to `/` and adds
`Cache-Control: no-store, max-age=0` only to `/` and `/index.html`. It does not
change the landing release symlink. The transition keeps a root-only byte-exact
backup and journal, validates the candidate with the Caddyfile adapter, reloads
Caddy once, and automatically restores the prior bytes as root:root `0644` if
validation, reload, root policy, Auth, or AVITO checks fail. A completed state
is reusable without another reload, and later landing routing recognizes the
recorded policy state.

`deploy` switches only `/var/www/the-bot-landing/current`. It verifies the
release markers, public root login CTA, `/schools/`, `/auth`, and AVITO health.
On failure it restores only the prior landing symlink; it never deletes a
release or changes Auth/AVITO.

Every mutating command writes and fsyncs a root-only intent journal before it
changes a release, Caddyfile, deployment record, or current symlink. A retry of
the same exact deployment id reconciles the recorded identities with the
actual release content hash, Caddy hash, and symlink target, then resumes only
an unambiguous operation. Any unrelated state fails closed and requires manual
review; the operator never guesses which state to remove. Archive metadata is
also checked before extraction: at most 500 regular/directory entries and at
most 100 MiB of declared regular-file content, followed by a second extracted
size check.

Public post-checks do not follow or accept redirects. Root and `/schools/`
must return exactly HTTP 200 with their release markers; the manifest and
brand asset must return exactly 200; Auth must return 200 with its login
heading; and AVITO health must return 200 with its documented `status: ok`
response.

## Exact rollback

Use the deployment id recorded by the successful deploy:

```sh
sudo /usr/local/sbin/deploy-the-bot-landing rollback "$DEPLOYMENT_ID"
```

Rollback is accepted only while that exact release is current and its root-only
record names an existing prior release. It changes only the landing symlink.

## Local verification

```sh
node schools/check-site.mjs
node deployment/landing/test-operator.mjs
```
