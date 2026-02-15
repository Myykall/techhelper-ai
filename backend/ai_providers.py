"""
Pluggable AI providers for TechHelper AI.
Supports: Ollama (free/local), OpenAI, Anthropic, and OpenRouter.
"""

import os
import httpx
from abc import ABC, abstractmethod
from typing import AsyncGenerator, List, Dict, Any
from dataclasses import dataclass


@dataclass
class Message:
    role: str  # "system", "user", "assistant"
    content: str


class AIProvider(ABC):
    """Base class for AI providers."""
    
    @abstractmethod
    async def chat(self, messages: List[Message]) -> str:
        """Get a complete response."""
        pass
    
    @abstractmethod
    async def chat_stream(self, messages: List[Message]) -> AsyncGenerator[str, None]:
        """Stream response chunks."""
        pass
    
    @abstractmethod
    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        """Estimate cost in USD."""
        pass


class OllamaProvider(AIProvider):
    """
    FREE option - Run models locally with Ollama.
    Install: https://ollama.com
    Recommended model: llama3.2 (good for conversations, free)
    """
    
    def __init__(self, model: str = "llama3.2", base_url: str = "http://localhost:11434"):
        self.model = model
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=120.0)
    
    async def chat(self, messages: List[Message]) -> str:
        response = await self.client.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": [{"role": m.role, "content": m.content} for m in messages],
                "stream": False
            }
        )
        response.raise_for_status()
        return response.json()["message"]["content"]
    
    async def chat_stream(self, messages: List[Message]) -> AsyncGenerator[str, None]:
        async with self.client.stream(
            "POST",
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": [{"role": m.role, "content": m.content} for m in messages],
                "stream": True
            }
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.strip():
                    try:
                        import json
                        data = json.loads(line)
                        if "message" in data and "content" in data["message"]:
                            yield data["message"]["content"]
                    except:
                        pass
    
    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        return 0.0  # FREE!


class OpenAIProvider(AIProvider):
    """
    OpenAI GPT-4o - High quality, pay-as-you-go.
    ~$0.0025 per 1K input tokens, ~$0.01 per 1K output tokens
    """
    
    def __init__(self, api_key: str = None, model: str = "gpt-4o-mini"):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        self.client = httpx.AsyncClient(timeout=60.0)
        # Pricing per 1K tokens
        self.pricing = {
            "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
            "gpt-4o": {"input": 0.0025, "output": 0.01},
        }
    
    async def chat(self, messages: List[Message]) -> str:
        response = await self.client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": [{"role": m.role, "content": m.content} for m in messages],
                "temperature": 0.7
            }
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    
    async def chat_stream(self, messages: List[Message]) -> AsyncGenerator[str, None]:
        async with self.client.stream(
            "POST",
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": [{"role": m.role, "content": m.content} for m in messages],
                "temperature": 0.7,
                "stream": True
            }
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        import json
                        chunk = json.loads(data)
                        delta = chunk["choices"][0].get("delta", {})
                        if "content" in delta:
                            yield delta["content"]
                    except:
                        pass
    
    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        prices = self.pricing.get(self.model, self.pricing["gpt-4o-mini"])
        return (input_tokens * prices["input"] + output_tokens * prices["output"]) / 1000


class OpenRouterProvider(AIProvider):
    """
    OpenRouter - Access many models, pay-as-you-go.
    Good cheap option: meta-llama/llama-3.2-3b-instruct
    """
    
    def __init__(self, api_key: str = None, model: str = "meta-llama/llama-3.2-3b-instruct"):
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        self.model = model
        self.client = httpx.AsyncClient(timeout=60.0)
    
    async def chat(self, messages: List[Message]) -> str:
        response = await self.client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "HTTP-Referer": "https://techhelper.ai",
                "X-Title": "TechHelper AI"
            },
            json={
                "model": self.model,
                "messages": [{"role": m.role, "content": m.content} for m in messages]
            }
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    
    async def chat_stream(self, messages: List[Message]) -> AsyncGenerator[str, None]:
        async with self.client.stream(
            "POST",
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "HTTP-Referer": "https://techhelper.ai",
                "X-Title": "TechHelper AI"
            },
            json={
                "model": self.model,
                "messages": [{"role": m.role, "content": m.content} for m in messages],
                "stream": True
            }
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        import json
                        chunk = json.loads(data)
                        delta = chunk["choices"][0].get("delta", {})
                        if "content" in delta:
                            yield delta["content"]
                    except:
                        pass
    
    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        # Very rough estimate - OpenRouter pricing varies by model
        # Llama 3.2 3B is about $0.0001 per 1K tokens total
        return (input_tokens + output_tokens) * 0.0000001


class GroqProvider(AIProvider):
    """
    Groq - Very fast inference, generous free tier.
    Free tier: 1,500,000 tokens/day (about 3000 messages)
    """
    
    def __init__(self, api_key: str = None, model: str = "llama-3.3-70b-versatile"):
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        self.model = model
        self.client = httpx.AsyncClient(timeout=60.0)
    
    async def chat(self, messages: List[Message]) -> str:
        response = await self.client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": [{"role": m.role, "content": m.content} for m in messages]
            }
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    
    async def chat_stream(self, messages: List[Message]) -> AsyncGenerator[str, None]:
        async with self.client.stream(
            "POST",
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": [{"role": m.role, "content": m.content} for m in messages],
                "stream": True
            }
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        import json
                        chunk = json.loads(data)
                        delta = chunk["choices"][0].get("delta", {})
                        if "content" in delta:
                            yield delta["content"]
                    except:
                        pass
    
    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        # Free tier available, paid is cheap
        # Roughly $0.00059 per 1K input, $0.00079 per 1K output
        return (input_tokens * 0.00000059 + output_tokens * 0.00000079)


def get_provider(provider_name: str = None, **kwargs) -> AIProvider:
    """Factory function to get the right provider."""
    provider = provider_name or os.getenv("AI_PROVIDER", "ollama").lower()
    
    if provider == "ollama":
        return OllamaProvider(**kwargs)
    elif provider == "openai":
        return OpenAIProvider(**kwargs)
    elif provider == "openrouter":
        return OpenRouterProvider(**kwargs)
    elif provider == "groq":
        return GroqProvider(**kwargs)
    else:
        raise ValueError(f"Unknown provider: {provider}")
