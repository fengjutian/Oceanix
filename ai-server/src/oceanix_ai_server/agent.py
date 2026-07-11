"""LangGraph Agent Runtime.

Creates a ReAct-style agent that can:
1. Plan tasks by breaking down the user's request
2. Execute tools (read_file, write_file, search, git, terminal)
3. Observe results and adjust the plan
4. Report the final result

Architecture:
    User request → Plan → Execute tool → Observe → (loop) → Report
"""

from typing import TypedDict, Annotated, Sequence, Literal
from loguru import logger

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

from .tools import TOOLS


# ── Agent State ─────────────────────────────────────────


class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], "append"]
    task: str
    plan: list[str]
    current_step: int
    result: str


# ── LLM Helper ─────────────────────────────────────────


def _get_agent_llm():
    """Get a chat model bound with editor tools."""
    from .server import _get_llm
    llm = _get_llm()
    if llm is None:
        raise RuntimeError("No LLM configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.")
    return llm.bind_tools(TOOLS)


# ── Agent LLM Node ─────────────────────────────────────


def agent_llm_node(state: AgentState) -> AgentState:
    """Call the LLM with tools and return its response."""
    from .prompts import AGENT_SYSTEM_PROMPT
    from langchain_core.messages import SystemMessage

    llm = _get_agent_llm()

    full_messages = [
        SystemMessage(content=AGENT_SYSTEM_PROMPT),
        HumanMessage(content=f"Task: {state['task']}\nPlan: {state['plan']}"),
        *state["messages"],
    ]

    response = llm.invoke(full_messages)
    return {"messages": [response]}


# ── Planner Node ────────────────────────────────────────


def plan_node(state: AgentState) -> AgentState:
    """Generate a step-by-step plan for the task."""
    logger.info(f"Planning: {state['task'][:80]}...")

    # Simple rule-based planning for now; LLM-driven in production
    task = state["task"].lower()

    plan = []
    if "fix" in task or "修复" in task or "bug" in task:
        plan = [
            "1. Read the relevant source files to understand the issue",
            "2. Search for related code patterns",
            "3. Identify the root cause",
            "4. Write the fix",
            "5. Run tests or verify the change",
        ]
    elif "implement" in task or "实现" in task or "add" in task:
        plan = [
            "1. Review existing related code",
            "2. Design the implementation approach",
            "3. Write the new code",
            "4. Verify the implementation compiles/runs",
            "5. Commit the changes",
        ]
    elif "review" in task or "审查" in task:
        plan = [
            "1. Read the files to review",
            "2. Check for bugs, style issues, and architectural problems",
            "3. Check git diff for recent changes",
            "4. Write review comments",
        ]
    else:
        plan = [
            "1. Understand the request",
            "2. Gather relevant information",
            "3. Execute the task",
            "4. Report results",
        ]

    return {
        "plan": plan,
        "current_step": 0,
        "result": "",
    }


# ── Executor Node ───────────────────────────────────────


def executor_node(state: AgentState) -> AgentState:
    """Execute the current step in the plan."""
    step_idx = state["current_step"]
    if step_idx >= len(state["plan"]):
        return {"result": "All steps completed"}

    step = state["plan"][step_idx]
    logger.info(f"Executing step {step_idx + 1}/{len(state['plan'])}: {step}")

    return {"current_step": step_idx + 1}


# ── Tools Node ──────────────────────────────────────────

tool_node = ToolNode(TOOLS)


# ── Router ──────────────────────────────────────────────


def should_continue(state: AgentState) -> Literal["tools", "agent_llm", "__end__"]:
    messages = state["messages"]
    if not messages:
        return "agent_llm"

    last_msg = messages[-1]

    # If the LLM requested tool calls, execute them
    tool_calls = getattr(last_msg, "tool_calls", None)
    if tool_calls and len(tool_calls) > 0:
        return "tools"

    # If we've completed all plan steps, end
    if state["current_step"] >= len(state["plan"]):
        return "__end__"

    # Otherwise continue the LLM loop
    return "agent_llm"


# ── Graph Builder ───────────────────────────────────────


def create_agent():
    """Create the main LangGraph agent graph (ReAct pattern)."""
    workflow = StateGraph(AgentState)

    # Nodes: plan → agent_llm ⇄ tools → end
    workflow.add_node("plan", plan_node)
    workflow.add_node("agent_llm", agent_llm_node)
    workflow.add_node("tools", tool_node)

    workflow.set_entry_point("plan")

    # plan → agent_llm
    workflow.add_edge("plan", "agent_llm")
    # agent_llm → tools (if tool calls) or loop/end
    workflow.add_conditional_edges(
        "agent_llm",
        should_continue,
        {"tools": "tools", "agent_llm": "agent_llm", "__end__": END},
    )
    # tools → back to agent_llm for next decision
    workflow.add_edge("tools", "agent_llm")

    agent = workflow.compile()
    logger.info("Agent graph compiled (ReAct pattern)")
    return agent


# ── Convenience ─────────────────────────────────────────


# Singleton agent instance
_agent = None


def get_agent():
    global _agent
    if _agent is None:
        _agent = create_agent()
    return _agent
