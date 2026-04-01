// Cloudflare Worker – Google OAuth token proxy pro Úkoly PWA
//
// Potřebné env proměnné (wrangler secret put):
//   GOOGLE_CLIENT_SECRET
//
// Potřebné vars (wrangler.toml):
//   GOOGLE_CLIENT_ID, ALLOWED_ORIGIN
//
// KV binding: TOKENS

const TOKEN_TTL = 60 * 60 * 24 * 365; // 1 rok

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status, env) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...cors(env), 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    const url = new URL(request.url);

    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, env);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid_json' }, 400, env);
    }

    if (url.pathname === '/auth')    return handleAuth(body, env);
    if (url.pathname === '/refresh') return handleRefresh(body, env);
    if (url.pathname === '/logout')  return handleLogout(body, env);

    return json({ error: 'not_found' }, 404, env);
  },
};

// Vymění authorization code za access + refresh token
async function handleAuth(body, env) {
  const { code, code_verifier, redirect_uri } = body;
  if (!code || !code_verifier || !redirect_uri) {
    return json({ error: 'missing_params' }, 400, env);
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri,
      grant_type: 'authorization_code',
      code_verifier,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error('Token exchange failed:', err);
    return json({ error: 'token_exchange_failed' }, 502, env);
  }

  const tokens = await tokenRes.json();

  if (!tokens.refresh_token) {
    console.error('No refresh token in response:', JSON.stringify(tokens));
    return json({ error: 'no_refresh_token' }, 502, env);
  }

  // Načte Google User ID pro klíč v KV
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) {
    console.error('Userinfo failed:', userRes.status, await userRes.text());
    return json({ error: 'userinfo_failed' }, 502, env);
  }
  const user = await userRes.json();

  const sessionId = crypto.randomUUID();

  await env.TOKENS.put(`rt:${user.sub}`, tokens.refresh_token, { expirationTtl: TOKEN_TTL });
  await env.TOKENS.put(`sess:${sessionId}`, user.sub, { expirationTtl: TOKEN_TTL });

  return json({
    session_id: sessionId,
    access_token: tokens.access_token,
    expires_in: tokens.expires_in || 3600,
  }, 200, env);
}

// Vrátí nový access token pomocí uložené session
async function handleRefresh(body, env) {
  const { session_id } = body;
  if (!session_id) return json({ error: 'missing_session' }, 400, env);

  const sub = await env.TOKENS.get(`sess:${session_id}`);
  if (!sub) return json({ error: 'session_not_found' }, 401, env);

  const refreshToken = await env.TOKENS.get(`rt:${sub}`);
  if (!refreshToken) return json({ error: 'no_refresh_token' }, 401, env);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenRes.ok) {
    // Refresh token expiroval nebo byl revokován
    await env.TOKENS.delete(`rt:${sub}`);
    await env.TOKENS.delete(`sess:${session_id}`);
    return json({ error: 'refresh_failed' }, 401, env);
  }

  const tokens = await tokenRes.json();

  // Google občas vydá nový refresh token – uložíme ho
  if (tokens.refresh_token) {
    await env.TOKENS.put(`rt:${sub}`, tokens.refresh_token, { expirationTtl: TOKEN_TTL });
  }

  return json({
    access_token: tokens.access_token,
    expires_in: tokens.expires_in || 3600,
  }, 200, env);
}

// Smaže session a refresh token
async function handleLogout(body, env) {
  const { session_id } = body;
  if (!session_id) return json({ error: 'missing_session' }, 400, env);

  const sub = await env.TOKENS.get(`sess:${session_id}`);
  if (sub) {
    await env.TOKENS.delete(`rt:${sub}`);
    await env.TOKENS.delete(`sess:${session_id}`);
  }

  return json({ ok: true }, 200, env);
}
