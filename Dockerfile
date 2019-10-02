FROM golang:alpine AS builder
RUN apk add --update git 
RUN go get -u -v github.com/a8m/envsubst/cmd/envsubst

FROM plugins/base:linux-amd64

LABEL maintainer="Serebrennikov Stanislav <goodsmileduck@gmail.com>" \
  org.label-schema.name="Yandex Cloud function deploy" \
  org.label-schema.vendor="Serebrennikov Stanislav" \
  org.label-schema.schema-version="1.0"

ENV ZONE=ru-central1-a \
  MEMORY=128m \
  TIMEOUT=5s

COPY --from=builder /go/bin/envsubst /bin/envsubst
RUN apk add curl bash python py-pip zip && \
  curl https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash && \
  pip install awscli && \
  ln -s /root/yandex-cloud/bin/yc /bin/yc

COPY config.tmpl /config.tmpl
COPY credentials.tmpl /credentials.tmpl
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
