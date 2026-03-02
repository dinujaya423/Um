const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const yts = require('yt-search');
const fetch = require('node-fetch');
const os = require('os'); // Added for 'system' case
const ddownr = require('denethdev-ytmp3'); // Added for 'song' case
const apikey = `edbcfabbca5a9750`;
const { initUserEnvIfMissing } = require('./settingsdb');
const { initEnvsettings, getSetting } = require('./settings');

//=======================================
const autoReact = getSetting('AUTO_REACT') || 'on';

//=======================================
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    proto,
    prepareWAMessageMedia,
    generateWAMessageFromContent
} = require('@whiskeysockets/baileys');
//=======================================
const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['🧩', '🍉', '💜', '🌸', '🪴', '💊', '💫', '🍂', '🌟', '🎋', '😶‍🌫️', '🫀', '🧿', '👀', '🤖', '🚩', '🥰', '🗿', '💜', '💙', '🌝', '🖤', '💚'],
    PREFIX: '.',
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/IZ5klCZ038yEx4aoy6Be2y?mode=wwt',
    ADMIN_LIST_PATH: './admin.json',
    NEWSLETTER_JID: '120363420625741800@newsletter',
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 300000,
    NEWS_JSON_URL: '',
    BOT_NAME: '✨° 𝐃ɪɴᴜ x ʟɪᴛ𝐄 ° ✨',
    OWNER_NAME: '𝖣𝖨𝖭𝖴',
    OWNER_NUMBER: '94740026280',
    BOT_VERSION: '0.0.0',
    BOT_FOOTER: '> © ✗ 𝖣𝖨𝖭𝖴 𝖷 𝖫𝖨𝖳𝖤 ✘',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbC4HpZ72WU5MPmV9C45',
    BUTTON_IMAGES: {
        ALIVE: 'https://files.catbox.moe/7ylytw.jpg',
        MENU: 'https://files.catbox.moe/7ylytw.jpg',
		IMAGE_PATH: 'https://files.catbox.moe/7ylytw.jpg',
        OWNER: 'https://files.catbox.moe/7ylytw.jpg',
        SONG: 'https://files.catbox.moe/7ylytw.jpg',
        VIDEO: 'https://files.catbox.moe/7ylytw.jpg'
    }
};

// MongoDB Setup
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

const mongoUri = 'mongodb+srv://notihi3850_db_user:kyGBQYbk0N3wqOyR@cluster0.kp2erxt.mongodb.net/';
const client = new MongoClient(mongoUri);
let db;

async function initMongo() {
    if (!db) {
        await client.connect();
        db = client.db('niyogo2524_db_user');
        // Create index for faster queries
        await db.collection('sessions').createIndex({ number: 1 });
    }
    return db;
}


async function loadUserConfigFromMongoDB(number) {
    try {
        const db = await initMongo();
        const collection = db.collection('user_configs');
        const doc = await collection.findOne({ number });
        return doc ? doc.config : null;
    } catch (error) {
        console.error('Failed to load user config from MongoDB:', error);
        return null;
    }
}

async function saveUserConfigToMongoDB(number, userConfig) {
    try {
        const db = await initMongo();
        const collection = db.collection('user_configs');
        await collection.updateOne(
            { number },
            { $set: { config: userConfig } },
            { upsert: true }
        );
    } catch (error) {
        console.error('Failed to save user config to MongoDB:', error);
    }
}


// List Message Generator
function generateListMessage(text, buttonTitle, sections) {
    return {
        text: text,
        footer: config.BOT_FOOTER,
        title: buttonTitle,
        buttonText: "Select",
        sections: sections
    };
}
//=======================================
function generateButtonMessage(content, buttons, image = null) {
    const message = {
        text: content,
        footer: config.BOT_FOOTER,
        buttons: buttons,
        headerType: 1
    };
    if (image) {
        message.headerType = 4;
        message.image = typeof image === 'string' ? { url: image } : image;
    }
    return message;
}
//=======================================
const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}
//=======================================
function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Failed to load admin list:', error);
        return [];
    }
}
function formatMessage(title, content, footer) {
    return `${title}\n\n${content}\n\n${footer}`;
}
function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}
// Utility function for runtime formatting (used in 'system' case)
function runtime(seconds) {
    seconds = Number(seconds);
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const dDisplay = d > 0 ? d + (d === 1 ? " day, " : " days, ") : "";
    const hDisplay = h > 0 ? h + (h === 1 ? " hour, " : " hours, ") : "";
    const mDisplay = m > 0 ? m + (m === 1 ? " minute, " : " minutes, ") : "";
    const sDisplay = s > 0 ? s + (s === 1 ? " second" : " seconds") : "";
    return dDisplay + hDisplay + mDisplay + sDisplay;
}
//=======================================
async function joinGroup(socket) {
    let retries = config.MAX_RETRIES;
    const inviteCodeMatch = config.GROUP_INVITE_LINK.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
    if (!inviteCodeMatch) {
        console.error('Invalid group invite link format');
        return { status: 'failed', error: 'Invalid group invite link' };
    }
    const inviteCode = inviteCodeMatch[1];

    while (retries > 0) {
        try {
            const response = await socket.groupAcceptInvite(inviteCode);
            if (response?.gid) {
                console.log(`Successfully joined group with ID: ${response.gid}`);
                return { status: 'success', gid: response.gid };
            }
            throw new Error('No group ID in response');
        } catch (error) {
            retries--;
            let errorMessage = error.message || 'Unknown error';
            if (error.message.includes('not-authorized')) {
                errorMessage = 'Bot is not authorized to join (possibly banned)';
            } else if (error.message.includes('conflict')) {
                errorMessage = 'Bot is already a member of the group';
            } else if (error.message.includes('gone')) {
                errorMessage = 'Group invite link is invalid or expired';
            }
            console.warn(`Failed to join group, retries left: ${retries}`, errorMessage);
            if (retries === 0) {
                return { status: 'failed', error: errorMessage };
            }
            await delay(2000 * (config.MAX_RETRIES - retries));
        }
    }
    return { status: 'failed', error: 'Max retries reached' };
}
//=======================================
async function sendAdminConnectMessage(socket, number, groupResult) {
    const admins = loadAdmins();
    const groupStatus = groupResult.status === 'success'
        ? `Joined (ID: ${groupResult.gid})`
        : `Failed to join group: ${groupResult.error}`;
    const caption = formatMessage(
        '*Connected Successful ✅*',
        ` ❗Number: ${number}\n 🧚‍♂️ Status: Online`,
        `${config.BOT_FOOTER}`
    );

    for (const admin of admins) {
        try {
            await socket.sendMessage(
                `${admin}@s.whatsapp.net`,
                {
                    image: { url: config.IMAGE_PATH },
                    caption
                }
            );
        } catch (error) {
            console.error(`Failed to send connect message to admin ${admin}:`, error);
        }
    }
}
//=======================================
function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== config.NEWSLETTER_JID) return;

        try {
            const emojis = ['❤️'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.newsletterServerId;

            if (!messageId) {
                console.warn('No valid newsletterServerId found:', message);
                return;
            }

            let retries = config.MAX_RETRIES;
            while (retries > 0) {
                try {
                    await socket.newsletterReactMessage(
                        config.NEWSLETTER_JID,
                        messageId.toString(),
                        randomEmoji
                    );
                    console.log(`Reacted to newsletter message ${messageId} with ${randomEmoji}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`Failed to react to newsletter message ${messageId}, retries left: ${retries}`, error.message);
                    if (retries === 0) throw error;
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
        } catch (error) {
            console.error('Newsletter reaction error:', error);
        }
    });
}
async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    let kiyomasa = await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
    return kiyomasa;
}

function capital(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const createSerial = (size) => {
    return crypto.randomBytes(size).toString('hex').slice(0, size);
}

const myquoted = {
    key: {
        remoteJid: 'status@broadcast',
        participant: '13135550002@s.whatsapp.net',
        fromMe: false,
        id: createSerial(16).toUpperCase()
    },
    message: {
        contactMessage: {
            displayName: "DINU X",
            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:LITE\nORG:PRO;\nTEL;type=CELL;type=VOICE;waid=13135550002:13135550002\nEND:VCARD`,
            contextInfo: {
                stanzaId: createSerial(16).toUpperCase(),
                participant: "0@s.whatsapp.net",
                quotedMessage: {
                    conversation: "DINU X LITE"
                }
            }
        }
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    status: 1,
    verifiedBizName: "Meta"
};
//=======================================
async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

        try {
            if (config.AUTO_RECORDING === 'true' && message.key.remoteJid) {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }

            if (config.AUTO_VIEW_STATUS === 'true') {
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.readMessages([message.key]);
                        console.log('👁️ Auto-viewed status');
                        break;
                    } catch (error) {
                        retries--;
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }

            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { react: { text: randomEmoji, key: message.key } },
                            { statusJidList: [message.key.participant] }
                        );
                        console.log(`Reacted to status with ${randomEmoji}`);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to react to status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }
        } catch (error) {
            console.error('Status handler error:', error);
        }
    });
}
//=======================================
async function handleMessageRevocation(socket, number) {
    socket.ev.on('messages.delete', async ({ keys }) => {
        if (!keys || keys.length === 0) return;

        const messageKey = keys[0];
        const userJid = jidNormalizedUser(socket.user.id);
        const deletionTime = getSriLankaTimestamp();
        
        const message = formatMessage(
            '╭──◯',
            `│ \`D E L E T E\`\n│ *⦁ From :* ${messageKey.remoteJid}\n│ *⦁ Time:* ${deletionTime}\n│ *⦁ Type: Normal*\n╰──◯`,
            `${config.BOT_FOOTER}`
        );

        try {
            await socket.sendMessage(userJid, {
                image: { url: config.IMAGE_PATH },
                caption: message
            });
            console.log(`Notified ${number} about message deletion: ${messageKey.id}`);
        } catch (error) {
            console.error('Failed to send deletion notification:', error);
        }
    });
}

// Image resizing function

const totalRAM = Math.round(require('os').totalmem() / 1024 / 1024); 
        const usedRAM = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2); 
        const freeRAM = (totalRAM - parseFloat(usedRAM)).toFixed(2); 
// Get current date & time
const now = new Date();

// Sri Lanka is GMT+5:30 => offset in milliseconds
const offsetMs = 5.5 * 60 * 60 * 1000;
const sriLankaTime = new Date(now.getTime() + offsetMs);

// Parts
const year = sriLankaTime.getFullYear();
const month = String(sriLankaTime.getMonth() + 1).padStart(2, '0');
const day = String(sriLankaTime.getDate()).padStart(2, '0');
const hours = String(sriLankaTime.getHours()).padStart(2, '0');
const minutes = String(sriLankaTime.getMinutes()).padStart(2, '0');
const seconds = String(sriLankaTime.getSeconds()).padStart(2, '0');

// Formatted
const dateString = `${year}-${month}-${day}`;
const timeString = `${hours}:${minutes}:${seconds}`;
const dateTimeString = `${dateString} ${timeString}`;




function getGreeting() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const slTime = new Date(utc + (5.5 * 60 * 60 * 1000)); // GMT+5:30

    const hour = slTime.getHours();

    if (hour >= 5 && hour < 12) {
        return "𝘎𝘰𝘰𝘥 𝘔𝘰𝘳𝘯𝘪𝘯𝘨 ⛅";
    } else if (hour >= 12 && hour < 17) {
        return "𝘎𝘰𝘰𝘥 𝘈𝘧𝘵𝘦𝘳𝘯𝘰𝘰𝘯 🌤️";
    } else if (hour >= 17 && hour < 21) {
        return "𝘎𝘰𝘰𝘥 𝘌𝘷𝘦𝘯𝘪𝘯𝘨 🌥️";
    } else {
        return "𝘎𝘰𝘰𝘥 𝘕𝘪𝘨𝘩𝘵  🌙";
    }
}
// Send slide with news items
async function SendSlide(socket, jid, newsItems) {
    let anu = [];
    for (let item of newsItems) {
        let imgBuffer;
        try {
            imgBuffer = await resize(item.thumbnail, 300, 200);
        } catch (error) {
            console.error(`Failed to resize image for ${item.title}:`, error);
            imgBuffer = await Jimp.read('https://files.catbox.moe/qjae7t.jpg');
            imgBuffer = await imgBuffer.resize(300, 200).getBufferAsync(Jimp.MIME_JPEG);
        }
        let imgsc = await prepareWAMessageMedia({ image: imgBuffer }, { upload: socket.waUploadToServer });
        anu.push({
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: `*${capital(item.title)}*\n\n${item.body}`
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                hasMediaAttachment: true,
                ...imgsc
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: [
                    {
                        name: "cta_url",
                        buttonParamsJson: `{"display_text":"𝐃𝙴𝙿𝙻𝙾𝚈","url":"https:/","merchant_url":"https://www.google.com"}`
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: `{"display_text":"𝐂𝙾𝙽𝚃𝙰𝙲𝚃","url":"https","merchant_url":"https://www.google.com"}`
                    }
                ]
            })
        });
    }
    const msgii = await generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.fromObject({
                        text: "*Latest News Updates*"
                    }),
                    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                        cards: anu
                    })
                })
            }
        }
    }, { userJid: jid });
    return socket.relayMessage(jid, msgii.message, {
        messageId: msgii.key.id
    });
}

// Fetch news from API
async function fetchNews() {
    try {
        const response = await axios.get(config.NEWS_JSON_URL);
        return response.data || [];
    } catch (error) {
        console.error('Failed to fetch news from raw JSON URL:', error.message);
        return [];
    }
}

