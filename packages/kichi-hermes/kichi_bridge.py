"""One profile-owned Node process speaking the Kichi bridge JSON protocol."""

from __future__ import annotations

import atexit
from concurrent.futures import Future, TimeoutError as FutureTimeoutError
import json
import logging
import os
from pathlib import Path
import queue
import subprocess
import threading
from typing import Any, Callable


logger = logging.getLogger(__name__)


class BridgeError(RuntimeError):
    """The bridge request or its process failed; no automatic recovery occurs."""


class ProfileLock:
    """Kernel-held lock: released on process exit without a stale-PID heuristic."""

    def __init__(self, path: Path):
        self._file = path.open("a+b")
        self._file.seek(0, os.SEEK_END)
        if self._file.tell() == 0:
            self._file.write(b"\0")
            self._file.flush()
        self._file.seek(0)
        try:
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(self._file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(self._file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self._file.close()
            raise BridgeError(
                f"Kichi is already running for this Hermes profile ({path.parent}). "
                "Close the other Kichi host before starting this one."
            ) from exc

    def close(self) -> None:
        self._file.close()


class KichiBridge:
    def __init__(self, package_dir: Path, runtime_dir: Path, on_bot_message: Callable[[dict], None]):
        self.runtime_dir = runtime_dir
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        self._profile_lock = ProfileLock(runtime_dir / "hermes.lock")
        self._request_lock = threading.Lock()
        self._close_lock = threading.Lock()
        self._pending: dict[int, Future] = {}
        self._next_id = 0
        self._failure: BridgeError | None = None
        self._closed = False
        self._closing = False
        self._events: queue.Queue = queue.Queue()
        self._on_bot_message = on_bot_message
        self._process: subprocess.Popen | None = None
        try:
            entry = package_dir / "dist" / "bridge.mjs"
            if not entry.is_file():
                raise BridgeError(f"Kichi bridge is not built: {entry}")
            self._process = subprocess.Popen(
                ["node", str(entry), "--runtime-dir", str(runtime_dir)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                encoding="utf-8",
                text=True,
                bufsize=1,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            self._reader = threading.Thread(target=self._read, name="kichi-json", daemon=True)
            self._event_worker = threading.Thread(target=self._deliver_events, name="kichi-events", daemon=True)
            self._reader.start()
            self.tools = self.request("tools/list")
            if not isinstance(self.tools, list) or not self.tools:
                raise BridgeError("Kichi bridge returned no tool definitions")
        except Exception:
            self.close()
            raise
        atexit.register(self.close)

    def start_events(self) -> None:
        self._event_worker.start()

    def request(self, method: str, params: dict | None = None, *, timeout: float = 30) -> Any:
        future = Future()
        with self._request_lock:
            if self._failure is not None:
                raise self._failure
            if self._closed:
                raise BridgeError("Kichi bridge is closed")
            request_id = self._next_id
            self._next_id += 1
            self._pending[request_id] = future
            try:
                self._process.stdin.write(json.dumps(
                    {"id": request_id, "method": method, "params": params or {}}, ensure_ascii=False
                ) + "\n")
                self._process.stdin.flush()
            except (OSError, ValueError) as exc:
                self._pending.pop(request_id)
                raise BridgeError(f"Cannot write to Kichi bridge: {exc}") from exc
        try:
            return future.result(timeout=timeout)
        except FutureTimeoutError as exc:
            failure = BridgeError(f"Kichi {method} timed out; its outcome is unknown. Restart the Hermes host.")
            self._fail(failure)
            self._process.terminate()
            raise failure from exc

    def _fail(self, error: BridgeError) -> None:
        with self._request_lock:
            if self._failure is None:
                self._failure = error
            pending = list(self._pending.values())
            self._pending.clear()
        for future in pending:
            future.set_exception(error)
        if not self._closing:
            logger.error("%s", error)

    def _read(self) -> None:
        try:
            for line in self._process.stdout:
                response = json.loads(line)
                if response.get("event") == "bot_message":
                    self._events.put(response["message"])
                    continue
                request_id = response.get("id")
                with self._request_lock:
                    future = self._pending.pop(request_id, None)
                if future is None:
                    raise BridgeError(f"Kichi returned an unknown request id: {request_id}")
                if "error" in response:
                    future.set_exception(BridgeError(str(response["error"])))
                elif "result" in response:
                    future.set_result(response["result"])
                else:
                    error = BridgeError("Kichi response contains neither result nor error")
                    future.set_exception(error)
                    raise error
            self._fail(BridgeError("Kichi bridge exited or closed stdout"))
        except Exception as exc:
            self._fail(BridgeError(f"Kichi bridge protocol failed: {exc}"))
            if self._process.poll() is None:
                self._process.terminate()

    def _deliver_events(self) -> None:
        while True:
            message = self._events.get()
            if message is None:
                return
            try:
                self._on_bot_message(message)
            except Exception:
                logger.exception("Kichi bot-message delivery failed; the message remains in Kichi history")

    def close(self) -> None:
        with self._close_lock:
            if self._closed:
                return
            self._closing = True
            try:
                if self._process is not None and self._process.poll() is None:
                    if self._failure is None:
                        try:
                            self.request("shutdown", timeout=5)
                        except BridgeError:
                            logger.exception("Kichi bridge did not acknowledge shutdown")
                    if self._process.stdin is not None:
                        self._process.stdin.close()
                    try:
                        self._process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        self._process.kill()
                        self._process.wait()
            finally:
                self._closed = True
                self._events.put(None)
                self._fail(BridgeError("Kichi bridge is closed"))
                self._profile_lock.close()
                atexit.unregister(self.close)
