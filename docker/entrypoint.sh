set -e

envsubst < /root/.config/yandex-cloud/config.tmpl > /root/.config/yandex-cloud/config.yaml
yc 
yc serverless function version create --function-id ${FUNCTION_ID} --package-bucket-name ${S3BUCKET} --package-object-name ${S3FILE}
