import { describe, expect, it } from 'vitest';

import { eligibleAcpUrl } from '../src/acp-url-eligibility';

describe('ACP URL eligibility', () => {
  it('allows remote HTTPS navigation without fetching it', () => {
    expect(eligibleAcpUrl('https://auth.example.com/connect?state=secret-canary')).toEqual({ host: 'auth.example.com' });
    expect(eligibleAcpUrl('https://auth.example.com/connect?redirect_uri=https%3A%2F%2Fdone.example.com%2Fcb')).toEqual({ host: 'auth.example.com' });
  });

  it.each([
    'http://auth.example.com', 'https://localhost/connect', 'https://127.0.0.1/connect',
    'https://[::1]/connect', 'https://auth.example.com:8443/connect',
    'https://user:password@auth.example.com/connect', 'https://xn--e1afmkfd.example/connect',
    'https://auth.example.com/connect?redirect_uri=http%3A%2F%2F127.0.0.1%3A8888%2Fcallback',
    'https://auth.example.com/connect?callback=https%3A%2F%2Flocalhost%2Fdone',
    'https://auth.example.com/connect?redirect_uri=https%3A%2F%2Fuser%3Apass%40done.example.com%2Fcb',
    'https://auth.example.com/connect?next=https%3A%2F%2Fdone.example.com%2F%3Fnext%3Dhttp%253A%252F%252Flocalhost',
    'https://auth.example.com/connect?redirect_uri=%ZZ',
    'javascript:alert(1)', 'https://auth.example.com\\@localhost/connect',
  ])('rejects unsupported navigation %s', (url) => {
    expect(eligibleAcpUrl(url)).toBeNull();
  });
});
