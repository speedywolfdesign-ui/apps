// Minimal server to serve the static app and proxy AI requests securely
// Usage:
//   OPENAI_API_KEY=sk-... PORT=3000 node server.js
// Then open http://localhost:3000/
/* eslint-disable no-console */
const path = require('path')
const express = require('express')
const cors = require('cors')
const { fetch } = require('undici')

const app = express()
const PORT = process.env.PORT || 3000
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || ''

app.use(cors())
app.use(express.json({ limit: '1mb' }))

// Serve static files from project directory
app.use(express.static(path.join(__dirname)))

// Proxy endpoint for AI chat
// Request body: { provider?: 'openai'|'openrouter'|'google', model: string, messages: [{role, content}], temperature?: number }
app.post('/api/ai', async (req, res) => {
  try {
    const provider = (req.body.provider || 'openai').toLowerCase()
    const model = req.body.model || 'gpt-4o-mini'
    const messages = Array.isArray(req.body.messages) ? req.body.messages : []
    const temperature = typeof req.body.temperature === 'number' ? req.body.temperature : 0.3

    if (!messages.length) {
      return res.status(400).json({ error: 'messages required' })
    }

    if (provider === 'openai') {
      if (!OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OPENAI_API_KEY not set on server' })
      }
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model, messages, temperature }),
      })
      const raw = await r.text().catch(() => '')
      let j = null
      try { j = raw ? JSON.parse(raw) : null } catch {}
      if (!r.ok) {
        const errPayload = j || { error: 'Upstream error', body: raw }
        console.error('OpenAI error:', errPayload)
        return res.status(r.status).json(errPayload)
      }
      if (!j) return res.status(502).json({ error: 'Empty JSON from OpenAI', body: raw })
      const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || ''
      return res.json({ content, raw: j })
    }

    if (provider === 'openrouter') {
      const key = OPENROUTER_API_KEY
      if (!key) {
        return res.status(500).json({ error: 'OPENROUTER_API_KEY not set on server' })
      }
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({ model, messages, temperature }),
      })
      const raw = await r.text().catch(() => '')
      let j = null
      try { j = raw ? JSON.parse(raw) : null } catch {}
      if (!r.ok) {
        const errPayload = j || { error: 'Upstream error', body: raw }
        console.error('OpenRouter error:', errPayload)
        return res.status(r.status).json(errPayload)
      }
      if (!j) return res.status(502).json({ error: 'Empty JSON from OpenRouter', body: raw })
      const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || ''
      return res.json({ content, raw: j })
    }

    if (provider === 'google') {
      if (!GOOGLE_API_KEY) {
        return res.status(500).json({ error: 'GOOGLE_API_KEY not set on server' })
      }
      // Map OpenAI-style messages to Google Generative Language API format
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content || '') }]
      }))
      const modelPath = String(model || '').startsWith('models/')
        ? String(model)
        : `models/${String(model || '')}`
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/${encodeURIComponent(modelPath)}:generateContent?key=${encodeURIComponent(GOOGLE_API_KEY)}`
      // const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${encodeURIComponent(GOOGLE_API_KEY)}`

      const body = {
        contents,
        generationConfig: { temperature }
      }
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const raw = await r.text().catch(() => '')
      let j = null
      try { j = raw ? JSON.parse(raw) : null } catch {}
      if (!r.ok) {
        const errPayload = j || { error: 'Upstream error', body: raw }
        console.error('Google AI error:', errPayload)
        return res.status(r.status).json(errPayload)
      }
      if (!j) return res.status(502).json({ error: 'Empty JSON from Google AI', body: raw })
      const candidate = (j.candidates && j.candidates[0]) || {}
      const parts = (candidate.content && candidate.content.parts) || []
      const text = parts.map(p => p.text).filter(Boolean).join('\n') || ''
      return res.json({ content: text, raw: j })
    }

    return res.status(400).json({ error: 'Unsupported provider' })
  } catch (e) {
    console.error('Proxy error:', e)
    res.status(500).json({ error: 'Proxy failed', details: String(e && e.message || e) })
  }
})

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})


