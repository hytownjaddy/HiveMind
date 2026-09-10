# Cloudflare Sandbox image for Class A/C labs (D-035). The base carries the sandbox
# agent, Node, Bun, and Python on Ubuntu 22.04; the tools below make a single-node
# Linux exercise look like a host. Pinned by digest (invariant 5).
FROM docker.io/cloudflare/sandbox:0.12.9@sha256:4a56a37a3cfd9b38d65bb4b5d0b341e6490a3a4c0226274ae4c1cca4948e85fe

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      iproute2 iputils-ping traceroute net-tools dnsutils netcat-openbsd tcpdump \
      vim-tiny nano less man-db procps \
 && rm -rf /var/lib/apt/lists/*

ENV TERM=xterm-256color
EXPOSE 8080
