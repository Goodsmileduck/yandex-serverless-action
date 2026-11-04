# Yandex Serverless Action

<p align="left">
  <a href="https://github.com/Goodsmileduck/yandex-serverless-action/actions?query=workflow%3Ayandex-serverless-action"><img alt="yandex-serverless-action" src="https://github.com/Goodsmileduck/yandex-serverless-action/workflows/yandex-serverless-action/badge.svg"></a> 
  <a href="https://github.com/Goodsmileduck/yandex-serverless-action/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/Goodsmileduck/yandex-serverless-action"></a>
</p>

This action uploads code to object storage and updates Serverless function in Yandex Cloud with enhanced security, input validation, and error handling.

## ✨ Recent Improvements

- 🔒 **Enhanced Security**: Comprehensive input validation and sanitization
- 🛡️ **Error Handling**: Proper exception handling with descriptive error messages  
- 📊 **Input Validation**: Memory (128-8192MB) and timeout (1-3600s) bounds checking
- 🔧 **Environment Parsing**: Robust KEY=VALUE parsing with error recovery
- 🔑 **GitHub OIDC**: Deploy without stored Yandex credentials (see [Authentication](#authentication))
- ⚡ **Node.js 24**: Runs on the Node.js 24 Actions runtime
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
    permissions:
      contents: read
      id-token: write   # required for OIDC authentication
    steps:
    - uses: actions/checkout@v7
    - uses: goodsmileduck/yandex-serverless-action@v3
      with:
        oidc_service_account_id: ${{ vars.YC_SA_ID }}
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

The following settings must be passed as variables as shown in the example. Sensitive information, especially `service_account_key`, `iam_token` and `token`, should be [set as encrypted secrets](https://help.github.com/en/articles/virtual-environments-for-github-actions#creating-and-using-secrets-encrypted-variables) — otherwise, they'll be public to anyone browsing your repository.

| Key | Value | Suggested Type | Required |
| ------------- | ------------- | ------------- | ------------- |
| `oidc_service_account_id` | Service account ID to authenticate as via GitHub OIDC. See [Authentication](#authentication) | `env` | One auth method required |
| `oidc_audience` | Audience for the GitHub OIDC token; must match the federation audience. Default: `https://github.com/<owner>` | `env` | No |
| `service_account_key` | Service account authorized key JSON (`yc iam key create` output) | `secret` | One auth method required |
| `iam_token` | Yandex Cloud IAM token | `secret` | One auth method required |
| `token` | **Deprecated.** Yandex OAuth token. Yandex Cloud rejects OAuth tokens issued after 2026-06-01 | `secret` | One auth method required |
| `function_id` | The ID of function in Yandex Cloud | `env` | **Yes** |
| `runtime` | Runtime for function in Yandex Cloud. To get the list of allowed args visit [link](https://cloud.yandex.com/en-ru/docs/functions/concepts/runtime/#runtimes) | `env` | **Yes** |
| `entrypoint` | Entry point of function | `env` | **Yes** |
| `description` | Description for version of function | `env` | No |
| `environment` | Comma-separated list with env variables in format `KEY1=value1,KEY2=value2` | `env` | No |
| `memory` | Memory limit in `megabytes` for function in Yandex Cloud. Valid range: 128-8192MB. Default: `128` | `env` | No |
| `execution_timeout` | Execution timeout in seconds for function in Yandex Cloud. Valid range: 1-3600s. Default: `5` | `env` | No |
| `service_account` | Service account id. | `secret` | No |
| `bucket` | The name of the bucket you're syncing to. For example, `bucket`. If wasn't set action will try to upload code directly. Required if code bigger than 5Mb| `secret` | No |
| `accessKeyId` | Yandex AWS Access Key Id when s3 bucket used. Required if code bigger than 5Mb| `secret` | No |
| `secretAccessKey` | Yandex AWS Secret Access Key when s3 bucket used. Required if code bigger than 5Mb| `secret` | No |
| `source` | The local directory you wish to upload. For example, `./public`. Defaults to the root of your repository (`.`) if not provided. | `env` | No |
| `exclude` | Comma-separated patterns to exclude from archive (e.g., `*.txt, node_modules/`). Defaults empty if not provided. | `env` | No |

## Input Validation

This action includes comprehensive input validation to ensure security and reliability:

- **Required fields**: exactly one auth input (`oidc_service_account_id`, `service_account_key`, `iam_token` or `token`), `function_id`, `runtime`, `entrypoint` are validated for presence
- **Memory limits**: Must be between 128-8192 MB (defaults to 128 MB if invalid)
- **Execution timeout**: Must be between 1-3600 seconds (defaults to 5s if invalid)
- **Environment variables**: Malformed KEY=VALUE pairs are skipped with warnings
- **Exclude patterns**: Empty patterns are automatically filtered out

## Authentication

Set exactly one of the following inputs.

> Yandex Cloud no longer exchanges OAuth tokens issued after 2026-06-01, so new setups cannot use `token`.

### GitHub OIDC (recommended, no stored secrets)

Uses Yandex Cloud [Workload Identity Federation](https://yandex.cloud/en/docs/iam/concepts/workload-identity). GitHub issues the job a short-lived JWT, and the action exchanges it at `https://auth.yandex.cloud/oauth/token` for an IAM token of your service account. No credentials are stored in GitHub.

You need the [`yc` CLI](https://yandex.cloud/en/docs/cli/quickstart) logged in as a user who can manage IAM in the folder that contains your function. Each `create` command below prints the new resource's `id`; copy it into the next commands.

> Set the IDs explicitly, as below, rather than through `$(yc ... get ...)`. If that lookup times out, the variable silently ends up empty and later commands fail with confusing errors.

**1. Create the deployer service account**

```bash
FOLDER_ID=<folder_id>        # folder containing the function
yc iam service-account create --name github-deployer --folder-id $FOLDER_ID
SA_ID=<id printed above>
```

**2. Grant it the roles it needs**

| Role | Scope | Needed when |
| --- | --- | --- |
| `functions.editor` | folder | always (read the function, create versions) |
| `storage.viewer` | folder or bucket | deploying via `bucket` (Yandex Cloud reads the uploaded zip as the deployer) |
| `iam.serviceAccounts.user` | the runtime service account | setting `service_account` on the function |

```bash
yc resource-manager folder add-access-binding $FOLDER_ID \
  --role functions.editor --subject serviceAccount:$SA_ID

# only if you use `bucket`
yc resource-manager folder add-access-binding $FOLDER_ID \
  --role storage.viewer --subject serviceAccount:$SA_ID

# only if you use `service_account` (name or ID of the function's runtime SA)
yc iam service-account add-access-binding <runtime_sa_name_or_id> \
  --role iam.serviceAccounts.user --subject serviceAccount:$SA_ID
```

Uploading to the bucket itself still uses the static `accessKeyId`/`secretAccessKey` keys.

**3. Create a federation that trusts GitHub** (once per GitHub owner)

```bash
yc iam workload-identity oidc federation create --name github --folder-id $FOLDER_ID \
  --issuer "https://token.actions.githubusercontent.com" \
  --audiences "https://github.com/<github_owner>" \
  --jwks-url "https://token.actions.githubusercontent.com/.well-known/jwks"
FED_ID=<id printed above>
```

The audience must be `https://github.com/<github_owner>` (GitHub's default). If you choose a different value, pass the same one as `oidc_audience`.

**4. Allow specific workflows to use the service account**

Each federated credential matches one exact `sub` claim of the GitHub token. Create one per trigger that deploys:

| Workflow trigger | Subject |
| --- | --- |
| push to a branch | `repo:<owner>/<repo>:ref:refs/heads/<branch>` |
| push of a tag | `repo:<owner>/<repo>:ref:refs/tags/<tag>` |
| pull request | `repo:<owner>/<repo>:pull_request` |
| job with `environment:` | `repo:<owner>/<repo>:environment:<environment>` (takes precedence over the above) |

```bash
yc iam workload-identity federated-credential create --service-account-id $SA_ID \
  --federation-id $FED_ID --external-subject-id "repo:<owner>/<repo>:ref:refs/heads/main"
```

**5. Configure the workflow**

```bash
gh variable set YC_SA_ID --body $SA_ID     # the ID is not secret
```

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write          # lets the job request a GitHub OIDC token
    steps:
    - uses: actions/checkout@v7
    - uses: goodsmileduck/yandex-serverless-action@v3
      with:
        oidc_service_account_id: ${{ vars.YC_SA_ID }}
        function_id: '<function_id>'
        runtime: 'python312'
        entrypoint: 'main.handler'
        source: '.'
```

GitHub does not issue OIDC tokens to workflows triggered by Dependabot or by pull requests from forks. Skip the deploy job there, e.g. `if: github.event.pull_request.head.repo.full_name == github.repository && github.actor != 'dependabot[bot]'`.

**Troubleshooting**

| Error | Fix |
| --- | --- |
| `No credentials provided` | `vars.YC_SA_ID` is empty: the variable is missing or was set on another repo/environment. |
| `Failed to get GitHub OIDC token` | Add `permissions: id-token: write` to the job. Fork and Dependabot runs can't get tokens. |
| `No matching federated credentials for specified service account, issuer and external subject` | No federated credential matches this job's subject. The error shows the likely subject; add it (step 4). |
| `FunctionService/Get ... PERMISSION_DENIED` or function not found | Grant `functions.editor` in the folder that contains the function. |
| `CreateVersion PERMISSION_DENIED` when using `bucket` | Grant `storage.viewer` (step 2). |
| `CreateVersion PERMISSION_DENIED` when using `service_account` | Grant `iam.serviceAccounts.user` on the runtime service account (step 2). |
| `OAuth token ... issued after '2026-06-01', is not supported` | You are still using `token`; switch to OIDC. |

**Migrating from `token`:** replace `token: ${{ secrets.TOKEN }}` with `oidc_service_account_id: ${{ vars.YC_SA_ID }}`, add the `permissions` block, then delete the `TOKEN` secret.

### Service account authorized key

```bash
yc iam key create --service-account-id $SA_ID -o key.json
gh secret set YC_SA_KEY < key.json && rm key.json
```
Then pass `service_account_key: ${{ secrets.YC_SA_KEY }}`.

### IAM token

Pass a token you obtained in an earlier step (e.g. `yc iam create-token`) as `iam_token`. IAM tokens are valid for at most 12 hours.

## Node.js Runtime Requirements

- **Actions runtime**: `node24` (since v3.2.0)
- **GitHub-hosted runners**: supported on all current images
- **Self-hosted runners**: need a runner version that supports `node24` actions

# Scenarios

  - [Zip and and deploy folder](#zip-and-and-deploy-folder)
  - [Zip and upload to bucket and deploy](#zip-and-upload-to-bucket-and-deploy)
  - [Exclude pattern from archive](#Exclude-pattern-from-archive)
  - [Set service account id](#Set-service-account-id)

## Zip and and deploy folder

```yaml
- uses: goodsmileduck/yandex-serverless-action@v3
  with:
    oidc_service_account_id: ${{ vars.YC_SA_ID }}
    function_id: 'my_function_id'
    runtime: 'python39'
    memory: '256'
    entrypoint: 'main.handler'
    environment: DEBUG=True,COUNT=1
    source: '.'
```

## Zip and upload to bucket and deploy

```yaml
- uses: goodsmileduck/yandex-serverless-action@v3
  with:
    description: "Function with bucket"
    oidc_service_account_id: ${{ vars.YC_SA_ID }}
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
- uses: goodsmileduck/yandex-serverless-action@v3
  with:
    oidc_service_account_id: ${{ vars.YC_SA_ID }}
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
- uses: goodsmileduck/yandex-serverless-action@v3
  with:
    oidc_service_account_id: ${{ vars.YC_SA_ID }}
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
- **Solution**: Use numeric values between 128-8192 (e.g., `memory: '512'`)

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
