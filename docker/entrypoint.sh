set -e

if [ -z "$BUCKET" ]; then
  echo "AWS_S3_BUCKET is not set. Quitting."
  exit 1
fi

if [ -z "$ACCESS_KEY" ]; then
  echo "ACCESS_KEY is not set. Quitting."
  exit 1
fi

if [ -z "$SECRET_KEY" ]; then
  echo "SECRET_KEY is not set. Quitting."
  exit 1
fi

# Default to syncing entire repo if SOURCE_DIR not set.
if [ -z "$SOURCE_DIR" ]; then
  SOURCE_DIR="."
fi

envsubst < /root/.config/yandex-cloud/config.tmpl > /root/.config/yandex-cloud/config.yaml
envsubst < /root/.aws/credentials.tmpl > /root/.aws/credentials

zip -r latest.zip ${SOURCE_DIR} 
aws --endpoint-url=https://storage.yandexcloud.net s3 latest.zip ${BUCKET}/${FUNCTION_NAME}/latest.zip
yc serverless function version create --function-id ${FUNCTION_ID} --package-bucket-name ${S3BUCKET} --package-object-name ${S3FILE}