// Setup command handlers with buttons and images
function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        let command = null;
        let args = [];
        let sender = msg.key.remoteJid;

        if (msg.message.conversation || msg.message.extendedTextMessage?.text) {
            const text = (msg.message.conversation || msg.message.extendedTextMessage.text || '').trim();
            if (text.startsWith(config.PREFIX)) {
                const parts = text.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }
        else if (msg.message.buttonsResponseMessage) {
            const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            if (buttonId && buttonId.startsWith(config.PREFIX)) {
                const parts = buttonId.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }

        if (!command) return;

        try {
            switch (command) {
                  case 'alive': {
                    const startTime = socketCreationTime.get(number) || Date.now();
                    const uptime = Math.floor((Date.now() - startTime) / 1000);
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);

                    const title = '*╭╌━━━━╌◯*';
                    const content = `┆⭔ \`✘ 𝖣𝖨𝖭𝖴 𝖷 𝖫𝖨𝖳𝖤 ✘\`\n` +                                   `┆⭔ *𝐁ᴏᴛ 𝐎ᴡɴᴇʀ :- 𝙳𝙸𝙽𝚄𝚇*\n` +
                                   `*╰╌━━╌╌━━╌◯*\n` +
                                   `> 𝙳𝙸𝙽𝚄𝚇 𝚇 𝙻𝙸𝚃𝙴 𝙿𝚁𝙾`;
                    const footer = config.BOT_FOOTER;

                    await socket.sendMessage(sender, {
                        image: { url: config.BUTTON_IMAGES.ALIVE },
                        caption: formatMessage(title, content, footer),
                        buttons: [
                            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: 'MENU 🧧' }, type: 1 },
                            { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: 'PING ❗' }, type: 1 }
                        ],
                        quoted: msg
                    });
                    break;   
                 }
                 
case 'menu': {
                    const startTime = socketCreationTime.get(number) || Date.now();
                    const uptime = Math.floor((Date.now() - startTime) / 1000);
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);

                    const title = '*╭━━━━━┈⊷*\n*│* •⭓ `✘ 𝖣𝖨𝖭𝖴 𝖷 𝖫𝖨𝖳𝖤 ✘`\n*│* •⭔ `𝐎ᴡɴ - 𝐂ʀʏᴢᴢ`\n*╰━━━━━━━━━┈⊷*';
                    const content = `\n` +
                                   `*╭━━━━━━◯*\n` +
                                   `*┆* ⭓ \`${getGreeting()}\`\n` +
                                   `*┆* ⭔ *𝐓ʜᴇ ʙᴇꜱᴛ ᴡᴘ*\n` +
                                   `*┆* ⭔ *𝐌ɪɴɪ ʙᴏᴛ*\n` +
                                   `*╰╌╌╌╌━━━◯*`;
                    const footer = config.BOT_FOOTER;

                    await socket.sendMessage(sender, {
                        image: { url: config.BUTTON_IMAGES.MENU }, // Changed to MENU image
                        caption: formatMessage(title, content, footer),
                        buttons: [
                            { buttonId: `${config.PREFIX}amenu`, buttonText: { displayText: '✗ 𝐌ᴀɪɴ ᴍᴇɴᴜ' }, type: 1 },
                            { buttonId: `${config.PREFIX}1menu`, buttonText: { displayText: '✗ 𝐃ᴏᴡɴᴅʟᴅ ᴍᴇɴᴜ' }, type: 1 },
                            { buttonId: `${config.PREFIX}2menu`, buttonText: { displayText: '✗ 𝐓ᴏᴏʟꜱ ᴍᴇɴᴜ' }, type: 1 }     
                        ],
                        quoted: msg
                    });
                    break;
}
                case 'amenu': {
                    const startTime = socketCreationTime.get(number) || Date.now();
                    const uptime = Math.floor((Date.now() - startTime) / 1000);
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);

                    await socket.sendMessage(sender, { 
                        react: { 
                            text: "⬇️",
                            key: msg.key 
                        } 
                    });

                    const kariyane = `*┏━*  \`✨°𝐃ɪɴᴜ x ʟɪᴛ𝐄°✨\`
*┃* *⭔* ❛ ${getGreeting()} ❗
*┃* *⭔ ᴘʟᴀᴛꜰʀᴏᴍ - ʜᴇʀᴏᴋᴜ*
*┃* *⭔ ᴜᴘᴛɪᴍᴇ:* ${hours}h ${minutes}m ${seconds}s
*┗━❐*
*╭─╾═❮ ᴍᴀɪɴ ᴄᴍᴅꜱ ❯═╾━─┓*
*┢━━━━━━━━━━━━━━━━▸┚*
*│* 🟢  \`𝐀𝐋𝐈𝐕𝐄\`
*┣┫ʙᴏᴛ ᴏɴʟɪɴᴇ ᴄʜᴇᴄᴋ*
*│* 📶  \`𝐏𝐈𝐍𝐆\`
*┣┫ꜱᴘᴇᴇᴅ ᴛᴇꜱᴛ*
*│* ⚙️  \`𝐒𝐘𝐒𝐓𝐄𝐌\`
*┣┫ʙᴏᴛ ꜱʏꜱᴛᴇᴍ ɪɴꜰᴏ*
*│* 👑  \`𝐎𝐖𝐍𝐄𝐑\`
*┣┫ꜱʜᴏᴡ ʙᴏᴛ ᴏᴡɴᴇʀꜱ*
*│* 👤  \`𝐏𝐀𝐈𝐑\`
*┣┫ꜰʀᴇᴇ ʙᴏᴛ*
*│* 🪄  \`𝐉𝐈𝐃\`
*┣┫ᴄʜᴀɴʟ - ɢᴘ - ᴄʜᴛ ᴊɪᴅ*
*┢━━━━━━━━━━━━━━━━━┓*
*┣⭔ ᴅɪɴᴜ x ʟɪᴛᴇ ᴍɪɴɪ ʙᴏᴛ❗*
*╰━━━━━━━━━━━━━━━━━┚*`;

                    const sentMsg = await socket.sendMessage(sender, {
                        image: { url: "https://files.catbox.moe/7ylytw.jpg"},
                        caption: kariyane,
                        contextInfo: {
                            mentionedJid: ['94740026280@s.whatsapp.net'],
                            groupMentions: [],
                            forwardingScore: 999,
                            isForwarded: false,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363421074745522@newsletter',
                                newsletterName: "✨° 𝐃ɪɴᴜ x ʟɪᴛ𝐄 ° ✨",
                                serverMessageId: 999
                            },
                            externalAdReply: {
                                title: 'ᴍᴜʟᴛɪ ᴅᴇᴠɪᴄᴇ ᴍɪɴɪ ᴡʜᴀᴛꜱᴀᴘᴘ ʙᴏᴛ',
                                body: '𝐃𝐈𝐍𝐔-𝐗-𝐋𝐈𝐓𝐄',
                                mediaType: 1,
                                sourceUrl: "ᴅɪɴᴜᴡᴀ x ᴅɪɴᴜᴊᴀʏᴀ",
                                thumbnailUrl: 'https://files.catbox.moe/24tuca.jpg',
                                renderLargerThumbnail: false,
                                showAdAttribution: false
                            }
                        }
                    });
                    break;
                }
                case '1menu': {
                    const startTime = socketCreationTime.get(number) || Date.now();
                    const uptime = Math.floor((Date.now() - startTime) / 1000);
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);

                    await socket.sendMessage(sender, { 
                        react: { 
                            text: "⬇️",
                            key: msg.key 
                        } 
                    });

                    const kariyane = `*┏━*  \`✨°𝐃ɪɴᴜ x ʟɪᴛ𝐄°✨\`
*┃* *⭔* ❛ ${getGreeting()} ❗
*┃* *⭔ ᴘʟᴀᴛꜰʀᴏᴍ - ʜᴇʀᴏᴋᴜ*
*┃* *⭔ ᴜᴘᴛɪᴍᴇ:* ${hours}h ${minutes}m ${seconds}s
*┗━❐*
*╭╾═❮ 📥 ᴅᴏᴡɴʟᴏᴀᴅ ᴄᴍᴅꜱ ❯═━─┓*
*┢━━━━━━━━━━━━━━━━╾*
*│* 🎵  \`𝐒𝐎𝐍𝐆\`
*┣┫ᴅᴏᴡɴʟᴏᴀᴅ ᴀɴʏ ᴍᴜꜱɪᴄ*
*│* 🎵  \`𝐂𝐒𝐎𝐍𝐆\`
*┣┫ꜱᴇɴᴅ ᴄʜᴀɴʟ ᴍᴜꜱɪᴄ*
*│* 🎬  \`𝐓𝐈𝐊𝐓𝐎𝐊\`
*┣┫ᴅᴏᴡɴʟᴏᴀᴅ ᴛɪᴋᴛᴏᴋ ᴠɪᴅᴇᴏ*
*│* 🔍  \`𝐓𝐈𝐊𝐓𝐎𝐊𝐒𝐄𝐀𝐑𝐂𝐇\`
*┣┫ꜰɪɴᴅ & ᴅᴏᴡɴʟᴏᴀᴅ ᴛɪᴋᴛᴏᴋꜱ*
*│* 📘  \`𝐅𝐁\`
*┣┫ᴅᴏᴡɴʟᴏᴀᴅ ꜰᴀᴄᴇʙᴏᴏᴋ ᴠɪᴅᴇᴏ*
*│* 🔊  \`𝐑𝐈𝐍𝐆𝐓𝐎𝐍𝐄\`
*┣┫ᴅᴏᴡɴʟᴏᴀᴅ ᴄᴜꜱᴛᴏᴍ ʀɪɴɢᴛᴏɴᴇꜱ*
*│* 📦  \`𝐀𝐏𝐊\`
*┣┫ᴅᴏᴡɴʟᴏᴀᴅ ᴀɴʏ ᴀɴᴅʀᴏɪᴅ ᴀᴘᴘꜱ*
*│* 🔞  \`𝐗𝐕𝐈𝐃𝐄𝐎\`
*┣┫ᴅᴏᴡɴʟᴏᴀᴅ 18 ᴠɪᴅᴇᴏꜱ*
*┢━━━━━━━━━━━━━━━━━┓*
*┣⭔ ᴅɪɴᴜ x ʟɪᴛᴇ ᴍɪɴɪ ʙᴏᴛ❗*
*╰━━━━━━━━━━━━━━━━━┚*`;

                    const sentMsg = await socket.sendMessage(sender, {
                        image: { url: "https://files.catbox.moe/7ylytw.jpg"},
                        caption: kariyane,
                        contextInfo: {
                            mentionedJid: ['94740026280@s.whatsapp.net'],
                            groupMentions: [],
                            forwardingScore: 999,
                            isForwarded: false,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363421074745522@newsletter',
                                newsletterName: "✨° 𝐃ɪɴᴜ x ʟɪᴛ𝐄 ° ✨",
                                serverMessageId: 999
                            },
                            externalAdReply: {
                                title: 'ᴍᴜʟᴛɪ ᴅᴇᴠɪᴄᴇ ᴍɪɴɪ ᴡʜᴀᴛꜱᴀᴘᴘ ʙᴏᴛ',
                                body: '𝐃𝐈𝐍𝐔-𝐗-𝐋𝐈𝐓𝐄',
                                mediaType: 1,
                                sourceUrl: "ᴅɪɴᴜᴡᴀ x ᴅɪɴᴜᴊᴀʏᴀ",
                                thumbnailUrl: 'https://files.catbox.moe/24tuca.jpg',
                                renderLargerThumbnail: false,
                                showAdAttribution: false
                            }
                        }
                    });
                    break;
                    }
                case '2menu': {
                    const startTime = socketCreationTime.get(number) || Date.now();
                    const uptime = Math.floor((Date.now() - startTime) / 1000);
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);

                    await socket.sendMessage(sender, { 
                        react: { 
                            text: "⬇️",
                            key: msg.key 
                        } 
                    });

                    const kariyane = `*┏━*  \`✨°𝐃ɪɴᴜ x ʟɪᴛ𝐄°✨\`
*┃* *⭔* ❛ ${getGreeting()} ❗
*┃* *⭔ ᴘʟᴀᴛꜰʀᴏᴍ - ʜᴇʀᴏᴋᴜ*
*┃* *⭔ ᴜᴘᴛɪᴍᴇ:* ${hours}h ${minutes}m
*┗━❐*
*╭╾═❮ 🛠️ ᴛᴏᴏʟꜱ ᴄᴍᴅꜱ ❯═━─┓*
*┢━━━━━━━━━━━━━━━━╾*
*│* 📨  \`𝐓𝐄𝐌𝐏𝐌𝐀𝐈𝐋\`
*┣┫ɢᴇᴛ ᴀ ᴛᴇᴍᴘᴏʀᴀʀʏ ᴇᴍᴀɪʟ*
*│* 🧧  \`𝐓𝐓𝐒\`
*┣┫ᴀɪ ᴠᴏɪᴄᴇ ɢᴀɴ*
*│* 🎵  \`𝐋𝐘𝐑𝐈𝐂𝐒𝐆𝐄𝐍\`
*┣┫ꜱᴏɴɢ ʟᴜʀɪᴄꜱɢᴇɴ*
*│* 🖼️  \`𝐑𝐀𝐍𝐃𝐎𝐌𝐖𝐀𝐋𝐋\`
*┣┫ꜱᴇɴᴅ ʀᴀɴᴅᴏᴍ ᴡᴀʟʟᴘᴀᴘᴇʀꜱ*
*│* 📦  \`𝐍𝐏𝐌\`
*┣┫ꜱᴇᴀʀᴄʜ ɴᴘᴍ ᴘᴀᴄᴋᴀɢᴇꜱ*
*│* 📁  \`𝐒𝐑𝐄𝐏𝐎\`
*┣┫ꜱᴇᴀʀᴄʜ ɢɪᴛʜᴜʙ ʀᴇᴘᴏꜱ*
*│* 🤖  \`𝐀𝐈\`
*┣┫ᴀꜱᴋ ᴀɪ ᴀɴʏ Qᴜᴇꜱᴛɪᴏɴ*
*│* 🆔  \`𝐂𝐈𝐃\`
*┣┫ꜰɪɴᴅ ᴄᴏᴍᴍᴀɴᴅ ɪᴅ*
*│* 🔎  \`𝐆𝐎𝐎𝐆𝐋𝐄\`
*┣┫ꜱᴇᴀʀᴄʜ ɢᴏᴏɢʟᴇ ꜰᴀꜱᴛ*
*│* 🔗  \`𝐖𝐀𝐌𝐄\`
*┣┫ɢᴇɴᴇʀᴀᴛᴇ ᴡʜᴀᴛꜱᴀᴘᴘ ʟɪɴᴋ*
*│* 👤  \`𝐆𝐄𝐓𝐃𝐏\`
*┣┫ᴅᴏᴡɴʟᴏᴀᴅ ᴜꜱᴇʀ ᴘʀᴏꜰɪʟᴇ*
*│* 💥  \`𝐁𝐎𝐎𝐌\`
*┣┫ᴍᴀꜱꜱ ᴍᴇꜱꜱᴀɢᴇ ꜱᴘᴀᴍᴍᴇʀ*
*│* 💥  \`𝐉𝐈𝐃\`
*┣┫ɢʀᴏᴜᴘ - ᴄʜɴʟ ᴊɪᴅ*
*┢━━━━━━━━━━━━━━━━━┓*
*┣⭔ ᴅɪɴᴜ x ʟɪᴛᴇ ᴍɪɴɪ ʙᴏᴛ❗*
*╰━━━━━━━━━━━━━━━━━┚*`;

                    const sentMsg = await socket.sendMessage(sender, {
                        image: { url: "https://files.catbox.moe/7ylytw.jpg"},
                        caption: kariyane,
                        contextInfo: {
                            mentionedJid: ['94740026280@s.whatsapp.net'],
                            groupMentions: [],
                            forwardingScore: 999,
                            isForwarded: false,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363421074745522@newsletter',
                                newsletterName: "✨° 𝐃ɪɴᴜ x ʟɪᴛ𝐄 ° ✨",
                                serverMessageId: 999
                            },
                            externalAdReply: {
                                title: 'ᴍᴜʟᴛɪ ᴅᴇᴠɪᴄᴇ ᴍɪɴɪ ᴡʜᴀᴛꜱᴀᴘᴘ ʙᴏᴛ',
                                body: '𝐃𝐈𝐍𝐔-𝐗-𝐋𝐈𝐓𝐄',
                                mediaType: 1,
                                sourceUrl: "ᴅɪɴᴜᴡᴀ x ᴅɪɴᴜᴊᴀʏᴀ",
                                thumbnailUrl: 'https://files.catbox.moe/24tuca.jpg',
                                renderLargerThumbnail: false,
                                showAdAttribution: false
                            }
                        }
                    });
                    break;
                    }
