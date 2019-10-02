# Yandex serverless action
> **Note:** To use this action, you must have access to the [GitHub Actions](https://github.com/features/actions) feature. GitHub Actions are currently only available in public beta. You can [apply for the GitHub Actions beta here](https://github.com/features/actions/signup/).

This action uploads code to object storage and update Serverless funstion in Yandex cloud.

## Usage

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
        CLOUD_ID: ${{ secrets.CLOUD_ID }}
        FOLDER_ID: ${{ secrets.FOLDER_ID }}
        TOKEN: ${{ secrets.TOKEN }}
        BUCKET: ${{ secrets.BUCKET }}
        ACCESS_KEY: ${{ secrets.ACCESS_KEY }}
        SECRET_KEY: ${{ secrets.SECRET_KEY }}
```

### Configuration

The following settings must be passed as environment variables as shown in the example. Sensitive information, especially `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, should be [set as encrypted secrets](https://help.github.com/en/articles/virtual-environments-for-github-actions#creating-and-using-secrets-encrypted-variables) — otherwise, they'll be public to anyone browsing your repository.

| Key | Value | Suggested Type | Required |
| ------------- | ------------- | ------------- | ------------- |
| `ACCESS_KEY` | Your AWS Access Key. [More info here.](https://docs.aws.amazon.com/general/latest/gr/managing-aws-access-keys.html) | `secret` | **Yes** |
| `SECRET_KEY` | Your AWS Secret Access Key. [More info here.](https://docs.aws.amazon.com/general/latest/gr/managing-aws-access-keys.html) | `secret` | **Yes** |
| `BUCKET` | The name of the bucket you're syncing to. For example, `bucket`. | `secret` | **Yes** |
| `SOURCE_DIR` | The local directory you wish to sync/upload to S3. For example, `./public`. Defaults to the root of your repository (`.`) if not provided. | `env` | No |


## License

This project is distributed under the [MIT license](LICENSE.md).
