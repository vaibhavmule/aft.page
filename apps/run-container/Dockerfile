FROM docker.io/cloudflare/sandbox:0.12.8
# ponytail: stock image has python3 but no pip. Image install is the ceiling; runner still falls back to ensurepip/apt.
# ponytail: apt elixir/erlang/ruby majors may lag app .tool-versions / .ruby-version — mismatch fails honestly.
USER root
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    python3-pip \
    python3-venv \
    elixir \
    erlang-base \
    ruby \
    ruby-dev \
    bundler \
    build-essential \
    libsqlite3-dev \
    libyaml-dev \
    zlib1g-dev \
  && rm -rf /var/lib/apt/lists/*
EXPOSE 8080
