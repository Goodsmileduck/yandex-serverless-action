# Yandex Serverless Action

<p align="left">
  <a href="https://github.com/Goodsmileduck/yandex-serverless-action/actions?query=workflow%3Ayandex-serverless-action"><img alt="yandex-serverless-action" src="https://github.com/Goodsmileduck/yandex-serverless-action/workflows/yandex-serverless-action/badge.svg"></a> 
  <a href="https://github.com/Goodsmileduck/yandex-serverless-action/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/Goodsmileduck/yandex-serverless-action"></a>
</p>

This action uploads code to object storage and updates Serverless function in Yandex Cloud with enhanced security, input validation, and error handling.

## ✨ Recent Improvements

- 🔒 **Enhanced Security**: Comprehensive input validation and sanitization
- 🛡️ **Error Handling**: Proper exception handling with descriptive error messages  
- 📊 **Input Validation**: Memory (128-4096MB) and timeout (1-900s) bounds checking
- 🔧 **Environment Parsing**: Robust KEY=VALUE parsing with error recovery
- ⚡ **Node.js 20**: Updated to latest Node.js runtime for better performance
- 🏗️ **Dependencies**: All dependencies updated to latest secure versions


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
    - uses: actions/checkout@v4
    - uses: goodsmileduck/yandex-serverless-action@v2
      with:
        token: ${{ secrets.TOKEN }}
        bucket: ${{ secrets.BUCKET }}
        accessKeyId: ${{ secrets.ACCESS_KEY_ID }}
        secretAccessKey: ${{ secrets.SECRET_ACCESS_KEY }}
        function_id: '234awefq12345g24f'
        runtime: 'python39'
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
| `runtime` | Runtime for function in Yandex Cloud. To get the list of allowed args visit [link](https://cloud.yandex.com/en-ru/docs/functions/concepts/runtime/#runtimes) | `env` | **Yes** |
| `entrypoint` | Entry point of function | `env` | **Yes** |
| `description` | Description for version of function | `env` | No |
| `environment` | Comma-separated list with env variables in format `KEY1=value1,KEY2=value2` | `env` | No |
| `memory` | Memory limit in `megabytes` for function in Yandex Cloud. Valid range: 128-4096MB. Default: `128` | `env` | No |
| `execution_timeout` | Execution timeout in seconds for function in Yandex Cloud. Valid range: 1-900s. Default: `5` | `env` | No |
| `service_account` | Service account id. | `secret` | No |
| `bucket` | The name of the bucket you're syncing to. For example, `bucket`. If wasn't set action will try to upload code directly. Required if code bigger than 5Mb| `secret` | No |
| `accessKeyId` | Yandex AWS Access Key Id when s3 bucket used. Required if code bigger than 5Mb| `secret` | No |
| `secretAccessKey` | Yandex AWS Secret Access Key when s3 bucket used. Required if code bigger than 5Mb| `secret` | No |
| `source` | The local directory you wish to upload. For example, `./public`. Defaults to the root of your repository (`.`) if not provided. | `env` | No |
| `exclude` | Comma-separated patterns to exclude from archive (e.g., `*.txt, node_modules/`). Defaults empty if not provided. | `env` | No |

## Input Validation

This action includes comprehensive input validation to ensure security and reliability:

- **Required fields**: `token`, `function_id`, `runtime`, `entrypoint` are validated for presence
- **Memory limits**: Must be between 128-4096 MB (defaults to 128 MB if invalid)
- **Execution timeout**: Must be between 1-900 seconds (defaults to 5s if invalid)
- **Environment variables**: Malformed KEY=VALUE pairs are skipped with warnings
- **Exclude patterns**: Empty patterns are automatically filtered out

## Node.js Runtime Requirements

- **Minimum Node.js version**: 20.x
- **GitHub Actions runner**: Uses Node.js 20 runtime
- **Compatibility**: Works with ubuntu-latest, ubuntu-20.04, ubuntu-22.04

# Scenarios

  - [Zip and and deploy folder](#zip-and-and-deploy-folder)
  - [Zip and upload to bucket and deploy](#zip-and-upload-to-bucket-and-deploy)
  - [Exclude pattern from archive](#Exclude-pattern-from-archive)
  - [Set service account id](#Set-service-account-id)

## Zip and and deploy folder

```yaml
- uses: goodsmileduck/yandex-serverless-action@v2
  with:
    token: ${{ secrets.TOKEN }}
    function_id: 'my_function_id'
    runtime: 'python39'
    memory: '256'
    entrypoint: 'main.handler'
    environment: DEBUG=True,COUNT=1
    source: '.'
```

## Zip and upload to bucket and deploy

```yaml
- uses: goodsmileduck/yandex-serverless-action@v2
  with:
    description: "Function with bucket"
    token: ${{ secrets.TOKEN }}
    bucket: ${{ secrets.BUCKET }}
    accessKeyId: ${{ secrets.ACCESS_KEY_ID }}
    secretAccessKey: ${{ secrets.SECRET_ACCESS_KEY }}
    function_id: 'my_function_id'
    runtime: 'python39'
    memory: '256'
    entrypoint: 'main.handler'
    environment: DEBUG=True,COUNT=1
    source: './src'
```

## Exclude pattern from archive

```yaml
- uses: goodsmileduck/yandex-serverless-action@v2
  with:
    token: ${{ secrets.TOKEN }}
    function_id: 'my_function_id'
    runtime: 'python39'
    memory: '256'
    entrypoint: 'main.handler'
    environment: DEBUG=True,COUNT=2
    source: './public'
    exclude: '*.txt, node_modules/'
```

## Set service account id

```yaml
- uses: goodsmileduck/yandex-serverless-action@v2
  with:
    token: ${{ secrets.TOKEN }}
    function_id: 'my_function_id'
    runtime: 'python39'
    memory: '256'
    entrypoint: 'main.handler'
    environment: DEBUG=True,COUNT=2
    source: './public'
    service_account: ${{ secrets.SERVICE_ACCOUNT }}
```

## Troubleshooting

### Common Issues

**❌ "Missing GITHUB_SHA environment variable"**
- **Cause**: Action not running in GitHub Actions environment
- **Solution**: Ensure you're running this in a GitHub Actions workflow

**❌ "Missing ACCESS_KEY_ID or SECRET_ACCESS_KEY when bucket is specified"**
- **Cause**: Bucket specified but AWS credentials missing
- **Solution**: Add `accessKeyId` and `secretAccessKey` inputs when using bucket

**❌ "Invalid memory: 'abc' is not a valid number"**
- **Cause**: Non-numeric value provided for memory
- **Solution**: Use numeric values between 128-4096 (e.g., `memory: '512'`)

**❌ "Failed to find function with ID: xyz"**
- **Cause**: Function doesn't exist or access denied
- **Solution**: Verify function ID and ensure token has proper permissions

### Debug Mode

Enable debug logging by setting:
```yaml
env:
  ACTIONS_STEP_DEBUG: true
```

### Supported Runtimes

Refer to [Yandex Cloud documentation](https://cloud.yandex.com/en-ru/docs/functions/concepts/runtime/#runtimes) for current runtime versions:
- `python39`, `python311`
- `nodejs18`, `nodejs20`  
- `go119`, `go121`
- And more...

## License

This project is distributed under the [MIT license](LICENSE.md).
