"""User-defined tool registry.

Supports registering shell commands and Python scripts as Agent tools.
Tools are persisted to JSON files:
  - Global:  ~/.oceanix/tools.json
  - Project: <workspace>/.oceanix/tools.json
Project tools override global tools with the same name.
"""

import json
import subprocess
import sys
import os
import textwrap
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Literal
from loguru import logger

from langchain_core.tools import tool as langchain_tool


# ── Data model ───────────────────────────────────────────


@dataclass
class ToolParamDef:
    name: str
    type: str  # str, int, float, bool
    description: str = ""


@dataclass
class UserToolDef:
    name: str
    description: str
    type: Literal["shell", "python"]
    code: str
    parameters: list[ToolParamDef] = field(default_factory=list)
    source: Literal["global", "project"] = "project"  # where it was loaded from


# ── Path helpers ─────────────────────────────────────────


def _global_tools_path() -> Path:
    return Path.home() / ".oceanix" / "tools.json"


def _project_tools_path(workspace_root: str | None = None) -> Path | None:
    root = workspace_root or os.getcwd()
    if not root:
        return None
    return Path(root) / ".oceanix" / "tools.json"


# ── Load / Save ──────────────────────────────────────────


def _dict_to_tool(d: dict, source: str) -> UserToolDef:
    params = [ToolParamDef(**p) for p in d.get("parameters", [])]
    return UserToolDef(
        name=d["name"],
        description=d.get("description", ""),
        type=d["type"],
        code=d["code"],
        parameters=params,
        source=source,
    )


def load_user_tools(workspace_root: str | None = None) -> list[UserToolDef]:
    """Load all user-defined tools, merging global + project."""
    tools_by_name: dict[str, UserToolDef] = {}

    # 1. Load global tools (lowest priority)
    global_path = _global_tools_path()
    if global_path.exists():
        try:
            data = json.loads(global_path.read_text("utf-8"))
            for t in data.get("tools", []):
                tool = _dict_to_tool(t, "global")
                tools_by_name[tool.name] = tool
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to parse global tools: {e}")

    # 2. Load project tools (override global)
    project_path = _project_tools_path(workspace_root)
    if project_path and project_path.exists():
        try:
            data = json.loads(project_path.read_text("utf-8"))
            for t in data.get("tools", []):
                tool = _dict_to_tool(t, "project")
                tools_by_name[tool.name] = tool  # override
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to parse project tools: {e}")

    return list(tools_by_name.values())


def save_user_tools(
    tools: list[UserToolDef],
    workspace_root: str | None = None,
) -> Path:
    """Save tools to the project-level file (creates .oceanix/ if needed)."""
    project_path = _project_tools_path(workspace_root)
    if project_path is None:
        raise ValueError("No workspace root — cannot save project tools")

    project_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "tools": [
            {
                "name": t.name,
                "description": t.description,
                "type": t.type,
                "code": t.code,
                "parameters": [asdict(p) for p in t.parameters],
            }
            for t in tools
        ]
    }
    project_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), "utf-8")
    logger.info(f"Saved {len(tools)} user tools to {project_path}")
    return project_path


def save_global_tools(tools: list[UserToolDef]) -> Path:
    """Save tools to the global file."""
    global_path = _global_tools_path()
    global_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "tools": [
            {
                "name": t.name,
                "description": t.description,
                "type": t.type,
                "code": t.code,
                "parameters": [asdict(p) for p in t.parameters],
            }
            for t in tools
        ]
    }
    global_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), "utf-8")
    logger.info(f"Saved {len(tools)} user tools to {global_path}")
    return global_path


# ── Tool factory: wrap user tools as LangChain tools ────


_PARAM_TYPE_MAP = {
    "str": str,
    "int": int,
    "float": float,
    "bool": bool,
}


def _make_shell_tool(tool_def: UserToolDef):
    """Create a LangChain tool from a shell command definition."""

    # Build a function that executes the shell command
    param_names = [p.name for p in tool_def.parameters]

    def _execute(**kwargs) -> str:
        cmd = tool_def.code
        # Substitute {param} placeholders
        for key, value in kwargs.items():
            cmd = cmd.replace(f"{{{key}}}", str(value))

        try:
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=60,
                cwd=os.getcwd(),
            )
            out = result.stdout.strip()
            err = result.stderr.strip()
            if result.returncode != 0:
                return f"Exit code: {result.returncode}\nstdout:\n{out}\nstderr:\n{err}"
            return out or "(no output)"
        except subprocess.TimeoutExpired:
            return "Error: command timed out after 60s"
        except Exception as e:
            return f"Error executing shell command: {e}"

    # Dynamic signature via annotations
    annotations = {"return": str}
    for p in tool_def.parameters:
        annotations[p.name] = _PARAM_TYPE_MAP.get(p.type, str)

    _execute.__annotations__ = annotations
    _execute.__name__ = tool_def.name
    _execute.__doc__ = tool_def.description

    return langchain_tool(_execute)


