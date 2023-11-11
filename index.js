require("dotenv").config()

const { Client, Intents } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const googleTTS = require('google-tts-api');
const { Readable } = require("stream");
const axios = require("axios");

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS, 
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_VOICE_STATES],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

let connection = null; // Variable to store the voice connection
let voice = {
  provider: "tiktok"
};
let ttsEnabled = true;

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const args = message.content.slice(1).split(" ");
  const command = args.shift().trim();
  if (message.content.startsWith("*")) {
    if (command === 'join') {
      const voiceChannel = message.member.voice.channel;
      if (voiceChannel) {
        try {
          if (!connection) {
            connection = joinVoiceChannel({
              channelId: voiceChannel.id,
              guildId: voiceChannel.guild.id,
              adapterCreator: voiceChannel.guild.voiceAdapterCreator,
              selfDeaf: false
            });

            connection.on('error', (error) => {
              console.error('Voice connection error:', error);
              connection.destroy();
              connection = null;
            });

            const player = createAudioPlayer();
            player.on(AudioPlayerStatus.Idle, () => {
              connection.destroy();
              connection = null;
            });

            connection.subscribe(player);
          }

          message.reply('Joined the voice channel!');
        } catch (error) {
          console.error('Error joining voice channel:', error);
        }
      } else {
        message.reply('You need to be in a voice channel for me to join!');
      }
    } else if (command === "voice") {
      voice.provider = args[0];
      voice.voice = args[1];
      if (args.length === 1)
        message.reply(`Voice changed to ${voice.provider}!`)
      else
        message.reply(`Voice changed to ${voice.provider} ${voice.voice}!`)
    } else if (command === "start") {
      ttsEnabled = true;
      message.reply("Started tts!")
    } else if (command === "stop") {
      ttsEnabled = false;
      message.reply("Stopped tts!")
    } else if (command === "toggle") {
      ttsEnabled = !ttsEnabled;
      message.reply(`Toggled tts to ${ttsEnabled ? "on" : "off"}!`)
    } else if (command === 'leave') {
      if (connection) {
        connection.destroy();
        connection = null;
        message.reply('Left the voice channel!');
      } else {
        message.reply('I am not currently in a voice channel!');
      }
    }
  } else if (connection?.joinConfig?.channelId === message.member.voice.channelId && message.channelId === "863275827729530951") {
    // remove links
    // https://urlregex.com/
    const text = message.cleanContent.replace(/((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/, "");
    if (text) {
      try {
        const buffer = Buffer.concat(voice.provider === "gtts" ?
          (await googleTTS.getAllAudioBase64(text, {
            lang: "en",
          })).map((result) => Buffer.from(result.base64, "base64")) : await Promise.all(
            text.match(/.{1,300}/g)?.map(async (subtext) =>
              Buffer.from(
                (
                  await axios.post(
                    "https://tiktok-tts.weilnet.workers.dev/api/generation",
                    {
                      text: subtext,
                      voice: voice.voice ?? "en_us_001",
                    },
                  )
                ).data.data,
                "base64",
              ),
            ) ?? [],
          )
        );

        const resource = createAudioResource(Readable.from(buffer));

        const player = createAudioPlayer();
        player.play(resource);

        connection.subscribe(player);
      } catch (error) {
        console.error('Error playing audio:', error);
      }
    } else {
      message.reply('Please provide text for me to speak!');
    }
  }
});

client.on('voiceStateUpdate', (oldState, newState) => {
  // Check if the bot is connected to a voice channel
  if (connection && connection.joinConfig.channelId === oldState.channelId) {
    const channel = oldState.channel;
    if (channel) {
      const members = channel.members.filter((member) => !member.user.bot);
      if (members.size === 0) {
        // If all users have left the voice channel, destroy the connection
        connection.destroy();
        connection = null;
      }
    }
  }
});
client.login(process.env.TOKEN);
