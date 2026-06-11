#!/usr/bin/env python3
"""Minimal MCP stdio fixture used by Rust integration tests."""

import json
import sys


TOOLS = [
    {
        "name": "echo_text",
        "description": "Echo text back to the caller",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
            },
            "required": ["text"],
        },
    }
]


def write_response(request_id, result=None, error=None):
    response = {
        "jsonrpc": "2.0",
        "id": request_id,
    }
    if error is not None:
        response["error"] = error
    else:
        response["result"] = result
    print(json.dumps(response, separators=(",", ":")), flush=True)


def handle_request(message):
    request_id = message.get("id")
    method = message.get("method")

    if request_id is None:
        return

    if method == "initialize":
        write_response(
            request_id,
            {
                "protocolVersion": "2025-03-26",
                "capabilities": {"tools": {}},
                "serverInfo": {
                    "name": "mobaus-stdio-fixture",
                    "version": "1.0.0",
                },
            },
        )
        return

    if method == "tools/list":
        write_response(request_id, {"tools": TOOLS})
        return

    if method == "tools/call":
        params = message.get("params") or {}
        name = params.get("name")
        arguments = params.get("arguments") or {}

        if name != "echo_text":
            write_response(
                request_id,
                error={"code": -32601, "message": f"Unknown tool: {name}"},
            )
            return

        text = str(arguments.get("text", ""))
        write_response(
            request_id,
            {
                "content": [{"type": "text", "text": f"echo:{text}"}],
                "isError": False,
            },
        )
        return

    if method == "resources/list":
        write_response(request_id, {"resources": []})
        return

    write_response(
        request_id,
        error={"code": -32601, "message": f"Unknown method: {method}"},
    )


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            message = json.loads(line)
        except json.JSONDecodeError as exc:
            print(f"invalid json: {exc}", file=sys.stderr, flush=True)
            continue

        handle_request(message)


if __name__ == "__main__":
    main()
