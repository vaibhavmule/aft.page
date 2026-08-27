FROM docker.io/cloudflare/sandbox:0.12.8
# ponytail: stock image has python3 but no pip. Image install is the ceiling; runner still falls back to ensurepip/apt.
USER root
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3-pip python3-venv \
  && rm -rf /var/lib/apt/lists/*
EXPOSE 8080
