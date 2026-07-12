"""Oceanix AI HTTP API — streaming chat endpoint.

Runs alongside the MCP stdio server in a separate thread.
Provides /chat/stream with SSE for real token-by-token streaming.
"""

import json
import sys
import os
from typing import AsyncGenerator

from fastapi import FastAPI, Request, Query, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.callbacks import AsyncCallbackManager
from langchain_core.outputs import LLMResult

from .prompts import SYSTEM_PROMPT

app = FastAPI(title="Oceanix AI Chat API")

# Allow Tauri webview to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Re-use the same LLM provider from server.py
from .server import _get_llm as get_llm


class ChatRequest:
    messages: list[dict]
    context_files: list[str] | None = None


# ── Streaming SSE endpoint ──────────────────────────────

@app.post("/chat/stream")
async def chat_stream(request: Request):
    """Stream chat response token by token via SSE.

    POST body: { "messages": [{"role": "...", "content": "..."}], "context_files": [...] }
    """
    body = await request.json()
    messages = body.get("messages", [])
    context_files = body.get("context_files")

    logger.info(f"Chat stream: {len(messages)} messages")

    # Read optional model selection from request
    model = body.get("model")

    provider = get_llm(model=model) if model else get_llm()
    if not provider:
        async def _error():
            yield f"data: {json.dumps({'error': 'No LLM provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.'})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_error(), media_type="text/event-stream")

    # Build messages
    role_map = {
        "system": SystemMessage,
        "user": HumanMessage,
        "assistant": AIMessage,
    }
    lc_messages = [SystemMessage(content=SYSTEM_PROMPT)]
    for msg in messages:
        cls = role_map.get(msg.get("role", "user"), HumanMessage)
        content = msg.get("content", "")
        # Attach context files to the last user message
        if msg.get("role") == "user" and context_files:
            content = f"Files:\n{chr(10).join(f'- {f}' for f in context_files)}\n\nUser: {content}"
        lc_messages.append(cls(content=content))

    async def _stream():
        import uuid
        chat_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
        try:
            full_text = ""
            async for chunk in provider.astream(lc_messages):
                text = ""
                if hasattr(chunk, "content") and chunk.content:
                    text = chunk.content
                elif isinstance(chunk, str):
                    text = chunk
                if text:
                    full_text += text
                    # OpenAI-compatible SSE chunk
                    yield f"data: {json.dumps({'id': chat_id, 'object': 'chat.completion.chunk', 'choices': [{'delta': {'content': text}, 'index': 0}]})}\n\n"
            # Final chunk with finish_reason
            yield f"data: {json.dumps({'id': chat_id, 'object': 'chat.completion.chunk', 'choices': [{'delta': {}, 'finish_reason': 'stop', 'index': 0}]})}\n\n"
        except Exception as e:
            logger.error(f"Chat stream error: {e}")
            yield f"data: {json.dumps({'id': chat_id, 'object': 'chat.completion.chunk', 'choices': [{'delta': {'content': f'Error: {e}'}, 'finish_reason': 'error', 'index': 0}]})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(_stream(), media_type="text/event-stream")


# ── RAG endpoints ───────────────────────────────────────

@app.get("/rag/search")
async def rag_search(q: str = Query(..., description="Search query"), top_k: int = Query(10, description="Number of results")):
    """Search the RAG code index."""
    from .rag import search_codebase
    results = search_codebase(q, top_k=top_k)
    return {"results": results, "count": len(results)}


@app.post("/rag/rebuild")
async def rag_rebuild():
    """Rebuild the RAG code index from scratch."""
    from .rag import rebuild_index, get_index
    rebuild_index()
    idx = get_index()
    return idx.stats()


@app.get("/rag/stats")
async def rag_stats():
    """Get RAG index statistics."""
    from .rag import get_index
    return get_index().stats()


# ── Conversation history endpoints ──────────────────────

@app.get("/conversations")
async def list_conversations(limit: int = Query(20, description="Maximum conversations to return")):
    """List saved conversations."""
    from .memory import list_conversations as _list
    import os
    root = os.getcwd()
    return {"conversations": _list(root, limit=limit)}


@app.get("/conversations/{conv_id}")
async def load_conversation(conv_id: str):
    """Load a saved conversation by ID."""
    from .memory import load_conversation as _load
    import os
    root = os.getcwd()
    data = _load(root, conv_id)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Conversation {conv_id} not found")
    return data


@app.post("/conversations")
async def save_conversation(request: Request):
    """Save a conversation. Body: {"id": str, "messages": [...]}"""
    body = await request.json()
    conv_id = body.get("id", "")
    messages = body.get("messages", [])
    if not conv_id:
        raise HTTPException(status_code=400, detail="Missing 'id' field")
    from .memory import save_conversation as _save
    import os
    root = os.getcwd()
    path = _save(root, conv_id, messages)
    return {"saved": path, "id": conv_id}


