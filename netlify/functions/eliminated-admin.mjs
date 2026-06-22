import { getStore } from '@netlify/blobs';

export default async function handler(req) {
  const store = getStore('tournament-data');

  if (req.method === 'GET') {
    const list = await store.get('manual-eliminated', { type: 'json' }) || [];
    return Response.json(list);
  }

  if (req.method === 'POST') {
    const pw = req.headers.get('x-admin-password');
    if (!pw || pw !== process.env.ADMIN_PASSWORD) {
      return new Response('Unauthorized', { status: 401 });
    }
    const body = await req.json();
    const teams = Array.isArray(body.teams) ? body.teams : [];
    await store.set('manual-eliminated', JSON.stringify(teams));
    await store.delete('results');
    return Response.json({ ok: true, teams });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