def _make_python_tool(tool_def: UserToolDef):
    """Create a LangChain tool from a Python code definition.

    The code must define a function `run(**kwargs) -> str`.
    """

    def _execute(**kwargs) -> str:
        # Restricted namespace for exec
        namespace: dict = {}
        try:
            exec(tool_def.code, namespace)
            run_fn = namespace.get("run")
            if not callable(run_fn):
                return "Error: Python tool must define a 'run(**kwargs) -> str' function"
            result = run_fn(**kwargs)
            return str(result)
        except Exception as e:
            return f"Error executing Python tool '{tool_def.name}': {e}"

    annotations = {"return": str}
    for p in tool_def.parameters:
        annotations[p.name] = _PARAM_TYPE_MAP.get(p.type, str)

    _execute.__annotations__ = annotations
    _execute.__name__ = tool_def.name
    _execute.__doc__ = tool_def.description

    return langchain_tool(_execute)


def wrap_user_tools(user_tools: list[UserToolDef]) -> list:
    """Convert UserToolDef list into LangChain tool functions."""
    wrapped = []
    for td in user_tools:
        try:
            if td.type == "shell":
                t = _make_shell_tool(td)
            elif td.type == "python":
                t = _make_python_tool(td)
            else:
                logger.warning(f"Unknown tool type '{td.type}' for {td.name}, skipping")
                continue
            wrapped.append(t)
        except Exception as e:
            logger.error(f"Failed to create tool '{td.name}': {e}")
    return wrapped


# ── Unified tool list (built-in + user) ──────────────────


def get_all_tools(workspace_root: str | None = None) -> list:
    """Return built-in tools + user-defined tools combined."""
    from .tools.builtin import read_file, write_file, grep_files, glob_files
    from langchain_core.tools import tool as langchain_tool

    BUILTIN_TOOLS = [
        langchain_tool(read_file),
        langchain_tool(write_file),
        langchain_tool(grep_files),
        langchain_tool(glob_files),
    ]

    user_tools = load_user_tools(workspace_root)
    wrapped_user_tools = wrap_user_tools(user_tools)

    # Built-in tools first, then user tools
    all_tools = list(BUILTIN_TOOLS) + wrapped_user_tools
    logger.debug(
        f"Tools: {len(BUILTIN_TOOLS)} built-in + {len(wrapped_user_tools)} user = {len(all_tools)} total"
    )
    return all_tools


def get_user_tool_defs(workspace_root: str | None = None) -> list[dict]:
    """Return user tool definitions as dicts (for API)."""
    tools = load_user_tools(workspace_root)
    return [
        {
            "name": t.name,
            "description": t.description,
            "type": t.type,
            "code": t.code,
            "parameters": [asdict(p) for p in t.parameters],
            "source": t.source,
            "builtin": False,
        }
        for t in tools
    ]


def add_user_tool(
    tool_dict: dict,
    workspace_root: str | None = None,
    scope: Literal["global", "project"] = "project",
) -> dict:
    """Add a new user tool. Returns the saved tool dict."""
    tools = load_user_tools(workspace_root)

    # Remove existing with same name
    tools = [t for t in tools if t.name != tool_dict["name"]]

    # Build new tool
    params = [ToolParamDef(**p) for p in tool_dict.get("parameters", [])]
    new_tool = UserToolDef(
        name=tool_dict["name"],
        description=tool_dict.get("description", ""),
        type=tool_dict["type"],
        code=tool_dict["code"],
        parameters=params,
        source=scope,
    )
    tools.append(new_tool)

    if scope == "global":
        save_global_tools(tools)
    else:
        save_user_tools(tools, workspace_root)

    # Rebuild agent tools
    _invalidate_agent()

    return {
        "name": new_tool.name,
        "description": new_tool.description,
        "type": new_tool.type,
        "code": new_tool.code,
        "parameters": [asdict(p) for p in new_tool.parameters],
        "source": new_tool.source,
    }


def remove_user_tool(
    name: str,
    workspace_root: str | None = None,
) -> bool:
    """Remove a user tool by name. Returns True if found and removed."""
    tools = load_user_tools(workspace_root)
    before = len(tools)
    tools = [t for t in tools if t.name != name]
    after = len(tools)

    if before == after:
        return False

    # Save back (only project-level tools)
    project_tools = [t for t in tools if t.source == "project"]
    save_user_tools(project_tools, workspace_root)

    # Also check global
    global_path = _global_tools_path()
    if global_path.exists():
        try:
            data = json.loads(global_path.read_text("utf-8"))
            global_list = [t for t in data.get("tools", []) if t.get("name") != name]
            if len(global_list) < len(data.get("tools", [])):
                global_path.write_text(
                    json.dumps({"tools": global_list}, indent=2, ensure_ascii=False),
                    "utf-8",
                )
                logger.info(f"Removed tool '{name}' from global registry")
        except Exception as e:
            logger.warning(f"Failed to update global tools: {e}")

    _invalidate_agent()
    return True


# ── Agent invalidation ───────────────────────────────────


def _invalidate_agent():
    """Force the agent to be recreated next time with updated tools."""
    from . import agent as agent_mod
    agent_mod._agent = None
    logger.info("Agent invalidated — will rebuild with updated tools on next use")
