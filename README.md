# 🤖 TechHelper AI

AI-powered tech support service designed specifically for seniors. Voice-enabled, patient, and easy to use.

## ✨ Features

- 🎙️ **Voice-First Interface** - Talk naturally, no typing required
- 👴 **Senior-Friendly Design** - Large buttons, high contrast, simple language
- 🔧 **Guided Troubleshooting** - Step-by-step help for common tech problems
- 💰 **Usage Tracking** - Track costs per customer for billing
- 🚨 **Human Escalation** - Easy handoff to human helpers when needed
- 🔌 **Pluggable AI** - Switch between free and paid AI providers

## 🏗️ Architecture

```
techhelper-ai/
├── backend/
│   ├── main.py           # FastAPI server with WebSocket support
│   ├── ai_providers.py   # Pluggable AI (Ollama/OpenAI/Groq/OpenRouter)
│   └── requirements.txt
├── frontend/
│   ├── index.html        # Senior-friendly UI
│   ├── styles.css        # Accessible styling
│   └── app.js            # Voice + chat functionality
└── README.md
```

## 🚀 Quick Start

### Option 1: Free Local Setup (Ollama)

1. **Install Ollama** (free local AI):
   ```bash
   # macOS/Linux
   curl -fsSL https://ollama.com/install.sh | sh
   
   # Windows: Download from https://ollama.com
   ```

2. **Download a model**:
   ```bash
   ollama pull llama3.2
   ```

3. **Start Ollama**:
   ```bash
   ollama serve
   ```

4. **Install Python dependencies**:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

5. **Run the backend**:
   ```bash
   export AI_PROVIDER=ollama
   python main.py
   ```

6. **Open the frontend**:
   ```bash
   # Just open frontend/index.html in your browser
   # Or use a simple server:
   cd frontend && python -m http.server 8080
   ```

7. **Access the app**: http://localhost:8080

### Option 2: Cloud AI Setup (When You Have Paying Customers)

1. **Get API keys** (choose one):
   - **Groq** (best free tier): https://console.groq.com - 1.5M tokens/day free
   - **OpenRouter** (cheap): https://openrouter.ai - Pay per use, cheap models
   - **OpenAI**: https://platform.openai.com - Most capable, costs ~$0.01/message

2. **Set environment variable**:
   ```bash
   # For Groq (recommended for starting)
   export AI_PROVIDER=groq
   export GROQ_API_KEY=your_key_here
   
   # For OpenAI
   export AI_PROVIDER=openai
   export OPENAI_API_KEY=your_key_here
   
   # For OpenRouter
   export AI_PROVIDER=openrouter
   export OPENROUTER_API_KEY=your_key_here
   ```

3. **Run as above**

## 💰 Cost Analysis

| Provider | Free Tier | Paid Cost | Quality |
|----------|-----------|-----------|---------|
| **Ollama** | Unlimited | $0 (run locally) | Good |
| **Groq** | 1.5M tokens/day | ~$0.001/message | Excellent |
| **OpenRouter** | None | ~$0.0001/message | Good |
| **OpenAI (GPT-4o-mini)** | $5 credit | ~$0.002/message | Excellent |
| **OpenAI (GPT-4o)** | $5 credit | ~$0.02/message | Best |

**Estimated Monthly Costs** (assuming 100 conversations/day, 10 messages each):

| Provider | Monthly Cost |
|----------|--------------|
| Ollama | $0 |
| Groq (within free tier) | $0 |
| OpenRouter | ~$30 |
| OpenAI GPT-4o-mini | ~$60 |
| OpenAI GPT-4o | ~$600 |

## 📊 Admin Dashboard

View usage stats and costs:

```bash
curl http://localhost:8000/admin/stats
```

Or open in browser: http://localhost:8000/admin/stats

Sample output:
```json
{
  "active_sessions": 5,
  "total_messages": 47,
  "total_estimated_cost_usd": 0.0894,
  "provider": "openai",
  "sessions": [...]
}
```

## 🌐 Deployment

### Deploy to Render.com (Free Tier)

1. Push to GitHub
2. Create new Web Service on Render
3. Use this `render.yaml`:
   ```yaml
   services:
     - type: web
       name: techhelper-api
       runtime: python
       buildCommand: pip install -r backend/requirements.txt
       startCommand: cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT
       envVars:
         - key: AI_PROVIDER
           value: groq
         - key: GROQ_API_KEY
           sync: false
   ```

### Deploy to Railway

1. Push to GitHub
2. Connect Railway to repo
3. Set environment variables
4. Deploy

### Deploy Frontend (Static)

Use Vercel, Netlify, or GitHub Pages:

```bash
# Vercel
npm i -g vercel
cd frontend
vercel

# Netlify
cd frontend
netlify deploy --prod
```

## 🎯 Business Model Ideas

### 1. Pay-Per-Session
- $5 per 15-minute session
- AI cost: ~$0.10
- **Margin: 98%**

### 2. Monthly Subscription
- $19/month unlimited
- Average usage: 10 sessions/month
- AI cost: ~$1/user
- **Margin: 95%**

### 3. Freemium
- 3 free sessions, then upgrade
- Human help: $15/callback

### 4. Family Plan
- $29/month covers whole family
- Adult children can monitor usage

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/chat` | POST | Send message, get response |
| `/ws/{session_id}` | WebSocket | Real-time streaming chat |
| `/session/{id}/stats` | GET | Get session usage |
| `/admin/stats` | GET | Get all sessions |
| `/session/{id}/human-help` | POST | Request human callback |

## 🛠️ Customization

### Change the AI Personality

Edit the system prompt in `backend/main.py`:

```python
Message(
    role="system",
    content="""Your custom instructions here..."""
)
```

### Add More Quick Actions

Edit `frontend/index.html`:

```html
<button class="quick-btn" data-message="Your message">Button Text</button>
```

### Change Colors/Branding

Edit `frontend/styles.css` CSS variables:

```css
:root {
    --primary: #your-color;
    --secondary: #your-color;
}
```

## 🧪 Testing

1. **Test with mock mode** (no AI):
   ```bash
   # Just don't set any API keys
   python backend/main.py
   ```

2. **Test voice input/output**:
   - Open browser console (F12)
   - Check for speech recognition errors
   - Test with Chrome/Edge (best support)

3. **Test WebSocket**:
   ```bash
   wscat -c ws://localhost:8000/ws/test-session
   ```

## 📝 Roadmap

- [ ] Multi-language support
- [ ] Screen sharing integration
- [ ] SMS notifications for human help
- [ ] Integration with calendar for scheduling
- [ ] Mobile app (React Native)
- [ ] Usage analytics dashboard
- [ ] Automated follow-up emails

## 🤝 Contributing

This is a starter template. Feel free to:
- Add more AI providers
- Improve accessibility
- Add more troubleshooting flows
- Create integrations (Zapier, etc.)

## 📄 License

MIT - Use this to help seniors everywhere! 🎉

---

**Need help setting this up?** The AI assistant in this app would be happy to help! 😉
