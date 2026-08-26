const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = "8751373370:AAFDeoi7OIeelK53RJYrh9xgsvY0HVy8oGI";
const OWNER_ID = 8854073031;
const CHANNEL_USERNAME = "@Hajghasem12"; 
const BOT_USERNAME = "@HajGasemProxyBot";
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
    support_targets: {},
    spam_control: {},
    voted_proxies: {},
    support_targets_list: {},
    bot_settings: {
        is_maintenance: false,
        maintenance_reason: "بروزرسانی سیستم و انبار حاجی"
    }
};

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(data);
            if (!db.voted_proxies) db.voted_proxies = {};
            if (!db.bot_settings) {
                db.bot_settings = { is_maintenance: false, maintenance_reason: "بروزرسانی سیستم و انبار حاجی" };
            }
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

function sendTelegram(method, body) {
    return new Promise((resolve) => {
        const urlObj = new URL(`${TELEGRAM_API}/${method}`);
        const data = JSON.stringify(body);

        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let resData = '';
            res.on('data', chunk => { resData += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(resData));
                } catch (e) {
                    resolve(null);
                }
            });
        });

        req.on('error', (err) => {
            console.error("Telegram API Error:", err);
            resolve(null);
        });

        req.write(data);
        req.end();
    });
}

function pingProxy(proxyLink) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        try {
            const parsed = new URL(proxyLink);
            const reqOptions = {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'HEAD',
                timeout: 3000
            };

            const client = parsed.protocol === 'https:' ? https : http;
            const req = client.request(reqOptions, (res) => {
                const duration = Date.now() - startTime;
                resolve(`${duration}ms 🟢`);
                req.destroy();
            });

            req.on('timeout', () => {
                req.destroy();
                resolve("آفلاین / ضعیف 🔴");
            });

            req.on('error', () => {
                resolve("آفلاین / ضعیف 🔴");
            });

            req.end();
        } catch (e) {
            resolve("آفلاین / ضعیف 🔴");
        }
    });
}

async function checkMembership(userId) {
    try {
        const res = await sendTelegram("getChatMember", {
            chat_id: CHANNEL_USERNAME,
            user_id: userId
        });
        if (res && res.ok && res.result) {
            const status = res.result.status;
            if (["creator", "administrator", "member"].includes(status)) {
                return true;
            }
        }
        return false;
    } catch (err) {
        console.error("Error checking membership:", err);
        return true; 
    }
}

async function isAdminOrOwner(userId) {
    if (Number(userId) === Number(OWNER_ID)) return true;
    return db.admins && db.admins[userId] === true;
}

function isOwner(userId) {
    return Number(userId) === Number(OWNER_ID);
}

