import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthConfig } from '../config/configuration';
import type { SessionUser } from './session.service';

export const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
export const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
export const GITHUB_API_URL = 'https://api.github.com';

interface GitHubTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUserResponse {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

/**
 * Server-side GitHub OAuth App flow with read-only scopes. The access token
 * exchanged here is handed to SessionService and never returned to the
 * browser. `configured` is false until a client id + secret are present; the
 * auth controller then bounces the user to a readable "not configured" state
 * instead of crashing.
 */
@Injectable()
export class GitHubAuthService {
  constructor(private readonly config: ConfigService) {}

  private get authConfig(): AuthConfig {
    return this.config.get<AuthConfig>('auth') ?? ({} as AuthConfig);
  }

  get configured(): boolean {
    return Boolean(this.authConfig.githubClientId && this.authConfig.githubClientSecret);
  }

  /** GitHub authorize URL for a fresh CSRF state value. */
  getAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.authConfig.githubClientId,
      redirect_uri: this.authConfig.githubRedirectUri,
      // Read-only: identity + public repos. No scary private-repo scope.
      scope: 'read:user public_repo',
      state,
    });
    return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
  }

  /** Exchanges an authorization code for an access token. */
  async exchangeCode(code: string): Promise<string> {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.authConfig.githubClientId,
        client_secret: this.authConfig.githubClientSecret,
        code,
        redirect_uri: this.authConfig.githubRedirectUri,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`GITHUB_TOKEN_EXCHANGE_FAILED (${response.status})`);
    }
    const data = (await response.json()) as GitHubTokenResponse;
    if (!data.access_token) {
      throw new Error(
        `GITHUB_TOKEN_EXCHANGE_FAILED: ${data.error ?? 'no access token returned'}`,
      );
    }
    return data.access_token;
  }

  /** Fetches the authenticated user's profile. */
  async fetchUser(accessToken: string): Promise<SessionUser> {
    const response = await fetch(`${GITHUB_API_URL}/user`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'TraceGraph',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`GITHUB_USER_FETCH_FAILED (${response.status})`);
    }
    const user = (await response.json()) as GitHubUserResponse;
    return {
      id: String(user.id),
      login: user.login,
      name: user.name ?? user.login,
      avatarUrl: user.avatar_url ?? '',
    };
  }
}
