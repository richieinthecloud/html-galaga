# Galaga container image.
#
# The game is 100% static files (html, css, js, images), so all we need is a
# tiny web server to hand them to the browser.
#
# Base image is nginx-UNPRIVILEGED, not stock nginx. The difference matters:
#
#   stock nginx:         starts as root, chowns its cache dirs, binds :80 (a privileged port), then drops to the nginx user.
#                        Running it under a locked-down Kubernetes securityContext means granting CHOWN/SETUID/SETGID
#                        back, which defeats most of the point.
#
#   nginx-unprivileged:  runs as uid 101 the whole way through and listens on :8080, which needs no special privilege at all. The
#                        pod spec can drop ALL capabilities and set runAsNonRoot: true with nothing to work around.
# Pinned to a specific minor version for reproducible builds. Bump it deliberately, not automatically.

FROM nginxinc/nginx-unprivileged:1.27-alpine

# The base image already runs as the nginx user. Step up to root just long
# enough to clear the default welcome page and place our files, then step
# back down -- the container must not run as root at runtime.
USER root

# Remove nginx's default landing page so nothing stale can be served.
RUN rm -rf /usr/share/nginx/html/*

# Our server config replaces the image's default server block.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# The game itself, into nginx's web root.
COPY game/ /usr/share/nginx/html/

# nginx reads these files as uid 101; make sure it can.
RUN chown -R 101:101 /usr/share/nginx/html

# Back to the unprivileged user for runtime. Everything after this line,
# including the container's main process, runs as uid 101.
USER 101

# Documentation only -- EXPOSE does not publish anything. The real mapping is
# `docker run -p 8080:8080` locally, or containerPort: 8080 in the Deployment.
EXPOSE 8080

# No CMD needed: the base image's entrypoint already starts nginx in the
# foreground, which is what keeps the container alive and lets Docker and
# Kubernetes manage its lifecycle properly.