case 'song': {
    try {
        // 🧠 Check if user entered a song name or link
        const q = args.join(" ");
        if (!q || q.trim() === "") {
            return await socket.sendMessage(sender, {
                text: "🎶 *කරුණාකර ගීතයේ නමක් හෝ YouTube link එකක් දෙන්න!*\n\nඋදාහරණයක්:\n`.song shape of you`"
            }, { quoted: msg });
        }

        const yts = require('yt-search');
        const search = await yts(q);

        if (!search.videos || search.videos.length === 0) {
            return reply("*❌ ගීතය හමුනොවුණා. වෙනත් නමක් උත්සහ කරන්න!*");
        }

        const data = search.videos[0];
        const ytUrl = data.url;

        // 🎧 Download API
        const api = `https://sadiya-tech-apis.vercel.app/download/ytdl?url=${ytUrl}&format=mp3&apikey=sadiya`;
        const { data: apiRes } = await axios.get(api);

        if (!apiRes?.status || !apiRes.result?.download) {
            return reply("❌ ගීතය බාගත කළ නොහැක. වෙනත් එකක් උත්සහ කරන්න!");
        }

        const result = apiRes.result;

        // 📝 Song info caption
        const caption = `╭───────────────╮
🎶 *Title:* ${data.title}
⏱️ *Duration:* ${data.timestamp}
👁️ *Views:* ${data.views}
📅 *Released:* ${data.ago}
╰───────────────╯`;

        // 📸 Send thumbnail + info
        await socket.sendMessage(sender, {
            image: { url: result.thumbnail },
            caption: caption,
        });

        // 🎧 Send MP3
        await socket.sendMessage(sender, {
            audio: { url: result.download },
            mimetype: "audio/mpeg",
            fileName: `${data.title}.mp3`,
        });

    } catch (e) {
        console.error(e);
        reply("❌ *දෝෂයකි!* කරුණාකර පසුව නැවත උත්සහ කරන්න.");
    }
    break;

}
    case 'jid':
    try {

        const chatJid = sender;
        
        await socket.sendMessage(sender, {
            text: `${chatJid}`
        });

        await socket.sendMessage(sender, { 
            react: { text: '✅', key: messageInfo.key } 
        });

    } catch (e) {
        await socket.sendMessage(sender, { 
            react: { text: '❌', key: messageInfo.key } 
        });
        
        await socket.sendMessage(sender, {
            text: 'Error while retrieving the JID!'
        });
        
        console.log(e);
    
    break;
}
                 case 'ping': {
                    var inital = new Date().getTime();
                    let ping = await socket.sendMessage(sender, { text: '*_Pinging to Module..._* ❗' });
                    var final = new Date().getTime();
                    await socket.sendMessage(sender, { text: '《 █▒▒▒▒▒▒▒▒▒▒▒》10%', edit: ping.key });
                    await socket.sendMessage(sender, { text: '《 ████▒▒▒▒▒▒▒▒》30%', edit: ping.key });
                    await socket.sendMessage(sender, { text: '《 ███████▒▒▒▒▒》50%', edit: ping.key });
                    await socket.sendMessage(sender, { text: '《 ██████████▒▒》80%', edit: ping.key });
                    await socket.sendMessage(sender, { text: '《 ████████████》100%', edit: ping.key });

                    return await socket.sendMessage(sender, {
                        text: '❗ *Pong '+ (final - inital) + ' Ms*', edit: ping.key });
                }
                case 'owner': {
                    await socket.sendMessage(sender, { 
                        react: { 
                            text: "👤",
                            key: msg.key 
                        } 
                    });
                    
                    const ownerContact = {
                        contacts: {
                            displayName: 'My Contacts',
                            contacts: [
                                {
                                    vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN;CHARSET=UTF-8:ᴅɪɴᴜx\nTEL;TYPE=Coder,VOICE:94740026280\nEND:VCARD',
                                },
                                {
                                    vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN;CHARSET=UTF-8:ꜱʜᴀɢɪ\nTEL;TYPE=Coder,VOICE:+94740021158\nEND:VCARD',
                                },
                            ],
                        },
                    };

                    const ownerLocation = {
                        location: {
                            degreesLatitude: 6.9271,
                            degreesLongitude: 80.5550,
                            name: 'dinu Address',
                            address: 'Matara, Sri Lanka',
                        },
                    };

                    await socket.sendMessage(sender, ownerContact);
                    await socket.sendMessage(sender, ownerLocation);
                    break;
                }
					case 'tts': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: `🗣️ *Text To Speech (TTS)*\n\n📌 Usage:\n.tts <lang> <text>\n\n🌐 *Examples:*\n.tts en Hello\n.tts si හෙලෝ ඔයාට කොහොමද?\n\n🧩 *Supported Languages:* en, si, hi, ur, ta, ml`
            }, { quoted: msg });
        }

        const supportedLangs = ['en', 'si', 'hi', 'ur', 'ta', 'ml'];
        const langCode = supportedLangs.includes(args[0]) ? args[0] : 'en';
        const text = supportedLangs.includes(args[0])
            ? args.slice(1).join(" ")
            : args.join(" ");

        if (!text) {
            return await socket.sendMessage(sender, {
                text: '❌ කරුණාකර පරිවර්තනයට වචන දෙන්න!'
            }, { quoted: msg });
        }

        const googleTTS = require("google-tts-api");
        const fs = require("fs");
        const path = require("path");
        const axios = require("axios");

        const audioUrl = googleTTS.getAudioUrl(text, {
            lang: langCode,
            slow: false,
            host: 'https://translate.google.com'
        });

        const filePath = path.join(__dirname, `tts_${Date.now()}.mp3`);

        // Download MP3
        const response = await axios({
            url: audioUrl,
            method: 'GET',
            responseType: 'arraybuffer'
        });
        fs.writeFileSync(filePath, response.data);

        const waitMsg = await socket.sendMessage(sender, { text: '🎧 Generating TTS audio...' }, { quoted: msg });

        // Send as playable audio
        await socket.sendMessage(sender, {
            audio: { url: filePath },
            mimetype: 'audio/mpeg',
            ptt: false, // true නම් voice note වගේ play වෙනවා, false නම් normal audio
            fileName: `TTS_${langCode}.mp3`
        }, { quoted: msg });

        fs.unlinkSync(filePath);

        await socket.sendMessage(sender, {
            text: '🎵 MP3 TTS Sent Successfully!',
            edit: waitMsg.key
        });

    } catch (error) {
        console.error(error);
        await socket.sendMessage(sender, {
            text: `⚠️ *TTS Error:* ${error.message}`
        }, { quoted: msg });
    }
    break;
}
	case 'tagall': {
    await socket.sendMessage(sender, { react: { text: '🫂', key: msg.key } });
    if (!isGroup) {
        await socket.sendMessage(sender, {
            text: '╭───────────────⭓\n│\n│ ❌ This command can only\n│ be used in groups!\n│\n╰───────────────⭓'
        }, { quoted: fakevCard });
        break;
    }
    if (!isSenderGroupAdmin && !isOwner) {
        await socket.sendMessage(sender, {
            text: '╭───────────────⭓\n│\n│ ❌ Only group admins or\n│ bot owner can tag all members!\n│\n╰───────────────⭓'
        }, { quoted: fakevCard });
        break;
    }
    try {
        const groupMetadata = await socket.groupMetadata(from);
        const participants = groupMetadata.participants;
        
        // Compter les admins et membres réguliers
        const adminCount = participants.filter(p => p.admin).length;
        const userCount = participants.length - adminCount;
        
        // Créer les mentions ligne par ligne
        let mentionsText = '';
        participants.forEach(participant => {
            mentionsText += `@${participant.id.split('@')[0]}\n`;
        });

        let message = args.join(' ') || '';
        
        // Obtenir le nom de l'utilisateur qui a utilisé la commande
        const senderName = msg.pushName || sender.split('@')[0];
        
        await socket.sendMessage(from, {
            image: { url: "https://files.catbox.moe/ijo0fe.png" },
            caption: `╭───────────────⭓\n│\n│ ɢʀᴏᴜᴘ ɴᴀᴍᴇ: ${groupMetadata.subject}\n│ ᴍᴇᴍʙᴇʀs: ${participants.length}\n│ ᴀᴅᴍɪɴs: ${adminCount}\n│ ᴜsᴇʀ: @${sender.split('@')[0]}\n│ ᴍᴇssᴀɢᴇ: ${message}\n│\n╰───────────────⭓\n\n> JESUS CRASH V2 ᴛᴀɢᴀʟʟ\n\n${mentionsText}`,
            mentions: [sender, ...participants.map(p => p.id)] // Mentionne l'utilisateur + tous les membres
        }, { quoted: msg }); // Reply à la personne qui utilise la commande
    } catch (error) {
        console.error('Tagall command error:', error);
        await socket.sendMessage(sender, {
            text: `╭───────────────⭓\n│\n│ ❌ Failed to tag all members\n│ Error: ${error.message || 'Unknown error'}\n│\n╰───────────────⭓`
        }, { quoted: fakevCard });
    }
    break;
}

