# FocAIRemover cleaner — Cloudflare Containers image.
#
# Do not vendor the upstream Python tree. Depend on the published HTTP
# service image and talk to it on port 8765.
#
# Upstream: https://github.com/guillaumemeyer/watermarks-remover  (MIT)
# Image:    ghcr.io/guillaumemeyer/watermarks-remover
# Latest release checked 2026-09-04: v0.7.0 (~20k★)
#
# Bind / port (from upstream service/Dockerfile):
#   EXPOSE 8765
#   ENTRYPOINT ["python3"]
#   CMD ["/app/scripts/server.py", "--host", "0.0.0.0"]
#   default port env WATERMARKS_SERVER_PORT=8765
# The process therefore listens on 0.0.0.0:8765 inside the container.
# Cloudflare Container class MUST set:
#   defaultPort = 8765
#   (optional) pingEndpoint that hits GET /health
#
# Cloudflare Containers require linux/amd64. The upstream core image is amd64.
#
# Native GHCR pull is not in Cloudflare's pre-built image sources
# (Cloudflare Registry, Docker Hub, Amazon ECR, Google Artifact Registry).
# Wrangler builds this Dockerfile on deploy and pushes layers to the
# Cloudflare registry. Public GHCR `docker pull` during that build is enough.
#
# Pin a release tag in production instead of :latest, e.g.
#   FROM ghcr.io/guillaumemeyer/watermarks-remover:0.7.0
#
# Upstream run hint (local):
#   docker run --rm -p 127.0.0.1:8765:8765 --read-only --tmpfs /tmp <image>
# Cloudflare disk is already ephemeral; still set a decoded-file cap below
# so JSON+base64 proxied through a Worker stays under the 128 MiB isolate.

# Pinned, not :latest. Upstream's /clean contract does change between releases:
# v0.7.0 is the version that made a Layer B rewrite mandatory for the `text`
# kind. A moving tag would silently alter what this service does to user files.
# Verified 2026-09-04: v0.7.0 and latest are the same digest
# (sha256:d0ca21aa12856...), and the image publishes linux/amd64, which
# Cloudflare Containers requires.
FROM ghcr.io/guillaumemeyer/watermarks-remover:v0.7.0

# 8 MiB decoded file, matching MAX_UPLOAD_BYTES in wrangler.jsonc. The Worker
# proxies base64-in-JSON, so N bytes cost ~3.7N of isolate memory against the
# 128 MiB limit; the cap on both sides must agree. (This previously said 16 MiB
# in the comment while setting 32 MiB, and the Worker allowed 32 MiB.)
# Do not raise it until the cleaner contract streams via R2.
ENV WATERMARKS_MAX_INPUT_BYTES=8388608 \
    WATERMARKS_MAX_BATCH_FILES=8 \
    PYTHONUNBUFFERED=1

# Inherited: USER remover (uid 10001), EXPOSE 8765, CMD server.py --host 0.0.0.0
EXPOSE 8765
