"""Agent Service — autonomous task execution with planning and tools.

Wraps the LangGraph ReAct agent and exposes a streaming execution
interface compatible with the frontend's AgentStreamEvent protocol.
"""
from collections.abc import Iterator
from dataclasses import dataclass, field
from enum import Enum
from loguru import logger

from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from .llm_service import LLMService
from .tool_service import ToolService


# ── streaming event types (frontend-compatible) ──────

class AgentEventType(str, Enum):
    PLAN = "plan"
    STEP = "step"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    RESULT = "result"
    ERROR = "error"
    FILE_CHANGES = "file_changes"


@dataclass
class AgentStreamEvent:
    type: AgentEventType
    # plan
    steps: list[str] | None = None
    # step
    index: int | None = None
    description: str | None = None
    status: str | None = None
    # tool
    tool: str | None = None
    input: str | None = None
    output: str | None = None
    # result
    summary: str | None = None
    steps_completed: int | None = None
    messages: list[dict] | None = None
    # error
    message: str | None = None
    # file_changes
    files: int | None = None
    insertions: int | None = None
    deletions: int | None = None

    def to_dict(self) -> dict:
        """Serialize for SSE/JSON transport."""
        d: dict = {"type": self.type.value}
        for field_name in [
            "steps", "index", "description", "status",
            "tool", "input", "output", "summary",
            "steps_completed", "messages", "message",
            "files", "insertions", "deletions",
        ]:
            val = getattr(self, field_name)
            if val is not None:
                d[field_name] = val
        return d


# ── Agent internal state (LangGraph) ─────────────────

from typing import TypedDict, Annotated, Sequence, Literal
from langchain_core.messages import BaseMessage


class _AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], "append"]
    task: str
    plan: list[str]
    current_step: int
    result: str


# ── Service ──────────────────────────────────────────

class AgentService:
    """Autonomous agent execution service.

    Takes a task description, generates a plan, and executes
    tools in a ReAct loop until completion or max_steps.
    """

    def __init__(self, llm_service: LLMService, tool_service: ToolService) -> None:
        self._llm = llm_service
        self._tools = tool_service
        self._graph = self._build_graph()

    def _build_graph(self):
        """Build the ReAct agent graph."""
        from oceanix_ai_server.prompts import AGENT_SYSTEM_PROMPT

        workflow = StateGraph(_AgentState)

        def plan_node(state: _AgentState) -> dict:
            task = state["task"].lower()
            if "fix" in task or "修复" in task or "bug" in task:
                plan = [
                    "Read the relevant source files to understand the issue",
                    "Search for related code patterns",
                    "Identify the root cause",
                    "Write the fix",
                    "Run tests or verify the change",
                ]
            elif "implement" in task or "实现" in task or "add" in task:
                plan = [
                    "Review existing related code",
                    "Design the implementation approach",
                    "Write the new code",
                    "Verify the implementation compiles/runs",
                    "Commit the changes",
                ]
            elif "review" in task or "审查" in task:
                plan = [
                    "Read the files to review",
                    "Check for bugs, style issues, and architectural problems",
                    "Check git diff for recent changes",
                    "Write review comments",
                ]
            else:
                plan = [
                    "Understand the request",
                    "Gather relevant information",
                    "Execute the task",
                    "Report results",
                ]
            return {"plan": plan, "current_step": 0, "result": ""}

        def agent_llm_node(state: _AgentState) -> dict:
            llm = self._llm.to_langchain_model()
            lc_tools = self._tools.to_langchain_tools()
            llm_with_tools = llm.bind_tools(lc_tools)

            full_messages = [
                SystemMessage(content=AGENT_SYSTEM_PROMPT),
                HumanMessage(content=f"Task: {state['task']}\nPlan: {state['plan']}"),
                *state["messages"],
            ]
            response = llm_with_tools.invoke(full_messages)
            return {"messages": [response]}

        def tools_node(state: _AgentState) -> dict:
            lc_tools = self._tools.to_langchain_tools()
            tool_node = ToolNode(lc_tools)
            return tool_node.invoke(state)

        def executor_node(state: _AgentState) -> dict:
            step_idx = state["current_step"]
            if step_idx >= len(state["plan"]):
                return {"result": "All steps completed"}
            return {"current_step": step_idx + 1}

        def should_continue(state: _AgentState) -> Literal["tools", "agent_llm", "__end__"]:
            messages = state["messages"]
            if not messages:
                return "agent_llm"
            last_msg = messages[-1]
            tool_calls = getattr(last_msg, "tool_calls", None)
            if tool_calls and len(tool_calls) > 0:
                return "tools"
            if state["current_step"] >= len(state["plan"]):
                return "__end__"
            return "agent_llm"

        workflow.add_node("plan", plan_node)
        workflow.add_node("agent_llm", agent_llm_node)
        workflow.add_node("tools", tools_node)

        workflow.set_entry_point("plan")
        workflow.add_edge("plan", "agent_llm")
        workflow.add_conditional_edges(
            "agent_llm", should_continue,
            {"tools": "tools", "agent_llm": "agent_llm", "__end__": END},
        )
        workflow.add_edge("tools", "agent_llm")

        return workflow.compile()

    def execute(
        self, task: str, max_steps: int = 10,
    ) -> Iterator[AgentStreamEvent]:
        """Execute a task and yield streaming events for the frontend."""
        logger.info(f"Agent executing: {task[:100]}")

        # Phase 1: Plan
        plan = self._generate_plan(task)
        yield AgentStreamEvent(type=AgentEventType.PLAN, steps=plan)

        # Phase 2: Run the graph
        try:
            result = self._graph.invoke(
                {"task": task, "messages": [HumanMessage(content=task)], "plan": plan, "current_step": 0, "result": ""},
                config={"recursion_limit": max_steps * 2},
            )
            yield AgentStreamEvent(
                type=AgentEventType.RESULT,
                summary=result.get("result", "Done"),
                steps_completed=result.get("current_step", 0),
            )
        except Exception as e:
            logger.error(f"Agent failed: {e}")
            yield AgentStreamEvent(type=AgentEventType.ERROR, message=str(e))

    def _generate_plan(self, task: str) -> list[str]:
        """Generate a plan for the task."""
        task_lower = task.lower()
        if "fix" in task_lower or "修复" in task_lower or "bug" in task_lower:
            return [
                "Read the relevant source files to understand the issue",
                "Search for related code patterns",
                "Identify the root cause",
                "Write the fix",
                "Run tests or verify the change",
            ]
        elif "implement" in task_lower or "实现" in task_lower or "add" in task_lower:
            return [
                "Review existing related code",
                "Design the implementation approach",
                "Write the new code",
                "Verify the implementation compiles/runs",
                "Commit the changes",
            ]
        elif "review" in task_lower or "审查" in task_lower:
            return [
                "Read the files to review",
                "Check for bugs, style issues, and architectural problems",
                "Check git diff for recent changes",
                "Write review comments",
            ]
        else:
            return [
                "Understand the request",
                "Gather relevant information",
                "Execute the task",
                "Report results",
            ]
