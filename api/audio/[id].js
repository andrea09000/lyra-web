const { cors } = require('../_lib/invidious');
const { getHead, parseRange, upstreamHeaders, dropCaches } = require('../_lib/stream');

/**
 * HTML5 <audio> proxy — Range-correct. Responses capped so invocations stay fast.
 */
module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const id = String(req.query.id || '').trim();
  if (!id) return res.status(400).json({ error: 'missing id' });

  try {
    const head = await getHead(id);
    const total = head.total || head.buf.length;
    const { start, end } = parseRange(req.headers.range, total);
    const length = end - start + 1;

    res.setHeader('Content-Type', head.contentType || 'audio/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);

    if (req.method === 'HEAD') {
      res.status(206);
      res.setHeader('Content-Length', String(length));
      return res.end();
    }

    // Served straight from RAM — first play starts without another upstream hop
    if (end < head.buf.length) {
      const chunk = head.buf.subarray(start, end + 1);
      res.status(206);
      res.setHeader('Content-Length', String(chunk.length));
      return res.end(chunk);
    }

    const upstream = await fetch(head.url, {
      headers: upstreamHeaders(`bytes=${start}-${end}`),
      signal: AbortSignal.timeout(20000),
    });

    if (upstream.status === 403 || upstream.status === 410) {
      dropCaches(id);
      const fresh = await getHead(id);
      const range = parseRange(req.headers.range, fresh.total || fresh.buf.length);
      const retry = await fetch(fresh.url, {
        headers: upstreamHeaders(`bytes=${range.start}-${range.end}`),
        signal: AbortSignal.timeout(20000),
      });
      if (!retry.ok && retry.status !== 206) {
        dropCaches(id);
        return res.status(502).json({ error: `upstream ${retry.status}` });
      }
      const retryBuf = Buffer.from(await retry.arrayBuffer());
      const freshTotal = fresh.total || fresh.buf.length;
      const actualEnd = range.start + retryBuf.length - 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${actualEnd}/${freshTotal}`);
      res.setHeader('Content-Length', String(retryBuf.length));
      return res.end(retryBuf);
    }

    if (!upstream.ok && upstream.status !== 206) {
      dropCaches(id);
      return res.status(502).json({ error: `upstream ${upstream.status}` });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    const actualEnd = start + buf.length - 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${actualEnd}/${total}`);
    res.setHeader('Content-Length', String(buf.length));
    return res.end(buf);
  } catch (err) {
    dropCaches(id);
    return res.status(502).json({ error: String(err?.message || err) });
  }
};
