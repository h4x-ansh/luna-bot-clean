process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const { Client, GatewayIntentBits } = require("discord.js");
const { Shoukaku, Connectors } = require("shoukaku");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

const nodes = [
  {
    name: "main",
    url: "lavalink.darrennathanael.com:443",
    auth: "youshallnotpass",
    secure: true
  }
];

const shoukaku = new Shoukaku(
  new Connectors.DiscordJS(client),
  nodes
);

// READY
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// EVENTS
shoukaku.on("ready", (name) => {
  console.log("🔥 Lavalink connected:", name);
});

shoukaku.on("error", (name, error) => {
  console.log("❌ Lavalink error:", error.message);
});

// COMMAND
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!play")) return;

  const query = message.content.split(" ").slice(1).join(" ");
  const vc = message.member.voice.channel;

  if (!vc) return message.reply("Join VC");

  const node = shoukaku.getNode();

  const player = await node.joinChannel({
    guildId: message.guild.id,
    channelId: vc.id,
    shardId: message.guild.shardId
  });

  const res = await node.rest.resolve(`ytsearch:${query}`);

  if (!res.tracks.length) return message.reply("No results");

  const track = res.tracks[0];

  await player.playTrack({ track: track.encoded });

  message.reply(`🎵 Playing: ${track.info.title}`);
});

client.login(process.env.TOKEN);