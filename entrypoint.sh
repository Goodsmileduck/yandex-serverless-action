#!/bin/bash
set -e

if [ -z "$FUNCTION_NAME" ]; then
  echo "FUNCTION_NAME is not set. Quitting."
  exit 1
fi

if [ -z "$SOURCE_DIR" ]; then
  SOURCE_DIR="."
fi
mkdir -p ~/.aws
mkdir -p ~/.config/yandex-cloud
envsubst < /config.tmpl > ~/.config/yandex-cloud/config.yaml

envsubst < /credentials.tmpl > ~/.aws/credentials

zip -r ${GITHUB_SHA}.zip ${SOURCE_DIR}

if [ -z "$BUCKET" ]; then
  if [ -z "$ENVIRONMENT" ]; then
    yc serverless function version create --token ${TOKEN} \
      --function-name ${FUNCTION_NAME} \
      --cloud-id ${CLOUD_ID}\
      --folder-id ${FOLDER_ID} \
      --runtime ${RUNTIME} \
      --memory ${MEMORY} \
      --execution-timeout ${TIMEOUT} \
      --entrypoint ${ENTRYPOINT} \
      --source-path ${GITHUB_SHA}.zip
  else
    yc serverless function version create --token ${TOKEN} \
      --function-name ${FUNCTION_NAME} \
      --cloud-id ${CLOUD_ID}\
      --folder-id ${FOLDER_ID} \
      --runtime ${RUNTIME} \
      --memory ${MEMORY} \
      --execution-timeout ${TIMEOUT} \
      --entrypoint ${ENTRYPOINT} \
      --environment ${ENVIRONMENT} \
      --source-path ${GITHUB_SHA}.zip
  fi
else
  if [ -z "$ACCESS_KEY" ]; then
    echo "ACCESS_KEY is not set. Quitting."
    exit 1
  fi

  if [ -z "$SECRET_KEY" ]; then
    echo "SECRET_KEY is not set. Quitting."
    exit 1
  fi
  aws --endpoint-url=https://storage.yandexcloud.net s3 cp ${GITHUB_SHA}.zip s3://${BUCKET}/${FUNCTION_NAME}/${GITHUB_SHA}.zip

  if [ -z "$ENVIRONMENT" ]; then
    yc serverless function version create --token ${TOKEN} \
      --function-name ${FUNCTION_NAME} \
      --cloud-id ${CLOUD_ID}\
      --folder-id ${FOLDER_ID} \
      --runtime ${RUNTIME} \
      --memory ${MEMORY} \
      --execution-timeout ${TIMEOUT} \
      --entrypoint ${ENTRYPOINT} \
      --source-path ${GITHUB_SHA}.zip
  else
    yc serverless function version create --token ${TOKEN} \
      --function-name ${FUNCTION_NAME} \
      --cloud-id ${CLOUD_ID}\
      --folder-id ${FOLDER_ID} \
      --runtime ${RUNTIME} \
      --memory ${MEMORY} \
      --execution-timeout ${TIMEOUT} \
      --entrypoint ${ENTRYPOINT} \
      --environment ${ENVIRONMENT} \
      --source-path ${GITHUB_SHA}.zip
  fi
fi

