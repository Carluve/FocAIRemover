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

FROM ghcr.io/guillaumemeyer/watermarks-remover:latest

# 16 MiB decoded file. JSON envelope is ~1.5× that (base64). Worker memory is
# 128 MiB — do not raise this until v1.5 streams via R2.
ENV WATERMARKS_MAX_INPUT_BYTES=33554432 \
    WATERMARKS_MAX_BATCH_FILES=8 \
    PYTHONUNBUFFERED=1

# Inherited: USER remover (uid 10001), EXPOSE 8765, CMD server.py --host 0.0.0.0
EXPOSE 8765