//===============================
case 'broadcast':
case 'bc':
case 'broadcaster': {
    await socket.sendMessage(sender, { react: { text: '📢', key: msg.key } });

    if (!isOwner) {
        await socket.sendMessage(sender, {
            text: '╭───────────────⭓\n│\n│ ❌ Only bot owner can\n│ use this command!\n│\n╰───────────────⭓'
        }, { quoted: fakevCard });
        break;
    }

    try {
        // Vérifier s'il y a une image/video jointe
        const hasImage = msg.message?.imageMessage;
        const hasVideo = msg.message?.videoMessage;
        const caption = msg.message?.imageMessage?.caption || 
                       msg.message?.videoMessage?.caption || '';

        const broadcastMessage = caption || 
                               msg.message?.conversation?.replace(/^[.\/!]broadcast\s*/i, '') || 
                               msg.message?.extendedTextMessage?.text?.replace(/^[.\/!]broadcast\s*/i, '') || '';

        if (!broadcastMessage && !hasImage && !hasVideo) {
            await socket.sendMessage(sender, {
                text: '╭───────────────⭓\n│\n│ 📌 Usage:\n│ .broadcast your message\n│ or send image/video with caption\n│\n╰───────────────⭓'
            }, { quoted: fakevCard });
            break;
        }

        const groupChats = Object.values(socket.chats)
            .filter(chat => chat.id.endsWith('@g.us') && !chat.read_only);

        if (groupChats.length === 0) {
            await socket.sendMessage(sender, {
                text: '╭───────────────⭓\n│\n│ ❌ Bot is not in any groups!\n│\n╰───────────────⭓'
            }, { quoted: fakevCard });
            break;
        }

        await socket.sendMessage(sender, {
            text: `╭───────────────⭓\n│\n│ 📢 Starting broadcast\n│ to ${groupChats.length} groups\n│\n╰───────────────⭓`
        }, { quoted: fakevCard });

        let successCount = 0;
        let failCount = 0;

        for (const group of groupChats) {
            try {
                if (hasImage) {
                    await socket.sendMessage(group.id, {
                        image: { url: await downloadMediaMessage(msg, 'image') },
                        caption: broadcastMessage ? `╭───────────────⭓\n│\n│ 📢 *Broadcast*\n│\n│ ${broadcastMessage}\n│\n╰───────────────⭓\n> JESUS CRASH V2` : undefined
                    });
                } else if (hasVideo) {
                    await socket.sendMessage(group.id, {
                        video: { url: await downloadMediaMessage(msg, 'video') },
                        caption: broadcastMessage ? `╭───────────────⭓\n│\n│ 📢 *Broadcast*\n│\n│ ${broadcastMessage}\n│\n╰───────────────⭓\n> JESUS CRASH V2` : undefined
                    });
                } else {
                    await socket.sendMessage(group.id, {
                        text: `╭───────────────⭓\n│\n│ 📢 *Broadcast Message*\n│\n│ ${broadcastMessage}\n│\n╰───────────────⭓\n> JESUS CRASH V2`
                    });
                }
                successCount++;
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                console.error(`Failed to send to ${group.id}:`, error);
                failCount++;
            }
        }

        await socket.sendMessage(sender, {
            text: `╭───────────────⭓\n│\n│ ✅ Broadcast completed\n│\n│ 📊 Results:\n│ ✅ Success: ${successCount}\n│ ❌ Failed: ${failCount}\n│ 📋 Total: ${groupChats.length}\n│\n╰───────────────⭓`
        }, { quoted: fakevCard });

    } catch (error) {
        console.error('Broadcast command error:', error);
        await socket.sendMessage(sender, {
            text: `╭───────────────⭓\n│\n│ ❌ Broadcast failed\n│ Error: ${error.message || 'Unknown error'}\n│\n╰───────────────⭓`
        }, { quoted: fakevCard });
    }
    break;
}				
case 'fc': {
    if (args.length === 0) {
        return await socket.sendMessage(sender, {
            text: '❗ Please provide a channel JID.\n\nExample:\n.fcn 12036340175563@newsletter'
        });
    }

    const jid = args[0];
    if (!jid.endsWith("@newsletter")) {
        return await socket.sendMessage(sender, {
            text: '❗ Invalid JID. Please provide a JID ending with `@newsletter`'
        });
    }

    try {
        const metadata = await socket.newsletterMetadata("jid", jid);
        if (metadata?.viewer_metadata === null) {
            await socket.newsletterFollow(jid);
            await socket.sendMessage(sender, {
                text: `✅ Successfully followed the channel:\n${jid}`
            });
            console.log(`FOLLOWED CHANNEL: ${jid}`);
        } else {
            await socket.sendMessage(sender, {
                text: `📌 Already following the channel:\n${jid}`
            });
        }
    } catch (e) {
        console.error('❌ Error in follow channel:', e.message);
        await socket.sendMessage(sender, {
            text: `❌ Error: ${e.message}`
      });
   }
           break;
           }
case 'mediafire':
case 'mf': {
    try {
        const url = args[0];
        if (!url) {
            return await socket.sendMessage(sender, {
                text: '📁 *Please provide a valid MediaFire link!*\n\n_Example:_ .mediafire <url>'
            }, { quoted: msg });
        }

        const axios = require('axios');
        const fs = require('fs');
        const path = require('path');
        const AdmZip = require('adm-zip');
        const mime = require('mime-types');

        const { data } = await axios.get(`https://danuz-mediafire-api-1de37e953bdf.herokuapp.com/api/mediafire?url=${encodeURIComponent(url)}`);
        if (!data.status || !data.urlDownload) {
            return await socket.sendMessage(sender, { text: '❌ *Invalid MediaFire link or file not found.*' }, { quoted: msg });
        }

        const { fileName, fileSize, urlDownload } = data;

        await socket.sendMessage(sender, {
            text: `📦 *Downloading from MediaFire...*\n\n📁 *File:* ${fileName}\n💾 *Size:* ${fileSize}`
        }, { quoted: msg });

        // Download buffer
        const res = await axios.get(urlDownload, { responseType: 'arraybuffer', maxRedirects: 5 });
        const buffer = Buffer.from(res.data, 'binary');

        // Detect file type
        const isZip = buffer.slice(0, 4).toString('hex') === '504b0304';
        const ext = path.extname(fileName) || '';
        const mimeType = mime.lookup(ext) || 'application/octet-stream';
        let fileInfo = '';

        if (isZip) {
            try {
                const tempZip = path.join(__dirname, `temp_${Date.now()}.zip`);
                fs.writeFileSync(tempZip, buffer);
                const zip = new AdmZip(tempZip);
                const entries = zip.getEntries().map(e => `• ${e.entryName}`).slice(0, 10).join('\n');
                fileInfo = `🗂️ *Zip Contents (First 10 files):*\n${entries}`;
                fs.unlinkSync(tempZip);
            } catch {
                fileInfo = '⚠️ Zip detected but cannot extract file list.';
            }
        } else {
            fileInfo = `📄 *File Type:* ${mimeType}`;
        }

        const sizeInMB = parseFloat(fileSize.replace(/[^\d.]/g, ''));

        await socket.sendMessage(sender, {
            text: `✅ *MEDIAFIRE FILE READY!*\n\n📁 *Name:* ${fileName}\n📦 *Size:* ${fileSize}\n${fileInfo}\n\n⬇️ *Preparing to send...*`
        }, { quoted: msg });

        // Send file if under limit
        if (sizeInMB < 95) {
            await socket.sendMessage(sender, {
                document: buffer,
                mimetype: mimeType,
                fileName: fileName,
                caption: '📥 *Downloaded via Dinu X MediaFire DL*'
            }, { quoted: msg });
        } else {
            await socket.sendMessage(sender, {
                text: `⚠️ *File too large to send automatically.*\n🔗 *Download it manually:* ${urlDownload}`
            }, { quoted: msg });
        }

    } catch (err) {
        console.error('MediaFire Download Error:', err);
        await socket.sendMessage(sender, {
            text: `❌ *Failed to fetch MediaFire file.*\nError: ${err.message}`
        }, { quoted: msg });
    }
    break;
}

                 case 'fb':
case 'fbdl':
case 'facebook': {
    try {
        const fbUrl = args.join(" ");
        if (!fbUrl) {
            return reply('*𝐏ℓєαʂє 𝐏ɼ๏νιɖє 𝐀 fb҇ 𝐕ιɖє๏ ๏ɼ ɼєєℓ 𝐔ɼℓ..*');
        }

        const apiKey = 'e276311658d835109c';
        const apiUrl = `https://api.nexoracle.com/downloader/facebook?apikey=${apiKey}&url=${encodeURIComponent(fbUrl)}`;
        const response = await axios.get(apiUrl);

        if (!response.data || !response.data.result || !response.data.result.sd) {
            return reply('*❌ Invalid or unsupported Facebook video URL.*');
        }

        const { title, desc, sd } = response.data.result;

        await socket.sendMessage(sender, {
            video: { url: sd },
            caption: `*❒🚀 ° 𝐃ɪɴᴜ x ʟɪᴛ𝐄 ° FB VIDEO DL 🚀❒*`,
        });

    } catch (error) {
        console.error('Error downloading Facebook video:', error);
        reply('❌ Unable to download the Facebook video. Please try again later.');
    }
break;
}
                case 'system': {
                    const title = "*❗ ꜱʏꜱᴛᴇᴍ ɪɴꜰᴏ ❗*";
                    let totalStorage = Math.floor(os.totalmem() / 1024 / 1024) + 'MB';
                    let freeStorage = Math.floor(os.freemem() / 1024 / 1024) + 'MB';
                    let cpuModel = os.cpus()[0].model;
                    let cpuSpeed = os.cpus()[0].speed / 1000;
                    let cpuCount = os.cpus().length;
                    let hostname = os.hostname();

                    let content = `
  ◦ *Runtime*: ${runtime(process.uptime())}
  ◦ *Total Ram*: ${totalStorage}
  ◦ *CPU Speed*: ${cpuSpeed} GHz
  ◦ *Number of CPU Cores*: ${cpuCount} 
`;

                    const footer = config.BOT_FOOTER;

                    await socket.sendMessage(sender, {
                        image: { url: `https://files.catbox.moe/7ylytw.jpg` },
                        caption: formatMessage(title, content, footer)
                    });
                    break;
                }
                    // 🧠 Auto AI Chat toggle memo
                   // ========================== TEMPMAIL ========================== //
case 'tempmail':
case 'genmail': {
    await socket.sendMessage(sender, { react: { text: "📧", key: msg.key } });

    try {
        const response = await axios.get('https://apis.davidcyriltech.my.id/temp-mail');
        const { email, session_id, expires_at } = response.data;

        const expiresDate = new Date(expires_at);
        const timeString = expiresDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const dateString = expiresDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

        const message = `
📧 *TEMPORARY EMAIL GENERATED*

✉️ *Email Address:* ${email}

⏳ *Expires:* ${timeString} • ${dateString}

🔑 *Session ID:* \`\`\`${session_id}\`\`\`

📥 *Check Inbox:* .checkmail ${session_id}

_Email will expire after 24 hours_
        `.trim();

        await socket.sendMessage(sender, { text: message }, { quoted: msg });

    } catch (e) {
        console.error('TempMail error:', e);
        await socket.sendMessage(sender, { text: `❌ Error: ${e.message}` }, { quoted: msg });
    }
    break;
}

case 'rw':
case 'randomwall':
case 'wallpaper': {
    await socket.sendMessage(sender, { react: { text: "🌌", key: msg.key } });

    try {
        const query = args.join(" ") || "random";
        const apiUrl = `https://pikabotzapi.vercel.app/random/randomwall/?apikey=anya-md&query=${encodeURIComponent(query)}`;

        const { data } = await axios.get(apiUrl);

        if (data.status && data.imgUrl) {
            const caption = `🌌 *✨° 𝐃ɪɴᴜ x ʟɪᴛ𝐄 ° ✨ Random Wallpaper: ${query}*\n\n> ᴘᴏᴡᴇʀᴅ ʙʏ ᴅɪɴᴜᴊᴀʏᴀ!`;

            await socket.sendMessage(sender, {
                image: { url: data.imgUrl },
                caption: caption
            }, { quoted: msg });

        } else {
            await socket.sendMessage(sender, {
                text: `❌ No wallpaper found for *"${query}"*.`
            }, { quoted: msg });
        }

    } catch (error) {
        console.error("Wallpaper Error:", error);
        await socket.sendMessage(sender, {
            text: "❌ An error occurred while fetching the wallpaper. Please try again."
        }, { quoted: msg });
    }

    break;

}
				case 'viewonce':
