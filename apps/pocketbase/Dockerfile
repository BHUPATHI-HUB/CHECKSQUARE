# Fly.io Dockerfile for PocketBase
#
# Pins the PocketBase version that matches the JS SDK (^0.26.9).
# Stores the SQLite DB + uploaded files on a Fly Volume mounted at /pb_data
# (see fly.toml for the volume + mount config).

FROM alpine:3.20

ARG PB_VERSION=0.26.9

RUN apk add --no-cache \
    unzip \
    ca-certificates \
    wget

# Download the matching PocketBase Linux binary for the container's arch.
RUN ARCH=$(uname -m) \
 && case "$ARCH" in \
      x86_64)  PB_ARCH=amd64 ;; \
      aarch64) PB_ARCH=arm64 ;; \
      *) echo "Unsupported arch: $ARCH"; exit 1 ;; \
    esac \
 && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" -O /tmp/pb.zip \
 && unzip /tmp/pb.zip -d /pb \
 && rm /tmp/pb.zip \
 && chmod +x /pb/pocketbase

WORKDIR /pb

# Migrations + hooks ship with the image (auto-applied on first boot).
COPY pb_migrations /pb/pb_migrations
COPY pb_hooks       /pb/pb_hooks

# pb_data is a mounted volume; do NOT bake it into the image.
# Note: VOLUME directive removed for Railway compatibility (Railway uses managed
# volumes attached via UI). Fly.io infers the volume from fly.toml, so it works
# there without this line too.
# VOLUME ["/pb_data"]

EXPOSE 8080

# Listen on 0.0.0.0:8080 because Fly forwards external 80/443 to 8080 internally.
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8080", "--dir=/pb_data", "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks"]
