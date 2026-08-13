require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../src/config');

if (!config.token || !config.clientId) {
  console.error('DISCORD_TOKEN and CLIENT_ID are required in .env');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, '..', 'src', 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command) commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    console.log(`Registered ${commands.length} slash commands globally`);
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
})();