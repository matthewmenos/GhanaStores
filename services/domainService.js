/**
 * DiDwa - Unified Domain Acquisition Service
 * Flow A: Bring Your Own Domain (Cloudflare for SaaS custom hostnames)
 * Flow B: Buy New Domain (Openprovider + Hubtel MoMo/Card checkout)
 *
 * DRY_RUN mode activates automatically when credentials are missing,
 * returning deterministic simulated results so the full domain flow
 * remains demoable without live keys.
 */
import axios from 'axios';

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || '';
const CLOUDFLARE_PROXY_IP = process.env.CLOUDFLARE_PROXY_IP || '104.16.0.1';

const OPENPROVIDER_API_URL = process.env.OPENPROVIDER_API_URL || 'https://api.openprovider.eu/v1';
const OPENPROVIDER_USERNAME = process.env.OPENPROVIDER_USERNAME || '';
const OPENPROVIDER_PASSWORD = process.env.OPENPROVIDER_PASSWORD || '';

const HUBTEL_CLIENT_ID = process.env.HUBTEL_CLIENT_ID || '';
const HUBTEL_CLIENT_SECRET = process.env.HUBTEL_CLIENT_SECRET || '';
const HUBTEL_BASE_URL = process.env.HUBTEL_CHECKOUT_BASE_URL || 'https://api.hubtel.com';
const HUBTEL_CALLBACK_URL = process.env.HUBTEL_CALLBACK_URL || '';
const PLATFORM_DOMAIN = (process.env.PLATFORM_DOMAIN || 'didwaghana.com').replace(/^https?:\/\//, '');
const CNAME_TARGET = process.env.CNAME_TARGET || `cname.${PLATFORM_DOMAIN}`;
const DOMAIN_MARGIN = Number(process.env.DOMAIN_MARGIN || 1.25);

export const domainDryRun = !(
  CLOUDFLARE_API_TOKEN && CLOUDFLARE_ZONE_ID &&
  OPENPROVIDER_USERNAME && OPENPROVIDER_PASSWORD &&
  HUBTEL_CLIENT_ID && HUBTEL_CLIENT_SECRET
);

const cf = axios.create({
  baseURL: 'https://api.cloudflare.com/client/v4',
  timeout: 25_000,
  headers: {
    Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

let _opToken = null;
let _opTokenExpiry = 0;

async function getOpenproviderToken() {
  if (_opToken && Date.now() < _opTokenExpiry) return _opToken;
  const { data } = await axios.post(`${OPENPROVIDER_API_URL}/auth/login`, {
    ip: '0.0.0.0',
    username: OPENPROVIDER_USERNAME,
    password: OPENPROVIDER_PASSWORD,
  });
  _opToken = data?.data?.token || '';
  _opTokenExpiry = Date.now() + 3500_000;
  return _opToken;
}

const op = axios.create({
  baseURL: OPENPROVIDER_API_URL,
  timeout: 25_000,
  headers: { 'Content-Type': 'application/json' },
});

op.interceptors.request.use(async (config) => {
  const token = await getOpenproviderToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function roundTo5Ghs(amount) {
  return Math.round(amount / 5) * 5;
}

function cleanDomain(domainName) {
  return String(domainName || '')
    .toLowerCase().trim()
    .replace(/^https?:\/\//, '')
    .split('/')[0];
}

/* =========================================================================
 * Flow A: Bring Your Own Domain (BYOD)
 * ========================================================================= */

export async function connectExistingDomain({ storeId, domainName }) {
  const clean = cleanDomain(domainName);
  if (!clean) throw new Error('Domain name is required.');

  if (domainDryRun) {
    console.log(`[domain:DRY_RUN] Connect existing domain ${clean} for store ${storeId}`);
    return {
      dryRun: true,
      domainName: clean,
      status: 'PENDING_DNS',
      provider: 'EXTERNAL',
      customHostnameId: `dry-hostname-${Date.now()}`,
      verificationErrors: [],
      dnsTarget: { aRecord: CLOUDFLARE_PROXY_IP, cnameRecord: CNAME_TARGET },
    };
  }

  let cfResult;
  try {
    const { data } = await cf.post(`/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames`, {
      hostname: clean,
      ssl: { method: 'http', type: 'dv' },
    });
    cfResult = data;
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[domain] Cloudflare custom_hostname create failed:', typeof detail === 'object' ? JSON.stringify(detail) : detail);
    throw new Error('Failed to provision SSL hostname on Cloudflare. Please verify domain ownership and retry.');
  }

  if (!cfResult?.success) {
    const errors = cfResult?.errors?.map((e) => e.message).join('; ') || 'Unknown Cloudflare error.';
    throw new Error(`Cloudflare provisioning failed: ${errors}`);
  }

  const hostname = cfResult.result;
  return {
    domainName: clean,
    status: 'PENDING_DNS',
    provider: 'EXTERNAL',
    customHostnameId: hostname.id,
    verificationErrors: hostname.ssl?.validation_errors || [],
    dnsTarget: { aRecord: CLOUDFLARE_PROXY_IP, cnameRecord: CNAME_TARGET },
  };
}

export async function verifyDomainStatus(domainName) {
  const clean = cleanDomain(domainName);

  if (domainDryRun) {
    console.log(`[domain:DRY_RUN] Verify status for ${clean}`);
    return { domainName: clean, status: 'ACTIVE', dryRun: true };
  }

  try {
    const { data } = await cf.get(`/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames`, {
      params: { hostname: clean },
    });

    if (!data?.success || !data.result?.length) {
      return { domainName: clean, status: 'PENDING_DNS', error: 'Hostname not found in Cloudflare.' };
    }

    const hostname = data.result[0];
    const sslStatus = hostname.ssl?.status || 'pending';

    let status = 'PENDING_DNS';
    if (sslStatus === 'active' || sslStatus === 'validated') status = 'ACTIVE';
    else if (sslStatus === 'pending_validation') status = 'PENDING_DNS';
    else if (sslStatus === 'deleted') status = 'FAILED';

    return {
      domainName: clean,
      status,
      customHostnameId: hostname.id,
      ssl: { status: sslStatus, method: hostname.ssl?.method },
      verificationErrors: hostname.ssl?.validation_errors || [],
    };
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[domain] Cloudflare verify failed:', typeof detail === 'object' ? JSON.stringify(detail) : detail);
    throw new Error('Unable to query Cloudflare verification status.');
  }
}

/* =========================================================================
 * Flow B: Buy New Domain (Openprovider + Hubtel)
 * ========================================================================= */

export async function searchDomains(query) {
  const cleanQuery = String(query || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
  if (!cleanQuery || cleanQuery.length < 2) {
    throw new Error('Enter at least 2 characters to search.');
  }

  const extensions = ['com', 'shop', 'africa', 'online'];

  if (domainDryRun) {
    console.log(`[domain:DRY_RUN] Search domains for "${cleanQuery}"`);
    return extensions.map((ext, i) => ({
      extension: ext,
      domain: `${cleanQuery}.${ext}`,
      available: i % 2 === 0,
      priceGhs: roundTo5Ghs(120 * (i + 1) * DOMAIN_MARGIN),
      priceOriginal: 120 * (i + 1),
      dryRun: true,
    }));
  }

  try {
    const domainsToCheck = extensions.map((ext) => ({ name: cleanQuery, extension: ext }));
    const { data } = await op.post('/domains/check', { domains: domainsToCheck });

    if (!data?.data?.results) throw new Error('Invalid response from Openprovider.');

    return data.data.results.map((r) => {
      const wholesale = Number(r.price?.product?.price || 120);
      return {
        extension: r.domain?.split('.').pop() || '',
        domain: r.domain || `${cleanQuery}.com`,
        available: r.status === 'active' || r.status === 'free',
        priceGhs: roundTo5Ghs(wholesale * DOMAIN_MARGIN),
        priceOriginal: wholesale,
      };
    });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[domain] Openprovider search failed:', typeof detail === 'object' ? JSON.stringify(detail) : detail);
    throw new Error('Domain search service is temporarily unavailable. Please retry.');
  }
}

export async function initializeHubtelCheckout({ amountGhs, domainName, customerPhone, customerEmail, storeId }) {
  if (!domainName || !amountGhs || !customerPhone) {
    throw new Error('Domain name, amount, and phone number are required.');
  }

  const reference = `GSD-${storeId}-${Date.now()}`;

  if (domainDryRun) {
    console.log(`[domain:DRY_RUN] Init Hubtel checkout: ${domainName} @ GHS ${amountGhs} for ${customerPhone}`);
    return {
      dryRun: true,
      checkoutUrl: `https://checkout.hubtel.com/dry-run/${reference}`,
      checkoutId: reference,
      reference,
    };
  }

  try {
    const { data } = await axios.post(
      `${HUBTEL_BASE_URL}/v2/pos/onlinecheckout/items/initiate`,
      {
        totalAmount: Number(amountGhs).toFixed(2),
        description: `Domain registration: ${domainName}`,
        callbackUrl: HUBTEL_CALLBACK_URL || undefined,
        merchantAccountNumber: process.env.HUBTEL_MERCHANT_ACCOUNT || undefined,
        cancellationUrl: `${process.env.CLIENT_URL || 'https://didwaghana.com'}/domains`,
        returnUrl: `${process.env.CLIENT_URL || 'https://didwaghana.com'}/domains`,
        clientReference: reference,
        items: [{
          name: domainName,
          quantity: 1,
          unitPrice: Number(amountGhs).toFixed(2),
          totalPrice: Number(amountGhs).toFixed(2),
        }],
        metadata: { storeId, domainName, customerEmail, customerPhone },
      },
      {
        auth: { username: HUBTEL_CLIENT_ID, password: HUBTEL_CLIENT_SECRET },
        headers: { 'Content-Type': 'application/json' },
        timeout: 25_000,
      },
    );

    return {
      checkoutUrl: data?.checkoutUrl || data?.data?.checkoutUrl || data?.response?.checkoutUrl,
      checkoutId: data?.checkoutId || data?.data?.reference || reference,
      reference,
    };
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[domain] Hubtel checkout init failed:', typeof detail === 'object' ? JSON.stringify(detail) : detail);
    throw new Error('Failed to initialize payment gateway. Please retry.');
  }
}

export async function handleHubtelWebhook(payload) {
  const status = payload?.Data?.Status || payload?.status || '';
  if (String(status).toLowerCase() !== 'success') {
    console.log('[domain] Hubtel webhook: non-success status ignored:', status);
    return { processed: false, reason: 'Not a successful transaction.' };
  }

  const reference = payload?.Data?.ClientReference || payload?.reference || '';
  const metadata = payload?.Data?.Metadata || payload?.metadata || {};
  const domainName = metadata.domainName || '';
  const storeId = metadata.storeId || '';

  if (!domainName || !storeId) {
    console.error('[domain] Hubtel webhook: missing domainName or storeId.', { reference });
    return { processed: false, reason: 'Missing metadata.' };
  }

  if (domainDryRun) {
    console.log(`[domain:DRY_RUN] Webhook auto-register ${domainName} for store ${storeId}`);
    return { processed: true, dryRun: true, domainName, storeId, action: 'REGISTERED' };
  }

  try {
    await op.post('/domains', {
      owner: {
        first_name: metadata.ownerName || 'Ghana',
        last_name: metadata.ownerName || 'Stores',
        email: metadata.customerEmail || `admin@${domainName}`,
      },
      name: domainName,
      period: 1,
      auto_renew: true,
    });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[domain] Openprovider registration failed:', typeof detail === 'object' ? JSON.stringify(detail) : detail);
  }

  try {
    await cf.post(`/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames`, {
      hostname: domainName,
      ssl: { method: 'http', type: 'dv' },
    });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[domain] Cloudflare provision after webhook failed:', typeof detail === 'object' ? JSON.stringify(detail) : detail);
  }

  return { processed: true, domainName, storeId, action: 'REGISTERED' };
}

export async function registerDomainOnOpenprovider({ domainName, ownerEmail, ownerName }) {
  if (domainDryRun) {
    console.log(`[domain:DRY_RUN] Register ${domainName} on Openprovider`);
    return { dryRun: true, domainName, orderId: `dry-op-${Date.now()}` };
  }

  try {
    const { data } = await op.post('/domains', {
      owner: {
        first_name: ownerName || 'Ghana',
        last_name: ownerName || 'Stores',
        email: ownerEmail || `admin@${domainName}`,
      },
      name: domainName,
      period: 1,
      auto_renew: true,
    });
    return { domainName, orderId: data?.data?.id || null, raw: data };
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[domain] Openprovider register failed:', typeof detail === 'object' ? JSON.stringify(detail) : detail);
    throw new Error('Domain registration failed. Please contact support.');
  }
}

export async function provisionCloudflareHostname(domainName) {
  if (domainDryRun) {
    console.log(`[domain:DRY_RUN] Provision Cloudflare hostname ${domainName}`);
    return { dryRun: true, hostnameId: `dry-cf-${Date.now()}` };
  }

  try {
    const { data } = await cf.post(`/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames`, {
      hostname: domainName,
      ssl: { method: 'http', type: 'dv' },
    });
    return { hostnameId: data?.result?.id, raw: data };
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[domain] Cloudflare provision failed:', typeof detail === 'object' ? JSON.stringify(detail) : detail);
    throw new Error('SSL provisioning failed. Please retry verification.');
  }
}

export default {
  connectExistingDomain,
  verifyDomainStatus,
  searchDomains,
  initializeHubtelCheckout,
  handleHubtelWebhook,
  registerDomainOnOpenprovider,
  provisionCloudflareHostname,
  get dryRun() { return domainDryRun; },
  get platformDomain() { return PLATFORM_DOMAIN; },
  get cnameTarget() { return CNAME_TARGET; },
  get cloudflareProxyIp() { return CLOUDFLARE_PROXY_IP; },
};