@app.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    """Delete a saved conversation by ID."""
    from .memory import delete_conversation as _delete
    import os
    root = os.getcwd()
    ok = _delete(root, conv_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Conversation {conv_id} not found")
    return {"deleted": conv_id}


# ── Agent streaming endpoint ─────────────────────────────

@app.post("/agent/stream")
async def agent_stream(request: Request):
    """Stream agent execution step by step via SSE.

    POST body: { "task": "...", "max_steps": 10, "context_files": [...] }

    Events:
        data: {"type": "plan", "steps": ["..."]}
        data: {"type": "step", "index": 0, "description": "...", "status": "running"}
        data: {"type": "tool_call", "step": 0, "tool": "read_file", "input": "..."}
        data: {"type": "tool_result", "step": 0, "output": "..."}
        data: {"type": "step", "index": 0, "status": "completed"}
        data: {"type": "result", "summary": "..."}
        data: {"type": "error", "message": "..."}
    """
    import asyncio
    body = await request.json()
    task = body.get("task", "")
    max_steps = body.get("max_steps", 10)
    context_files = body.get("context_files", [])

    logger.info(f"Agent stream: {task[:80]}")

    # Build task with file context
    full_task = task
    if context_files:
        full_task = f"Task: {task}\nRelevant files: {', '.join(context_files)}"

    async def _stream():
        try:
            from .agent import get_agent, AgentState

            agent = get_agent()

            yield f"data: {json.dumps({'type': 'status', 'status': 'planning'})}\n\n"

            # Run with streaming via astream_events
            config = {"recursion_limit": max_steps * 2}
            initial_state: AgentState = {
                "task": full_task,
                "messages": [HumanMessage(content=full_task)],
                "plan": [],
                "current_step": 0,
                "result": "",
            }

            last_step_idx = -1
            async for event in agent.astream_events(initial_state, config=config, version="v2"):
                kind = event.get("event", "")

                if kind == "on_chain_start" and "plan" in event.get("name", ""):
                    yield f"data: {json.dumps({'type': 'status', 'status': 'planning'})}\n\n"

                elif kind == "on_chain_end" and "plan" in event.get("name", ""):
                    output = event.get("data", {}).get("output", {})
                    if isinstance(output, dict) and "plan" in output:
                        plan = output["plan"]
                        yield f"data: {json.dumps({'type': 'plan', 'steps': plan})}\n\n"

                elif kind == "on_tool_start":
                    tool_name = event.get("name", "unknown")
                    tool_input = event.get("data", {}).get("input", {})
                    yield f"data: {json.dumps({'type': 'tool_call', 'tool': tool_name, 'input': str(tool_input)[:500]})}\n\n"

                elif kind == "on_tool_end":
                    tool_name = event.get("name", "unknown")
                    output = event.get("data", {}).get("output", "")
                    yield f"data: {json.dumps({'type': 'tool_result', 'tool': tool_name, 'output': str(output)[:1000]})}\n\n"

                elif kind == "on_chain_end" and "executor" in event.get("name", ""):
                    output = event.get("data", {}).get("output", {})
                    if isinstance(output, dict):
                        idx = output.get("current_step", 0)
                        if idx > last_step_idx:
                            last_step_idx = idx
                            plan = output.get("plan", [])
                            step_desc = plan[idx - 1] if 0 < idx <= len(plan) else f"Step {idx}"
                            yield f"data: {json.dumps({'type': 'step', 'index': idx - 1, 'description': step_desc, 'status': 'completed'})}\n\n"

                elif kind == "on_chain_end" and "LangGraph" in event.get("name", ""):
                    output = event.get("data", {}).get("output", {})
                    if isinstance(output, dict) and "result" in output:
                        yield f"data: {json.dumps({'type': 'result', 'summary': str(output['result'])[:2000], 'plan': output.get('plan', []), 'steps_completed': output.get('current_step', 0), 'messages': [{'role': str(m.__class__.__name__), 'content': str(m.content)[:500]} for m in output.get('messages', [])[-5:]]})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            logger.error(f"Agent stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(_stream(), media_type="text/event-stream")


# ── MCP tools listing ────────────────────────────────────


@app.get("/mcp/tools")
async def mcp_tools(request: Request):
    """List all registered MCP tools + user-defined tools with metadata."""
    from .server import get_mcp_tool_definitions
    from .tool_registry import get_user_tool_defs

    workspace = request.query_params.get("workspace")
    builtin = get_mcp_tool_definitions()
    user = get_user_tool_defs(workspace)

    return {
        "tools": builtin,
        "user_tools": user,
    }


@app.post("/mcp/tools")
async def mcp_tools_register(request: Request):
    """Register a new user-defined tool.

    POST body: {
        "name": "my_tool",
        "description": "Does X",
        "type": "shell" | "python",
        "code": "echo hello {name}" or Python source,
        "parameters": [{"name": "name", "type": "str", "description": "..."}],
        "scope": "project" | "global"  (default "project")
    }
    """
    from .tool_registry import add_user_tool

    body = await request.json()
    scope = body.get("scope", "project")
    workspace = body.get("workspace")
    tool = add_user_tool(body, workspace_root=workspace, scope=scope)
    return {"status": "registered", "tool": tool}


@app.delete("/mcp/tools/{tool_name}")
async def mcp_tools_remove(tool_name: str, request: Request):
    """Remove a user-defined tool by name."""
    from .tool_registry import remove_user_tool

    workspace = request.query_params.get("workspace")
    ok = remove_user_tool(tool_name, workspace_root=workspace)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")
    return {"status": "removed", "name": tool_name}


# ── Health check ─────────────────────────────────────────

@app.get("/health")
async def health():
    provider = get_llm()
    return {
        "status": "ok",
        "provider": type(provider).__name__ if provider else "none",
    }


# ── Entry point for standalone HTTP mode ─────────────────

def run_http(port: int = 11435):
    """Run the FastAPI server (called from server.py main thread)."""
    import uvicorn
    logger.info(f"Starting AI HTTP server on port {port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
