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
    // Tyhjennä cache jotta get-results hakee tuoreimman datan
    const store = getStore('tournament-data');
    await store.delete('results');
    await store.delete('oracle');

    // Hae tuoreet tulokset suoraan
    const res = await fetch(new URL('/api/get-results', req.url));
    const data = res.ok ? await res.json() : { error: 'fetch failed' };

    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
