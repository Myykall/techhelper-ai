"""
TechHelper AI - Backend API
FastAPI server with usage tracking for cost management.
"""

import os
import json
import uuid
import time
from datetime import datetime, timedelta
from typing import List, Optional
from dataclasses import dataclass, asdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ai_providers import get_provider, Message, AIProvider


# ============== Data Models ==============

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    speak_slowly: bool = False


class ChatResponse(BaseModel):
    response: str
    session_id: str
    estimated_cost: float


class SessionStats(BaseModel):
    session_id: str
    message_count: int
    total_input_tokens: int
    total_output_tokens: int
    estimated_cost: float
    created_at: str
    last_activity: str


@dataclass
class Session:
    """Tracks a support session with usage metrics."""
    id: str
    messages: List[Message]
    message_count: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    estimated_cost: float = 0.0
    created_at: str = ""
    last_activity: str = ""
    
    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now().isoformat()
        self.last_activity = datetime.now().isoformat()
    
    def add_usage(self, input_tokens: int, output_tokens: int, cost: float):
        self.message_count += 1
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens
        self.estimated_cost += cost
        self.last_activity = datetime.now().isoformat()


# ============== Storage ==============

class SessionStore:
    """Simple in-memory session store (use Redis/DB in production)."""
    
    def __init__(self):
        self.sessions: dict[str, Session] = {}
    
    def create(self) -> Session:
        session_id = str(uuid.uuid4())[:8]
        session = Session(
            id=session_id,
            messages=[Message(
                role="system",
                content="""You are TechHelper, a patient and friendly tech support assistant for seniors.

SPEAKING STYLE:
- Use simple, clear language. Avoid jargon.
- Be warm and encouraging.
- Speak step-by-step. One instruction at a time.
- Confirm understanding before moving to next step.
- If the user seems confused, slow down and repeat.

TROUBLESHOOTING APPROACH:
1. First, understand the problem by asking gentle questions
2. Break the solution into small, numbered steps
3. Wait for confirmation after each step
4. Offer to repeat or explain differently if needed
5. Stay calm and positive even if frustrated

ESCALATION:
- If the problem is beyond your scope, suggest calling a human helper
- Never ask seniors to do risky things (delete system files, etc.)

Remember: The person you're helping may be anxious about technology. Be extra patient and reassuring."""
            )]
        )
        self.sessions[session_id] = session
        return session
    
    def get(self, session_id: str) -> Optional[Session]:
        return self.sessions.get(session_id)
    
    def cleanup_old(self, max_age_hours: int = 24):
        """Remove sessions older than max_age_hours."""
        cutoff = datetime.now() - timedelta(hours=max_age_hours)
        to_remove = []
        for sid, session in self.sessions.items():
            last = datetime.fromisoformat(session.last_activity)
            if last < cutoff:
                to_remove.append(sid)
        for sid in to_remove:
            del self.sessions[sid]


# ============== Application ==============

store = SessionStore()
ai_provider: Optional[AIProvider] = None


