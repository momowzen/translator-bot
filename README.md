# translator-bot

Multilingual Discord translation bot with per-channel auto-translate. Detects the source language, expands common slang/abbreviations, and replies with a translation into every configured target language.

## Features

- **Auto-translate per channel** — configure 1–5 target languages with `/translator set`.
- **Bidirectional** — any language is translated into all configured targets; messages already in a target language are skipped.
- **Slang & abbreviation expansion** — `ur` → "your", `AFK` → "away from keyboard", `b4` → "before", `GG` → "good game", etc. (see `src/data/slang.json`) before translation for better results.
- **Mention preservation** — `@user`, `@everyone`, `@here`, and custom emoji are kept intact and ping-safe.
- **Case-aware** — `GG` → "GOOD GAME", `Gg` → "Good game", `gg` → "good game".
- **Sane rate limits** — per-channel dedup and a sliding-window DeepL guard protect free-tier quotas.

## Requirements

- Node.js >= 18
- A [DeepL API key](https://www.deepl.com/pro-api)
- A Discord application (bot token + application ID) from the [Developer Portal](https://discord.com/developers/applications)

## Setup

```bash
npm install
cp .env.example .env   # then fill in your values
npm run deploy         # register slash commands once
npm start              # or: npm run dev (auto-restart on changes)
```

## Environment variables

| Variable        | Required | Description                                   |
| --------------- | -------- | --------------------------------------------- |
| `DISCORD_TOKEN` | yes      | Bot token from the Developer Portal.          |
| `CLIENT_ID`     | yes      | Application ID (right sidebar in the portal). |
| `DEEPL_API_KEY` | yes      | DeepL API key.                                |
| `TURSO_URL`     | no       | Turso database URL (hosted persistence).      |
| `TURSO_TOKEN`   | no       | Turso auth token.                             |
| `GROQ_API_KEY`  | no\*     | Groq key for voice speech-to-text (STT).      |
| `EDGE_TTS_PROXY`| no       | HTTP proxy for Edge TTS if geo-blocked.       |

\* Required only for the voice (STT) features; auto-translate works without it.

### DeepL tuning (optional)

| Variable                     | Default              | Description                                                        |
| ---------------------------- | -------------------- | ------------------------------------------------------------------ |
| `DEEPL_MODEL_TYPE`           | `quality_optimized`  | `quality_optimized` (best) or `latency_optimized` (fastest). Voice always uses `latency_optimized`. |
| `DEEPL_FORMALITY`            | *(unset)*            | `default`/`more`/`less`/`prefer_more`/`prefer_less`.               |
| `DEEPL_PRESERVE_FORMATTING`  | `true`               | Keep Markdown and punctuation intact.                              |
| `DEEPL_SPLIT_SENTENCES`      | *(unset)*            | `default`/`on`/`off`/`nonewlines`.                                 |
| `TRANSLATOR_CONTEXT_MESSAGES`| `3`                  | Prior channel messages sent as context (0 disables).               |

Without `TURSO_URL`/`TURSO_TOKEN`, settings persist to `data/db.json` (gitignored).

## Glossary

`src/services/terms.json` holds user-editable terms applied before and after translation:

```json
{
  "keep": ["Ainz", "Yggdrasil", "다이아"],
  "replace": { "다이아": { "en": "diamonds", "ja": "ダイヤ" } }
}
```

- **keep** — proper nouns/jargon passed through untranslated.
- **replace** — optional per-target-language wording; falls back to the original term when a target is not listed.

Terms are masked before translation and restored afterward, so DeepL can't mangle them. Latin terms match on word boundaries; non-Latin (CJK) terms match as substrings so attached particles (e.g. 다이아가) are caught.

## Commands

| Command                                | Description                                                        |
| -------------------------------------- | ------------------------------------------------------------------ |
| `/translator set <lang1> [lang2…5]` | Enable auto-translate in this channel (autocomplete for codes).    |
| `/translator off`                  | Disable auto-translate in this channel.                            |
| `/help`                                | Show command help and language code hints.                         |

`/translator` requires **Manage Channels** permission.

## Hosting

Works on any Node.js host (Railway, Fly, etc.). Recommends setting `TURSO_URL`/`TURSO_TOKEN` for persistent storage across restarts.

## Tests

```bash
npm test
```

Covers the slang normalizer (case handling, word boundaries, digit safety, placeholders). Add a real DeepL key to test translation end-to-end.