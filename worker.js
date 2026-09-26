// Metra live relay: fetches Metra's GTFS-realtime feeds, decodes the protobuf by hand,
// and returns clean JSON to the dashboard. No caching: every call hits Metra fresh.
// Secret required: METRA_API_TOKEN

function readVarint(b, p) { let r = 0, s = 1, byte; do { byte = b[p]; r += (byte & 0x7f) * s; s *= 128; p++; } while (byte & 0x80); return [r, p]; }
function readFloat(b, p) { const dv = new DataView(b.buffer, b.byteOffset + p, 4); return [dv.getFloat32(0, true), p + 4]; }
function skip(b, p, wt) {
  if (wt === 0) return readVarint(b, p)[1];
  if (wt === 1) return p + 8;
  if (wt === 5) return p + 4;
  if (wt === 2) { const [len, p2] = readVarint(b, p); return p2 + len; }
  throw new Error("bad wiretype " + wt);
}
function readString(b, p) { const [len, p2] = readVarint(b, p); const s = new TextDecoder().decode(b.subarray(p2, p2 + len)); return [s, p2 + len]; }
function readSub(b, p) { const [len, p2] = readVarint(b, p); return [b.subarray(p2, p2 + len), p2 + len]; }

// Walk every field of a message: cb(fieldNumber, wireType, bytes, position) returns the new position
// (or undefined to have the field skipped).
function eachField(b, cb) {
  let p = 0;
  while (p < b.length) {
    const [tag, p1] = readVarint(b, p); p = p1;
    const f = tag >>> 3, wt = tag & 7;
    const np = cb(f, wt, b, p);
    p = np === undefined ? skip(b, p, wt) : np;
  }
}

/* ------------------------------ vehicle positions (unchanged) ------------------------------ */
function parseVehicles(buf) {
  const b = new Uint8Array(buf);
  const out = [];
  let p = 0;
  while (p < b.length) {
    const [tag, p1] = readVarint(b, p); p = p1;
    const field = tag >>> 3, wt = tag & 7;
    if (field === 2 && wt === 2) {
      const [entBytes, p2] = readSub(b, p); p = p2;
      let ep = 0, vehicleSub = null;
      while (ep < entBytes.length) {
        const [etag, ep1] = readVarint(entBytes, ep); ep = ep1;
        const ef = etag >>> 3, ewt = etag & 7;
        if (ef === 4 && ewt === 2) { const [vb, ep2] = readSub(entBytes, ep); ep = ep2; vehicleSub = vb; }
        else ep = skip(entBytes, ep, ewt);
      }
      if (vehicleSub) {
        let vp = 0, trip_id = null, route_id = null, direction_id = null, lat = null, lon = null, ts = null, veh_id = null;
        while (vp < vehicleSub.length) {
          const [vtag, vp1] = readVarint(vehicleSub, vp); vp = vp1;
          const vf = vtag >>> 3, vwt = vtag & 7;
          if (vf === 1 && vwt === 2) {
            const [tb, vp2] = readSub(vehicleSub, vp); vp = vp2;
            let tp = 0;
            while (tp < tb.length) {
              const [ttag, tp1] = readVarint(tb, tp); tp = tp1;
              const tf = ttag >>> 3, twt = ttag & 7;
              if (tf === 1 && twt === 2) { const [s, tp2] = readString(tb, tp); trip_id = s; tp = tp2; }
              else if (tf === 5 && twt === 2) { const [s, tp2] = readString(tb, tp); route_id = s; tp = tp2; }
              else if (tf === 6 && twt === 0) { const [n, tp2] = readVarint(tb, tp); direction_id = n; tp = tp2; }
              else tp = skip(tb, tp, twt);
            }
          } else if (vf === 8 && vwt === 2) {
            const [vdb, vp2] = readSub(vehicleSub, vp); vp = vp2;
            let dp = 0;
            while (dp < vdb.length) {
              const [dtag, dp1] = readVarint(vdb, dp); dp = dp1;
              const df = dtag >>> 3, dwt = dtag & 7;
              if (df === 1 && dwt === 2) { const [s, dp2] = readString(vdb, dp); veh_id = s; dp = dp2; }
              else dp = skip(vdb, dp, dwt);
            }
          } else if (vf === 2 && vwt === 2) {
            const [pb, vp2] = readSub(vehicleSub, vp); vp = vp2;
            let pp = 0;
            while (pp < pb.length) {
              const [ptag, pp1] = readVarint(pb, pp); pp = pp1;
              const pf = ptag >>> 3, pwt = ptag & 7;
              if (pf === 1 && pwt === 5) { const [f, pp2] = readFloat(pb, pp); lat = f; pp = pp2; }
              else if (pf === 2 && pwt === 5) { const [f, pp2] = readFloat(pb, pp); lon = f; pp = pp2; }
              else pp = skip(pb, pp, pwt);
            }
          } else if (vf === 5 && vwt === 0) { const [n, vp2] = readVarint(vehicleSub, vp); ts = n; vp = vp2; }
          else vp = skip(vehicleSub, vp, vwt);
        }
        if (lat != null && lon != null && route_id) out.push({ route_id, trip_id, direction_id, latitude: lat, longitude: lon, updated_at: ts, vehicle_id: veh_id });
      }
    } else p = skip(b, p, wt);
  }
  return out;
}

/* --------------------------------------- service alerts --------------------------------------- */
// Metra's alert text can contain HTML; send the dashboard plain text only.
function plainText(s) {
  return String(s || "")
    .replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/\s*(p|div|li)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}
