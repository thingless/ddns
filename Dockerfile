FROM phusion/baseimage:0.9.18
MAINTAINER FreeTheNation

#update & install
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y nodejs nsd \
    && apt-get clean

#copy source
RUN mkdir -p /usr/local/ddns
COPY server.js /usr/local/ddns

#config nsd
COPY conf/docker/nsd.conf /etc/nsd
COPY conf/docker/ddns.zone /etc/nsd

#config runit for server
RUN mkdir -p /etc/service/ddns
COPY conf/docker/ddns.runit /etc/service/ddns/run
RUN chmod +x /etc/service/ddns/run

#config runit for nsd
RUN mkdir -p /etc/service/nsd
COPY conf/docker/nsd.runit /etc/service/nsd/run
RUN chmod +x /etc/service/nsd/run

#copy default config
COPY conf/docker/config.json /usr/local/ddns

# File permissions
RUN chown -R nsd.nsd /usr/local/ddns

EXPOSE 53
EXPOSE 8080
