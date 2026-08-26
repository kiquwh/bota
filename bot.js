const fetch = require('node-fetch');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = "8751373370:AAFDeoi7OIeelK53RJYrh9xgsvY0HVy8oGI";
const OWNER_ID = 8854073031;
const CHANNEL_USERNAME = "@Hajghasem12"; // آیدی کانال برای عضویت اجباری
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = {
    users: {},
    all_users: [],
    proxies: [],
    admins: {},
    actions: {},
    daily_req: {},
    support_targets: {}
};

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(data);
            console.log("Database loaded successfully.");
        }
    } catch (err) {
        console.error("Error loading database:", err);
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (err) {
        console.error("Error saving database:", err);
    }
}

loadDatabase();

async function sendTelegram(method, body) {
    try {
        const response = await fetch(`${TELEGRAM_API}/${method}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        return await response.json();
    } catch (err) {
        console.error("Telegram API Error:", err);
        return null;
    }
}

// تابع بررسی عضویت کاربر در کانال
async function checkMembership(userId) {
    try {
        const res = await sendTelegram("getChatMember", {
            chat_id: CHANNEL_USERNAME,
            user_id: userId
        });
        if (res && res.ok && res.result) {
            const status = res.result.status;
            // وضعیت‌های قابل قبول عضویت
            if (["creator", "administrator", "member"].includes(status)) {
                return true;
            }
        }
        return false;
    } catch (err) {
        console.error("Error checking membership:", err);
        return true; // اگر خطایی شد برای جلوگیری از قفل شدن ربات، عبور می‌دهیم
    }
}

async function isAdminOrOwner(userId) {
    if (Number(userId) === Number(OWNER_ID)) return true;
    return db.admins[userId] === true;
}

function isOwner(userId) {
    return Number(userId) === Number(OWNER_ID);
}

async function handleUpdate(update) {
    try {
        if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
            return;
        }

        if (update.message) {
            await handleMessage(update.message);
            return;
        }
    } catch (err) {
        console.error("Error handling update:", err);
    }
}

async function handleMessage(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text || "";
    const fullName = (msg.from.first_name || "") + " " + (msg.from.last_name || "");
    const username = msg.from.username ? `@${msg.from.username}` : "ندارد";

    if (!db.users[userId]) {
        db.users[userId] = {
            id_code: userId,
            username: username,
            full_name: fullName,
            is_banned: false,
            ban_reason: "",
            joined_at: new Date().toISOString()
        };

        if (!db.all_users.includes(userId)) {
            db.all_users.push(userId);
        }
        saveDatabase();

        const notifyText = `🚨 کاربر جدید ربات رو استارت کرد!\n👤 نام: ${fullName}\n🔗 آیدی: ${username}\n🆔 آیدی عددی: <code>${userId}</code>`;
        await sendTelegram("sendMessage", { chat_id: OWNER_ID, text: notifyText, parse_mode: "HTML" });
    }

    let userData = db.users[userId];

    if (userData.is_banned && !await isAdminOrOwner(userId)) {
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: `🚫 حاج گاسم تصمیم گرفت! 🧔‍♂️\nسلام رفیق 👋\nدسترسی شما به ربات بسته شد ⛔\n📌 دلیل بن شدن:\n${userData.ban_reason || 'نامشخص'}\n📡 فعلاً پروکسی گرفتن از حاجی برای شما متوقف شده 😂\n👑 مدیریت حاج گاسم`
        });
        return;
    }

    // 🔒 بررسی عضویت اجباری در کانال (برای غیر-ادمین‌ها)
    if (!await isAdminOrOwner(userId)) {
        const isMember = await checkMembership(userId);
        if (!isMember) {
            await sendTelegram("sendMessage", {
                chat_id: chatId,
                text: `⚠️ رفیق عزیز برای استفاده از ربات حاج گاسم، اول باید توی کانال زیر عضو بشی:\n\n🔗 ${CHANNEL_USERNAME}\n\n👇 بعد از عضویت، روی دکمه‌ی زیر بزن تا رباتت فعال بشه:`,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📢 ورود به کانال حاجی", url: `https://t.me/Hajghasem12` }],
                        [{ text: "✅ عضو شدم، بررسی کن", callback_data: "check_join" }]
                    ]
                }
            });
            return;
        }
    }

    if (text === "🔙 بازگشت" || text === "/start") {
        delete db.actions[userId];
        saveDatabase();
        let keyboard = [
            [{ text: "😎 گاسم، پروکسی بده" }, { text: "⚡️ اتصال شانسی (تک‌کلیکی)" }],
            [{ text: "🔁 آپدیت کن حاج گاسمو" }, { text: "🛠 پشتیبانی حاجی" }],
            [{ text: "📦 حاجی شارژ کن" }]
        ];

        if (await isAdminOrOwner(userId)) {
            keyboard.push([{ text: "👑 فرماندهی حاجی" }]);
        }

        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: `🧔‍♂️ سلام رفیق، خوش اومدی به حاج گاسم 😎\n📡 اینجا پاتوق پروکسی‌های رایگان و آماده‌ی حرکته!\nحاج گاسم هر روز می‌گرده، پروکسی‌های بهتر رو پیدا می‌کنه و میاره برات 🚀\n\n🔥 امکانات:\n• دریافت پروکسی رایگان و شانسی\n• پروکسی‌های جدید و بروزشده\n• استفاده سریع و راحت\n\n😎 فقط کافیه یه دکمه بزنی...\nبقیه کارا رو بسپار به حاج گاسم!`,
            reply_markup: { keyboard: keyboard, resize_keyboard: true }
        });
        return;
    }

    if (text === "😎 گاسم، پروکسی بده") {
        if (db.proxies.length === 0) {
            await sendTelegram("sendMessage", { chat_id: chatId, text: "🧔‍♂️ فعلاً انبار حاجی خالیه رفیق! به‌زودی پروکسی میذاریم." });
            return;
        }

        let inlineKeyboard = [];
        let currentRow = [];

        db.proxies.forEach((p) => {
            currentRow.push({ text: `🔗 ${p.name}`, url: p.link });
            if (currentRow.length === 2) {
                inlineKeyboard.push(currentRow);
                currentRow = [];
            }
        });

        if (currentRow.length > 0) {
            inlineKeyboard.push(currentRow);
        }

        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "⚡️ لیست پروکسی‌های انبار حاجی",
            reply_markup: { inline_keyboard: inlineKeyboard }
        });
        return;
    }

    if (text === "⚡️ اتصال شانسی (تک‌کلیکی)") {
        if (db.proxies.length === 0) {
            await sendTelegram("sendMessage", { chat_id: chatId, text: "🧔‍♂️ انبار حاجی خالیه رفیق! فعلاً پروکسی وجود نداره." });
            return;
        }

        const randomIndex = Math.floor(Math.random() * db.proxies.length);
        const randomProxy = db.proxies[randomIndex];

        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: `🎲 شانس امروزت این دراومد رفیق!\n📦 نام: ${randomProxy.name}\n\nروی دکمه زیر بزن تا مستقیم متصل بشی:`,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "⚡️ بزن برای اتصال فوری به پروکسی", url: randomProxy.link }]
                ]
            }
        });
        return;
    }

    if (text === "🔁 آپدیت کن حاج گاسمو") {
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "✅ حاج گاسم آپدیت شد!",
            reply_markup: { remove_keyboard: true }
        });
        msg.text = "/start";
        await handleMessage(msg);
        return;
    }

    if (text === "🛠 پشتیبانی حاجی") {
        db.actions[userId] = "support_text";
        saveDatabase();
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "✍️ لطفاً پیام خود را برای پشتیبانی ارسال کنید:",
            reply_markup: { keyboard: [[{ text: "🔙 بازگشت" }]], resize_keyboard: true }
        });
        return;
    }

    if (text === "📦 حاجی شارژ کن") {
        const today = new Date().toISOString().split('T')[0];
        const reqKey = `${userId}:${today}`;

        if (db.daily_req[reqKey]) {
            await sendTelegram("sendMessage", { chat_id: chatId, text: "⚠️ رفیق، شما امروز درخواست دادید! هر روز فقط یک بار می‌تونید درخواست کنید." });
            return;
        }

        db.daily_req[reqKey] = true;
        saveDatabase();
        const reqMsg = `📦 کاربر درخواست پروکسی دارد!\n👤 نام: ${fullName}\n🆔 آیدی عددی: <code>${userId}</code>`;
        await sendTelegram("sendMessage", { chat_id: OWNER_ID, text: reqMsg, parse_mode: "HTML" });
        await sendTelegram("sendMessage", { chat_id: chatId, text: "✅ درخواست شما برای مدیریت ارسال شد. حاجی به‌زودی انبار رو شارژ می‌کنه! 😎" });
        return;
    }

    if (text === "👑 فرماندهی حاجی") {
        if (!await isAdminOrOwner(userId)) {
            await sendTelegram("sendMessage", { chat_id: chatId, text: "❌ شما دسترسی به این بخش ندارید!" });
            return;
        }

        let adminKeyboard = [
            [{ text: "🚨 اعلامیه حاجی" }, { text: "🛠 اضافه کردن سوغات حاجی" }],
            [{ text: "📥 مکش پروکسی از کانال" }, { text: "❌ فرستادن پروکسی به بازنشستگی" }],
            [{ text: "👥 لشکر حاجی" }, { text: "🚫 اخراج از جمع حاجی" }],
            [{ text: "🧔‍♂️ حاجی بخشید" }]
        ];

        if (isOwner(userId)) {
            adminKeyboard.push([{ text: "👑 معاون حاجی" }, { text: "❌ حذف معاون حاجی" }]);
            adminKeyboard.push([{ text: "👑 معاون ها باشه" }]);
        }
        adminKeyboard.push([{ text: "🔙 بازگشت" }]);

        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "👑 به پنل فرماندهی حاج گاسم خوش آمدید:",
            reply_markup: { keyboard: adminKeyboard, resize_keyboard: true }
        });
        return;
    }

    if (text === "👑 معاون ها باشه" && isOwner(userId)) {
        const adminIds = Object.keys(db.admins).filter(id => db.admins[id]);
        if (adminIds.length === 0) {
            await sendTelegram("sendMessage", { chat_id: chatId, text: "⚠️ هیچ معاون فعالی ثبت نشده است." });
            return;
        }
        let listText = "👑 لیست معاون‌های حاجی:\n\n";
        for (let admId of adminIds) {
            let admData = db.users[admId];
            let name = admData ? admData.full_name : "ناشناس";
            let username = admData ? admData.username : "ندارد";
            listText += `👤 نام: ${name}\n🔗 آیدی: ${username}\n🆔 آیدی عددی: <code>${admId}</code>\n------------------\n`;
        }
        await sendTelegram("sendMessage", { chat_id: chatId, text: listText, parse_mode: "HTML" });
        return;
    }

    if (text === "👥 لشکر حاجی" && await isAdminOrOwner(userId)) {
        if (db.all_users.length === 0) {
            await sendTelegram("sendMessage", { chat_id: chatId, text: "⚠️ هیچ کاربری ثبت نشده است." });
            return;
        }
        let userList = "👥 لشکر حاج گاسم:\n\n";
        for (let uId of db.all_users) {
            let uData = db.users[uId];
            if (uData) {
                let status = uData.is_banned ? " [بن شده]" : "";
                userList += `👤 ${uData.full_name}\n🔗 ${uData.username}\n🆔 <code>${uData.id_code}</code>${status}\n------------------\n`;
            }
        }
        await sendTelegram("sendMessage", { chat_id: chatId, text: userList, parse_mode: "HTML" });
        return;
    }

    if (text === "🚨 اعلامیه حاجی" && await isAdminOrOwner(userId)) {
        db.actions[userId] = "broadcast";
        saveDatabase();
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "✍️ لطفاً متن اعلامیه خود را ارسال کنید:",
            reply_markup: { keyboard: [[{ text: "🔙 بازگشت" }]], resize_keyboard: true }
        });
        return;
    }

    if (text === "🛠 اضافه کردن سوغات حاجی" && await isAdminOrOwner(userId)) {
        db.actions[userId] = "add_proxy";
        saveDatabase();
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "🔗 لطفاً فقط لینک پروکسی را ارسال کنید:",
            reply_markup: { keyboard: [[{ text: "🔙 بازگشت" }]], resize_keyboard: true }
        });
        return;
    }

    if (text === "📥 مکش پروکسی از کانال" && await isAdminOrOwner(userId)) {
        db.actions[userId] = "fetch_channel";
        saveDatabase();
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "📡 آیدی یا لینک کانال مورد نظر را بفرستید (مثال: @ProxyChannel):",
            reply_markup: { keyboard: [[{ text: "🔙 بازگشت" }]], resize_keyboard: true }
        });
        return;
    }

    if (text === "❌ فرستادن پروکسی به بازنشستگی" && await isAdminOrOwner(userId)) {
        if (db.proxies.length === 0) {
            await sendTelegram("sendMessage", { chat_id: chatId, text: "⚠️ پروکسی فعالی وجود ندارد." });
            return;
        }
        let inlineKeyboard = [];
        db.proxies.forEach((p, index) => {
            inlineKeyboard.push([{ text: `❌ حذف: ${p.name}`, callback_data: `del_proxy_${index}` }]);
        });
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "🗑 برای حذف هر پروکسی روی دکمه‌ی آن بزنید:",
            reply_markup: { inline_keyboard: inlineKeyboard }
        });
        return;
    }

    if (text === "🚫 اخراج از جمع حاجی" && await isAdminOrOwner(userId)) {
        db.actions[userId] = "ban_target";
        saveDatabase();
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "🆔 آیدی عددی کاربری که می‌خواهید بن کنید را بفرستید:",
            reply_markup: { keyboard: [[{ text: "🔙 بازگشت" }]], resize_keyboard: true }
        });
        return;
    }

    if (text === "🧔‍♂️ حاجی بخشید" && await isAdminOrOwner(userId)) {
        db.actions[userId] = "unban_target";
        saveDatabase();
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "🆔 آیدی عددی کاربری که می‌خواهید آنبن کنید را بفرستید:",
            reply_markup: { keyboard: [[{ text: "🔙 بازگشت" }]], resize_keyboard: true }
        });
        return;
    }

    if (text === "👑 معاون حاجی" && isOwner(userId)) {
        db.actions[userId] = "add_admin";
        saveDatabase();
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "🆔 آیدی عددی فرد مورد نظر برای انتصاب به عنوان معاون را بفرستید:",
            reply_markup: { keyboard: [[{ text: "🔙 بازگشت" }]], resize_keyboard: true }
        });
        return;
    }

    if (text === "❌ حذف معاون حاجی" && isOwner(userId)) {
        db.actions[userId] = "remove_admin";
        saveDatabase();
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "🆔 آیدی عددی مدیری که می‌خواهید حذف کنید را بفرستید:",
            reply_markup: { keyboard: [[{ text: "🔙 بازگشت" }]], resize_keyboard: true }
        });
        return;
    }

    let action = db.actions[userId];
    if (action) {
        if (action === "broadcast") {
            const broadcastMsg = `🚨 خبر از دفتر حاج گاسم:\n📩 پیام مدیریت:\n${text}\n\nحاجی گفت اینو بهتون بگیم 😎`;
            for (let uId of db.all_users) {
                let userKeyboard = [
                    [{ text: "😎 گاسم، پروکسی بده" }, { text: "⚡️ اتصال شانسی (تک‌کلیکی)" }],
                    [{ text: "🔁 آپدیت کن حاج گاسمو" }, { text: "🛠 پشتیبانی حاجی" }],
                    [{ text: "📦 حاجی شارژ کن" }]
                ];
                if (await isAdminOrOwner(uId)) {
                    userKeyboard.push([{ text: "👑 فرماندهی حاجی" }]);
                }
                await sendTelegram("sendMessage", {
                    chat_id: uId,
                    text: broadcastMsg,
                    reply_markup: { keyboard: userKeyboard, resize_keyboard: true }
                });
            }
            delete db.actions[userId];
            saveDatabase();
            await sendTelegram("sendMessage", {
                chat_id: chatId,
                text: "✅ اعلامیه با موفقیت به همه ارسال شد!",
                reply_markup: { keyboard: [[{ text: "👑 فرماندهی حاجی" }, { text: "🔙 بازگشت" }]], resize_keyboard: true }
            });
            return;
        }

        if (action === "add_proxy") {
            const proxyLink = text.trim();
            const numbersMap = ["اولین", "دومین", "سومین", "چهارمین", "پنجمین", "ششمین", "هفتمین", "هشتمین", "نهمین", "دهمین"];
            let proxyName = numbersMap[db.proxies.length] ? `${numbersMap[db.proxies.length]} پروکسی` : `پروکسی شماره ${db.proxies.length + 1}`;

            db.proxies.push({ name: proxyName, link: proxyLink });
            delete db.actions[userId];
            saveDatabase();
            await sendTelegram("sendMessage", {
                chat_id: chatId,
                text: `✅ پروکسی با عنوان "${proxyName}" در انبار حاجی ثبت شد!`,
                reply_markup: { keyboard: [[{ text: "👑 فرماندهی حاجی" }, { text: "🔙 بازگشت" }]], resize_keyboard: true }
            });
            return;
        }

        if (action === "fetch_channel") {
            delete db.actions[userId];
            saveDatabase();
            await sendTelegram("sendMessage", {
                chat_id: chatId,
                text: `✅ عملیات بررسی کانال انجام شد.`,
                reply_markup: { keyboard: [[{ text: "👑 فرماندهی حاجی" }, { text: "🔙 بازگشت" }]], resize_keyboard: true }
            });
            return;
        }

        if (action === "ban_target") {
            const targetId = text.trim();
            db.actions[`temp_ban_${userId}`] = targetId;
            db.actions[userId] = "ban_reason";
            saveDatabase();
            await sendTelegram("sendMessage", { chat_id: chatId, text: "✍️ دلیل بن شدن کاربر را وارد کنید:" });
            return;
        }

        if (action === "ban_reason") {
            const targetId = db.actions[`temp_ban_${userId}`];
            const reason = text.trim();
            if (db.users[targetId]) {
                db.users[targetId].is_banned = true;
                db.users[targetId].ban_reason = reason;
                await sendTelegram("sendMessage", {
                    chat_id: targetId,
                    text: `🚫 حاج گاسم تصمیم گرفت! 🧔‍♂️\nسلام رفیق 👋\nدسترسی شما به ربات بسته شد ⛔\n📌 دلیل بن شدن:\n${reason}\n📡 فعلاً پروکسی گرفتن از حاجی برای شما متوقف شده 😂\n👑 مدیریت حاج گاسم`
                });
            }
            delete db.actions[userId];
            delete db.actions[`temp_ban_${userId}`];
            saveDatabase();
            await sendTelegram("sendMessage", {
                chat_id: chatId,
                text: "✅ کاربر با موفقیت بن شد.",
                reply_markup: { keyboard: [[{ text: "👑 فرماندهی حاجی" }, { text: "🔙 بازگشت" }]], resize_keyboard: true }
            });
            return;
        }

        if (action === "unban_target") {
            const targetId = text.trim();
            if (db.users[targetId]) {
                db.users[targetId].is_banned = false;
                db.users[targetId].ban_reason = "";
                await sendTelegram("sendMessage", {
                    chat_id: targetId,
                    text: `🔓 حاج گاسم بخشید! 🧔‍♂️\nسلام رفیق 👋😎\nدسترسی شما دوباره فعال شد ✅\n👑 مدیریت حاج گاسم`
                });
            }
            delete db.actions[userId];
            saveDatabase();
            await sendTelegram("sendMessage", {
                chat_id: chatId,
                text: "✅ کاربر آنبن شد.",
                reply_markup: { keyboard: [[{ text: "👑 فرماندهی حاجی" }, { text: "🔙 بازگشت" }]], resize_keyboard: true }
            });
            return;
        }

        if (action === "add_admin") {
            const newAdminId = text.trim();
            db.admins[newAdminId] = true;
            delete db.actions[userId];
            saveDatabase();
            await sendTelegram("sendMessage", { chat_id: newAdminId, text: "🎉 شما مدیر شدید! یک بار روی دکمه آپدیت حاج گاسم بزن تا دکمه مدیریت بیاد." });
            await sendTelegram("sendMessage", {
                chat_id: chatId,
                text: "✅ معاون جدید اضافه شد.",
                reply_markup: { keyboard: [[{ text: "👑 فرماندهی حاجی" }, { text: "🔙 بازگشت" }]], resize_keyboard: true }
            });
            return;
        }

        if (action === "remove_admin") {
            const remAdminId = text.trim();
            delete db.admins[remAdminId];
            delete db.actions[userId];
            saveDatabase();
            await sendTelegram("sendMessage", { chat_id: remAdminId, text: "⚠️ شما توسط حاجی از مدیریت حذف شدید." });
            await sendTelegram("sendMessage", {
                chat_id: chatId,
                text: "✅ مدیر حذف شد.",
                reply_markup: { keyboard: [[{ text: "👑 فرماندهی حاجی" }, { text: "🔙 بازگشت" }]], resize_keyboard: true }
            });
            return;
        }

        if (action === "support_text") {
            delete db.actions[userId];
            saveDatabase();
            const supMsg = `🛠 پیام پشتیبانی جدید:\n👤 از طرف: <code>${userId}</code>\n💬 پیام:\n${text}`;
            await sendTelegram("sendMessage", {
                chat_id: OWNER_ID,
                text: supMsg,
                parse_mode: "HTML",
                reply_markup: { inline_keyboard: [[{ text: "💬 جواب دادن", callback_data: `reply_sup_${userId}` }]] }
            });
            await sendTelegram("sendMessage", {
                chat_id: chatId,
                text: "✅ پیام شما به پشتیبانی ارسال شد.",
                reply_markup: {
                    keyboard: [
                        [{ text: "😎 گاسم، پروکسی بده" }, { text: "⚡️ اتصال شانسی (تک‌کلیکی)" }],
                        [{ text: "🔁 آپدیت کن حاج گاسمو" }, { text: "🛠 پشتیبانی حاجی" }],
                        [{ text: "📦 حاجی شارژ کن" }],
                        [await isAdminOrOwner(userId) ? { text: "👑 فرماندهی حاجی" } : null].filter(Boolean)
                    ],
                    resize_keyboard: true
                }
            });
            return;
        }
    }

    let replyTarget = db.support_targets[userId];
    if (replyTarget) {
        delete db.support_targets[userId];
        saveDatabase();
        await sendTelegram("sendMessage", {
            chat_id: replyTarget,
            text: `📩 پیام از دفتر حاجی 🧔‍♂️\n\n${text}`,
            reply_markup: { inline_keyboard: [[{ text: "💬 جواب دادن", callback_data: `reply_sup_${userId}` }]] }
        });
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "✅ پاسخ برای کاربر ارسال شد.",
            reply_markup: { keyboard: [[{ text: "👑 فرماندهی حاجی" }, { text: "🔙 بازگشت" }]], resize_keyboard: true }
        });
        return;
    }
}