// GTFS-rt TranslatedString: prefer English, else the first translation.
function translated(b) {
  let first = null, en = null;
  eachField(b, (f, wt, bb, p) => {
    if (f !== 1 || wt !== 2) return;
    const [tb, np] = readSub(bb, p);
    let text = null, lang = "";
    eachField(tb, (tf, twt, tbb, tp) => {
      if (tf === 1 && twt === 2) { const [s, n] = readString(tbb, tp); text = s; return n; }
      if (tf === 2 && twt === 2) { const [s, n] = readString(tbb, tp); lang = s.toLowerCase(); return n; }
    });
    if (text != null) { if (first == null) first = text; if (!en && (lang === "" || lang.startsWith("en"))) en = text; }
    return np;
  });
  return en ?? first ?? "";
}
function parseAlerts(buf) {
  const b = new Uint8Array(buf);
  const out = [];
  eachField(b, (f, wt, bb, p) => {
    if (f !== 2 || wt !== 2) return;                        // FeedMessage.entity
    const [ent, np] = readSub(bb, p);
    let id = "", alertBytes = null, deleted = false;
    eachField(ent, (ef, ewt, eb, ep) => {
      if (ef === 1 && ewt === 2) { const [s, n] = readString(eb, ep); id = s; return n; }
      if (ef === 2 && ewt === 0) { const [v, n] = readVarint(eb, ep); deleted = !!v; return n; }
      if (ef === 5 && ewt === 2) { const [a, n] = readSub(eb, ep); alertBytes = a; return n; }
    });
    if (!alertBytes || deleted) return np;
    const a = { id, header: "", description: "", url: "", routes: [], stops: [], periods: [], cause: null, effect: null, severity: null };
    const routes = new Set(), stops = new Set();
    eachField(alertBytes, (af, awt, ab, ap) => {
      if (af === 1 && awt === 2) {                          // active_period
        const [tr, n] = readSub(ab, ap); const per = { start: null, end: null };
        eachField(tr, (tf, twt, tb, tp) => {
          if (tf === 1 && twt === 0) { const [v, m] = readVarint(tb, tp); per.start = v; return m; }
          if (tf === 2 && twt === 0) { const [v, m] = readVarint(tb, tp); per.end = v; return m; }
        });
        a.periods.push(per); return n;
      }
      if (af === 5 && awt === 2) {                          // informed_entity
        const [ie, n] = readSub(ab, ap);
        eachField(ie, (xf, xwt, xb, xp) => {
          if (xf === 2 && xwt === 2) { const [s, m] = readString(xb, xp); routes.add(s); return m; }
          if (xf === 5 && xwt === 2) { const [s, m] = readString(xb, xp); stops.add(s); return m; }
          if (xf === 4 && xwt === 2) {                      // trip -> its route_id
            const [tb, m] = readSub(xb, xp);
            eachField(tb, (tf, twt, tbb, tp) => { if (tf === 5 && twt === 2) { const [s, k] = readString(tbb, tp); routes.add(s); return k; } });
            return m;
          }
        });
        return n;
      }
      if (af === 6 && awt === 0) { const [v, n] = readVarint(ab, ap); a.cause = v; return n; }
      if (af === 7 && awt === 0) { const [v, n] = readVarint(ab, ap); a.effect = v; return n; }
      if (af === 14 && awt === 0) { const [v, n] = readVarint(ab, ap); a.severity = v; return n; }
      if (af === 8 && awt === 2) { const [s, n] = readSub(ab, ap); a.url = translated(s); return n; }
      if (af === 10 && awt === 2) { const [s, n] = readSub(ab, ap); a.header = plainText(translated(s)); return n; }
      if (af === 11 && awt === 2) { const [s, n] = readSub(ab, ap); a.description = plainText(translated(s)); return n; }
    });
    a.routes = [...routes]; a.stops = [...stops];
    if (!/^https?:\/\//i.test(a.url)) a.url = "";
    if (a.header || a.description) out.push(a);
    return np;
  });
  return out;
}

/* ------------------------------------------ handler ------------------------------------------ */
const BASE = "https://gtfspublic.metrarr.com/gtfs/public/";

export default {
  async fetch(request, env) {
    const headers = { Authorization: `Bearer ${env.METRA_API_TOKEN}` };
    const out = {};
    // Both feeds in parallel. If alerts fail, positions still come through (and vice versa).
    const [pos, alr] = await Promise.allSettled([
      fetch(BASE + "positions", { headers }),
      fetch(BASE + "alerts", { headers })
    ]);

    try {
      if (pos.status !== "fulfilled") throw pos.reason;
      const mResp = pos.value;
      if (mResp.ok) {
        const vehicles = parseVehicles(await mResp.arrayBuffer());
        const byRoute = {};
        for (const v of vehicles) { (byRoute[v.route_id] ||= []).push(v); }
        out.metra_lines = byRoute;
      } else {
        out.metra_error = `Metra feed returned ${mResp.status}`;
      }
    } catch (e) {
      out.metra_error = String(e);
    }

    try {
      if (alr.status !== "fulfilled") throw alr.reason;
      const aResp = alr.value;
      if (aResp.ok) out.alerts = parseAlerts(await aResp.arrayBuffer());
      else out.alerts_error = `Metra alerts feed returned ${aResp.status}`;
    } catch (e) {
      out.alerts_error = String(e);
    }

    out.fetched_at = Date.now();
    return new Response(JSON.stringify(out), {
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "Cache-Control": "no-store"
      }
    });
  }
};
