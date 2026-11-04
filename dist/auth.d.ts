export declare const YC_TOKEN_EXCHANGE_URL = "https://auth.yandex.cloud/oauth/token";
export declare const YC_IAM_TOKENS_URL = "https://iam.api.cloud.yandex.net/iam/v1/tokens";
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
/**
 * Resolves the configured credentials to a Yandex Cloud IAM token. The same token is used for
 * the Cloud API session and for Object Storage uploads.
 */
export declare function resolveIamToken(inputs: IAuthInputs): Promise<string>;
export declare function parseAuthorizedKey(raw: string): {
    serviceAccountId: string;
    keyId: string;
    privateKey: string;
};
/** PS256 JWT for exchanging an authorized key at the IAM tokens endpoint. */
export declare function signServiceAccountJwt(key: {
    serviceAccountId: string;
    keyId: string;
    privateKey: string;
}): string;
export declare function exchangeGithubOidcToken(serviceAccountId: string, audience: string): Promise<string>;
