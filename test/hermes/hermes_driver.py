"""JSON test driver using the installed Hermes plugin loader and registry."""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys


def emit(value):
    print("KICHI_TEST " + json.dumps(value, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hermes-source", type=Path, required=True)
    parser.add_argument("--home", type=Path, required=True)
    args = parser.parse_args()
    os.environ["HERMES_HOME"] = str(args.home.resolve())
    sys.path.insert(0, str(args.hermes_source.resolve()))
    from hermes_cli.plugins import get_plugin_manager
    from tools.registry import registry

    # Observe the real OS child solely for lifecycle assertions/fault injection.
    # Loading, registration, dispatch, hooks, and bridge I/O are not replaced.
    bridge_processes = []
    original_popen = subprocess.Popen

    def observe_process(command, *positional, **keyword):
        process = original_popen(command, *positional, **keyword)
        if isinstance(command, list) and any(str(item).endswith("bridge.mjs") for item in command):
            bridge_processes.append(process)
        return process

    manager = get_plugin_manager()
    subprocess.Popen = observe_process
    try:
        manager.discover_and_load()
    finally:
        subprocess.Popen = original_popen
    info = next(item for item in manager.list_plugins() if item["key"] == "kichi")
    if info["error"]:
        raise RuntimeError("Kichi plugin failed: " + info["error"])
    if len(bridge_processes) != 1:
        raise RuntimeError(f"Expected one real Kichi bridge child, got {len(bridge_processes)}")
    bridge = bridge_processes[0]
    entry = registry.get_entry("kichi_action", scope=manager.scope_key)
    emit({"event": "ready", "bridge_pid": bridge.pid, "tool_count": info["tools"],
          "avatar_status": entry.schema["parameters"]["properties"]["avatarStatus"]["enum"][0]})

    try:
        for line in sys.stdin:
            request = json.loads(line)
            try:
                method = request["method"]
                parameters = request["params"]
                if method == "tool":
                    result = registry.dispatch(parameters["name"], parameters["arguments"],
                                               scope=manager.scope_key, task_id="hermes-integration")
                    if isinstance(result, str):
                        result = json.loads(result)
                elif method == "hook":
                    result = manager.invoke_hook(parameters["name"], session_id="hermes-integration",
                                                 conversation_history=[], is_first_turn=True,
                                                 model="fixture", **parameters["values"])
                elif method == "set_runtime":
                    state_path = args.home / "kichi" / "state.json"
                    state = json.loads(state_path.read_text(encoding="utf-8"))
                    state["llmRuntimeEnabled"] = parameters["enabled"]
                    state_path.write_text(json.dumps(state), encoding="utf-8")
                    result = {"enabled": parameters["enabled"]}
                elif method == "kill_bridge":
                    bridge.kill()
                    bridge.wait(timeout=5)
                    result = {"exited": True}
                elif method == "exit":
                    emit({"id": request["id"], "result": {"exiting": True}})
                    break
                else:
                    raise ValueError(f"Unknown test-driver command: {method}")
                emit({"id": request["id"], "result": result})
            except Exception as exc:
                emit({"id": request["id"], "error": str(exc)})
    finally:
        manager.unload("kichi")
        if bridge.poll() is None:
            raise RuntimeError("Hermes unload left the Kichi child running")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit({"event": "fatal", "error": str(exc)})
        raise