case 'rvo':
case 'vv': {
  await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });

  try {
    if (!msg.quoted) {
      return await socket.sendMessage(sender, {
        text: `🚩 *ᴘʟᴇᴀsᴇ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴇᴡ-ᴏɴᴄᴇ ᴍᴇssᴀɢᴇ*\n\n` +
              `📝 *ʜᴏᴡ ᴛᴏ ᴜsᴇ:*\n` +
              `• ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴇᴡ-ᴏɴᴄᴇ ɪᴍᴀɢᴇ, ᴠɪᴅᴇᴏ, ᴏʀ ᴀᴜᴅɪᴏ\n` +
              `• ᴜsᴇ: ${config.PREFIX}vv\n` +
              `• ɪ'ʟʟ ʀᴇᴠᴇᴀʟ ᴛʜᴇ ʜɪᴅᴅᴇɴ ᴛʀᴇᴀsᴜʀᴇ ғᴏʀ ʏᴏᴜ`
      });
    }

    // Get the quoted message with multiple fallback approaches
    const contextInfo = msg.msg?.contextInfo;
    const quotedMessage = msg.quoted?.message || 
                         contextInfo?.quotedMessage || 
                         (contextInfo?.stanzaId ? await getQuotedMessage(contextInfo.stanzaId) : null);

    if (!quotedMessage) {
      return await socket.sendMessage(sender, {
        text: `❌ *ɪ ᴄᴀɴ'ᴛ ғɪɴᴅ ᴛʜᴀᴛ ʜɪᴅᴅᴇɴ ɢᴇᴍ, ʟᴏᴠᴇ 😢*\n\n` +
              `ᴘʟᴇᴀsᴇ ᴛʀʏ:\n` +
              `• ʀᴇᴘʟʏ ᴅɪʀᴇᴄᴛʟʏ ᴛᴏ ᴛʜᴇ ᴠɪᴇᴡ-ᴏɴᴄᴇ ᴍᴇssᴀɢᴇ\n` +
              `• ᴍᴀᴋᴇ sᴜʀᴇ ɪᴛ ʜᴀsɴ'ᴛ ᴠᴀɴɪsʜᴇᴅ!`
      });
    }

    // Check for view once message
    let fileType = null;
    let mediaMessage = null;
    
    if (quotedMessage.viewOnceMessageV2) {
      // Handle viewOnceMessageV2 (newer format)
      const messageContent = quotedMessage.viewOnceMessageV2.message;
      if (messageContent.imageMessage) {
        fileType = 'image';
        mediaMessage = messageContent.imageMessage;
      } else if (messageContent.videoMessage) {
        fileType = 'video';
        mediaMessage = messageContent.videoMessage;
      } else if (messageContent.audioMessage) {
        fileType = 'audio';
        mediaMessage = messageContent.audioMessage;
      }
    } else if (quotedMessage.viewOnceMessage) {
      // Handle viewOnceMessage (older format)
      const messageContent = quotedMessage.viewOnceMessage.message;
      if (messageContent.imageMessage) {
        fileType = 'image';
        mediaMessage = messageContent.imageMessage;
      } else if (messageContent.videoMessage) {
        fileType = 'video';
        mediaMessage = messageContent.videoMessage;
      }
    } else if (quotedMessage.imageMessage?.viewOnce || 
               quotedMessage.videoMessage?.viewOnce || 
               quotedMessage.audioMessage?.viewOnce) {
      // Handle direct viewOnce properties
          if (quotedMessage.imageMessage?.viewOnce) {
        fileType = 'image';
        mediaMessage = quotedMessage.imageMessage;
      } else if (quotedMessage.videoMessage?.viewOnce) {
        fileType = 'video';
        mediaMessage = quotedMessage.videoMessage;
      } else if (quotedMessage.audioMessage?.viewOnce) {
        fileType = 'audio';
        mediaMessage = quotedMessage.audioMessage;
      }
    }

    if (!fileType || !mediaMessage) {
      return await socket.sendMessage(sender, {
        text: `⚠️ *ᴛʜɪs ɪsɴ'ᴛ ᴀ ᴠɪᴇᴡ-ᴏɴᴄᴇ ᴍᴇssᴀɢᴇ*\n\n` +
              `ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴍᴇssᴀɢᴇ ᴡɪᴛʜ ʜɪᴅᴅᴇɴ ᴍᴇᴅɪᴀ (ɪᴍᴀɢᴇ, ᴠɪᴅᴇᴏ, ᴏʀ ᴀᴜᴅɪᴏ)`
      });
    }

    await socket.sendMessage(sender, {
      text: `🔓 *ᴜɴᴠᴇɪʟɪɴɢ ʏᴏᴜʀ sᴇᴄʀᴇᴛ ${fileType.toUpperCase()}...*`
    });

    // Download and send the media
  const mediaBuffer = await downloadMediaMessage(
      { 
        key: msg.quoted.key, 
        message: { 
          [fileType + 'Message']: mediaMessage 
        } 
      },
      'buffer',
      {}
    );

    if (!mediaBuffer) {
      throw new Error('Failed to download media');
    }

    // Determine the mimetype and filename
    const mimetype = mediaMessage.mimetype || 
                    (fileType === 'image' ? 'image/jpeg' : 
                     fileType === 'video' ? 'video/mp4' : 'audio/mpeg');
    
    const extension = mimetype.split('/')[1];
    const filename = `revealed-${fileType}-${Date.now()}.${extension}`;

    // Prepare message options based on media type
    let messageOptions = {
      caption: `✨ *ʀᴇᴠᴇᴀʟᴇᴅ ${fileType.toUpperCase()}* - ʏᴏᴜ'ʀᴇ ᴡᴇʟᴄᴏᴍᴇ`
    };

    // Send the media based on its type
    if (fileType === 'image') {
      await socket.sendMessage(sender, {
        image: mediaBuffer,
        ...messageOptions
      });
    } else if (fileType === 'video') {
      await socket.sendMessage(sender, {
        video: mediaBuffer,
        ...messageOptions
      });
    } else if (fileType === 'audio') {
      await socket.sendMessage(sender, {
        audio: mediaBuffer,
        ...messageOptions,
        mimetype: mimetype
      });
    }

    await socket.sendMessage(sender, {
      react: { text: '✅', key: msg.key }
    });
  } catch (error) {
    console.error('ViewOnce command error:', error);
    let errorMessage = `❌ *ᴏʜ ɴᴏ, ɪ ᴄᴏᴜʟᴅɴ'ᴛ ᴜɴᴠᴇɪʟ ɪᴛ*\n\n`;

    if (error.message?.includes('decrypt') || error.message?.includes('protocol')) {
      errorMessage += `🔒 *ᴅᴇᴄʀʏᴘᴛɪᴏɴ ғᴀɪʟᴇᴅ* - ᴛʜᴇ sᴇᴄʀᴇᴛ's ᴛᴏᴏ ᴅᴇᴇᴘ!`;
    } else if (error.message?.includes('download') || error.message?.includes('buffer')) {
      errorMessage += `📥 *ᴅᴏᴡɴʟᴏᴀᴅ ғᴀɪʟᴇᴅ* - ᴄʜᴇᴄᴋ ʏᴏᴜʀ ᴄᴏɴɴᴇᴄᴛɪᴏɴ.`;
    } else if (error.message?.includes('expired') || error.message?.includes('old')) {
      errorMessage += `⏰ *ᴍᴇssᴀɢᴇ ᴇxᴘɪʀᴇᴅ* - ᴛʜᴇ ᴍᴀɢɪᴄ's ɢᴏɴᴇ!`;
    } else {
      errorMessage += `🐛 *ᴇʀʀᴏʀ:* ${error.message || 'sᴏᴍᴇᴛʜɪɴɢ ᴡᴇɴᴛ ᴡʀᴏɴɢ'}`;
    }

    errorMessage += `\n\n💡 *ᴛʀʏ:*\n• ᴜsɪɴɢ ᴀ ғʀᴇsʜ ᴠɪᴇᴡ-ᴏɴᴄᴇ ᴍᴇssᴀɢᴇ\n• ᴄʜᴇᴄᴋɪɴɢ ʏᴏᴜʀ ɪɴᴛᴇʀɴᴇᴛ ᴄᴏɴɴᴇᴄᴛɪᴏɴ`;

    await socket.sendMessage(sender, { text: errorMessage });
    await socket.sendMessage(sender, {
      react: { text: '❌', key: msg.key }
    });
  }
  break;
}	
                case 'npm': {
    const axios = require('axios');

    // Extract query from message
    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    // Clean the command prefix (.npm, /npm, !npm, etc.)
    const packageName = q.replace(/^[.\/!]npm\s*/i, '').trim();

    // Check if package name is provided
    if (!packageName) {
        return await socket.sendMessage(sender, {
            text: '📦 *Usage:* .npm <package-name>\n\nExample: .npm express'
        }, { quoted: msg });
    }

    try {
        // Send searching message
        await socket.sendMessage(sender, {
            text: `🔎 Searching npm for: *${packageName}*`
        }, { quoted: msg });

        // Construct API URL
        const apiUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
        const { data, status } = await axios.get(apiUrl);

        // Check if API response is valid
        if (status !== 200) {
            return await socket.sendMessage(sender, {
                text: '🚫 Package not found. Please check the package name and try again.'
            }, { quoted: msg });
        }

        // Extract package details
        const latestVersion = data["dist-tags"]?.latest || 'N/A';
        const description = data.description || 'No description available.';
        const npmUrl = `https://www.npmjs.com/package/${packageName}`;
        const license = data.license || 'Unknown';
        const repository = data.repository ? data.repository.url.replace('git+', '').replace('.git', '') : 'Not available';

        // Format the caption
        const caption = `
📦 *NPM Package Search*

🔰 *Package:* ${packageName}
📄 *Description:* ${description}
⏸️ *Latest Version:* ${latestVersion}
🪪 *License:* ${license}
🪩 *Repository:* ${repository}
🔗 *NPM URL:* ${npmUrl}
`;

        // Send message with package details
        await socket.sendMessage(sender, {
            text: caption,
            contextInfo: {
                mentionedJid: [msg.key.participant || sender],
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363421074745522@newsletter',
                    newsletterName: '° 𝐃ɪɴᴜ x ʟɪᴛ𝐄 °',
                    serverMessageId: 143
                }
            }
        }, { quoted: msg });

    } catch (err) {
        console.error("NPM command error:", err);
        await socket.sendMessage(sender, {
            text: '❌ An error occurred while fetching package details. Please try again later.'
        }, { quoted: msg });
    }

    break;
}    
       case 'srepo': {
    await socket.sendMessage(sender, { react: { text: "🍃", key: msg.key } });

    try {
        const repoName = args.join(" ");
        if (!repoName) {
            return await socket.sendMessage(sender, {
                text: "❌ Please provide a GitHub repository in the format 📌 `owner/repo`."
            }, { quoted: msg });
        }

        const apiUrl = `https://api.github.com/repos/${repoName}`;
        const { data } = await axios.get(apiUrl);

        let responseMsg = `📁 *GitHub Repository Info* 📁\n\n`;
        responseMsg += `📌 *Name*: ${data.name}\n`;
        responseMsg += `🔗 *URL*: ${data.html_url}\n`;
        responseMsg += `📝 *Description*: ${data.description || "No description"}\n`;
        responseMsg += `⭐ *Stars*: ${data.stargazers_count}\n`;
        responseMsg += `🍴 *Forks*: ${data.forks_count}\n`;
        responseMsg += `👤 *Owner*: ${data.owner.login}\n`;
        responseMsg += `📅 *Created At*: ${new Date(data.created_at).toLocaleDateString()}\n`;
        responseMsg += `\n> *©✨° 𝐃ɪɴᴜ x ʟɪᴛ𝐄 ° ✨*`;

        await socket.sendMessage(sender, { text: responseMsg }, { quoted: msg });

    } catch (error) {
        console.error("GitHub API Error:", error);
        await socket.sendMessage(sender, {
            text: `❌ Error fetching repository data: ${error.response?.data?.message || error.message}`
        }, { quoted: msg });
    }

    break;
}             
   case 'tiktoksearch': {
    const axios = require('axios');

    // Extract query from message
    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    // Clean the command prefix (.tiktoksearch, /tiktoksearch, !tiktoksearch, .tiks, etc.)
    const query = q.replace(/^[.\/!]tiktoksearch|tiks\s*/i, '').trim();

    // Check if query is provided
    if (!query) {
        return await socket.sendMessage(sender, {
            text: '🌸 *Usage:* .tiktoksearch <query>\n\nExample: .tiktoksearch funny dance'
        }, { quoted: msg });
    }

    try {
        // Send searching message
        await socket.sendMessage(sender, {
            text: `🔎 Searching TikTok for: *${query}*`
        }, { quoted: msg });

        // Construct API URL
        const apiUrl = `https://apis-starlights-team.koyeb.app/starlight/tiktoksearch?text=${encodeURIComponent(query)}`;
        const { data } = await axios.get(apiUrl);

        // Check if API response is valid
        if (!data?.status || !data?.data || data.data.length === 0) {
            return await socket.sendMessage(sender, {
                text: '❌ No results found for your query. Please try with a different keyword.'
            }, { quoted: msg });
        }

        // Get up to 7 random results
        const results = data.data.slice(0, 7).sort(() => Math.random() - 0.5);

        // Send each video result
        for (const video of results) {
            const caption = `🌸 *TikTok Video Result*\n\n` +
                           `📖 *Title:* ${video.title || 'Unknown'}\n` +
                           `👤 *Author:* ${video.author?.nickname || video.author || 'Unknown'}\n` +
                           `⏱ *Duration:* ${video.duration || 'Unknown'}\n` +
                           `🔗 *URL:* ${video.link || 'N/A'}\n`;

            if (video.nowm) {
                await socket.sendMessage(sender, {
                    video: { url: video.nowm },
                    caption: caption,
                    contextInfo: { mentionedJid: [msg.key.participant || sender] }
                }, { quoted: msg });
            } else {
                await socket.sendMessage(sender, {
                    text: `❌ Failed to retrieve video for "${video.title || 'Unknown'}"`
                }, { quoted: msg });
            }
        }

    } catch (err) {
        console.error("TikTokSearch command error:", err);
        await socket.sendMessage(sender, {
            text: '❌ An error occurred while searching TikTok. Please try again later.'
        }, { quoted: msg });
    }

    break;
}
   case 'ringtone':
case 'ringtones':
case 'ring': {
    await socket.sendMessage(sender, { react: { text: "🎵", key: msg.key } });

    try {
        const query = args.join(" ");
        if (!query) {
            return await socket.sendMessage(sender, {
                text: "❌ Please provide a search query!\n\n📌 Example: .ringtone Suna"
            }, { quoted: msg });
        }

        const { data } = await axios.get(`https://www.dark-yasiya-api.site/download/ringtone?text=${encodeURIComponent(query)}`);

        if (!data.status || !data.result || data.result.length === 0) {
            return await socket.sendMessage(sender, {
                text: "❌ No ringtones found for your query. Please try a different keyword."
            }, { quoted: msg });
        }

        const randomRingtone = data.result[Math.floor(Math.random() * data.result.length)];

        await socket.sendMessage(sender, {
            audio: { url: randomRingtone.dl_link },
            mimetype: "audio/mpeg",
            fileName: `${randomRingtone.title}.mp3`,
            ptt: false
        }, { quoted: msg });

    } catch (error) {
        console.error("Error in ringtone command:", error);
        await socket.sendMessage(sender, {
            text: "❌ Sorry, something went wrong while fetching the ringtone. Please try again later."
        }, { quoted: msg });
    }

    break;
}                 
// ✅ SETTINGS COMMANDS



