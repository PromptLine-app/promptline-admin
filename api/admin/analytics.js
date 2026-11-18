import crypto from 'crypto';

// In-memory cache for reports
const cache = new Map();
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key, customTtl) {
  const item = cache.get(key);
  if (!item) return null;
  const ttl = customTtl !== undefined ? customTtl : DEFAULT_CACHE_TTL_MS;
  if (Date.now() - item.ts > ttl) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data) {
  cache.set(key, { ts: Date.now(), data });
}

/**
 * Exchange Google Service Account credentials for an OAuth2 access token.
 */
async function getGoogleAccessToken(clientEmail, privateKey) {
  const cacheKey = `token_${clientEmail}`;
  const cached = getCached(cacheKey, 50 * 60 * 1000); // 50 mins
  if (cached) return cached;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsignedToken = `${b64(header)}.${b64(claim)}`;

  const formattedKey = privateKey
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n')
    .trim();

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsignedToken);
  sign.end();
  const signature = sign.sign(formattedKey, 'base64url');
  const assertion = `${unsignedToken}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth token error (${res.status}): ${errText}`);
  }

  const { access_token } = await res.json();
  setCache(cacheKey, access_token);
  return access_token;
}

/**
 * Run a GA4 report query via REST
 */
async function runGa4Report(propertyId, token, body, isRealtime = false) {
  const endpoint = isRealtime ? 'runRealtimeReport' : 'runReport';
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:${endpoint}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GA4 API error (${res.status}): ${err}`);
  }

  return await res.json();
}

/**
 * Provide sensible fallback / demo data when credentials are not yet configured.
 */
function getFallbackData(type, range, debugInfo = {}) {
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 28;

  let baseData;
  if (type === 'realtime') {
    const minuteBars = Array.from({ length: 30 }, (_, i) => ({
      minute: 29 - i,
      users: i >= 25 ? Math.floor(Math.random() * 25 + 35) : Math.floor(Math.random() * 5),
    }));

    baseData = {
      activeUsers: 59,
      activeUsersLast5: 57,
      minuteBars,
      topPages: [
        { page: 'PromptLine', views: 67, users: 58 },
        { page: 'Home Services (Roofing, HVAC...)', views: 2, users: 2 },
      ],
      totalPageviews: 69,
      topCountries: [
        { country: 'United States', users: 55 },
        { country: 'India', users: 3 },
        { country: 'Canada', users: 1 },
      ],
      topCities: [
        { country: 'United States', city: 'Cedar Rapids', users: 24 },
        { country: 'United States', city: 'Des Moines', users: 18 },
        { country: 'India', city: 'Mumbai', users: 3 },
      ],
      topEvents: [
        { eventName: 'page_view', count: 68 },
        { eventName: 'first_visit', count: 61 },
        { eventName: 'session_start', count: 59 },
        { eventName: 'scroll', count: 21 },
        { eventName: 'user_engagement', count: 5 },
        { eventName: 'form_start', count: 2 },
      ],
      totalEvents: 216,
      deviceBreakdown: [
        { category: 'desktop', users: 48 },
        { category: 'mobile', users: 11 },
      ],
      totalDeviceUsers: 59,
      topSources: [
        { source: '(direct)', users: 42 },
        { source: 'google', users: 12 },
        { source: 'linkedin', users: 5 },
      ],
    };
  } else if (type === 'sources') {
    baseData = {
      channelGroups: [
        { channel: 'Direct', sessions: Math.round(days * 42), pct: 45.2 },
        { channel: 'Organic Search', sessions: Math.round(days * 28), pct: 30.1 },
        { channel: 'Email Outreach', sessions: Math.round(days * 15), pct: 16.1 },
        { channel: 'Referral', sessions: Math.round(days * 8), pct: 8.6 },
      ],
      rows: [
        { source: '(direct)', medium: '(none)', sessions: Math.round(days * 42), users: Math.round(days * 35), bounceRate: 38.5, avgSessionDuration: 145 },
        { source: 'google', medium: 'organic', sessions: Math.round(days * 28), users: Math.round(days * 25), bounceRate: 42.1, avgSessionDuration: 182 },
        { source: 'zoho-mail', medium: 'email', sessions: Math.round(days * 15), users: Math.round(days * 14), bounceRate: 29.4, avgSessionDuration: 210 },
        { source: 'linkedin.com', medium: 'referral', sessions: Math.round(days * 8), users: Math.round(days * 7), bounceRate: 51.0, avgSessionDuration: 94 },
      ],
    };
  } else if (type === 'geo') {
    baseData = {
      countries: [
        { country: 'United States', users: Math.round(days * 55), sessions: Math.round(days * 68), pct: 68.2 },
        { country: 'Canada', users: Math.round(days * 12), sessions: Math.round(days * 14), pct: 14.8 },
        { country: 'United Kingdom', users: Math.round(days * 8), sessions: Math.round(days * 9), pct: 9.9 },
        { country: 'Germany', users: Math.round(days * 4), sessions: Math.round(days * 4), pct: 4.9 },
        { country: 'Australia', users: Math.round(days * 2), sessions: Math.round(days * 2), pct: 2.2 },
      ],
      cities: [
        { city: 'Cedar Rapids', country: 'United States', users: Math.round(days * 18), sessions: Math.round(days * 22), newUsers: Math.round(days * 15) },
        { city: 'Des Moines', country: 'United States', users: Math.round(days * 14), sessions: Math.round(days * 17), newUsers: Math.round(days * 12) },
        { city: 'Chicago', country: 'United States', users: Math.round(days * 11), sessions: Math.round(days * 13), newUsers: Math.round(days * 9) },
        { city: 'Toronto', country: 'Canada', users: Math.round(days * 8), sessions: Math.round(days * 9), newUsers: Math.round(days * 7) },
        { city: 'New York', country: 'United States', users: Math.round(days * 7), sessions: Math.round(days * 8), newUsers: Math.round(days * 6) },
      ],
    };
  } else if (type === 'devices') {
    baseData = {
      categories: [
        { category: 'desktop', users: Math.round(days * 58), sessions: Math.round(days * 72), pct: 62.5 },
        { category: 'mobile', users: Math.round(days * 31), sessions: Math.round(days * 38), pct: 33.4 },
        { category: 'tablet', users: Math.round(days * 4), sessions: Math.round(days * 5), pct: 4.1 },
      ],
      browsers: [
        { name: 'Chrome', users: Math.round(days * 52), sessions: Math.round(days * 65), pct: 56.5 },
        { name: 'Safari', users: Math.round(days * 24), sessions: Math.round(days * 30), pct: 26.1 },
        { name: 'Edge', users: Math.round(days * 11), sessions: Math.round(days * 13), pct: 12.0 },
        { name: 'Firefox', users: Math.round(days * 5), sessions: Math.round(days * 6), pct: 5.4 },
      ],
      operatingSystems: [
        { name: 'Windows', users: Math.round(days * 42), sessions: Math.round(days * 52), pct: 45.6 },
        { name: 'macOS', users: Math.round(days * 26), sessions: Math.round(days * 32), pct: 28.3 },
        { name: 'iOS', users: Math.round(days * 18), sessions: Math.round(days * 22), pct: 19.6 },
        { name: 'Android', users: Math.round(days * 6), sessions: Math.round(days * 7), pct: 6.5 },
      ],
    };
  } else if (type === 'pages') {
    baseData = {
      totalViews: Math.round(days * 148),
      rows: [
        { path: '/', title: 'PromptLine | AI Answering Service for Local Businesses', views: Math.round(days * 72), users: Math.round(days * 55), avgDurationSec: 110, bounceRate: 35.2 },
        { path: '/pricing', title: 'Pricing & Plans | PromptLine', views: Math.round(days * 34), users: Math.round(days * 28), avgDurationSec: 145, bounceRate: 28.4 },
        { path: '/roi-calculator', title: 'ROI Loss Calculator | PromptLine', views: Math.round(days * 22), users: Math.round(days * 18), avgDurationSec: 195, bounceRate: 21.0 },
        { path: '/demo', title: 'Interactive Voice Agent Demo | PromptLine', views: Math.round(days * 14), users: Math.round(days * 12), avgDurationSec: 240, bounceRate: 18.5 },
        { path: '/contact', title: 'Contact Sales | PromptLine', views: Math.round(days * 6), users: Math.round(days * 5), avgDurationSec: 90, bounceRate: 40.0 },
      ],
    };
  } else if (type === 'goals') {
    baseData = {
      totalConversions: Math.round(days * 5.4),
      overallRatePct: 4.8,
      goals: [
        { eventName: 'calculator_lead_submitted', category: 'lead_generation', eventCount: Math.round(days * 2.2), totalUsers: Math.round(days * 2), conversionRatePct: 2.1 },
        { eventName: 'contact_form_submitted', category: 'lead_generation', eventCount: Math.round(days * 1.5), totalUsers: Math.round(days * 1.4), conversionRatePct: 1.4 },
        { eventName: 'demo_call_initiated', category: 'engagement', eventCount: Math.round(days * 1.1), totalUsers: Math.round(days * 1), conversionRatePct: 0.9 },
        { eventName: 'pricing_plan_selected', category: 'conversion', eventCount: Math.round(days * 0.6), totalUsers: Math.round(days * 0.5), conversionRatePct: 0.4 },
      ],
    };
  } else {
    // Default: Overview
    const timeseries = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const baseUsers = 12 + Math.round(Math.sin(i * 0.5) * 6) + (i % 7 === 0 ? 8 : 0);
      timeseries.push({
        date: `${yr}${mo}${day}`,
        users: baseUsers,
        sessions: Math.round(baseUsers * 1.25),
        pageviews: Math.round(baseUsers * 2.1),
      });
    }

    const totalUsers = timeseries.reduce((acc, r) => acc + r.users, 0);
    const totalSessions = timeseries.reduce((acc, r) => acc + r.sessions, 0);
    const totalPageviews = timeseries.reduce((acc, r) => acc + r.pageviews, 0);

    baseData = {
      kpis: {
        totalUsers,
        newUsers: Math.round(totalUsers * 0.82),
        sessions: totalSessions,
        pageviews: totalPageviews,
        bounceRate: 36.8,
        avgSessionDuration: 154,
        usersDelta: 14.2,
        sessionsDelta: 11.8,
      },
      timeseries,
    };
  }

  return {
    ...baseData,
    _debug: {
      isLive: false,
      ...debugInfo,
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { type = 'overview', range = '28d' } = req.query;
  const propertyId = (process.env.GA_PROPERTY_ID || '565054817').trim();
  const clientEmail = (process.env.GA_CLIENT_EMAIL || '').trim();
  const privateKey = (process.env.GA_PRIVATE_KEY || '').trim();

  const isRealtimeQuery = type === 'realtime';
  const ttl = isRealtimeQuery ? 10 * 1000 : DEFAULT_CACHE_TTL_MS;

  const cacheKey = `${type}_${range}_${propertyId}`;
  const cached = getCached(cacheKey, ttl);
  if (cached) {
    return res.status(200).json(cached);
  }

  // Check if env vars are missing
  if (!clientEmail || !privateKey) {
    const missing = [];
    if (!clientEmail) missing.push('GA_CLIENT_EMAIL');
    if (!privateKey) missing.push('GA_PRIVATE_KEY');
    return res.status(200).json(getFallbackData(type, range, {
      error: `Missing environment variable(s): ${missing.join(', ')} on Vercel`,
      propertyId,
    }));
  }

  try {
    const token = await getGoogleAccessToken(clientEmail, privateKey);
    const daysAgo = range === '7d' ? '7daysAgo' : range === '90d' ? '90daysAgo' : '28daysAgo';

    let resultData;

    if (type === 'realtime') {
      const [
        minuteReport,
        pagesReport,
        countriesReport,
        eventsReport,
        devicesReport,
        sourcesReport,
      ] = await Promise.all([
        runGa4Report(
          propertyId,
          token,
          {
            dimensions: [{ name: 'minutesAgo' }],
            metrics: [{ name: 'activeUsers' }],
          },
          true,
        ).catch((err) => {
          console.warn('Minute report error:', err.message);
          return null;
        }),
        runGa4Report(
          propertyId,
          token,
          {
            dimensions: [{ name: 'unifiedScreenName' }],
            metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
            limit: 10,
          },
          true,
        ).catch((err) => {
          console.warn('Pages report error:', err.message);
          return null;
        }),
        runGa4Report(
          propertyId,
          token,
          {
            dimensions: [{ name: 'country' }, { name: 'city' }],
            metrics: [{ name: 'activeUsers' }],
            limit: 15,
          },
          true,
        ).catch((err) => {
          console.warn('Countries report error:', err.message);
          return null;
        }),
        runGa4Report(
          propertyId,
          token,
          {
            dimensions: [{ name: 'eventName' }],
            metrics: [{ name: 'eventCount' }],
            limit: 10,
          },
          true,
        ).catch((err) => {
          console.warn('Events report error:', err.message);
          return null;
        }),
        runGa4Report(
          propertyId,
          token,
          {
            dimensions: [{ name: 'deviceCategory' }],
            metrics: [{ name: 'activeUsers' }],
          },
          true,
        ).catch((err) => {
          console.warn('Devices report error:', err.message);
          return null;
        }),
        runGa4Report(
          propertyId,
          token,
          {
            dimensions: [{ name: 'firstUserSource' }],
            metrics: [{ name: 'activeUsers' }],
            limit: 10,
          },
          true,
        ).catch((err) => {
          console.warn('Sources report error:', err.message);
          return null;
        }),
      ]);

      // Parse minutes
      const minuteBars = Array.from({ length: 30 }, (_, i) => ({
        minute: 29 - i,
        users: 0,
      }));
      let activeUsersLast30 = 0;
      let activeUsersLast5 = 0;

      if (minuteReport?.rows) {
        for (const row of minuteReport.rows) {
          const minAgo = parseInt(row.dimensionValues?.[0]?.value || '0', 10);
          const users = parseInt(row.metricValues?.[0]?.value || '0', 10);
          activeUsersLast30 += users;
          if (minAgo <= 4) {
            activeUsersLast5 += users;
          }
          const idx = 29 - minAgo;
          if (idx >= 0 && idx < 30) {
            minuteBars[idx].users = users;
          }
        }
      }

      // Parse pages
      const topPages = [];
      let totalPageviews = 0;
      if (pagesReport?.rows) {
        for (const row of pagesReport.rows) {
          const page = row.dimensionValues?.[0]?.value || '/';
          const views = parseInt(row.metricValues?.[0]?.value || '0', 10);
          const users = parseInt(row.metricValues?.[1]?.value || '0', 10);
          totalPageviews += views;
          topPages.push({ page, views, users });
        }
      }

      // Parse countries & cities
      const topCountries = [];
      const topCities = [];
      if (countriesReport?.rows) {
        for (const row of countriesReport.rows) {
          const country = row.dimensionValues?.[0]?.value || 'Unknown';
          const city = row.dimensionValues?.[1]?.value || '(not set)';
          const users = parseInt(row.metricValues?.[0]?.value || '0', 10);
          topCountries.push({ country, users });
          if (city && city !== '(not set)') {
            topCities.push({ country, city, users });
          }
        }
      }

      // Parse events
      const topEvents = [];
      let totalEvents = 0;
      if (eventsReport?.rows) {
        for (const row of eventsReport.rows) {
          const eventName = row.dimensionValues?.[0]?.value || '';
          const count = parseInt(row.metricValues?.[0]?.value || '0', 10);
          totalEvents += count;
          topEvents.push({ eventName, count });
        }
      }

      // Parse devices
      const deviceBreakdown = [];
      let totalDeviceUsers = 0;
      if (devicesReport?.rows) {
        for (const row of devicesReport.rows) {
          const category = row.dimensionValues?.[0]?.value?.toLowerCase() || 'desktop';
          const users = parseInt(row.metricValues?.[0]?.value || '0', 10);
          totalDeviceUsers += users;
          deviceBreakdown.push({ category, users });
        }
      }

      // Parse sources
      const topSources = [];
      if (sourcesReport?.rows) {
        for (const row of sourcesReport.rows) {
          const source = row.dimensionValues?.[0]?.value || '(direct)';
          const users = parseInt(row.metricValues?.[0]?.value || '0', 10);
          topSources.push({ source, users });
        }
      }

      const activeUsers = Math.max(
        activeUsersLast30,
        deviceBreakdown.reduce((sum, d) => sum + d.users, 0),
        topPages.reduce((sum, p) => sum + p.users, 0),
        0
      );

      resultData = {
        activeUsers,
        activeUsersLast5: activeUsersLast5 || activeUsers,
        minuteBars,
        topPages,
        totalPageviews,
        topCountries,
        topCities,
        topEvents,
        totalEvents,
        deviceBreakdown,
        totalDeviceUsers,
        topSources,
        _debug: { isLive: true, propertyId },
      };
    } else if (type === 'sources') {
      const report = await runGa4Report(propertyId, token, {
        dateRanges: [{ startDate: daysAgo, endDate: 'today' }],
        dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionDefaultChannelGroup' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
        limit: 25,
      });

      const rows = [];
      const channelMap = new Map();
      let totalSessions = 0;

      for (const r of report.rows || []) {
        const source = r.dimensionValues?.[0]?.value || '(direct)';
        const medium = r.dimensionValues?.[1]?.value || '(none)';
        const channel = r.dimensionValues?.[2]?.value || 'Other';
        const sessions = parseInt(r.metricValues?.[0]?.value || '0', 10);
        const users = parseInt(r.metricValues?.[1]?.value || '0', 10);
        const bounceRate = parseFloat(r.metricValues?.[2]?.value || '0') * 100;
        const avgSessionDuration = parseFloat(r.metricValues?.[3]?.value || '0');

        totalSessions += sessions;
        channelMap.set(channel, (channelMap.get(channel) || 0) + sessions);

        rows.push({ source, medium, sessions, users, bounceRate, avgSessionDuration });
      }

      const channelGroups = Array.from(channelMap.entries()).map(([channel, sessions]) => ({
        channel,
        sessions,
        pct: totalSessions > 0 ? (sessions / totalSessions) * 100 : 0,
      }));

      resultData = { rows, channelGroups, _debug: { isLive: true, propertyId } };
    } else if (type === 'geo') {
      const report = await runGa4Report(propertyId, token, {
        dateRanges: [{ startDate: daysAgo, endDate: 'today' }],
        dimensions: [{ name: 'country' }, { name: 'city' }],
        metrics: [{ name: 'totalUsers' }, { name: 'sessions' }, { name: 'newUsers' }],
        limit: 50,
      });

      const countryMap = new Map();
      const cities = [];
      let totalUsers = 0;

      for (const r of report.rows || []) {
        const country = r.dimensionValues?.[0]?.value || 'Unknown';
        const city = r.dimensionValues?.[1]?.value || '(not set)';
        const users = parseInt(r.metricValues?.[0]?.value || '0', 10);
        const sessions = parseInt(r.metricValues?.[1]?.value || '0', 10);
        const newUsers = parseInt(r.metricValues?.[2]?.value || '0', 10);

        totalUsers += users;
        countryMap.set(country, (countryMap.get(country) || 0) + users);
        if (city !== '(not set)') {
          cities.push({ country, city, users, sessions, newUsers });
        }
      }

      const countries = Array.from(countryMap.entries())
        .map(([country, users]) => ({
          country,
          users,
          sessions: users,
          pct: totalUsers > 0 ? (users / totalUsers) * 100 : 0,
        }))
        .sort((a, b) => b.users - a.users);

      resultData = { countries, cities, _debug: { isLive: true, propertyId } };
    } else if (type === 'devices') {
      const report = await runGa4Report(propertyId, token, {
        dateRanges: [{ startDate: daysAgo, endDate: 'today' }],
        dimensions: [{ name: 'deviceCategory' }, { name: 'browser' }, { name: 'operatingSystem' }],
        metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
        limit: 50,
      });

      const catMap = new Map();
      const browserMap = new Map();
      const osMap = new Map();
      let totalUsers = 0;

      for (const r of report.rows || []) {
        const category = r.dimensionValues?.[0]?.value?.toLowerCase() || 'desktop';
        const browser = r.dimensionValues?.[1]?.value || 'Other';
        const os = r.dimensionValues?.[2]?.value || 'Other';
        const users = parseInt(r.metricValues?.[0]?.value || '0', 10);
        const sessions = parseInt(r.metricValues?.[1]?.value || '0', 10);

        totalUsers += users;
        catMap.set(category, (catMap.get(category) || 0) + users);
        browserMap.set(browser, (browserMap.get(browser) || 0) + users);
        osMap.set(os, (osMap.get(os) || 0) + users);
      }

      const categories = Array.from(catMap.entries()).map(([category, users]) => ({
        category,
        users,
        sessions: users,
        pct: totalUsers > 0 ? (users / totalUsers) * 100 : 0,
      }));

      const browsers = Array.from(browserMap.entries()).map(([name, users]) => ({
        name,
        users,
        sessions: users,
        pct: totalUsers > 0 ? (users / totalUsers) * 100 : 0,
      }));

      const operatingSystems = Array.from(osMap.entries()).map(([name, users]) => ({
        name,
        users,
        sessions: users,
        pct: totalUsers > 0 ? (users / totalUsers) * 100 : 0,
      }));

      resultData = { categories, browsers, operatingSystems, _debug: { isLive: true, propertyId } };
    } else if (type === 'pages') {
      const report = await runGa4Report(propertyId, token, {
        dateRanges: [{ startDate: daysAgo, endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'totalUsers' },
          { name: 'userEngagementDuration' },
          { name: 'bounceRate' },
        ],
        limit: 50,
      });

      let totalViews = 0;
      const rows = [];

      for (const r of report.rows || []) {
        const path = r.dimensionValues?.[0]?.value || '/';
        const title = r.dimensionValues?.[1]?.value || path;
        const views = parseInt(r.metricValues?.[0]?.value || '0', 10);
        const users = parseInt(r.metricValues?.[1]?.value || '0', 10);
        const duration = parseFloat(r.metricValues?.[2]?.value || '0');
        const bounceRate = parseFloat(r.metricValues?.[3]?.value || '0') * 100;

        totalViews += views;
        rows.push({
          path,
          title,
          views,
          users,
          avgDurationSec: users > 0 ? duration / users : 0,
          bounceRate,
        });
      }

      resultData = { totalViews, rows, _debug: { isLive: true, propertyId } };
    } else {
      // Overview report
      const report = await runGa4Report(propertyId, token, {
        dateRanges: [{ startDate: daysAgo, endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'totalUsers' },
          { name: 'newUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      });

      const timeseries = [];
      let totalUsers = 0;
      let newUsers = 0;
      let sessions = 0;
      let pageviews = 0;
      let avgDuration = 0;
      let bounceSum = 0;

      for (const r of report.rows || []) {
        const date = r.dimensionValues?.[0]?.value || '';
        const u = parseInt(r.metricValues?.[0]?.value || '0', 10);
        const nu = parseInt(r.metricValues?.[1]?.value || '0', 10);
        const s = parseInt(r.metricValues?.[2]?.value || '0', 10);
        const pv = parseInt(r.metricValues?.[3]?.value || '0', 10);
        const br = parseFloat(r.metricValues?.[4]?.value || '0') * 100;
        const d = parseFloat(r.metricValues?.[5]?.value || '0');

        totalUsers += u;
        newUsers += nu;
        sessions += s;
        pageviews += pv;
        bounceSum += br;
        avgDuration += d;

        timeseries.push({ date, users: u, sessions: s, pageviews: pv });
      }

      const rowCount = report.rows?.length || 1;

      resultData = {
        kpis: {
          totalUsers,
          newUsers,
          sessions,
          pageviews,
          bounceRate: bounceSum / rowCount,
          avgSessionDuration: avgDuration / rowCount,
          usersDelta: 0,
          sessionsDelta: 0,
        },
        timeseries,
        _debug: { isLive: true, propertyId },
      };
    }

    setCache(cacheKey, resultData);
    return res.status(200).json(resultData);
  } catch (err) {
    console.error('GA4 API error:', err.message);
    // Don't cache errors so user can immediately retry
    return res.status(200).json(getFallbackData(type, range, {
      error: err.message,
      propertyId,
    }));
  }
}
