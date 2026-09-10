# hivemind/linux-lab — the Linux node image for Class B/C labs (D-012).
# Built on the lab host by tools/host/provision.sh as hivemind/linux-lab:<version>;
# the base is pinned by digest (invariant 5). Bump the version tag on any change.
FROM docker.io/library/ubuntu:24.04@sha256:224a1869083a311ef3f13648a154ba79832fbef6364d31493642ca03082da254

LABEL org.hivemind.image="linux-lab" org.hivemind.version="1.0.0"

ENV DEBIAN_FRONTEND=noninteractive TERM=xterm-256color
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash coreutils procps iproute2 iputils-ping iputils-tracepath traceroute \
      tcpdump net-tools dnsutils netcat-openbsd curl ca-certificates \
      vim-tiny nano less man-db python3 openssh-client jq \
 && rm -rf /var/lib/apt/lists/*

# A learner shell that looks like a host, not a container.
RUN echo 'PS1="\\u@\\h:\\w\\$ "' >> /etc/bash.bashrc \
 && echo 'export TERM=xterm-256color' >> /etc/bash.bashrc

WORKDIR /root
CMD ["sleep", "infinity"]
