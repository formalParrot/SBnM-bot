# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run start        # run the bot
npm run deploy       # register slash commands with Discord (run after adding/renaming any command)
```

There are no tests or a linter configured.

## Architecture

The bot uses **discord.js v14** with a SQLite database via **better-sqlite3**. All DB queries are prepared statements in `db.js` — add new queries there, import `stmts` wherever needed.

### Interaction flow

Every user action (slash command, button click, modal submit) fires `events/interactionCreate.js`, which routes to one of three handlers:

- `handlers/commandHandler.js` — slash commands, with per-user cooldown
- `handlers/buttonHandler.js` — all button clicks; buttons are identified by `customId` prefix (e.g. `phase_`, `jview_`, `jscore_`, `event_delete_confirm_`, `event_delete_execute_`)
- `handlers/modalHandler.js` — the submission form and the score form

### Event lifecycle

Events move through statuses in order: `submissions_open → judging → revealed → archived`. Phase transitions are triggered by buttons in the `#judging` channel (admin only). The status is stored in the `events` table and checked throughout button/modal handlers to gate behaviour.

### Submission threads

Each submission gets a **private thread** inside `#submit`. At creation time only the submitter and admins are added as thread members — judges are deliberately excluded. When judging starts, `setThreadVisibility()` in `utils/helpers.js` fetches all guild members with `JUDGE_ROLE_ID` and adds them to every thread, then calls `setLocked(true)` (which prevents non-moderators from typing without needing explicit `SendMessages: false` overwrites).

### Channel permissions pattern

All three event channels (`#submit`, `#judging`, `#results`) deny `SendMessages` for `@everyone` but include an explicit allow overwrite for `interaction.client.user.id` (the bot). Without this the bot cannot post to its own locked-down channels. The judging channel additionally denies `ViewChannel` for `@everyone`.

### Judge hub (the pinned message in `#judging`)

`buildJudgeHub()` in `utils/helpers.js` constructs the embed + button rows. `refreshJudgeHub()` fetches the pinned message by ID and edits it in place — called after every submission and every score so averages stay live. The message ID is stored in `events.judge_hub_message_id`.

### Deleting events

The delete flow (`event_delete_confirm_` → `event_delete_execute_`) must reply to the interaction *before* deleting `#judging`, because Discord blocks deleting the channel an interaction is pending on. The judging channel and category are deleted via `interaction.client.rest.delete()` (direct REST) rather than `guild.channels.fetch().delete()` because the bot may lack `ViewChannel` on the judging channel if it was created before the bot overwrite was added.