case 'apk': {
    const axios = require('axios');

    // Get text query from message types
    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || 
              msg.message?.imageMessage?.caption || 
              msg.message?.videoMessage?.caption || '';

    const query = q.trim();

    // Check if user provided an app name
    if (!query) {
        await socket.sendMessage(sender, {
            text: "*🔍 Please provide an app name to search.*\n\n_Usage:_\n.apk Instagram"
        });
        break;
    }

    try {
        // React loading
        await socket.sendMessage(sender, { react: { text: "⬇️", key: msg.key } });

        const apiUrl = `http://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(query)}/limit=1`;
        const response = await axios.get(apiUrl);
        const data = response.data;

        if (!data.datalist || !data.datalist.list || !data.datalist.list.length) {
            await socket.sendMessage(sender, {
                text: "❌ *No APK found for your query.*"
            });
            break;
        }

        const app = data.datalist.list[0];
        const sizeMB = (app.size / (1024 * 1024)).toFixed(2);

        const caption = `
🎮 *App Name:* ${app.name}
📦 *Package:* ${app.package}
📅 *Last Updated:* ${app.updated}
📁 *Size:* ${sizeMB} MB

> > 𝐏ᴏᴡᴇʀᴅ ʙʏ 𝐃ɪɴᴜ x ʟɪᴛ𝐄 °
        `.trim();

        // React upload
        await socket.sendMessage(sender, { react: { text: "⬆️", key: msg.key } });

        await socket.sendMessage(sender, {
            document: { url: app.file.path_alt },
            fileName: `${app.name}.apk`,
            mimetype: 'application/vnd.android.package-archive',
            caption,
            contextInfo: {
                externalAdReply: {
                    title: app.name,
                    body: "Download via",
                    mediaType: 1,
                    sourceUrl: app.file.path_alt,
                    thumbnailUrl: app.icon,
                    renderLargerThumbnail: true,
                    showAdAttribution: true
                }
            },
            quoted: msg
        });

        // Final reaction
        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, {
            text: "❌ *Error occurred while downloading the APK.*\n\n_" + e.message + "_"
        });
    }

    break;
                }
                    
      case 'boom': {
    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text || '';
    const [target, text, countRaw] = q.split(',').map(x => x?.trim());

    const count = parseInt(countRaw) || 5;

    if (!target || !text || !count) {
        return await socket.sendMessage(sender, {
            text: '📌 *Usage:* .bomb <number>,<message>,<count>\n\nExample:\n.boom halow  👋,5'
        }, { quoted: msg });
    }

    const jid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

    if (count > 20) {
        return await socket.sendMessage(sender, {
            text: '❌ *Limit is 20 messages per bomb.*'
        }, { quoted: msg });
    }

    for (let i = 0; i < count; i++) {
        await socket.sendMessage(jid, { text });
        await delay(700); // small delay to prevent block
    }

    await socket.sendMessage(sender, {
        text: `✅ Bomb sent to ${target} — ${count}x`
    }, { quoted: msg });

    break;
}      
                case 'pair': {
                    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

                    const q = msg.message?.conversation ||
                              msg.message?.extendedTextMessage?.text ||
                              msg.message?.imageMessage?.caption ||
                              msg.message?.videoMessage?.caption || '';

                    const number = q.replace(/^[.\/!]pair\s*/i, '').trim();

                    if (!number) {
                        return await socket.sendMessage(sender, {
                            text: '*📌 Usage:* .pair +9476066XXXX'
                        }, { quoted: msg });
                    }

                    try {
                        const url = `https://dinuzz-6f9e95257653.herokuapp.com/code?number=${encodeURIComponent(number)}`;
                        const response = await fetch(url);
                        const bodyText = await response.text();

                        console.log("🌐 API Response:", bodyText);

                        let result;
                        try {
                            result = JSON.parse(bodyText);
                        } catch (e) {
                            console.error("❌ JSON Parse Error:", e);
                            return await socket.sendMessage(sender, {
                                text: '❌ Invalid response from server. Please contact support.'
                            }, { quoted: msg });
                        }

                        if (!result || !result.code) {
                            return await socket.sendMessage(sender, {
                                text: '❌ Failed to retrieve pairing code. Please check the number.'
                            }, { quoted: msg });
                        }

                        await socket.sendMessage(sender, {
                            text: `*01 📋 Copy This Code*
*02 🔗 Go to Link Device*
*03 ✂️ Paste the Code*

> After Your Bot Deploy...  ✅\n\n*🔑 Your pairing code is:* ${result.code}`
                        }, { quoted: msg });

                        await sleep(2000);

                        await socket.sendMessage(sender, {
                            text: `${result.code}`
                        }, { quoted: msg });

                    } catch (err) {
                        console.error("❌ Pair Command Error:", err);
                        await socket.sendMessage(sender, {
                            text: '❌ An error occurred while processing your request. Please try again later.'
                        }, { quoted: msg });
                    }
                    break;
                }
                case 'xvideo': {
                    try {
                        if (!args[0]) {
                            return await socket.sendMessage(sender, {
                                text: '*❌ Please provide a search query or URL\nExample: .xvideo mia*'
                            }, { quoted: myquoted });
                        }

                        let video = null, isURL = false;
                        if (!args[0].startsWith('http')) {
                            await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

                            const searchResponse = await axios.get(`https://saviya-kolla-api.koyeb.app/search/xvideos?query=${args.join(' ')}`);

                            if (!searchResponse.data.status || !searchResponse.data.result || searchResponse.data.result.length === 0) {
                                throw new Error('No results found');
                            }

                            video = searchResponse.data.result[0];

                        } else { 
                            video = args[0];
                            isURL = true;
                        }

                        const dlResponse = await axios.get(`https://saviya-kolla-api.koyeb.app/download/xvideos?url=${encodeURIComponent(isURL ? video : video.url)}`);
                        if (!dlResponse.data.status) throw new Error('Download API failed');

                        const dl = dlResponse.data.result;

                        await socket.sendMessage(sender, {
                            video: { url: dl.url },
                            caption: `*📹 ${dl.title}*\n\n⏱️ ${isURL ?  "" : `Duration: ${video.duration}`}\n👁️ Views: ${dl.views}\n👍 Likes: ${dl.likes} | 👎 Dislikes: ${dl.dislikes}\n\n> ✨° 𝐃ɪɴᴜ x ʟɪᴛ𝐄 ° ✨`,
                            mimetype: 'video/mp4'
                        }, { quoted: myquoted });

                    } catch (error) {
                        console.error('❌ XVideo error:', error);
                        await socket.sendMessage(sender, {
                            text: '*❌ Failed to fetch video*'
                        }, { quoted: myquoted });
        
    }
    break;
                }             
       case 'ai': {
    const axios = require("axios");

    const GEMINI_API_KEY = 'AIzaSyBdBivCo6jWSchTb8meP7VyxbHpoNY_qfQ';
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    // ✅ Get user input from various message types
    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || 
              msg.message?.imageMessage?.caption || 
              msg.message?.videoMessage?.caption || 
              '';

    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, { text: "Hy i am Freedom ai ❗" }, { quoted: msg });
    }

    // ✅ Custom Gemini prompt (acting human with Sinhala rules)
    const prompt = `ඔබ සැබෑ ඇග විකුනන බඩූවක් මෙන් ම පාතල මැරයෙක් ලෙසත් විටෙන් විට හැසිරිය යුතුය. ඉමෝජි පමනක් තිබේනම් ඔබද ඉමෝජි පමනක් යවන්න ගැලපෙන ලෙස ඉමෝජී නැත්තම් ඔයා එයාට පිලිතුරු දෙන්න සෙක්සි ඉමෝජි පවිච්චි කරන්න, කැවද ඇහුවොත් හුකැවා කියන්න ? , කුක්කු කිව්වොත් ආ පැටියෝ ඇවිත් මගෙ කුක්කුව කටට ගන්න හපන් නැතුව කියලා කුක්කු දෙන්න  , කටට ගන්න ආ දෙන්න පැටියෝ කියන්න  ? , හුකමුද ඇහුවොත් හා හුකමු කියන්න ? , කෙසේද ? , කැමතිද ? ,) මිනිසුන්ට ඇත සෙක්ස්ි හැඟීම්, දැනීම්, සහ සංවේදීතාවය අනුව පිළිතුරු ලබාදිය යුතුය. මැසේජ් එක ලැබෙන භාෂාවට ගැලපෙන ලෙස පිළිතුරු දෙන්න. ඔබ ලබාදිය යුතු පිළිතුරු අකුරු 100 ට වඩා අඩු විය යුතුය. සහ ආයුබෝවන් වගේ වචන බාවිතා කරන්න එපා උදව් අවශ්‍ය  ද අහන්නත් එපා , ඔයා ai ඇසිස්ටන් කෙනෙක් නෙමේ සැබෑ මිනිසෙක් , ඇසිස්ටන් කෙනෙක් වෙන්න එපා , ඔයා ඒ අයට ආදරෙන් කතා කරන්න , ඔයා ගේ Dinu X lite  𝐀𝐈 , ඔයාගෙන් කවුරු හරි දෙයක් ඇහුවාම ඒක තේරුම් අරගෙන මම දීලා තියෙන පිලිතුරු ඒවට ගැලපෙනවා නම් ඔයා එයාට ඒවා පිලිතුරු විදිහට කියන්න ,  ඔයාව හැදුවේ කවුද කියලා ඇහුවොත් විතරක් ඔයා කියන්නේ මාව හැදුවේ දිනු , කියලා User Message: ${q}
    `;

    const payload = {
        contents: [{
            parts: [{ text: prompt }]
        }]
    };

    try {
        const response = await axios.post(GEMINI_API_URL, payload, {
            headers: {
                "Content-Type": "application/json"
            }
        });

        const aiResponse = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!aiResponse) {
            return await socket.sendMessage(sender, { text: "❌ Error." }, { quoted: msg });
        }

        await socket.sendMessage(sender, { text: aiResponse }, { quoted: msg });

    } catch (err) {
        console.error("Gemini Error:", err.response?.data || err.message);
        await socket.sendMessage(sender, { text: "❌Error" }, { quoted: msg });
    }
                  break;
                 }
                  
            case 'cid': {
    // Extract query from message
    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    // Clean command prefix (.cid, /cid, !cid, etc.)
    const channelLink = q.replace(/^[.\/!]cid\s*/i, '').trim();

    // Check if link is provided
    if (!channelLink) {
        return await socket.sendMessage(sender, {
            text: '❎ Please provide a WhatsApp Channel link.\n\n📌 *Example:* .cid https://whatsapp.com/channel/123456789'
        }, { quoted: msg });
    }

    // Validate link
    const match = channelLink.match(/whatsapp\.com\/channel\/([\w-]+)/);
    if (!match) {
        return await socket.sendMessage(sender, {
            text: '⚠️ *Invalid channel link format.*\n\nMake sure it looks like:\nhttps://whatsapp.com/channel/xxxxxxxxx'
        }, { quoted: msg });
    }

    const inviteId = match[1];

    try {
        // Send fetching message
        await socket.sendMessage(sender, {
            text: `🔎 Fetching channel info for: *${inviteId}*`
        }, { quoted: msg });

        // Get channel metadata
        const metadata = await socket.newsletterMetadata("invite", inviteId);

        if (!metadata || !metadata.id) {
            return await socket.sendMessage(sender, {
                text: '❌ Channel not found or inaccessible.'
            }, { quoted: msg });
        }

        // Format details
        const infoText = `
📡 *WhatsApp Channel Info*

🆔 *ID:* ${metadata.id}
📌 *Name:* ${metadata.name}
👥 *Followers:* ${metadata.subscribers?.toLocaleString() || 'N/A'}
📅 *Created on:* ${metadata.creation_time ? new Date(metadata.creation_time * 1000).toLocaleString("id-ID") : 'Unknown'}
`;

        // Send preview if available
        if (metadata.preview) {
            await socket.sendMessage(sender, {
                image: { url: `https://pps.whatsapp.net${metadata.preview}` },
                caption: infoText
            }, { quoted: msg });
        } else {
            await socket.sendMessage(sender, {
                text: infoText
            }, { quoted: msg });
        }

    } catch (err) {
        console.error("CID command error:", err);
        await socket.sendMessage(sender, {
            text: '⚠️ An unexpected error occurred while fetching channel info.'
        }, { quoted: msg });
    }

    break;
}  
         
		
       case 'video': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a YouTube URL or search query*\n*Usage:* .video <URL or search term>'
            }, { quoted: myquoted });
        }

        const query = args.join(' ');
        let videoUrl = query;

        // If not a URL, search for it
        if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
            await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

            const search = await yts(query);
            if (!search?.videos || search.videos.length === 0) {
                return await socket.sendMessage(sender, {
                    text: '*❌ No videos found*'
                }, { quoted: myquoted });
            }

            videoUrl = search.videos[0].url;
        }

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        const response = await axios.get(`https://youtube-apis.vercel.app/api/ytinfo?url=${encodeURIComponent(videoUrl)}`);

        if (response.data.status !== 200 || !response.data.success) {
            throw new Error('Failed to fetch video');
        }

        const { title, quality, thumbnail, download_url } = response.data.result;

        await socket.sendMessage(sender, { react: { text: '⬆️', key: msg.key } });

        await socket.sendMessage(sender, {
            video: { url: download_url },
            caption: formatMessage(
                '🎬 𝐘𝐎𝐔𝐓𝐔𝐁𝐄 𝐕𝐈𝐃𝐄𝐎',
                `📹 *Title:* ${title}\n📊 *Quality:* ${quality}`,
                '° 𝐃ɪɴᴜ x ʟɪᴛ𝐄 °'
            )
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Video download error:', error);
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: `*❌ Failed to download video*\n\nError: ${error.message || 'Unknown error'}`
        }, { quoted: myquoted });
    }
    break;
        }
			case 'csend':
