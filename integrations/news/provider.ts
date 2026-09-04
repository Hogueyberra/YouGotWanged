import type {
  NormalizationResult,
  ProviderConfigStatus,
} from '../providers/contracts.ts';

export interface NewsSourceRights {
  sourceId: string;
  termsReviewedAt: string | null;
  collectionAllowed: boolean;
  storageAllowed: boolean;
  displayAllowed: boolean;
  derivativeUseAllowed: boolean;
  llmUseAllowed: boolean;
  attributionRequired: boolean;
  retentionHours: number | null;
}

export interface NewsObservation {
  sourceId: string;
  sourceItemId: string;
  canonicalUrl: string;
  subjectPlayerId: string | null;
  publishedAt: string;
  fetchedAt: string;
  availableToModelAt: string;
  headline: string | null;
  summary: string | null;
  originLineageId: string | null;
}

export interface NewsCollectionRequest {
  asOf: string;
  since: string | null;
}

export interface NewsSocialProvider {
  readonly status: ProviderConfigStatus;
  collect(
    request: NewsCollectionRequest,
  ): Promise<NormalizationResult<readonly NewsObservation[]>>;
}

export class NewsProviderDisabledError extends Error {
  constructor() {
    super(
      'News and social collection is disabled until a source contract and rights profile are approved.',
    );
    this.name = 'NewsProviderDisabledError';
  }
}

/** Reserved interface only. It performs no scraping, scheduling, or network I/O. */
export class DisabledNewsSocialProvider implements NewsSocialProvider {
  readonly status: ProviderConfigStatus = {
    provider: 'news-social-reserved',
    readiness: 'disabled',
    readOnly: true,
    missingConfiguration: [],
    liveContractValidated: false,
    retentionHours: null,
    message:
      'News and social sources are reserved but disabled pending provider and rights approval.',
  };

  collect(
    _request: NewsCollectionRequest,
  ): Promise<NormalizationResult<readonly NewsObservation[]>> {
    return Promise.reject(new NewsProviderDisabledError());
  }
}
