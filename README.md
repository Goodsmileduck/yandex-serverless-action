# Yandex serverless action
> **Note:** To use this action, you must have access to the [GitHub Actions](https://github.com/features/actions) feature. GitHub Actions are currently only available in public beta. You can [apply for the GitHub Actions beta here](https://github.com/features/actions/signup/).

This action uploads code to object storage and update Serverless funstion in Yandex cloud.

## Usage
### Requirements

1. Create serverless function in Yandex Cloud

### `workflow.yml` Example

Place in a `.yml` file such as this one in your `.github/workflows` folder. [Refer to the documentation on workflow YAML syntax here.](https://help.github.com/en/articles/workflow-syntax-for-github-actions)

```yaml
name: Sync Bucket
on: push

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@master
    - uses: goodsmileduck/yandex-serverless-action@master
      env:
        SOURCE_DIR: '.'
        ZONE: 'ru-central1-a'
        FUNCTION_NAME: 'handler'
        RUNTIME: 'python37'
        ENTRYPOINT: 'main.handler'
        ENVIRONMENT: DEBUG=True,COUNT=1
        CLOUD_ID: ${{ secrets.CLOUD_ID }}
        FOLDER_ID: ${{ secrets.FOLDER_ID }}
        TOKEN: ${{ secrets.TOKEN }}
        BUCKET: ${{ secrets.BUCKET }}
        ACCESS_KEY: ${{ secrets.ACCESS_KEY }}
        SECRET_KEY: ${{ secrets.SECRET_KEY }}
        EXCLUDE: 'src/'
```

### Configuration

The following settings must be passed as environment variables as shown in the example. Sensitive information, especially `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, should be [set as encrypted secrets](https://help.github.com/en/articles/virtual-environments-for-github-actions#creating-and-using-secrets-encrypted-variables) — otherwise, they'll be public to anyone browsing your repository.

| Key | Value | Suggested Type | Required |
| ------------- | ------------- | ------------- | ------------- |
| `CLOUD_ID` | Yandex Cloud Id | `secret` | **Yes** |
| `FOLDER_ID` | Folder Id in Yandex cloud where function created. | `secret` | **Yes** |
| `TOKEN` | Token for access to yc cli. | `secret` | **Yes** |
| `FUNCTION_NAME` | The name of function in Yandex Cloud | `env` | **Yes** |
| `RUNTIME` | Runtime for function in Yandex Cloud | `env` | **Yes** |
| `ENTRYPOINT` | Entry point of function | `env` | **Yes** |
| `ENVIRONMENT` | Comma-separated list with env variables | `env` | No |
| `MEMORY` | Memory limit in megabytes for function in Yandex Cloud Default value is `128m`| `env` | No |
| `TIMEOUT` | Execution timeout in seconds for function in Yandex Cloud. Default value is `5s` | `env` | No |
| `ACCESS_KEY` | Your Access Key. Required if code bigger than 5Mb | `secret` | No |
| `SECRET_KEY` | Your Secret Access Key. Required if code bigger than 5Mb | `secret` | No |
| `BUCKET` | The name of the bucket you're syncing to. For example, `bucket`. If wasn't set action will try to upload code directly. Required if code bigger than 5Mb| `secret` | No |
| `SOURCE_DIR` | The local directory you wish to upload. For example, `./public`. Defaults to the root of your repository (`.`) if not provided. | `env` | No |
| `EXCLUDE` | Explicitly exclude the specified files. Defaults empty if not provided. | `env` | No |


## License

This project is distributed under the [MIT license](LICENSE.md).