function checkSpam(userId) {
    const now = Date.now();
    if (!db.spam_control) db.spam_control = {};
    if (!db.spam_control[userId]) {
        db.spam_control[userId] = { timestamps: [], blocked_until: 0 };
    }
    
    let userSpam = db.spam_control[userId];
    if (userSpam.blocked_until > now) {
        return Math.ceil((userSpam.blocked_until - now) / 1000);
    }
    
    userSpam.timestamps = userSpam.timestamps.filter(t => now - t < 30000);
    userSpam.timestamps.push(now);
    
    if (userSpam.timestamps.length >= 8) {
        userSpam.blocked_until = now + (30 * 60 * 1000);
        saveDatabase();
        return 1800;
    }
    return 0;
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
    const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";

    if (isGroup) {
        if (text.toLowerCase().includes("پروکسی")) {
            if (!db.proxies || db.proxies.length === 0) {
                await sendTelegram("sendMessage", {
                    chat_id: chatId,
                    reply_to_message_id: msg.message_id,
                    text: "🧔‍♂️ فعلاً انبار حاج گاسم خالیه رفیق!"
                });
                return;
            }
            let inlineKeyboard = [];
            db.proxies.slice(0, 4).forEach((p) => {
                inlineKeyboard.push([{ text: `🔗 ${p.name} (⭐ ${p.stars || 0})`, url: p.link }]);
            });
            await sendTelegram("sendMessage", {
                chat_id: chatId,
                reply_to_message_id: msg.message_id,
                text: "⚡️ چند نمونه از پروکسی‌های انبار حاج گاسم:",
                reply_markup: { inline_keyboard: inlineKeyboard }
            });
        }
        return;
    }

    const userIsAdmin = await isAdminOrOwner(userId);
    if (db.bot_settings && db.bot_settings.is_maintenance && !userIsAdmin) {
        let action = db.actions && db.actions[userId];
        if (!action) {
            const reason = db.bot_settings.maintenance_reason || "در حال بروزرسانی سیستم";
            await sendTelegram("sendMessage", {
                chat_id: chatId,
                text: `🚧 حاج گاسم فعلاً در حال استراحت است 🧔‍♂️\nسلام رفیق 👋😎\nربات برای انجام کارهای فنی، بروزرسانی یا مدیریت سیستم موقتاً خاموش شده است ⚙️\n📌 دلیل:\n${reason}\n⏳ لطفاً کمی صبر کنید...\nحاجی در حال آماده‌سازی دوباره است و به‌زودی برمی‌گردد 🚀\n❤️ ممنون از همراهی شما\n🧔‍♂️ Gasem ProMax 📡\n\n🔗 آیدی بات: ${BOT_USERNAME}`
            });
            return;
        }
    }

    const spamSeconds = checkSpam(userId);
    if (spamSeconds > 0 && !userIsAdmin) {
        const mins = Math.ceil(spamSeconds / 60);
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: `🚫 شما به علت اسپم، ${mins} دقیقه سکوت خوردید! لطفاً آرامش خود را حفظ کنید 🧔‍♂️`
        });
        return;
    }

    if (!db.users) db.users = {};
    if (!db.all_users) db.all_users = [];

    let isNewUser = !db.users[userId];

    if (isNewUser) {
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

    if (userData.is_banned && !userIsAdmin) {
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: `🚫 حاج گاسم تصمیم گرفت! 🧔‍♂️\nسلام رفیق 👋\nدسترسی شما به ربات بسته شد ⛔\n📌 دلیل بن شدن:\n${userData.ban_reason || 'نامشخص'}\n📡 فعلاً پروکسی گرفتن از حاجی برای شما متوقف شده 😂\n👑 مدیریت حاج گاسم`
        });
        return;
    }

    if (!userIsAdmin) {
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

    if (!db.actions) db.actions = {};

    if (text === "🔙 بازگشت" || text.startsWith("/start")) {
        if (text.startsWith("/start") && !isNewUser) {
            await sendTelegram("sendMessage", {
                chat_id: chatId,
                text: `⚠️ شما قبلاً ربات رو استارت کرده‌اید رفیق! 😎\n\n🔗 آیدی ربات: ${BOT_USERNAME}`
            });
        }

        delete db.actions[userId];
        saveDatabase();
        
        let keyboard = [
            [{ text: "🟢 گاسم، پروکسی بده" }, { text: "🔵 اتصال شانسی (تک‌کلیکی)" }],
            [{ text: "🟡 تست پینگ پروکسی‌ها" }, { text: "🟠 آپدیت کن حاج گاسمو" }],
            [{ text: "🛠 پشتیبانی حاجی" }, { text: "📦 حاجی شارژ کن" }],
            [{ text: "🤝 حمایت از حاجی" }, { text: "🔴 راهنمای ربات" }]
        ];

        if (await isAdminOrOwner(userId)) {
            keyboard.push([{ text: "👑 فرماندهی حاجی" }]);
        }

        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: `🧔‍♂️ سلام رفیق، خوش اومدی به حاج گاسم 😎\n📡 اینجا پاتوق پروکسی‌های رایگان و آماده‌ی حرکته!\nحاج گاسم هر روز می‌گرده، پروکسی‌های بهتر رو پیدا می‌کنه و میاره برات 🚀`,
            reply_markup: { keyboard: keyboard, resize_keyboard: true }
        });
        return;
    }

    if (text === "🔴 راهنمای ربات") {
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: `🤖 **راهنمای کامل ربات حاج گاسم** 🧔‍♂️\n\nاین ربات یک پاتوق اختصاصی برای دریافت پروکسی‌های پرسرعت، رایگان و امن تلگرام است.\n\n🔹 **امکانات اصلی ربات:**\n- **گاسم، پروکسی بده:** دریافت لیست کامل پروکسی‌های فعال انبار.\n- **اتصال شانسی:** اتصال سریع و رندوم با یک کلیک به یکی از پروکسی‌ها.\n- **تست پینگ:** بررسی سرعت و وضعیت اتصال پروکسی‌ها (آنلاین/آفلاین).\n- **حاجی شارژ کن:** ارسال درخواست شارژ انبار و پروکسی جدید به مدیریت.\n- **حمایت از حاجی:** دریافت لینک اختصاصی برای دعوت دوستان و بزرگ کردن لشکر حاجی.\n\nبا دکمه‌های رنگی منو به راحتی می‌تونی به بخش‌های مختلف دسترسی داشته باشی! 🚀`
        });
        return;
    }

    if (text === "🟢 گاسم، پروکسی بده") {
        if (!db.proxies || db.proxies.length === 0) {
            await sendTelegram("sendMessage", { chat_id: chatId, text: "🧔‍♂️ فعلاً انبار حاجی خالیه رفیق! به‌زودی پروکسی میذاریم." });
            return;
        }

        let inlineKeyboard = [];
        db.proxies.forEach((p, index) => {
            let starsCount = p.stars || 0;
            let row = [
                { text: `🔗 ${p.name}`, url: p.link },
                { text: `⭐ ${starsCount}`, callback_data: isOwner(userId) ? `admin_star_${index}` : `star_proxy_${index}` },
                { text: "🚨 گزارش", callback_data: `report_proxy_${index}` }
            ];
            inlineKeyboard.push(row);
        });

        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "⚡️ لیست پروکسی‌های انبار حاجی:",
            reply_markup: { inline_keyboard: inlineKeyboard }
        });
        return;
    }

    if (text === "🟡 تست پینگ پروکسی‌ها") {
        if (!db.proxies || db.proxies.length === 0) {
            await sendTelegram("sendMessage", { chat_id: chatId, text: "🧔‍♂️ انباری برای تست پینگ وجود ندارد." });
            return;
        }

        let waitMsg = await sendTelegram("sendMessage", { chat_id: chatId, text: "⏳ در حال گرفتن پینگ واقعی پروکسی‌ها..." });
        let inlineKeyboard = [];

        for (let i = 0; i < db.proxies.length; i++) {
            let p = db.proxies[i];
            let pingResult = await pingProxy(p.link);
            let starsCount = p.stars || 0;
            let row = [
                { text: `🔗 ${p.name} [${pingResult}]`, url: p.link },
                { text: `⭐ ${starsCount}`, callback_data: isOwner(userId) ? `admin_star_${i}` : `star_proxy_${i}` },
                { text: "🚨 گزارش", callback_data: `report_proxy_${i}` }
            ];
            inlineKeyboard.push(row);
        }

        if (waitMsg && waitMsg.result) {
            await sendTelegram("deleteMessage", { chat_id: chatId, message_id: waitMsg.result.message_id });
        }

        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "📊 نتیجه تست پینگ واقعی انبار حاجی:",
            reply_markup: { inline_keyboard: inlineKeyboard }
        });
        return;
    }

    if (text === "🔵 اتصال شانسی (تک‌کلیکی)") {
        if (!db.proxies || db.proxies.length === 0) {
            await sendTelegram("sendMessage", { chat_id: chatId, text: "🧔‍♂️ انبار حاجی خالیه رفیق! فعلاً پروکسی وجود نداره." });
            return;
        }

        const randomIndex = Math.floor(Math.random() * db.proxies.length);
        const randomProxy = db.proxies[randomIndex];
        const starsCount = randomProxy.stars || 0;

        let inlineKeyboard = [
            [{ text: "⚡️ بزن برای اتصال فوری به پروکسی", url: randomProxy.link }],
            [
                { text: `⭐ پسندیدم (${starsCount})`, callback_data: isOwner(userId) ? `admin_star_${randomIndex}` : `star_proxy_${randomIndex}` },
                { text: "🚨 گزارش قطعی", callback_data: `report_proxy_${randomIndex}` }
            ]
        ];

        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: `🎲 شانس امروزت این دراومد رفیق!\n📦 نام: ${randomProxy.name}\n⭐ محبوبیت: ${starsCount}\n\nروی دکمه زیر بزن تا مستقیم متصل بشی:`,
            reply_markup: { inline_keyboard: inlineKeyboard }
        });
        return;
    }

    if (text === "🟠 آپدیت کن حاج گاسمو") {
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
        if (!db.daily_req) db.daily_req = {};
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

    if (text === "🤝 حمایت از حاجی") {
        const botUsernameClean = BOT_USERNAME.replace("@", "");
        const refLink = `https://t.me/${botUsernameClean}?start=ref_${userId}`;
        if (!db.users[userId].referrals) db.users[userId].referrals = 0;
        
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: `🤝 **بخش حمایت از حاج گاسم** 🧔‍♂️\n\nبا اشتراک‌گذاری لینک زیر با دوستانت، می‌تونی به حاجی کمک کنی لشکر رو بزرگ‌تر کنیم و حمایت ویژه‌ای از ربات داشته باشی:\n\n🔗 لینک اختصاصی شما:\n<code>${refLink}</code>\n\n👥 تعداد دعوت‌شده‌ها: ${db.users[userId].referrals} نفر\n\nدکمه‌ی زیر رو بزن تا لینک رو سریع برای دوستانت بفرستی:`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📤 اشتراک‌گذاری لینک در تلگرام", url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent("دریفت پروکسی‌های رایگان و پرسرعت با ربات حاج گاسم 😎👇")}` }]
                ]
            }
        });
        return;
    }

    if (text === "👑 فرماندهی حاجی") {
        if (!await isAdminOrOwner(userId)) {
            await sendTelegram("sendMessage", { chat_id: chatId, text: "❌ شما دسترسی به این بخش ندارید!" });
            return;
        }

        let isMaint = db.bot_settings && db.bot_settings.is_maintenance;
        let maintToggleText = isMaint ? "🟢 روشن کردن ربات" : "🔴 خاموش کردن ربات";

        let adminKeyboard = [
            [{ text: "🚨 اعلامیه حاجی" }, { text: "🛠 اضافه کردن سوغات حاجی" }],
            [{ text: "📥 مکش پروکسی از کانال" }, { text: "❌ فرستادن پروکسی به بازنشستگی" }],
            [{ text: "👥 لشکر حاجی" }, { text: "🚫 اخراج از جمع حاجی" }],
            [{ text: "🧔‍♂️ حاجی بخشید" }, { text: maintToggleText }]
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

    if (text === "🔴 خاموش کردن ربات" && await isAdminOrOwner(userId)) {
        db.actions[userId] = "set_maintenance_reason";
        saveDatabase();
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "✍️ لطفاً دلیل خاموشی و استراحت ربات را وارد کنید (این متن برای همه کاربران ارسال می‌شود):",
            reply_markup: { keyboard: [[{ text: "🔙 بازگشت" }]], resize_keyboard: true }
        });
        return;
    }

    if (text === "🟢 روشن کردن ربات" && await isAdminOrOwner(userId)) {
        if (db.bot_settings) {
            db.bot_settings.is_maintenance = false;
        }
        saveDatabase();

        const returnMsg = `🚀 حاج گاسم دوباره برگشت! 🧔‍♂️🔥\nسلام رفیق 👋😎\n✅ ربات با موفقیت فعال شد و آماده خدمت‌رسانی به شماست.\n📡 پروکسی‌ها آماده دریافت هستند\n⚡ سیستم‌ها آنلاین و بدون مشکل در حال کار می‌باشند\nممنون از صبر و همراهی شما ❤️\n🧔‍♂️ Gasem ProMax 🚀`;
        
        if (db.all_users) {
            for (let uId of db.all_users) {
                let userKeyboard = [
                    [{ text: "🟢 گاسم، پروکسی بده" }, { text: "🔵 اتصال شانسی (تک‌کلیکی)" }],
                    [{ text: "🟡 تست پینگ پروکسی‌ها" }, { text: "🟠 آپدیت کن حاج گاسمو" }],
                    [{ text: "🛠 پشتیبانی حاجی" }, { text: "📦 حاجی شارژ کن" }],
                    [{ text: "🤝 حمایت از حاجی" }, { text: "🔴 راهنمای ربات" }]
                ];
                if (await isAdminOrOwner(uId)) {
                    userKeyboard.push([{ text: "👑 فرماندهی حاجی" }]);
                }
                await sendTelegram("sendMessage", {
                    chat_id: uId,
                    text: returnMsg,
                    reply_markup: { keyboard: userKeyboard, resize_keyboard: true }
                });
            }
        }

        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: "✅ ربات روشن شد و پیام بازگشت برای تمام کاربران ارسال گردید!",
            reply_markup: { keyboard: [[{ text: "👑 فرماندهی حاجی" }, { text: "🔙 بازگشت" }]], resize_keyboard: true }
        });
        return;
    }

    if (text === "👑 معاون ها باشه" && isOwner(userId)) {
        const adminIds = db.admins ? Object.keys(db.admins).filter(id => db.admins[id]) : [];
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
        if (!db.all_users || db.all_users.length === 0) {
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
        if (!db.proxies || db.proxies.length === 0) {
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
        if (action === "set_maintenance_reason") {
            const reason = text.trim();
            db.bot_settings.is_maintenance = true;
            db.bot_settings.maintenance_reason = reason;
            delete db.actions[userId];
            saveDatabase();

            const maintMsg = `🚧 حاج گاسم فعلاً در حال استراحت است 🧔‍♂️\nسلام رفیق 👋😎\nربات برای انجام کارهای فنی، بروزرسانی یا مدیریت سیستم موقتاً خاموش شده است ⚙️\n📌 دلیل:\n${reason}\n⏳ لطفاً کمی صبر کنید...\nحاجی در حال آماده‌سازی دوباره است و به‌زودی برمی‌گردد 🚀\n❤️ ممنون از همراهی شما\n🧔‍♂️ Gasem ProMax 📡`;

            if (db.all_users) {
                for (let uId of db.all_users) {
                    await sendTelegram("sendMessage", {
                        chat_id: uId,
                        text: maintMsg,
                        reply_markup: { remove_keyboard: true }
                    });
                }
            }

            await sendTelegram("sendMessage", {
                chat_id: chatId,
                text: "✅ ربات خاموش شد و پیام استراحت برای تمام کاربران ارسال گردید.",
                reply_markup: { keyboard: [[{ text: "👑 فرماندهی حاجی" }, { text: "🔙 بازگشت" }]], resize_keyboard: true }
            });
            return;
        }

        if (action.startsWith("input_star_")) {
            const proxyIndex = parseInt(action.replace("input_star_", ""));
            const starAmount = parseInt(text.trim());

            if (isNaN(starAmount)) {
                await sendTelegram("sendMessage", { chat_id: chatId, text: "⚠️ لطفاً یک عدد معتبر وارد کنید (مثلا 5):" });
                return;
            }

            if (db.proxies && db.proxies[proxyIndex]) {
                if (!db.proxies[proxyIndex].stars) db.proxies[proxyIndex].stars = 0;
                db.proxies[proxyIndex].stars += starAmount;
                saveDatabase();
                delete db.actions[userId];
                await sendTelegram("sendMessage", {
                    chat_id: chatId,
                    text: `✅ تعداد ${starAmount} ستاره به پروکسی "${db.proxies[proxyIndex].name}" اضافه شد!\nمجموع ستاره‌ها: ${db.proxies[proxyIndex].stars} ⭐`,
                    reply_markup: {
                        keyboard: [
                            [{ text: "🟢 گاسم، پروکسی بده" }, { text: "🔵 اتصال شانسی (تک‌کلیکی)" }],
                            [{ text: "🟡 تست پینگ پروکسی‌ها" }, { text: "🟠 آپدیت کن حاج گاسمو" }],
                            [{ text: "🛠 پشتیبانی حاجی" }, { text: "📦 حاجی شارژ کن" }],
                            [{ text: "🤝 حمایت از حاجی" }, { text: "🔴 راهنمای ربات" }],
                            [await isAdminOrOwner(userId) ? { text: "👑 فرماندهی حاجی" } : null].filter(Boolean)
                        ],
                        resize_keyboard: true
                    }
                });
            } else {
                delete db.actions[userId];
                await sendTelegram("sendMessage", { chat_id: chatId, text: "⚠️ پروکسی مورد نظر یافت نشد." });
            }
            return;
        }

        if (action === "broadcast") {
            const broadcastMsg = `🚨 خبر از دفتر حاج گاسم:\n📩 پیام مدیریت:\n${text}\n\nحاجی گفت اینو بهتون بگیم 😎`;
            if (db.all_users) {
                for (let uId of db.all_users) {
                    let userKeyboard = [
                        [{ text: "🟢 گاسم، پروکسی بده" }, { text: "🔵 اتصال شانسی (تک‌کلیکی)" }],
                        [{ text: "🟡 تست پینگ پروکسی‌ها" }, { text: "🟠 آپدیت کن حاج گاسمو" }],
                        [{ text: "🛠 پشتیبانی حاجی" }, { text: "📦 حاجی شارژ کن" }],
                        [{ text: "🤝 حمایت از حاجی" }, { text: "🔴 راهنمای ربات" }]
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
            if (!db.proxies) db.proxies = [];
            const numbersMap = ["اولین", "دومین", "سومین", "چهارمین", "پنجمین", "ششمین", "هفتمین", "هشتمین", "نهمین", "دهمین"];
            let proxyName = numbersMap[db.proxies.length] ? `${numbersMap[db.proxies.length]} پروکسی` : `پروکسی شماره ${db.proxies.length + 1}`;

            db.proxies.push({ name: proxyName, link: proxyLink, stars: 0 });
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
            if (db.users && db.users[targetId]) {
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
            if (db.users && db.users[targetId]) {
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
            if (!db.admins) db.admins = {};
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
            if (db.admins) delete db.admins[remAdminId];
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
                        [{ text: "🟢 گاسم، پروکسی بده" }, { text: "🔵 اتصال شانسی (تک‌کلیکی)" }],
                        [{ text: "🟡 تست پینگ پروکسی‌ها" }, { text: "🟠 آپدیت کن حاج گاسمو" }],
                        [{ text: "🛠 پشتیبانی حاجی" }, { text: "📦 حاجی شارژ کن" }],
                        [{ text: "🤝 حمایت از حاجی" }, { text: "🔴 راهنمای ربات" }],
                        [await isAdminOrOwner(userId) ? { text: "👑 فرماندهی حاجی" } : null].filter(Boolean)
                    ],
                    resize_keyboard: true
                }
            });
            return;
        }
    }

    if (!db.support_targets_list) db.support_targets_list = {};
    let replyTarget = db.support_targets_list[userId];
    if (replyTarget) {
        delete db.support_targets_list[userId];
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

    if (data === "check_join") {
        const isMember = await checkMembership(userId);
        if (isMember) {
            await sendTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: "عضویت شما تایید شد! خوش اومدی رفیق 🎉" });
            await sendTelegram("deleteMessage", { chat_id: chatId, message_id: messageId });
            
            let keyboard = [
                [{ text: "🟢 گاسم، پروکسی بده" }, { text: "🔵 اتصال شانسی (تک‌کلیکی)" }],
                [{ text: "🟡 تست پینگ پروکسی‌ها" }, { text: "🟠 آپدیت کن حاج گاسمو" }],
                [{ text: "🛠 پشتیبانی حاجی" }, { text: "📦 حاجی شارژ کن" }],
                [{ text: "🤝 حمایت از حاجی" }, { text: "🔴 راهنمای ربات" }]
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

    if (data.startsWith("admin_star_")) {
        if (!isOwner(userId)) {
            await sendTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: "❌ این قابلیت فقط برای مالک ربات است!", show_alert: true });
            return;
        }
        const index = parseInt(data.replace("admin_star_", ""));
        if (db.proxies && db.proxies[index]) {
            if (!db.actions) db.actions = {};
            db.actions[userId] = `input_star_${index}`;
            saveDatabase();
            await sendTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: "لطفا تعداد ستاره را در چت ارسال کنید." });
            await sendTelegram("sendMessage", {
                chat_id: chatId,
                text: `✍️ تعداد ستاره‌ای که می‌خواهید به پروکسی "${db.proxies[index].name}" اضافه شود را به صورت عدد ارسال کنید (مثلاً 5 یا 10):`,
                reply_markup: { keyboard: [[{ text: "🔙 بازگشت" }]], resize_keyboard: true }
            });
        } else {
            await sendTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: "⚠️ این پروکسی دیگر موجود نیست." });
        }
        return;
    }

    if (data.startsWith("star_proxy_")) {
        const index = parseInt(data.replace("star_proxy_", ""));
        
        if (!db.voted_proxies) db.voted_proxies = {};
        if (!db.voted_proxies[userId]) db.voted_proxies[userId] = {};

        if (db.voted_proxies[userId][index]) {
            await sendTelegram("answerCallbackQuery", { 
                callback_query_id: cq.id, 
                text: "⚠️ رفیق، شما قبلاً به این پروکسی رای دادید و فقط یه بار می‌تونید ستاره بدید!", 
                show_alert: true 
            });
            return;
        }

        if (db.proxies && db.proxies[index]) {
            if (!db.proxies[index].stars) db.proxies[index].stars = 0;
            db.proxies[index].stars += 1;
            
            db.voted_proxies[userId][index] = true;
            saveDatabase();

            await sendTelegram("answerCallbackQuery", { 
                callback_query_id: cq.id, 
                text: "⭐ دمت گرم! یک ستاره به این پروکسی اضافه شد." 
            });
        } else {
            await sendTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: "⚠️ این پروکسی دیگر موجود نیست." });
        }
        return;
    }

    if (data.startsWith("report_proxy_")) {
        const index = parseInt(data.replace("report_proxy_", ""));
        if (db.proxies && db.proxies[index]) {
            const proxyName = db.proxies[index].name;
            const user = cq.from;
            const userFullName = (user.first_name || "") + " " + (user.last_name || "");
            const userUsername = user.username ? `@${user.username}` : "ندارد";

            const reportMsg = `🚨 **گزارش خرابی پروکسی**\n\n📦 پروکسی: ${proxyName}\n👤 کاربر: ${userFullName}\n🔗 آیدی: ${userUsername}\n🆔 آیدی عددی: <code>${user.id}</code>\n\n⚠️ کاربر گزارش زد که این پروکسی کار نمی‌کند. لطفاً تعویض یا جدید بگذارید! 🛠`;
            
            await sendTelegram("sendMessage", {
                chat_id: OWNER_ID,
                text: reportMsg,
                parse_mode: "HTML"
            });

            await sendTelegram("answerCallbackQuery", {
                callback_query_id: cq.id,
                text: "✅ گزارش خرابی برای مدیر ارسال شد. ممنون از همکاریت رفیق!",
                show_alert: true
            });
        } else {
            await sendTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: "⚠️ این پروکسی یافت نشد." });
        }
        return;
    }

    if (data.startsWith("del_proxy_")) {
        const index = parseInt(data.replace("del_proxy_", ""));
        if (db.proxies && db.proxies[index]) {
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
        if (!db.support_targets_list) db.support_targets_list = {};
        db.support_targets_list[userId] = targetUserId;
        saveDatabase();
        await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: `✍️ پاسخ خود را برای کاربر وارد کنید:`,
            reply_markup: { keyboard: [[{ text: "🔙 بازگشت" }]], resize_keyboard: true }
        });
        return;
    }
}

// سیستم Long Polling برای دریافت خودکار پیام‌ها بدون نیاز به Webhook
let offset = 0;
async function startPolling() {
    console.log("Haj Gasem Bot is running via Long Polling... 😎");
    while (true) {
        try {
            const res = await sendTelegram("getUpdates", { offset: offset, timeout: 30 });
            if (res && res.ok && res.result) {
                for (let update of res.result) {
                    offset = update.update_id + 1;
                    await handleUpdate(update);
                }
            }
        } catch (err) {
            console.error("Polling error:", err);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Haj Gasem Ultimate Bot is running! 😎');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startPolling(); // شروع خودکار دریافت پیام‌ها
});