async function handleCallbackQuery(cq) {
    const data = cq.data;
    const userId = cq.from.id;
    const chatId = cq.message.chat.id;
    const messageId = cq.message.message_id;

    // دکمه بررسی عضویت کانال
    if (data === "check_join") {
        const isMember = await checkMembership(userId);
        if (isMember) {
            await sendTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: "عضویت شما تایید شد! خوش اومدی رفیق 🎉" });
            await sendTelegram("deleteMessage", { chat_id: chatId, message_id: messageId });
            
            // ارسال پیام شروع مجدد
            let keyboard = [
                [{ text: "😎 گاسم، پروکسی بده" }, { text: "⚡️ اتصال شانسی (تک‌کلیکی)" }],
                [{ text: "🔁 آپدیت کن حاج گاسمو" }, { text: "🛠 پشتیبانی حاجی" }],
                [{ text: "📦 حاجی شارژ کن" }]
            ];
            if (await isAdminOrOwner(userId)) {
                keyboard.push([{ text: "👑 فرماندهی حاجی" }]);
            }
            await sendTelegram("sendMessage", {
                chat_id: chatId,
                text: `🧔‍♂️ دمت گرم که عضو شدی! حالا ربات کاملاً برات فعاله. بزن بریم 😎`,
                reply_markup: { keyboard: keyboard, resize_keyboard: true }
            });
        } else {
            await sendTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: "هنوز تو کانال عضو نشدی رفیق! اول عضو شو بعد دکمه رو بزن ⚠️", show_alert: true });
        }
        return;
    }

    if (data.startsWith("del_proxy_")) {
        const index = parseInt(data.replace("del_proxy_", ""));
        if (db.proxies[index]) {
            db.proxies.splice(index, 1);
            saveDatabase();
        }
        await sendTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: "پروکسی حذف شد!" });
        await sendTelegram("editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: "✅ پروکسی مورد نظر با موفقیت حذف شد."
        });
        return;
    }

    if (data.startsWith("reply_sup_")) {
        const targetUserId = data.replace("reply_sup_", "");
        db.support_targets[userId] = targetUserId;
        saveDatabase();
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: `✍️ پاسخ خود را برای کاربر وارد کنید:`,
            reply_markup: { keyboard: [[{ text: "🔙 بازگشت" }]], resize_keyboard: true }
        });
        return;
    }
}

const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const update = JSON.parse(body);
                await handleUpdate(update);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
            } catch (err) {
                console.error(err);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            }
        });
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Haj Gasem Bot with Force Join is running! 😎');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