def estimate_tokens(text: str) -> int:
    """Rough token estimation (4 chars ≈ 1 token)."""
    return len(text) // 4


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize AI provider on startup."""
    global ai_provider
    
    provider_name = os.getenv("AI_PROVIDER", "ollama")
    print(f"🤖 Initializing AI provider: {provider_name}")
    
    try:
        ai_provider = get_provider(provider_name)
        print(f"✅ AI provider ready: {provider_name}")
    except Exception as e:
        print(f"⚠️ Failed to initialize {provider_name}: {e}")
        print("Falling back to mock responses for testing")
        ai_provider = None
    
    yield
    
    print("👋 Shutting down...")


app = FastAPI(
    title="TechHelper AI",
    description="AI-powered tech support for seniors",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== API Endpoints ==============

@app.get("/")
async def root():
    return {
        "service": "TechHelper AI",
        "version": "1.0.0",
        "ai_provider": os.getenv("AI_PROVIDER", "ollama"),
        "status": "ready" if ai_provider else "mock_mode"
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Send a message and get AI response."""
    
    # Get or create session
    if request.session_id:
        session = store.get(request.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        session = store.create()
    
    # Add user message
    session.messages.append(Message(role="user", content=request.message))
    
    # Estimate input tokens
    input_tokens = estimate_tokens(request.message)
    
    # Get AI response
    if ai_provider is None:
        # Mock mode for testing
        response_text = "(AI provider not configured - this is a test response)"
    else:
        try:
            response_text = await ai_provider.chat(session.messages)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")
    
    # Estimate output tokens and cost
    output_tokens = estimate_tokens(response_text)
    cost = ai_provider.estimate_cost(input_tokens, output_tokens) if ai_provider else 0.0
    
    # Track usage
    session.add_usage(input_tokens, output_tokens, cost)
    
    # Add assistant response to history
    session.messages.append(Message(role="assistant", content=response_text))
    
    return ChatResponse(
        response=response_text,
        session_id=session.id,
        estimated_cost=round(cost, 6)
    )


@app.websocket("/ws/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str):
    """WebSocket for real-time streaming chat with voice support."""
    await websocket.accept()
    
    session = store.get(session_id)
    if not session:
        await websocket.send_json({"error": "Session not found"})
        await websocket.close()
        return
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            user_message = data.get("message", "")
            
            if not user_message:
                continue
            
            # Add to session
            session.messages.append(Message(role="user", content=user_message))
            input_tokens = estimate_tokens(user_message)
            
            # Stream AI response
            full_response = ""
            
            if ai_provider is None:
                await websocket.send_json({
                    "chunk": "(AI not configured - testing mode)",
                    "done": True
                })
                full_response = "(AI not configured - testing mode)"
            else:
                try:
                    async for chunk in ai_provider.chat_stream(session.messages):
                        full_response += chunk
                        await websocket.send_json({
                            "chunk": chunk,
                            "done": False
                        })
                    
                    # Send completion signal
                    await websocket.send_json({"done": True})
                    
                except Exception as e:
                    await websocket.send_json({
                        "error": str(e),
                        "done": True
                    })
                    continue
            
            # Track usage
            output_tokens = estimate_tokens(full_response)
            cost = ai_provider.estimate_cost(input_tokens, output_tokens) if ai_provider else 0.0
            session.add_usage(input_tokens, output_tokens, cost)
            
            # Add to history
            session.messages.append(Message(role="assistant", content=full_response))
            
            # Send cost update
            await websocket.send_json({
                "type": "stats",
                "session_cost": round(session.estimated_cost, 6),
                "this_message_cost": round(cost, 6),
                "total_messages": session.message_count
            })
            
    except WebSocketDisconnect:
        print(f"Client disconnected from session {session_id}")


@app.get("/session/{session_id}/stats", response_model=SessionStats)
async def get_session_stats(session_id: str):
    """Get usage stats for a session."""
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return SessionStats(
        session_id=session.id,
        message_count=session.message_count,
        total_input_tokens=session.total_input_tokens,
        total_output_tokens=session.total_output_tokens,
        estimated_cost=round(session.estimated_cost, 6),
        created_at=session.created_at,
        last_activity=session.last_activity
    )


@app.get("/admin/stats")
async def get_all_stats():
    """Get stats for all sessions (for admin dashboard)."""
    total_cost = sum(s.estimated_cost for s in store.sessions.values())
    total_messages = sum(s.message_count for s in store.sessions.values())
    
    return {
        "active_sessions": len(store.sessions),
        "total_messages": total_messages,
        "total_estimated_cost_usd": round(total_cost, 4),
        "provider": os.getenv("AI_PROVIDER", "ollama"),
        "sessions": [
            {
                "id": s.id,
                "messages": s.message_count,
                "cost_usd": round(s.estimated_cost, 6),
                "last_activity": s.last_activity
            }
            for s in sorted(store.sessions.values(), key=lambda x: x.last_activity, reverse=True)
        ]
    }


@app.post("/session/{session_id}/human-help")
async def request_human_help(session_id: str, phone: Optional[str] = None):
    """Request escalation to human helper."""
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # In production: send SMS, email, or push notification to available helpers
    # For now, just log it
    print(f"🚨 HUMAN HELP REQUESTED - Session: {session_id}")
    if phone:
        print(f"   Phone: {phone}")
    print(f"   Transcript preview: {session.messages[-3:] if len(session.messages) > 3 else session.messages}")
    
    return {
        "status": "requested",
        "session_id": session_id,
        "message": "A human helper will contact you shortly. Please keep your phone nearby."
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
