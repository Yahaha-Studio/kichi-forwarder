"""One real Hermes AIAgent tool loop; API credentials are read only from env."""

import argparse
import json
import os
from pathlib import Path
import shutil
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hermes-source", type=Path, required=True)
    parser.add_argument("--plugin-root", type=Path, required=True)
    parser.add_argument("--home", type=Path, required=True)
    args = parser.parse_args()
    home = args.home.resolve()
    if home.exists() and any(home.iterdir()):
        raise RuntimeError("--home must be an empty test directory")
    plugin = home / "plugins" / "kichi"
    plugin.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(args.plugin_root.resolve(), plugin)
    (home / "config.yaml").write_text("plugins:\n  enabled: [kichi]\n", encoding="utf-8")
    os.environ["HERMES_HOME"] = str(home)
    sys.path.insert(0, str(args.hermes_source.resolve()))
    from hermes_cli.plugins import get_plugin_manager
    from tools.registry import registry
    from run_agent import AIAgent

    manager = get_plugin_manager()
    manager.discover_and_load()
    calls = []
    original_dispatch = registry.dispatch

    def observed_dispatch(name, arguments, **kwargs):
        if name not in {"kichi_connection_status", "kichi_get_config"}:
            raise AssertionError(f"Unexpected tool in read-only smoke: {name}")
        result = original_dispatch(name, arguments, **kwargs)
        parsed = json.loads(result) if isinstance(result, str) else result
        if parsed.get("error"):
            raise AssertionError(parsed["error"])
        calls.append(name)
        return result

    registry.dispatch = observed_dispatch
    try:
        agent = AIAgent(
            base_url=os.environ["KICHI_TEST_BASE_URL"], api_key=os.environ["KICHI_TEST_API_KEY"],
            provider="custom", api_mode="chat_completions", model=os.environ["KICHI_TEST_MODEL"],
            max_iterations=3, enabled_toolsets=["kichi"], quiet_mode=True,
            session_id="kichi-hermes-llm-smoke", platform="cli", skip_context_files=True,
            skip_memory=True, skip_background_review=True,
        )
        result = agent.run_conversation(
            "Call kichi_connection_status exactly once with {}. Then state the connected value "
            "from that result in one short sentence. Do not call any other tool.",
            system_message="This is an isolated adapter smoke test. Use only kichi_connection_status. "
                           "Do not join, connect, run commands, inspect files, or take any other action.",
            task_id="kichi-hermes-llm-smoke",
        )
        assert calls == ["kichi_connection_status"], f"Unexpected real registry calls: {calls}"
        assert not result.get("error"), str(result.get("error"))
        messages = result["messages"]
        assert any(item.get("role") == "tool" for item in messages), "No tool result in Hermes conversation"
        assert messages[-1]["role"] == "assistant" and messages[-1].get("content"), "Hermes did not finish with an answer"
        assert not messages[-1].get("tool_calls"), "Hermes ended with unexecuted tool calls"
        print(json.dumps({"success": True, "actual_registry_calls": calls,
                          "model": os.environ["KICHI_TEST_MODEL"], "tool_result_in_conversation": True}))
    finally:
        registry.dispatch = original_dispatch
        manager.unload("kichi")


if __name__ == "__main__":
    main()
