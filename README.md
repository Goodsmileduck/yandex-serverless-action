# Yandex serverless action

<p align="left">
  <a href="https://github.com/Goodsmileduck/yandex-serverless-action/actions?query=workflow%3Ayandex-serverless-action"><img alt="yandex-serverless-action" src="https://github.com/Goodsmileduck/yandex-serverless-action/workflows/yandex-serverless-action/badge.svg"></a> 
</p>

This action uploads code to object storage and update Serverless function in Yandex cloud.



## Usage

1. Create serverless function in Yandex Cloud and copy function id
2. Create s3 bucket (optional, if you want to upload code to bucket or if it's bigger than 5Mb)
3. Add workflow to your repo

## `workflow.yml` Example

Place in a `.yml|.yaml`  file such as this one in your `.github/workflows` folder. [Refer to the documentation on workflow YAML syntax here.](https://help.github.com/en/articles/workflow-syntax-for-github-actions)

```yaml
name: Push and Deploy Serverless function
on: push

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@master
    - uses: goodsmileduck/yandex-serverless-action@v2
      with:
        token: ${{ secrets.TOKEN }}
        bucket: ${{ secrets.BUCKET }}
        accessKeyId: ${{ secrets.ACCESS_KEY_ID }}
        secretAccessKey: ${{ secrets.SECRET_ACCESS_KEY }}
        function_id: '234awefq12345g24f'
        runtime: 'python37'
        memory: '256'
        entrypoint: 'main.handler'
        environment: DEBUG=True,COUNT=1
        source: '.'
        exclude: 'src/'
```

## Configuration

The following settings must be passed as variables as shown in the example. Sensitive information, especially `token`  should be [set as encrypted secrets](https://help.github.com/en/articles/virtual-environments-for-github-actions#creating-and-using-secrets-encrypted-variables) — otherwise, they'll be public to anyone browsing your repository.

| Key | Value | Suggested Type | Required |
| ------------- | ------------- | ------------- | ------------- |
| `token` | Token for access to yc cli. To get token visit [link](https://oauth.yandex.ru/authorize?response_type=token&client_id=1a6990aa636648e9b2ef855fa7bec2fb) | `secret` | **Yes** |
| `function_id` | The ID of function in Yandex Cloud | `env` | **Yes** |
| `runtime` | Runtime for function in Yandex Cloud | `env` | **Yes** |
| `entrypoint` | Entry point of function | `env` | **Yes** |
| `description` | Description for version of function | `env` | No |
| `environment` | Comma-separated list with env variables | `env` | No |
| `memory` | Memory limit in `megabytes` for function in Yandex Cloud Default value is `128`| `env` | No |
| `execution_timeout` | Execution timeout in seconds for function in Yandex Cloud. Default value is `5` | `env` | No |
| `service_account` | Service account id. | `secret` | No |
| `bucket` | The name of the bucket you're syncing to. For example, `bucket`. If wasn't set action will try to upload code directly. Required if code bigger than 5Mb| `secret` | No |
| `accessKeyId` | Yandex AWS Access Key Id when s3 bucket used. Required if code bigger than 5Mb| `secret` | No |
| `secretAccessKey` | Yandex AWS Access Key Id when s3 bucket used. Required if code bigger than 5Mb| `secret` | No |
| `source` | The local directory you wish to upload. For example, `./public`. Defaults to the root of your repository (`.`) if not provided. | `env` | No |
| `exclude` | Explicitly exclude the specified files. Defaults empty if not provided. | `env` | No |

# Scenarios

  - [Zip and and deploy folder](#zip-and-and-deploy-folder)
  - [Zip and upload to bucket and deploy](#zip-and-upload-to-bucket-and-deploy)
  - [Exclude pattern from archive](#Exclude-pattern-from-archive)
  - [Set service account id](#Set-service-account-id)

## Zip and and deploy folder

```yaml
- uses: goodsmileduck/yandex-serverless-action@v1
  with:
    token: ${{ secrets.TOKEN }}
    function_id: 'my_function_id'
    runtime: 'python37'
    memory: '256'
    entrypoint: 'main.handler'
    environment: DEBUG=True,COUNT=1
    source: '.'
```

## Zip and upload to bucket and deploy

```yaml
- uses: goodsmileduck/yandex-serverless-action@v1
  with:
    description: "Function without bucket"
    token: ${{ secrets.TOKEN }}
    bucket: ${{ secrets.BUCKET }}
    accessKeyId: ${{ secrets.ACCESS_KEY_ID }}
    secretAccessKey: ${{ secrets.SECRET_ACCESS_KEY }}
    function_id: 'my_function_id'
    runtime: 'python37'
    memory: '256'
    entrypoint: 'main.handler'
    environment: DEBUG=True,COUNT=1
    source: './src'
    description: "Version: v0.1.1"
```

## Exclude pattern from archive

```yaml
- uses: goodsmileduck/yandex-serverless-action@v1
  with:
    token: ${{ secrets.TOKEN }}
    function_id: 'my_function_id'
    runtime: 'python37'
    memory: '256'
    entrypoint: 'main.handler'
    environment: DEBUG=True,COUNT=2
    source: './public'
    exclude: '*.txt'
```

## Set service account id

```yaml
- uses: goodsmileduck/yandex-serverless-action@v1
  with:
    token: ${{ secrets.TOKEN }}
    function_id: 'my_function_id'
    runtime: 'python37'
    memory: '256'
    entrypoint: 'main.handler'
    environment: DEBUG=True,COUNT=2
    source: './public'
    service_account: ${{ secrets.SERVICE_ACCOUNT }}
```
## License

This project is distributed under the [MIT license](LICENSE.md).
