import { Session } from "@yandex-cloud/nodejs-sdk";
export declare const YC_TOKEN_EXCHANGE_URL = "https://auth.yandex.cloud/oauth/token";
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
export declare function createSession(inputs: IAuthInputs): Promise<Session>;
export declare function parseAuthorizedKey(raw: string): {
    serviceAccountId: string;
    accessKeyId: string;
    privateKey: string;
};
export declare function exchangeGithubOidcToken(serviceAccountId: string, audience: string): Promise<string>;
