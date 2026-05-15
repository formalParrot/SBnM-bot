require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');

const client = new Client({
 intents: [
 GatewayIntentBits.Guilds,
 GatewayIntentBits.GuildMessages,
 GatewayIntentBits.MessageContent,
 GatewayIntentBits.GuildMembers,
 ],
});

client.cooldowns = new Collection();
client.commands = new Collection();

// Load commands
const foldersPath = path.join(__dirname, 'commands');
for (const folder of fs.readdirSync(foldersPath)) {
 const folderPath = path.join(foldersPath, folder);
 if (!fs.statSync(folderPath).isDirectory()) continue;
 for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith('.js'))) {
 const command = require(path.join(folderPath, file));
 if ('data' in command && 'execute' in command) {
 client.commands.set(command.data.name, command);
 } else {
 console.warn(`[WARN] ${file} is missing "data" or "execute"`);
 }
 }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
 const event = require(path.join(eventsPath, file));
 if (event.once) {
 client.once(event.name, (...args) => event.execute(...args));
 } else {
 client.on(event.name, (...args) => event.execute(...args));
 }
}

client.on('error', (err) => console.error('[client error]', err.message));

client.login(process.env.DISCORD_TOKEN);
