process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
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
    url: "lavalink.devamop.in:443",
    auth: "devamop",
    secure: true
  }
];

const shoukaku = new Shoukaku(
  new Connectors.DiscordJS(client),
  nodes
);

// READY
client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// EVENTS
shoukaku.on("ready", (name) => {
  console.log("🔥 Lavalink connected:", name);
});

shoukaku.on("error", (name, error) => {
  console.log("❌ Lavalink error:", error.message);
});

shoukaku.on("disconnect", (name, reason) => {
  console.log("⚠️ Lavalink disconnected:", name, reason);
});

// COMMANDS
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!") || message.author.bot) return;

  const args = message.content.slice(1).split(" ");
  const cmd = args.shift().toLowerCase();

  if (cmd === "play") {
    const query = args.join(" ");
    if (!query) return message.reply("Give song name");

    const vc = message.member.voice.channel;
    if (!vc) return message.reply("Join VC first");

    const node = shoukaku.nodes.values().next().value;
    if (!node) return message.reply("❌ Lavalink not connected");

    const player = await node.joinChannel({
      guildId: message.guild.id,
      channelId: vc.id,
      shardId: message.guild.shardId
    });

    const res = await node.rest.resolve(`ytsearch:${query}`);

    if (res.loadType === "NO_MATCHES") {
      return message.reply("❌ No results");
    }

    if (res.loadType === "LOAD_FAILED") {
      return message.reply("❌ Failed to load track");
    }

    const track = res.tracks[0];

    await player.playTrack({ track: track.encoded });

    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("🎧 Now Playing")
      .setDescription(`**${track.info.title}**`)
      .addFields(
        { name: "Duration", value: formatTime(track.info.length), inline: true },
        { name: "Author", value: track.info.author, inline: true }
      )
      .setFooter({ text: "✨ Luna Mode Enabled" });

    message.channel.send({ embeds: [embed] });
  }

  if (cmd === "skip") {
    const player = shoukaku.players.get(message.guild.id);
    if (player) player.stop();
  }

  if (cmd === "pause") {
    const player = shoukaku.players.get(message.guild.id);
    if (player) {
      player.setPaused(true);
      message.reply("⏸ Paused");
    }
  }

  if (cmd === "resume") {
    const player = shoukaku.players.get(message.guild.id);
    if (player) {
      player.setPaused(false);
      message.reply("▶ Resumed");
    }
  }

  if (cmd === "stop") {
    const player = shoukaku.players.get(message.guild.id);
    if (player) {
      player.destroy();
      message.reply("⏹ Stopped");
    }
  }

  if (cmd === "volume") {
    const player = shoukaku.players.get(message.guild.id);
    if (!player) return;

    const vol = parseInt(args[0]);
    if (isNaN(vol) || vol < 0 || vol > 100) {
      return message.reply("Enter 0–100");
    }

    player.setVolume(vol / 100);
    message.reply(`🔊 Volume set to ${vol}%`);
  }

  if (cmd === "queue") {
    const player = shoukaku.players.get(message.guild.id);
    if (!player || player.queue.length === 0) {
      return message.reply("📭 Queue is empty");
    }

    const now = player.queue.current;
    const nextSongs = player.queue.slice(0, 5);

    const queueStr = nextSongs
      .map((t, i) => `**${i + 1}.** ${t.info.title} (${formatTime(t.info.length)})`)
      .join("\n");

    message.reply(`🎧 Queue:\n**Now:** ${now.info.title}\n\n${queueStr || "No upcoming songs"}`);
  }
});

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

client.login(process.env.TOKEN);