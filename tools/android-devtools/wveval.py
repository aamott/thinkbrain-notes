#!/usr/bin/env python3
"""Evaluate JavaScript inside the running Android app's WebView.

Why this exists
---------------
Driving the Android build by `adb shell input tap` at fixed coordinates is not
reproducible: the dialog moves when the soft keyboard opens, and BACK perturbs
app state. An earlier debugging session got three different error codes from
identical input that way and concluded nothing.

`uiautomator dump` is not the answer either -- this app's WebView exposes no
accessibility tree, so a dump returns the empty content frame and nothing else.

What does work is the WebView's own DevTools protocol, which debug builds
expose on an abstract unix socket. Through it a Tauri command can be called
with exact arguments and events can be subscribed to, which makes a device run
as repeatable as a test.

Usage
-----
    adb forward tcp:9222 \\
      localabstract:webview_devtools_remote_$(adb shell pidof com.thinkbrain.notes)

    python3 wveval.py "document.title"
    python3 wveval.py @snippet.js          # read the expression from a file

Promises are awaited, so an expression may be an async IIFE.

Calling a Tauri command
-----------------------
`withGlobalTauri` is off, so `window.__TAURI__` is undefined; the low-level
bridge `window.__TAURI_INTERNALS__` is present and is what to use:

    window.__TAURI_INTERNALS__.invoke('some_command', { someArg: 1 })

To watch events, register a callback and collect into a global:

    window.__probe = [];
    const cb = window.__TAURI_INTERNALS__.transformCallback(e => window.__probe.push(e));
    await window.__TAURI_INTERNALS__.invoke('plugin:event|listen',
        { event: 'sync://import', target: { kind: 'Any' }, handler: cb });

then read `JSON.stringify(window.__probe)` in a later call.

Requires the `websocket-client` package.
"""

import json
import sys
import urllib.request

import websocket


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    expression = sys.argv[1]
    if expression.startswith("@"):
        with open(expression[1:], encoding="utf-8") as handle:
            expression = handle.read()

    targets = json.load(urllib.request.urlopen("http://localhost:9222/json"))
    if not targets:
        print("No DevTools targets. Is the app running and the port forwarded?")
        return 1

    # suppress_origin is required: the DevTools endpoint rejects a WebSocket
    # carrying an Origin header with "403 Rejected an incoming WebSocket
    # connection from the http://localhost:9222 origin".
    connection = websocket.create_connection(
        targets[0]["webSocketDebuggerUrl"], timeout=90, suppress_origin=True
    )
    connection.send(
        json.dumps(
            {
                "id": 1,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": expression,
                    "awaitPromise": True,
                    "returnByValue": True,
                },
            }
        )
    )

    while True:
        message = json.loads(connection.recv())
        if message.get("id") == 1:
            print(json.dumps(message.get("result"), indent=2))
            return 0


if __name__ == "__main__":
    raise SystemExit(main())
