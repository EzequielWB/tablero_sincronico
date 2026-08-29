const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function startOfUtc() {
    return Math.floor(Date.now() / 7200000) * 7200000;
}

function getClient(request) {
    const ip = request.headers['x-forwarded-for']
        ? request.headers['x-forwarded-for'].split(',')[0].trim()
        : (request.ip || request.connection?.remoteAddress || 'unknown');

    const fingerprint = request.headers['x-fingerprint'] || '';
    const uuid = request.headers['x-uuid'] || '';

    if (fingerprint) {
        return crypto.createHash('sha256')
            .update(ip + '|' + fingerprint)
            .digest('hex')
            .slice(0, 24);
    }
    if (uuid) {
        return 'u_' + crypto.createHash('sha256').update(uuid).digest('hex').slice(0, 22);
    }
    return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24);
}

// ---- Almacenamiento: Supabase si está configurado, si no memoria (dev local) ----
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usesSupabase = !!(supabaseUrl && supabaseKey);

let labels = new Map();
let supabase = null;

if (usesSupabase) {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    console.log('Usando Supabase como almacenamiento persistente.');
} else {
    console.log('Supabase no configurado. Usando memoria (solo desarrollo local).');
}

function dbGet(id, day) {
    if (usesSupabase) {
        return supabase
            .from('labels')
            .select('*')
            .eq('client_id', id)
            .eq('day_start', day)
            .maybeSingle();
    }
    const existing = labels.get(id);
    const row = existing && existing.day_start === day ? existing : null;
    return Promise.resolve({ data: row, error: null });
}

function dbGetAll() {
    if (usesSupabase) {
        return supabase
            .from('labels')
            .select('*')
            .order('timestamp', { ascending: true });
    }
    const sorted = Array.from(labels.values()).sort((a, b) => a.timestamp - b.timestamp);
    const mapped = sorted.map((l) => ({
        id: l.client_id,
        text: l.text,
        x: l.x,
        y: l.y,
        color: l.color,
        name: l.name || null,
        timestamp: l.timestamp
    }));
    return Promise.resolve({ data: mapped, error: null });
}

function dbUpsert(object) {
    if (usesSupabase) {
        return supabase.from('labels').upsert(object, { onConflict: 'client_id,day_start' });
    }
    labels.set(object.client_id, object);
    return Promise.resolve({ error: null });
}

function dbClear() {
    if (usesSupabase) {
        return supabase.from('labels').delete().gt('client_id', '');
    }
    labels.clear();
    return Promise.resolve({ error: null });
}

function toWire(row) {
    return {
        id: row.client_id,
        text: row.text,
        x: row.x,
        y: row.y,
        color: row.color,
        name: row.name || null,
        timestamp: row.timestamp
    };
}

app.get('/api/labels', (req, res) => {
    dbGetAll().then(({ data, error }) => {
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        const labelsResp = data.map(toWire);
        res.json({ labels: labelsResp, dayStart: startOfUtc() });
    });
});

app.get('/api/me', (req, res) => {
    const clientId = getClient(req);
    const day = startOfUtc();
    dbGet(clientId, day).then(({ data, error }) => {
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        res.json({ canPost: !data, clientId, dayStart: day });
    });
});

app.post('/api/reset', (req, res) => {
    dbClear().then(({ error }) => {
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        res.json({ ok: true });
    });
});

app.post('/api/labels', (req, res) => {
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    const x = Number(req.body.x);
    const y = Number(req.body.y);
    const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 20) : '';
    let color = typeof req.body.color === 'string' ? req.body.color.trim() : '';
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
        return res.status(400).json({ error: 'color must be a hex color' });
    }
    if (!color) color = '#ffd83d';

    if (!text || text.length > 25) {
        return res.status(400).json({ error: 'text required, max 25 chars' });
    }
    if (typeof x !== 'number' || Number.isNaN(x) || x < 0 || x > 100) {
        return res.status(400).json({ error: 'x must be a number in 0-100' });
    }
    if (typeof y !== 'number' || Number.isNaN(y) || y < 0 || y > 100) {
        return res.status(400).json({ error: 'y must be a number in 0-100' });
    }

    const clientId = getClient(req);
    const day = startOfUtc();

    dbGet(clientId, day).then(({ data: existing, error }) => {
        if (error) {
            return res.status(500).json({ error: error.message });
        }

        if (existing) {
            return res.status(429).json({ error: 'Solo puedes publicar un mensaje cada 2 horas.' });
        }

        const row = {
            client_id: clientId,
            text,
            x,
            y,
            color,
            name: name || null,
            timestamp: Date.now(),
            day_start: day
        };

        dbUpsert(row).then(({ error: upsertError }) => {
            if (upsertError) {
                return res.status(500).json({ error: upsertError.message });
            }
            res.json({ ok: true, label: toWire(row), updated: false, clientId });
        });
    });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Tablero colaborativo escuchando en http://localhost:${PORT}`);
    });
}

module.exports = app;

