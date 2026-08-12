module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Registered commands on boot: ${client.commands.size} (deploy once via "npm run deploy")`);
  },
};