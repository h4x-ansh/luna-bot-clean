const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  entersState,
  VoiceConnectionStatus
} = require('@discordjs/voice');

const play = require('play-dl');
const yts = require('yt-search');
const youtubedl = require('youtube-dl-exec');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { getData } = require('spotify-url-info')(fetch);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

const queues = new Map();

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!') || message.author.bot) return;

  const args = message.content.slice(1).split(" ");
  const cmd = args.shift().toLowerCase();

  let q = queues.get(message.guild.id);

  if (cmd === "play") {
    let query = args.join(" ");
    if (!query) return message.reply("Give song name");

    const vc = message.member.voice.channel;
    if (!vc) return message.reply("Join VC first");

    if (!q) {
      const player = createAudioPlayer();

      const connection = joinVoiceChannel({
        channelId: vc.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 20000);
      connection.subscribe(player);

      q = { connection, player, songs: [], textChannel: message.channel, loop: "off", volume: 0.5 };
      queues.set(message.guild.id, q);

      player.on(AudioPlayerStatus.Idle, () => {
        setTimeout(() => {

          if (q.progressInterval) {
            clearInterval(q.progressInterval);
          }

          if (q.loop === "song") {
            // 🔁 repeat same song
            playSong(message.guild, q.songs[0]);
            return;
          }

          if (q.loop === "queue") {
            const finished = q.songs.shift();
            q.songs.push(finished); // move to end
            playSong(message.guild, q.songs[0]);
            return;
          }

          // normal mode
          q.songs.shift();

          // 🎯 PLAY NEXT IF EXISTS
          if (q.songs.length > 0) {
            playSong(message.guild, q.songs[0]);
          } 
          else {
            console.log("⏸ Queue ended");
            message.channel.send("⏸ Queue ended");
          }

        }, 1000);
      });

      player.on('error', e => {
        console.log("❌ Player error:", e.message);
      });
    }

    // 🎧 SPOTIFY HANDLING
    try {

      // 🎵 SINGLE TRACK
      if (query.includes("spotify.com/track")) {
        const data = await getData(query);
        query = `${data.name} ${data.artists.map(a => a.name).join(" ")}`;
      }

      // 📃 PLAYLIST
      if (query.includes("spotify.com/playlist")) {
        const data = await getData(query);

        message.reply(`📃 Adding ${data.tracks.length} songs...`);

        for (const track of data.tracks) {
          const name = `${track.name} ${track.artists.map(a => a.name).join(" ")}`;

          const search = await yts(name);

          if (!search.videos.length) continue;

          const video = search.videos[0];

          q.songs.push({
            title: video.title,
            url: `https://www.youtube.com/watch?v=${video.videoId}`
          });
        }

        if (q.songs.length > 0) {
          playSong(message.guild, q.songs[0]);
        }

        message.channel.send(`✅ Playlist added to queue`);
        return;
      }

    } catch (e) {
      console.log("Spotify error:", e.message);
    }

    // 🔍 SMART SEARCH
    const search = await yts(query);

    if (!search.videos.length) {
      return message.reply("❌ No results");
    }

    const results = search.videos.slice(0, 5);

    const list = results.map((v, i) => 
      `**${i + 1}.** ${v.title}`
    ).join("\n");

    await message.reply(`🎵 Choose a song:\n${list}\n\nType number (1-5)`);

    // WAIT FOR USER RESPONSE
    const filter = m => m.author.id === message.author.id;
    const collected = await message.channel.awaitMessages({
      filter,
      max: 1,
      time: 15000
    }).catch(() => {});

    if (!collected || !collected.first()) {
      return message.reply("❌ Timeout");
    }

    const choice = parseInt(collected.first().content);

    if (!choice || choice < 1 || choice > 5) {
      return message.reply("❌ Invalid choice");
    }

    const video = results[choice - 1];

    const song = {
      title: video.title,
      url: `https://www.youtube.com/watch?v=${video.videoId}`
    };

    console.log("DEBUG URL:", song.url);

    q.songs.push(song);

    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("🎧 Now Playing")
      .setDescription(`**${song.title}**`)
      .setThumbnail(`https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`)
      .addFields(
        { name: "Volume", value: `${Math.round(q.volume * 100)}%`, inline: true },
        { name: "Loop", value: q.loop, inline: true }
      )
      .setFooter({ text: "✨ Luna Mode Enabled" });

    const msg = await message.channel.send({ embeds: [embed] });

    // 🔥 STORE MESSAGE
    q.nowPlayingMsg = msg;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('skip')
        .setEmoji('⏭')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('pause')
        .setEmoji('⏸')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('resume')
        .setEmoji('▶')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('stop')
        .setEmoji('⏹')
        .setStyle(ButtonStyle.Danger)
    );

    message.channel.send({ components: [row] });

    if (q.songs.length === 1) {
      playSong(message.guild, song);
    }
  }

  if (cmd === "skip") {
    if (!q) return;
    q.player.stop();
  }

  if (cmd === "stop") {
    if (!q) return;
    q.connection.destroy();
    queues.delete(message.guild.id);
  }

  if (cmd === "queue") {
    if (!q || q.songs.length === 0) {
      return message.reply("📭 Queue is empty");
    }

    const now = q.songs[0];
    const nextSongs = q.songs.slice(1, 6); // show next 5

    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("🎧 Music Queue")
      .setDescription(`**Now Playing:**\n🎵 ${now.title}`)
      .setThumbnail(`https://img.youtube.com/vi/${q.songs[0].url.split("v=")[1]}/hqdefault.jpg`)
      .addFields({
        name: "Up Next",
        value: nextSongs.length
          ? nextSongs
              .map(
                (s, i) =>
                  `**${i + 1}.** ${
                    s.title.length > 50 ? s.title.slice(0, 50) + "..." : s.title
                  }`
              )
              .join("\n")
          : "No songs in queue"
      })
      .setFooter({ text: `Total songs: ${q.songs.length}` });

    message.reply({ embeds: [embed] });
  }

  if (cmd === "loop") {
    if (!q) return message.reply("No music playing");

    if (args[0] === "song") {
      q.loop = "song";
      return message.reply("🔁 Looping current song");
    }

    if (args[0] === "queue") {
      q.loop = "queue";
      return message.reply("🔂 Looping queue");
    }

    q.loop = "off";
    message.reply("➡️ Loop disabled");
  }

  if (cmd === "shuffle") {
    if (!q || q.songs.length < 2) {
      return message.reply("Not enough songs to shuffle");
    }

    for (let i = q.songs.length - 1; i > 1; i--) {
      const j = Math.floor(Math.random() * (i - 1)) + 1;
      [q.songs[i], q.songs[j]] = [q.songs[j], q.songs[i]];
    }

    message.reply("🔀 Queue shuffled");
  }

  if (cmd === "volume") {
    if (!q) return;

    const vol = parseInt(args[0]);
    if (isNaN(vol) || vol < 0 || vol > 100) {
      return message.reply("Enter 0–100");
    }

    q.volume = vol / 100;

    if (q.player.state.resource?.volume) {
      q.player.state.resource.volume.setVolume(q.volume);
    }

    message.reply(`🔊 Volume set to ${vol}%`);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const q = queues.get(interaction.guild.id);
  if (!q) return;

  if (interaction.customId === 'pause') {
    q.player.pause();
    interaction.reply({ content: "⏸ Paused", ephemeral: true });
  }

  if (interaction.customId === 'resume') {
    q.player.unpause();
    interaction.reply({ content: "▶ Resumed", ephemeral: true });
  }

  if (interaction.customId === 'skip') {
    q.player.stop();
    interaction.reply({ content: "⏭ Skipped", ephemeral: true });
  }

  if (interaction.customId === 'stop') {
    q.connection.destroy();
    queues.delete(interaction.guild.id);
    interaction.reply({ content: "⏹ Stopped", ephemeral: true });
  }
});

function createProgressBar(current, total) {
  const size = 15;
  const progress = Math.round((current / total) * size);
  const empty = size - progress;

  return "━".repeat(progress) + "●" + "━".repeat(empty);
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function playSong(guild, song) {
  const q = queues.get(guild.id);
  if (!q || !song) return;

  try {
    console.log("▶️ Playing:", song.url);

    const stream = youtubedl.exec(song.url, {
      o: '-',
      q: '',
      f: 'bestaudio',
      r: '100K'
    });

    const resource = createAudioResource(stream.stdout, {
      inlineVolume: true
    });

    if (resource.volume) {
      resource.volume.setVolume(q.volume || 0.5);
    }

    q.player.play(resource);

    q.player.removeAllListeners(AudioPlayerStatus.Idle);

    q.player.once(AudioPlayerStatus.Idle, () => {
      q.songs.shift();

      if (q.songs.length > 0) {
        playSong(guild, q.songs[0]);
      } else {
        console.log("⏸ Queue ended");
      }
    });

  } catch (err) {
    console.log("❌ STREAM ERROR:", err.message);

    q.songs.shift();
    if (q.songs.length > 0) {
      playSong(guild, q.songs[0]);
    }
  }
}

client.login(process.env.TOKEN);