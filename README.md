# Galaga

A containerized Galaga clone: plain HTML/CSS/JS served by nginx.

This repo holds **application code and its container definition only**. It
builds an image and publishes it to GitHub Container Registry. It contains no
Kubernetes manifests, no Terraform, and no knowledge of where the image runs.

Deployment lives in [richieinthecloud/homelab](https://github.com/richieinthecloud/homelab),
which is what ArgoCD watches. The two repos are linked by exactly one thing: an
image tag.

## Why the split

Mixing app code with deployment config means every code commit churns the
manifests ArgoCD is diffing against, and every infrastructure tweak drags the
application's git history along with it. Keeping them apart means:

- this repo's history is about the game
- the GitOps repo's history is about the cluster
- promoting a build is an explicit commit, not a side effect of merging

## Running it locally

```bash
docker build -t galaga:dev .
docker run --rm -p 8080:8080 galaga:dev
```

Then open <http://localhost:8080>. The health endpoint the cluster probes is at
<http://localhost:8080/healthz> and should return `ok`.

## Publishing a release

Images are published on git tags, not on merges to `main`:

```bash
git tag v1.0.0
git push origin v1.0.0
```

That triggers `.github/workflows/build-and-push.yml`, which builds
`linux/amd64` and pushes `ghcr.io/richieinthecloud/galaga:v1.0.0` along with a
commit-SHA tag. The workflow's run summary prints the exact tag to pin.

Pull requests build the image to verify the Dockerfile, but never push.

### First-run gotcha: package visibility

**A GHCR package is private by default, even when the repo that published it is
public.** Your first deployment will fail with `ImagePullBackOff` and an
`unauthorized` error that gives no hint as to why.

After the first successful push, go to the package page (Profile → Packages →
`galaga`) → Package settings → Change visibility → **Public**. One click, once.
After that the cluster pulls with no credentials at all.

If you'd rather keep it private, create a pull secret in the cluster instead:

```bash
kubectl create secret docker-registry ghcr-creds \
  --namespace galaga \
  --docker-server=ghcr.io \
  --docker-username=richieinthecloud \
  --docker-password=<a PAT with read:packages>
```

...and add `imagePullSecrets` to the Deployment in the GitOps repo.

## Deploying a published image

Nothing here deploys. To put a new build on the cluster, over in the GitOps repo:

1. Edit `apps/galaga/kustomization.yaml` and set `images[0].newTag` to the new
   version.
2. Commit and push.
3. Sync the `galaga` Application in the ArgoCD UI.

That third step is manual on purpose while the workflow is still new. Once it
feels routine, enabling `syncPolicy.automated` in the Application turns steps 2
and 3 into one.

## Image details

| | |
|---|---|
| Base | `nginxinc/nginx-unprivileged:1.27-alpine` |
| Listens on | `8080` |
| Runs as | uid `101`, non-root |
| Health endpoint | `GET /healthz` → `200 ok` |
| Platform | `linux/amd64` |

The unprivileged base is deliberate: it needs no Linux capabilities, so the
Kubernetes pod spec can drop all of them and set `runAsNonRoot: true` without
workarounds.