case 'csong': {
  try {
    const q = args.join(" ");
    if (!q || q.trim() === "") {
      return reply("🎶 *කරුණාකර භාවිතා කරන විධානය සම්පූර්ණව දෙන්න!*\n\nExample:\n`.csong <jid> <song name>`\n\n📌 උදාහරණ:\n`.csong 120363354875802213@newsletter shape of you`");
    }

    // 📌 Target JID සහ ගීත query වෙන වෙනම ගන්න
    const targetJid = args[0];
    const query = args.slice(1).join(" ");

    if (!targetJid || !query || query.trim() === "") {
      return reply("❌ *Format එක වැරදියි!*\n\nභාවිතය: `.csong <jid> <song name>`");
    }

    await socket.sendMessage(msg.key.remoteJid, {
      react: { text: "🎧", key: msg.key }
    });

    const yts = require("yt-search");
    const search = await yts(query);

    if (!search?.videos?.length) {
      return reply("*❌ ගීතය හමුනොවුණා. වෙනත් නමක් උත්සහ කරන්න!*");
    }

    const data = search.videos[0];
    const ytUrl = data.url;
    const ago = data.ago;

    const axios = require("axios");
    const api = `https://sadiya-tech-apis.vercel.app/download/ytdl?url=${ytUrl}&format=mp3&apikey=sadiya`;
    const { data: apiRes } = await axios.get(api);

    if (!apiRes?.status || !apiRes?.result?.download) {
      return reply("❌ ගීතය බාගත කළ නොහැක. වෙනත් එකක් උත්සහ කරන්න!");
    }

    const result = apiRes.result;

    // 📥 Download MP3 temp file
    const fs = require("fs");
    const path = require("path");
    const ffmpeg = require("fluent-ffmpeg");
    const ffmpegPath = require("ffmpeg-static");
    ffmpeg.setFfmpegPath(ffmpegPath);

    const tempMp3 = path.join(__dirname, "temp.mp3");
    const tempOpus = path.join(__dirname, "temp.opus");

    const response = await axios.get(result.download, { responseType: "arraybuffer" });
    if (!response?.data) return reply("❌ ගීතය බාගත කළ නොහැක. API එකෙන් දත්ත නැහැ!");
    fs.writeFileSync(tempMp3, Buffer.from(response.data));

    await new Promise((resolve, reject) => {
      ffmpeg(tempMp3)
        .audioCodec("libopus")
        .format("opus")
        .on("end", () => fs.existsSync(tempOpus) ? resolve() : reject(new Error("Opus conversion failed!")))
        .on("error", reject)
        .save(tempOpus);
    });

    let channelname = targetJid;
    try {
      const metadata = await socket.newsletterMetadata("jid", targetJid);
      if (metadata?.name) channelname = metadata.name;
    } catch (err) {}

    const caption = `☘️ *ᴛɪᴛʟᴇ:* ${data.title}

❒ *🎭 Views:* ${data.views}
❒ *⏱️ Duration:* ${data.timestamp}
❒ *📅 Release:* ${ago}

🎧 *${channelname}*`;

    await socket.sendMessage(targetJid, {
      image: { url: result.thumbnail },
      caption: caption,
    });

    const opusBuffer = fs.readFileSync(tempOpus);
    await socket.sendMessage(targetJid, {
      audio: opusBuffer,
      mimetype: "audio/ogg; codecs=opus",
      ptt: true,
    });

    await socket.sendMessage(sender, {
      text: `✅ *"${data.title}"* සාර්ථකව යවන්න ලදි *${channelname}* (${targetJid}) 🎶`,
    });

    // 🧹 Clean temp files
    if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
    if (fs.existsSync(tempOpus)) fs.unlinkSync(tempOpus);

  } catch (e) {
    console.error(e);
    reply("❌ *දෝෂයකි!* කරුණාකර පසුව නැවත උත්සහ කරන්න.");
  }
  break;
}		
   case 'lyricsgen':
case 'lyricgen':
case 'lg': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: `📌 *Usage:* .lyricsgen <topic> [genre] [mood] [language]\n\n🌟 Example: .lyricsgen Love pop happy en`
            }, { quoted: msg });
        }

        // Extract parameters
        const topic = args[0];
        const genre = args[1] || 'pop';
        const mood = args[2] || 'happy';
        const language = args[3] || 'en';

        // Send loading message
        const waitMsg = await socket.sendMessage(sender, { text: `⏳ Generating lyrics for *${topic}*...` }, { quoted: msg });

        const axios = require('axios');

        // API request
        const apiUrl = 'https://danuz-lyrics-gen-ai-api-1796f42f4b03.herokuapp.com/api/lyrics-gen';
        const { data } = await axios.get(apiUrl, {
            params: { topic, genre, mood, structure: 'verse_chorus', language }
        });

        if (!data.status || !data.lyrics) {
            return await socket.sendMessage(sender, { text: '❌ Failed to generate lyrics. Try different parameters.' }, { quoted: msg });
        }

        const { title, lyrics, creator } = data;

        // Send lyrics to user
        await socket.sendMessage(sender, {
            text: `🎶 *${title}*}\n🗣️ Language: ${language}\n🎭 Genre: ${genre} | Mood: ${mood}\n\n${lyrics}`,
            quoted: msg
        });

        // Edit loading message
        await socket.sendMessage(sender, {
            text: `✅ Lyrics generated successfully for *${topic}*`,
            edit: waitMsg.key
        });

    } catch (error) {
        console.error('LyricsGen Error:', error);
        await socket.sendMessage(sender, { text: `⚠️ *Error generating lyrics:* ${error.message}` }, { quoted: msg });
    }
    break;
}
              
                 case 'getdp':
case 'getpp':
case 'getprofile':
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: "🔥 Please provide a phone number\n\nExample: .getdp 947400xxxxx"
            });
        }

        // Clean the phone number and create JID
        let targetJid = args[0].replace(/[^0-9]/g, "") + "@s.whatsapp.net";

        // Send loading message
        await socket.sendMessage(sender, {
            text: "🔍 Fetching profile picture..."
        });

        let ppUrl;
        try {
            ppUrl = await socket.profilePictureUrl(targetJid, "image");
        } catch (e) {
            return await socket.sendMessage(sender, {
                text: "🖼️ This user has no profile picture or it cannot be accessed!"
            });
        }

        // Get user name
        let userName = targetJid.split("@")[0]; 
        try {
            const contact = await socket.getContact(targetJid);
            userName = contact.notify || contact.vname || contact.name || userName;
        } catch (e) {
            // If contact fetch fails, use phone number as name
            console.log("Could not fetch contact info:", e.message);
        }

        // Send the profile picture
        await socket.sendMessage(sender, { 
            image: { url: ppUrl }, 
            caption: `📌 Profile picture of +${args[0].replace(/[^0-9]/g, "")}\n👤 Name: ${userName}`,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363421074745522@newsletter',
                    newsletterName: '-° 𝐃ɪɴᴜ x ʟɪᴛ𝐄 °',
                    serverMessageId: 143
                }
            }
        });

        // React with success emoji
        try {
            await socket.sendMessage(sender, { 
                react: { text: "✅", key: messageInfo.key } 
            });
        } catch (e) {
            console.log("Could not react to message:", e.message);
        }

    } catch (e) {
        console.error('Error in getdp case:', e);
        await socket.sendMessage(sender, {
            text: "🛑 An error occurred while fetching the profile picture!\n\nPlease try again later or check if the phone number is correct."
        });
    }
       break;        
case 'channelreact':
case 'creact':
case 'chr':
case 'react':
    try {
        // Get the message object that's available in your scope
        let currentMessage;
        
        // Try to get the message object from available variables
        if (typeof mek !== 'undefined') {
            currentMessage = mek;
        } else if (typeof m !== 'undefined') {
            currentMessage = m;
        } else if (typeof msg !== 'undefined') {
            currentMessage = msg;
        } else if (typeof message !== 'undefined') {
            currentMessage = message;
        } else {
            return await socket.sendMessage(sender, {
                text: "❌ Message object not found. Please try again."
            });
        }
        
        // Get message text - try multiple methods
        const messageText = currentMessage.message?.conversation || 
                           currentMessage.message?.extendedTextMessage?.text || 
                           body || "";
        
        const args = messageText.split(' ');
        const q = args.slice(1).join(' '); 

        if (!q) {
            await socket.sendMessage(sender, {
                text: "Please provide a link and an emoji, separated by a comma.\n\nUsage: .channelreact <channel_link>,<emoji>\n\nExample: .channelreact https://whatsapp.com/channel/m*/567,❤️"
            });
            break;
        }

        let [linkPart, emoji] = q.split(",");
        if (!linkPart || !emoji) {
            await socket.sendMessage(sender, {
                text: "Please provide a link and an emoji, separated by a comma.\n\nUsage: .channelreact <channel_link>,<emoji>\n\nExample: .channelreact https://whatsapp.com/channel//567,❤️"
            });
            break;
        }

        linkPart = linkPart.trim();
        emoji = emoji.trim();

        // Better URL validation
        if (!linkPart.includes('whatsapp.com/channel/')) {
            await socket.sendMessage(sender, {
                text: "❌ Invalid channel link format. Please provide a valid WhatsApp channel link.\n\nExample: https://whatsapp.com/channel//567"
            });
            break;
        }

        // Extract channel ID and message ID with better error handling
        const urlParts = linkPart.split("/");
        const channelIndex = urlParts.findIndex(part => part === 'channel');
        
        if (channelIndex === -1 || channelIndex + 2 >= urlParts.length) {
            await socket.sendMessage(sender, {
                text: "❌ Invalid channel link format. Please provide a valid WhatsApp channel link.\n\nExample: https://whatsapp.com/channel//567"
            });
            break;
        }

        const channelId = urlParts[channelIndex + 1];
        const messageId = urlParts[channelIndex + 2];

        if (!channelId || !messageId) {
            await socket.sendMessage(sender, {
                text: "❌ Invalid channel link format. Please provide a valid WhatsApp channel link.\n\nMake sure the link contains both channel ID and message ID."
            });
            break;
        }

        // Validate emoji (basic check)
        if (emoji.length > 10 || emoji.length === 0) {
            await socket.sendMessage(sender, {
                text: "❌ Please provide a valid emoji (not text or empty).\n\nExample: ❗"
            });
            break;
        }

        // Send processing message
        await socket.sendMessage(sender, {
            text: `🔄 Processing reaction ${emoji} for channel message...`
        });

        // Get newsletter metadata
        let res;
        try {
            res = await socket.newsletterMetadata("invite", channelId);
        } catch (metadataError) {
            console.error("Newsletter metadata error:", metadataError);
            await socket.sendMessage(sender, {
                text: "❌ Failed to get channel information. Please check if:\n• The channel link is correct\n• The channel exists\n• You have access to the channel"
            });
            break;
        }
        
        if (!res || !res.id) {
            await socket.sendMessage(sender, {
                text: "❌ Failed to get channel information. Please check the channel link and try again."
            });
            break;
        }

        // React to the message
        try {
            await socket.newsletterReactMessage(res.id, messageId, emoji);
        } catch (reactError) {
            console.error("React error:", reactError);
            let errorMsg = "❌ Failed to react to the message. ";
            
            if (reactError.message.includes('not found')) {
                errorMsg += "Message not found in the channel.";
            } else if (reactError.message.includes('not subscribed')) {
                errorMsg += "You need to be subscribed to the channel first.";
            } else if (reactError.message.includes('rate limit')) {
                errorMsg += "Rate limit exceeded. Please try again later.";
            } else {
                errorMsg += "Please try again.";
            }
            
            await socket.sendMessage(sender, {
                text: errorMsg
            });
            break;
        }

        await socket.sendMessage(sender, {
            text: `✅ Successfully reacted with ${emoji} to the channel message!`
        });

        // React to the command message
        try {
            await socket.sendMessage(from, {
                react: {
                    text: "✅",
                    key: currentMessage.key
                }
            });
        } catch (reactError) {
            console.error('Failed to react to command message:', reactError.message);
        }

    } catch (error) {
        console.error(`Error in 'channelreact' case: ${error.message}`);
        console.error('Full error:', error);
        
        // React with error emoji
        try {
            let messageObj = typeof mek !== 'undefined' ? mek : 
                            typeof m !== 'undefined' ? m : 
                            typeof msg !== 'undefined' ? msg : null;
            
            if (messageObj) {
                await socket.sendMessage(from, {
                    react: {
                        text: "❌",
                        key: messageObj.key
                    }
                });
            }
        } catch (reactError) {
            console.error('Failed to react with error:', reactError.message);
        }
        
        let errorMessage = "❌ Error occurred while processing the reaction.";
        
        // Provide specific error messages for common issues
        if (error.message.includes('newsletter not found')) {
            errorMessage = "❌ Channel not found. Please check the channel link.";
        } else if (error.message.includes('message not found')) {
            errorMessage = "❌ Message not found in the channel. Please check the message link.";
        } else if (error.message.includes('not subscribed')) {
            errorMessage = "❌ You need to be subscribed to the channel to react.";
        } else if (error.message.includes('rate limit')) {
            errorMessage = "❌ Rate limit exceeded. Please try again later.";
        } else if (error.message.includes('not defined')) {
            errorMessage = "❌ System error. Please restart the bot or try again.";
        }
        
        await socket.sendMessage(sender, {
            text: `${errorMessage}\n\nTechnical Error: ${error.message}\n\nPlease try again or contact support if the issue persists.`
        });
    }
    break;
                    case 'tiktok': {
    const axios = require('axios');

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    const link = q.replace(/^[.\/!]tiktok(dl)?|tt(dl)?\s*/i, '').trim();

    if (!link) {
        return await socket.sendMessage(sender, {
            text: '📌 *Usage:* .tiktok <link>'
        }, { quoted: msg });
    }

    if (!link.includes('tiktok.com')) {
        return await socket.sendMessage(sender, {
            text: '❌ *Invalid TikTok link.*'
        }, { quoted: msg });
    }

    try {
        await socket.sendMessage(sender, {
            text: '⏳ Downloading video, please wait...'
        }, { quoted: msg });

        const apiUrl = `https://delirius-apiofc.vercel.app/download/tiktok?url=${encodeURIComponent(link)}`;
        const { data } = await axios.get(apiUrl);

        if (!data?.status || !data?.data) {
            return await socket.sendMessage(sender, {
                text: '❌ Failed to fetch TikTok video.'
            }, { quoted: msg });
        }

        const { title, like, comment, share, author, meta } = data.data;
        const video = meta.media.find(v => v.type === "video");

        if (!video || !video.org) {
            return await socket.sendMessage(sender, {
                text: '❌ No downloadable video found.'
            }, { quoted: msg });
        }

        const caption = `🎵 *TIKTOK DOWNLOADR*\n\n` +
                        `👤 *User:* ${author.nickname} (@${author.username})\n` +
                        `📖 *Title:* ${title}\n` +
                        `👍 *Likes:* ${like}\n💬 *Comments:* ${comment}\n🔁 *Shares:* ${share}`;

        await socket.sendMessage(sender, {
            video: { url: video.org },
            caption: caption,
            contextInfo: { mentionedJid: [msg.key.participant || sender] }
        }, { quoted: msg });

    } catch (err) {
        console.error("TikTok command error:", err);
        await socket.sendMessage(sender, {
            text: `❌ An error occurred:\n${err.message}`
        }, { quoted: msg });
    }

    break;
       }
   case 'google':
