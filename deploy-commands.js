require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
const foldersPath = path.join(__dirname, 'commands');

for (const folder of fs.readdirSync(foldersPath)) {
 const folderPath = path.join(foldersPath, folder);
 if (!fs.statSync(folderPath).isDirectory()) continue;
 for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith('.js'))) {
 const command = require(path.join(folderPath, file));
 if ('data' in command && 'execute' in command) {
 commands.push(command.data.toJSON());
 }
 }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
 try {
 console.log(`Deploying ${commands.length} command(s)...`);
 const data = await rest.put(
 Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
 { body: commands },
 );
 console.log(` Successfully deployed ${data.length} command(s).`);
 } catch (err) {
 console.error(' Deploy failed:', err);
 }
})();
