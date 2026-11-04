import * as core from "@actions/core";
import { IamTokenService } from "@yandex-cloud/nodejs-sdk/dist/token-service/iam-token-service";

const YC_TOKEN_EXCHANGE_URL = "https://auth.yandex.cloud/oauth/token";
const YC_IAM_TOKENS_URL = "https://iam.api.cloud.yandex.net/iam/v1/tokens";

/**
 * Authentication inputs. Exactly one method must be provided.
 */
export interface IAuthInputs {
    /** Legacy Yandex OAuth token. Tokens issued after 2026-06-01 are rejected by Yandex Cloud IAM. */
    token: string;
    /** Ready-made IAM token (e.g. from `yc iam create-token`). */
    iamToken: string;
    /** Authorized key JSON, as produced by `yc iam key create`. */
    serviceAccountKey: string;
    /** Service account ID to impersonate via GitHub OIDC (Workload Identity Federation). */
    oidcServiceAccountId: string;
    /** Audience requested for the GitHub OIDC token. Empty means GitHub's default (https://github.com/<owner>). */
    oidcAudience: string;
}

interface IAuthorizedKey {
    id?: string;
    service_account_id?: string;
    private_key?: string;
}

/**
 * Resolves the configured credentials to a Yandex Cloud IAM token. The same token is used for
 * the Cloud API session and for Object Storage uploads.
 */
export async function resolveIamToken(inputs: IAuthInputs): Promise<string> {
    const provided = [
        inputs.token && "token",
        inputs.iamToken && "iam_token",
        inputs.serviceAccountKey && "service_account_key",
        inputs.oidcServiceAccountId && "oidc_service_account_id",
    ].filter(Boolean);

    if (provided.length === 0) {
        throw new Error(
            "No credentials provided: set one of oidc_service_account_id, service_account_key, iam_token or token"
        );
    }
    if (provided.length > 1) {
        throw new Error(`Only one authentication method may be set, got: ${provided.join(", ")}`);
    }

    if (inputs.oidcServiceAccountId) {
        core.info(`Authenticating via GitHub OIDC as service account "${inputs.oidcServiceAccountId}"`);
        return exchangeGithubOidcToken(inputs.oidcServiceAccountId, inputs.oidcAudience);
    }

    if (inputs.serviceAccountKey) {
        const key = parseAuthorizedKey(inputs.serviceAccountKey);
        core.info(`Authenticating with authorized key of service account "${key.serviceAccountId}"`);
        const iamToken = await new IamTokenService(key).getToken();
        core.setSecret(iamToken);
        return iamToken;
    }

    if (inputs.iamToken) {
        core.info("Authenticating with IAM token");
        return inputs.iamToken;
    }

    core.warning(
        "The `token` (OAuth) input is deprecated: Yandex Cloud no longer exchanges OAuth tokens issued after " +
        "2026-06-01. Switch to oidc_service_account_id or service_account_key."
    );
    const { iamToken } = await postForToken<{ iamToken?: string; message?: string }>(
        YC_IAM_TOKENS_URL,
        { "Content-Type": "application/json" },
        JSON.stringify({ yandexPassportOauthToken: inputs.token }),
        "iamToken",
        (status, payload, text) => `Failed to obtain IAM token (HTTP ${status}): ${payload.message || text}`,
    );
    return iamToken!;
}

function parseAuthorizedKey(raw: string): { serviceAccountId: string; accessKeyId: string; privateKey: string } {
    let parsed: IAuthorizedKey;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error("service_account_key is not valid JSON (expected the output of `yc iam key create`)");
    }

    if (!parsed.id || !parsed.service_account_id || !parsed.private_key) {
        throw new Error("service_account_key must contain id, service_account_id and private_key");
    }

    // `yc iam key create` prefixes the PEM with a warning line; keep only the PEM block.
    const pemStart = parsed.private_key.indexOf("-----BEGIN");
    const privateKey = pemStart >= 0 ? parsed.private_key.slice(pemStart) : parsed.private_key;

    return { serviceAccountId: parsed.service_account_id, accessKeyId: parsed.id, privateKey };
}

async function exchangeGithubOidcToken(serviceAccountId: string, audience: string): Promise<string> {
    let githubToken: string;
    try {
        githubToken = await core.getIDToken(audience || undefined);
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Failed to get GitHub OIDC token (${reason}). The job needs \`permissions: id-token: write\`; ` +
            "OIDC is not available for pull requests from forks or Dependabot."
        );
    }

    const body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
        audience: serviceAccountId,
        subject_token: githubToken,
        subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    });

    const { access_token } = await postForToken<{ access_token?: string; error?: string; error_description?: string }>(
        YC_TOKEN_EXCHANGE_URL,
        { "Content-Type": "application/x-www-form-urlencoded" },
        body.toString(),
        "access_token",
        (status, payload, text) =>
            `Yandex Cloud token exchange failed (HTTP ${status}): ${payload.error_description || payload.error || text}. ` +
            "Check that the workload identity federation trusts this repository and that a federated " +
            `credential links service account "${serviceAccountId}" to this job's subject (likely "${subjectHint()}").`,
    );
    return access_token!;
}

/** POSTs `body`, requires `field` in the JSON response, masks it, and returns the payload. */
async function postForToken<T extends object>(
    url: string,
    headers: Record<string, string>,
    body: string,
    field: keyof T & string,
    describeError: (status: number, payload: T, text: string) => string,
): Promise<T> {
    const response = await fetch(url, { method: "POST", headers, body });
    const text = await response.text();
    const payload = parseJson<T>(text);
    const token = (payload as Record<string, unknown>)[field];

    if (!response.ok || typeof token !== "string" || !token) {
        throw new Error(describeError(response.status, payload, text.slice(0, 500)));
    }
    core.setSecret(token);
    return payload;
}

function parseJson<T extends object>(text: string): T {
    try {
        return JSON.parse(text);
    }
    catch {
        return {} as T;
    }
}

function subjectHint(): string {
    const repo = process.env.GITHUB_REPOSITORY || "<owner>/<repo>";
    if (process.env.GITHUB_EVENT_NAME === "pull_request") {
        return `repo:${repo}:pull_request`;
    }
    return `repo:${repo}:ref:${process.env.GITHUB_REF || "refs/heads/<branch>"}`;
}
