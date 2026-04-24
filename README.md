# JSONL Conversation Viewer

A lightweight browser-based viewer for chat/event logs stored in JSONL format.

This project is designed for transcript files where each line is a JSON object (for example, user/assistant messages, tool calls, tool results, and system events). It renders messages in a chat layout:

- User messages on the right
- Assistant/tool/system messages on the left

## Features

- Open local `.jsonl` or `.json` files directly in the browser
- One-click demo loading from `docs/talent-labeler-batch-processing_claude.jsonl`
- Robust parsing for mixed message shapes:
  - `message.content` as string
  - `message.content` as array (`text`, `tool_use`, `tool_result`)
  - top-level `toolUseResult`
- Escaped sequence decoding for readable output:
  - `\n`, `\r\n`, `\t`, and `\"`
- Long message collapse/expand button in each message header
- Basic parse stats (total lines, rendered items, parse errors)

## Project Structure

- `index.html`: UI layout and styles
- `app.js`: parsing and rendering logic
- `docs/`: sample transcript files

## How to Use

1. Open `index.html` in a browser.
2. Choose a local `.jsonl`/`.json` file with the file picker, or click **Load docs sample**.
3. Read the conversation in left/right chat bubbles.

## Supported JSONL Event Shape (Typical)

Each line should be a valid JSON object, commonly with fields like:

- `type` (e.g. `user`, `assistant`, `file-history-snapshot`)
- `message.role` (`user` or `assistant`)
- `message.content` (string or array of parts)
- `toolUseResult` (optional tool output payload)

The viewer is tolerant of partial/mixed records and will skip malformed lines while reporting parse error count.

## Notes

- This is a static frontend utility. No backend is required.
- For very large files, browser memory/performance depends on your machine and browser.

## License

You can add your preferred license here (for example, MIT).
