# Discord Event Bot

A production-quality bot for managing competitive creative events (map building, coding, art, writing, build jams) on Discord.

---

## Folder Structure

```
bot/
 commands/
    events/
      setup.js # /event-setup
      status.js # /event-status
      delete.js # /event-delete
 handlers/
  commandHandler.js
  buttonHandler.js
  modalHandler.js
 events/
  ready.js
  interactionCreate.js
 utils/
  helpers.js
 db.js
 index.js
 deploy-commands.js
 .env <- create this (see below)
 .env.example
 package.json
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create your `.env` file

Copy `.env.example` to `.env` and fill it in:

```
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id
GUILD_ID=your_server_guild_id
JUDGE_ROLE_ID=role_id_for_judges
ADMIN_ROLE_ID=role_id_for_admins
```

**Never commit `.env` to git.** Add it to `.gitignore`.

### 3. Bot permissions required

When inviting the bot, ensure it has:
- `bot` scope + `applications.commands` scope
- Permissions: `Manage Channels`, `Manage Threads`, `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`, `View Channels`

### 4. Deploy slash commands

```bash
npm run deploy
```

### 5. Start the bot

```bash
npm start
```

---

## Event Lifecycle

```
/event-setup name:"Escape Room Competition"
 v
 Channels auto-created
 v
 Users click "Submit Entry" -> Modal -> Private thread created
 v
 Admin clicks "Start Judging" button in #judging
 v
 Threads lock, judges score via the judging panel
 v
 Admin clicks "Reveal Results" button
 v
 Threads go public
 v
 Admin clicks "Archive Event" button -> results posted to #results
```

---

## Commands

| Command | Description | Permission |
|---|---|---|
| `/event-setup` | Create a new event + all channels | Admin |
| `/event-status` | View event stats and phase | Admin |
| `/event-delete` | Delete an event and all its data | Admin |

---

## File Uploads

Discord modals do not allow file upload

1. User clicks **Submit Entry** and fills out the modal
2. A private thread is created immediately
3. User uploads files directly into the thread
4. Judges can see only after judging phase. Admins can see always.

---

## Thread Privacy

- Submission threads are **private** - only visible to the submitter, and admin role
- Threads are **locked** when judging starts (no more edits); judges can see it
- Threads become **public** after `/event-reveal`

---

## Database

SQLite with WAL mode. The `events.db` file is created automatically on first run.

Tables: `events`, `submissions`, `scores`, `votes`

---

- Rotate your bot token if it's ever exposed
# SBnM-bot
