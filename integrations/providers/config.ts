import type { ProviderConfigStatus } from './contracts.ts';

export const DEFAULT_YAHOO_RETENTION_HOURS = 24;

export interface YahooConfigurationInput {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  applicationApproved?: boolean;
  hasStoredUserToken?: boolean;
  liveContractValidated?: boolean;
}

function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isAcceptableRedirectUri(value: string | undefined): boolean {
  if (!hasText(value)) return false;

  try {
    const url = new URL(value as string);
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))
    );
  } catch {
    return false;
  }
}

/**
 * Reports readiness without returning or logging any credential values.
 * A stored user token is reported as a boolean because tokens should not be
 * environment configuration once account connections are persisted.
 */
export function inspectYahooConfiguration(
  input: YahooConfigurationInput,
): ProviderConfigStatus {
  const missing: string[] = [];

  if (!hasText(input.clientId)) missing.push('YAHOO_CLIENT_ID');
  if (!hasText(input.clientSecret)) missing.push('YAHOO_CLIENT_SECRET');
  if (!isAcceptableRedirectUri(input.redirectUri)) {
    missing.push('YAHOO_REDIRECT_URI');
  }

  if (missing.length > 0) {
    return {
      provider: 'yahoo',
      readiness: 'configuration_required',
      readOnly: true,
      missingConfiguration: missing,
      liveContractValidated: false,
      retentionHours: DEFAULT_YAHOO_RETENTION_HOURS,
      message:
        'Yahoo application configuration is incomplete. Demo data remains active.',
    };
  }

  if (!input.applicationApproved) {
    return {
      provider: 'yahoo',
      readiness: 'approval_required',
      readOnly: true,
      missingConfiguration: [],
      liveContractValidated: false,
      retentionHours: DEFAULT_YAHOO_RETENTION_HOURS,
      message:
        'Yahoo application configuration is present, but provider approval is not recorded.',
    };
  }

  if (!input.hasStoredUserToken) {
    return {
      provider: 'yahoo',
      readiness: 'connection_required',
      readOnly: true,
      missingConfiguration: [],
      liveContractValidated: false,
      retentionHours: DEFAULT_YAHOO_RETENTION_HOURS,
      message:
        'Yahoo application configuration is present, but no user connection is stored.',
    };
  }

  if (!input.liveContractValidated) {
    return {
      provider: 'yahoo',
      readiness: 'validation_required',
      readOnly: true,
      missingConfiguration: [],
      liveContractValidated: false,
      retentionHours: DEFAULT_YAHOO_RETENTION_HOURS,
      message:
        'Yahoo is connected, but sanitized live response fixtures still require validation.',
    };
  }

  return {
    provider: 'yahoo',
    readiness: 'ready',
    readOnly: true,
    missingConfiguration: [],
    liveContractValidated: true,
    retentionHours: DEFAULT_YAHOO_RETENTION_HOURS,
    message:
      'Yahoo application approval, a stored connection, and live contract validation are recorded.',
  };
}

export function inspectYahooEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  hasStoredUserToken = false,
  applicationApproved = false,
  liveContractValidated = false,
): ProviderConfigStatus {
  return inspectYahooConfiguration({
    clientId: environment.YAHOO_CLIENT_ID,
    clientSecret: environment.YAHOO_CLIENT_SECRET,
    redirectUri: environment.YAHOO_REDIRECT_URI,
    applicationApproved,
    hasStoredUserToken,
    liveContractValidated,
  });
}
