set -e

envsubst < /root/.config/yandex-cloud/config.tmpl > /root/.config/yandex-cloud/config.yaml
envsubst < /root/.aws/credentials.tmpl > /root/.aws/credentials

zip -r latest.zip ${SOURCE_DIR} 
aws s3 latest.zip ${S3_BUCKET}/${FUNCTION_NAME}/latest.zip
yc serverless function version create --function-id ${FUNCTION_ID} --package-bucket-name ${S3BUCKET} --package-object-name ${S3FILE}