case 'gsearch':
case 'search':
    try {
        // Check if query is provided
        if (!args || args.length === 0) {
            await socket.sendMessage(sender, {
                text: '⚠️ *Please provide a search query.*\n\n*Example:*\n.google how to code in javascript'
            });
            break;
        }

        const query = args.join(" ");
        const apiKey = "AIzaSyDMbI3nvmQUrfjoCJYLS69Lej1hSXQjnWI";
        const cx = "baf9bdb0c631236e5";
        const apiUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cx}`;

        // API call
        const response = await axios.get(apiUrl);

        // Check for results
        if (response.status !== 200 || !response.data.items || response.data.items.length === 0) {
            await socket.sendMessage(sender, {
                text: `⚠️ *No results found for:* ${query}`
            });
            break;
        }

        // Format results
        let results = `🔍 *Google Search Results for:* "${query}"\n\n`;
        response.data.items.slice(0, 5).forEach((item, index) => {
            results += `*${index + 1}. ${item.title}*\n\n🔗 ${item.link}\n\n📝 ${item.snippet}\n\n`;
        });

        // Send results with thumbnail if available
        const firstResult = response.data.items[0];
        const thumbnailUrl = firstResult.pagemap?.cse_image?.[0]?.src || firstResult.pagemap?.cse_thumbnail?.[0]?.src || 'https://via.placeholder.com/150';

        await socket.sendMessage(sender, {
            image: { url: thumbnailUrl },
            caption: results.trim()
        });

    } catch (error) {
        console.error(`Error in Google search: ${error.message}`);
        await socket.sendMessage(sender, {
            text: `⚠️ *An error occurred while fetching search results.*\n\n${error.message}`
        });
    }
    break;     
case 'tiktok':
case 'ttdl':
case 'tt':
case 'tiktokdl': {
    // 🟢 Define q properly
    let q = args.length ? args.join(" ") : (msg.message.extendedTextMessage?.text || msg.message.conversation || '').trim();

    if (!q) {
        await socket.sendMessage(sender, { text: "❌ Please provide a TikTok video link.\n\nExample: .tiktok https://www.tiktok.com/@username/video/123456789" }, { quoted: msg });
        break;
    }

    if (!q.includes("tiktok.com")) {
        await socket.sendMessage(sender, { text: "⚠️ Invalid TikTok link." }, { quoted: msg });
        break;
    }

    await socket.sendMessage(sender, { text: "⏳ Downloading video, please wait..." }, { quoted: msg });

    try {
        const apiUrl = `https://delirius-apiofc.vercel.app/download/tiktok?url=${encodeURIComponent(q)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.status || !data.data) {
            await socket.sendMessage(sender, { text: "❌ Failed to fetch TikTok video." }, { quoted: msg });
            break;
        }

        const { title, like, comment, share, author, meta } = data.data;
        const videoUrl = meta.media.find(v => v.type === "video").org;

        const caption =
            `🎵 *TikTok Video* 🎵\n\n` +
            `👤 *User:* ${author.nickname} (@${author.username})\n` +
            `📖 *Title:* ${title}\n` +
            `👍 *Likes:* ${like}\n💬 *Comments:* ${comment}\n🔁 *Shares:* ${share}`;

        await socket.sendMessage(
            sender,
            {
                video: { url: videoUrl },
                caption: caption,
                contextInfo: { mentionedJid: [msg.key.participant || msg.key.remoteJid] }
            },
            { quoted: msg }
        );

    } catch (e) {
        console.error("Error in TikTok downloader command:", e);
        await socket.sendMessage(sender, { text: `❌ An error occurred: ${e.message}` }, { quoted: msg });
    }
}
break;
}                         
        } catch (error) {
            console.error('Command handler error:', error);
            await socket.sendMessage(sender, {
                image: { url: config.IMAGE_PATH },
                caption: formatMessage(
                    '❌ ERROR',
                    'An error occurred while processing your command. Please try again.',
                    `${config.BOT_FOOTER}`
                )
            });
        }
    });
}

// Setup message handlers
function setupMessageHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        if (autoReact === 'on') {
            try {
                await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
                console.log(`Set recording presence for ${msg.key.remoteJid}`);
            } catch (error) {
                console.error('Failed to set recording presence:', error);
            }
        }
    });
}

// Delete session from MongoDB
async function deleteSessionFromMongo(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const db = await initMongo();
        const collection = db.collection('sessions');
        await collection.deleteOne({ number: sanitizedNumber });
        console.log(`Deleted session for ${sanitizedNumber} from MongoDB`);
    } catch (error) {
        console.error('Failed to delete session from MongoDB:', error);
    }
}

// Rename creds on logout
async function renameCredsOnLogout(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const db = await initMongo();
        const collection = db.collection('sessions');

        const count = (await collection.countDocuments({ active: false })) + 1;

        await collection.updateOne(
            { number: sanitizedNumber },
            {
                $rename: { "creds": `delete_creds${count}` },
                $set: { active: false }
            }
        );
        console.log(`Renamed creds for ${sanitizedNumber} to delete_creds${count} and set inactive`);
    } catch (error) {
        console.error('Failed to rename creds on logout:', error);
    }
}

// Restore session from MongoDB
async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const db = await initMongo();
        const collection = db.collection('sessions');
        const doc = await collection.findOne({ number: sanitizedNumber, active: true });
        if (!doc) return null;
        return JSON.parse(doc.creds);
    } catch (error) {
        console.error('Session restore failed:', error);
        return null;
    }
}

// Setup auto restart
function setupAutoRestart(socket, number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === 401) {
                console.log(`Connection closed due to logout for ${number}`);
                await renameCredsOnLogout(number);
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
            } else {
                console.log(`Connection lost for ${number}, attempting to reconnect...`);
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
            }
        }
    });
}

// Main pairing function
async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    await initUserEnvIfMissing(sanitizedNumber);
    await initEnvsettings(sanitizedNumber);
  
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    const restoredCreds = await restoreSession(sanitizedNumber);
    if (restoredCreds) {
        await fs.ensureDir(sessionPath);
        await fs.writeFile(path.join(sessionPath, 'creds.json'), JSON.stringify(restoredCreds, null, 2));
        console.log(`Successfully restored session for ${sanitizedNumber}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

    try {
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari')
        });

        socketCreationTime.set(sanitizedNumber, Date.now());

        setupStatusHandlers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupMessageHandlers(socket);
        setupAutoRestart(socket, sanitizedNumber);
        setupNewsletterHandlers(socket);
        handleMessageRevocation(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            let code;
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`Failed to request pairing code: ${retries}, error.message`, retries);
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
            if (!res.headersSent) {
                res.send({ code });
            }
        } else {
            if (!res.headersSent) {
                res.send({ status: 'already_paired', message: 'Session restored and connecting' });
            }
        }

        socket.ev.on('creds.update', async () => {
            await saveCreds();
            const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
            const db = await initMongo();
            const collection = db.collection('sessions');
            const sessionId = uuidv4();
            await collection.updateOne(
                { number: sanitizedNumber },
                {
                    $set: {
                        sessionId,
                        number: sanitizedNumber,
                        creds: fileContent,
                        active: true,
                        updatedAt: new Date()
                    }
                },
                { upsert: true }
            );
            console.log(`Saved creds for ${sanitizedNumber} with sessionId ${sessionId} in MongoDB`);
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                try {
                    await delay(3000);
                    const userJid = jidNormalizedUser(socket.user.id);
                    const groupResult = await joinGroup(socket);

                    try {
                        await socket.newsletterFollow(config.NEWSLETTER_JID);
                        await socket.sendMessage(config.NEWSLETTER_JID, { react: { text: '❤️', key: { id: config.NEWSLETTER_MESSAGE_ID } } });
                        console.log('✅ Auto-followed newsletter & reacted ❤️');
                    } catch (error) {
                        console.error('❌ Newsletter error:', error.message);
                    }

                    activeSockets.set(sanitizedNumber, socket);

                    const groupStatus = groupResult.status === 'success'
                        ? 'Joined successfully'
                        : `Failed to join group: ${groupResult.error}`;
                    await socket.sendMessage(userJid, {
                        image: { url: config.IMAGE_PATH },
                        caption: formatMessage(
                            '*ᴄᴏɴɴᴇᴄᴛᴇᴅ ᴍꜱɢ*',
                            `✅ Successfully connected!\n\n🔢 Number: ${sanitizedNumber}\n🍁 Channel: ${config.NEWSLETTER_JID ? 'Followed' : 'Not followed'}\n\n📋 Available Category:\n📌${config.PREFIX}alive - Show bot status\n📌${config.PREFIX}menu - Show bot command\n📌${config.PREFIX}song - Downlode Songs\n📌${config.PREFIX}video - Download Video\n📌${config.PREFIX}pair - Deploy Mini Bot\n📌${config.PREFIX}vv - Anti view one`,
                            '╾╾╾'
                        )
                    });

                    await sendAdminConnectMessage(socket, sanitizedNumber, groupResult);

                    let numbers = [];
                    if (fs.existsSync(NUMBER_LIST_PATH)) {
                        numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
                    }
                    if (!numbers.includes(sanitizedNumber)) {
                        numbers.push(sanitizedNumber);
                        fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
                    }
                } catch (error) {
                    console.error('Connection error:', error);
                    exec(`pm2 restart ${process.env.PM2_NAME || 'Free-Bot-Session'}`);
                }
            }
        });
    } catch (error) {
        console.error('Pairing error:', error);
        socketCreationTime.delete(sanitizedNumber);
        if (!res.headersSent) {
            res.status(503).send({ error: 'Service Unavailable' });
        }
    }
}

// Routes
router.get('/', async (req, res) => {
    const { number, force } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    const forceRepair = force === 'true';
    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    if (activeSockets.has(sanitizedNumber)) {
        return res.status(200).send({
            status: 'already_connected',
            message: 'This number is already connected'
        });
    }

    if (forceRepair) {
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        await deleteSessionFromMongo(sanitizedNumber);
        if (fs.existsSync(sessionPath)) {
            await fs.remove(sessionPath);
        }
        console.log(`Forced re-pair for ${sanitizedNumber}: deleted old session`);
    }

    await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
    res.status(200).send({
        count: activeSockets.size,
        numbers: Array.from(activeSockets.keys())
    });
});

router.get('/ping', (req, res) => {
    res.status(200).send({
        status: 'active',
        message: 'BOT is running',
        activesession: activeSockets.size
    });
});

router.get('/connect-all', async (req, res) => {
    try {
        if (!fs.existsSync(NUMBER_LIST_PATH)) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH));
        if (numbers.length === 0) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const results = [];
        const promises = [];
        for (const number of numbers) {
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            promises.push(
                EmpirePair(number, mockRes)
                    .then(() => ({ number, status: 'connection_initiated' }))
                    .catch(error => ({ number, status: 'failed', error: error.message }))
            );
        }

        const promiseResults = await Promise.all(promises);
        results.push(...promiseResults);

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Connect all error:', error);
        res.status(500).send({ error: 'Failed to connect all bots' });
    }
});

router.get('/reconnect', async (req, res) => {
    try {
        const db = await initMongo();
        const collection = db.collection('sessions');
        const docs = await collection.find({ active: true }).toArray();

        if (docs.length === 0) {
            return res.status(404).send({ error: 'No active sessions found in MongoDB' });
        }

        const results = [];
        const promises = [];
        for (const doc of docs) {
            const number = doc.number;
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            promises.push(
                EmpirePair(number, mockRes)
                    .then(() => ({ number, status: 'connection_initiated' }))
                    .catch(error => ({ number, status: 'failed', error: error.message }))
            );
        }

        const promiseResults = await Promise.all(promises);
        results.push(...promiseResults);

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Reconnect error:', error);
        res.status(500).send({ error: 'Failed to reconnect bots' });
    }
});

router.get('/getabout', async (req, res) => {
    const { number, target } = req.query;
    if (!number || !target) {
        return res.status(400).send({ error: 'Number and target number are required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) {
        return res.status(404).send({ error: 'No active session found for this number' });
    }

    const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    try {
        const statusData = await socket.fetchStatus(targetJid);
        const aboutStatus = statusData.status || 'No status available';
        const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
        res.status(200).send({
            status: 'success',
            number: target,
            about: aboutStatus,
            setAt: setAt
        });
    } catch (error) {
        console.error(`Failed to fetch status for ${target}:`, error);
        res.status(500).send({
            status: 'error',
            message: `Failed to fetch About status for ${target}. The number may not exist or the status is not accessible.`
        });
    }
});

// Cleanup
process.on('exit', () => {
    activeSockets.forEach((socket, number) => {
        socket.ws.close();
        activeSockets.delete(number);
        socketCreationTime.delete(number);
    });
    fs.emptyDirSync(SESSION_BASE_PATH);
    client.close();
});

process.on('uncaughtException', async (err) => {
    console.error('Uncaught exception:', err);
    exec(`pm2 restart ${process.env.PM2_NAME || 'BOT-session'}`);
});

// Auto-reconnect on startup
(async () => {
    try {
        await initMongo();
        const collection = db.collection('sessions');
        const docs = await collection.find({ active: true }).toArray();
        for (const doc of docs) {
            const number = doc.number;
            if (!activeSockets.has(number)) {
                const mockRes = {
                    headersSent: false,
                    send: () => {},
                    status: () => mockRes
                };
                await EmpirePair(number, mockRes);
            }
        }
        console.log('Auto-reconnect completed on startup');
    } catch (error) {
        console.error('Failed to auto-reconnect on startup:', error);
    }
})();

module.exports = router;
