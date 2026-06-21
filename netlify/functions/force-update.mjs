import { getStore } from '@netlify/blobs';

export default async function handler(req, context) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const pw = req.headers.get('x-admin-password');
  if (!pw || pw !== process.env.ADMIN_PASSWORD) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // Tyhjennä molemmat välimuistit
    const store = getStore('tournament-data');
    await store.delete('results');
    await store.delete('oracle');

    // Hae tuoreet tulokset JA uusi oraakkeli heti
    const base = new URL(req.url);
    const [resultsRes, oracleRes] = await Promise.all([
      fetch(new URL('/api/get-results', base)),
      fetch(new URL('/api/get-oracle', base)),
    ]);
    const data = resultsRes.ok ? await resultsRes.json() : { error: 'fetch failed' };

    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
