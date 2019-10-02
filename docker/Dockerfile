FROM golang:alpine AS builder
RUN apk add --update git 
RUN go get -u -v github.com/a8m/envsubst/cmd/envsubst

FROM plugins/base:linux-amd64

LABEL maintainer="Bo-Yi Wu <appleboy.tw@gmail.com>" \
  org.label-schema.name="Drone lambda" \
  org.label-schema.vendor="Bo-Yi Wu" \
  org.label-schema.schema-version="1.0"

ENV ZONE=ru-central1-a
COPY --from=builder /go/bin/envsubst /bin/envsubst
RUN apk add curl bash python py-pip && \
  curl https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash && \
  pip install awscli && \
  ln -s /root/yandex-cloud/bin/yc /bin/yc

COPY config.tmpl /root/.config/yandex-cloud/config.tmpl
ENTRYPOINT ["/entrypoint.sh"]
