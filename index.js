const { Client, GatewayIntentBits } = require("discord.js");
const { Manager } = require("erela.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

const manager = new Manager({
  nodes: [
    {
      host: "lavalink-4-production-61d6.up.railway.app",
      port: 443,
      password: "youshallnotpass",
      secure: true
    }
  ],
  send(id, payload) {
    const guild = client.guilds.cache.get(id);
    if (guild) guild.shard.send(payload);
  }
});

// READY
client.on("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  manager.init(client.user.id);
});

// EVENTS
manager.on("nodeConnect", () => {
  console.log("🔥 Lavalink connected");
});

manager.on("trackStart", (player, track) => {
  const channel = client.channels.cache.get(player.textChannel);
  if (channel) channel.send(`🎵 Now playing: ${track.title}`);
});

manager.on("queueEnd", (player) => {
  const channel = client.channels.cache.get(player.textChannel);
  if (channel) channel.send("⏸ Queue ended");
  player.destroy();
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

    const player = manager.create({
      guild: message.guild.id,
      voiceChannel: vc.id,
      textChannel: message.channel.id,
      selfDeafen: true
    });

    await player.connect();

    const res = await manager.search(query, message.author);

    if (res.loadType === "NO_MATCHES") {
      return message.reply("❌ No results");
    }

    const track = res.tracks[0];
    player.queue.add(track);

    message.reply(`🎵 Added: ${track.title}`);

    if (!player.playing && !player.paused) {
      player.play();
    }
  }

  if (cmd === "skip") {
    const player = manager.players.get(message.guild.id);
    if (player) player.stop();
  }

  if (cmd === "stop") {
    const player = manager.players.get(message.guild.id);
    if (player) {
      player.destroy();
      message.reply("⏹ Stopped");
    }
  }

  if (cmd === "queue") {
    const player = manager.players.get(message.guild.id);
    if (!player || player.queue.length === 0) {
      return message.reply("📭 Queue is empty");
    }

    const now = player.queue.current;
    const nextSongs = player.queue.slice(0, 5);

    const queueStr = nextSongs
      .map((t, i) => `**${i + 1}.** ${t.title} (${formatTime(t.duration)})`)
      .join("\n");

    message.reply(`🎧 Queue:\n**Now:** ${now.title}\n\n${queueStr || "No upcoming songs"}`);
  }

  if (cmd === "pause") {
    const player = manager.players.get(message.guild.id);
    if (player) {
      player.pause(true);
      message.reply("⏸ Paused");
    }
  }

  if (cmd === "resume") {
    const player = manager.players.get(message.guild.id);
    if (player) {
      player.pause(false);
      message.reply("▶ Resumed");
    }
  }

  if (cmd === "volume") {
    const player = manager.players.get(message.guild.id);
    if (!player) return;

    const vol = parseInt(args[0]);
    if (isNaN(vol) || vol < 0 || vol > 100) {
      return message.reply("Enter 0–100");
    }

    player.setVolume(vol);
    message.reply(`🔊 Volume set to ${vol}%`);
  }
});

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

client.login(process.env.TOKEN);