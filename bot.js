require('dotenv').config();
const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_USERNAME = '@dennyfun';
const ADMIN_ID = 546745364; // Ваш ID администратора

// Файл для хранения ID пользователей
const USER_IDS_FILE = 'user_ids.json';

// Состояние для отслеживания ожидания ссылки и возвращения из "ПРЕДЛОЖИТЬ СТАТЬЮ"
const waitingForLink = new Map();
const fromSuggestArticle = new Map(); // Новое состояние для отслеживания возвращения из "ПРЕДЛОЖИТЬ СТАТЬЮ"

// Загружаем сохраненные ID пользователей
let userIds = [];
if (fs.existsSync(USER_IDS_FILE)) {
    userIds = JSON.parse(fs.readFileSync(USER_IDS_FILE, 'utf-8'));
}

// Функция для сохранения ID пользователя
function saveUserId(userId) {
    if (!userIds.includes(userId)) {
        userIds.push(userId);
        fs.writeFileSync(USER_IDS_FILE, JSON.stringify(userIds), 'utf-8');
    }
}

// Google Sheets API setup
const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function getSheetData(range) {
    const spreadsheetId = '1Uvsn_CE7y-aEwhFANOpuajoOp46emuLguX121a9RvxA';
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
    });
    return response.data.values || [];
}

async function getBroadcastMessage() {
    const range = 'broadcast!A1:A';
    const data = await getSheetData(range);
    if (data.length > 0) {
        return data.map(row => row[0]).join('\n');
    }
    return null;
}

async function checkSubscription(ctx, next) {
    try {
        const chatMember = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
        if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
            return next();
        } else {
            ctx.reply(
                `Привет! Теперь все гайды по крипте от известных инфлюенсеров в одном месте и ты их не потеряешь! Чтобы получить доступ, подпишись на канал: https://t.me/dennyfun\n\nПосле подписки нажми кнопку "ПОДТВЕРДИТЬ"`,
                {
                    reply_markup: {
                        inline_keyboard: [[{ text: 'ПОДТВЕРДИТЬ', callback_data: 'check_subscription' }]]
                    }
                }
            );
        }
    } catch (error) {
        console.error('Ошибка проверки подписки:', error);
        ctx.reply('Произошла ошибка при проверки подписки. Попробуйте позже.');
    }
}

bot.action('check_subscription', async (ctx) => {
    try {
        const chatMember = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
        if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
            ctx.reply('✅ Подписка подтверждена!');
            setTimeout(() => sendMainMenu(ctx), 1000);
        } else {
            ctx.reply('❌ Ты ещё не подписался! Подпишись на канал и попробуй снова.');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        ctx.reply('Произошла ошибка при проверки подписки. Попробуйте позже.');
    }
});

bot.start(checkSubscription, async (ctx) => {
    saveUserId(ctx.from.id);
    sendMainMenu(ctx);
});

bot.command('menu', checkSubscription, (ctx) => {
    saveUserId(ctx.from.id);
    sendMainMenu(ctx);
});

function sendMainMenu(ctx) {
    ctx.reply('Все гайды и статьи лежат внутри.\n\nВыберите интересующее вас направление:', {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'ОСНОВА', callback_data: 'basic' },
                    { text: 'МЕМКОИНЫ', callback_data: 'memecoins' }
                ],
                [
                    { text: 'РЕТРО', callback_data: 'retro' },
                    { text: 'КОДИНГ', callback_data: 'coding' }
                ],
                [
                    { text: 'DEFI', callback_data: 'defi' },
                    { text: 'AI', callback_data: 'ai' }
                ],
                [
                    { text: 'ПРЕДЛОЖИТЬ СТАТЬЮ', callback_data: 'suggest_article' }
                ]
            ]
        }
    });
}

async function sendSectionData(ctx, section, range) {
    try {
        const data = await getSheetData(range);
        if (data.length === 0) {
            ctx.reply(`В разделе ${section} пока нет данных.`);
            return;
        }
        let message = `Раздел ${section}:\n\n`;
        data.forEach((row, index) => {
            message += `${index + 1}. "${row[0]}"\nавтор: ${row[1]}\nканал: ${row[2]}\nгайд: ${row[3]}\n\n`;
        });
        ctx.reply(message, {
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [[{ text: 'Назад', callback_data: 'main_menu' }]]
            }
        });
    } catch (error) {
        console.error('Ошибка:', error);
        ctx.reply('Не удалось загрузить данные. Попробуйте позже.');
    }
}

// Обработка команды "ПРЕДЛОЖИТЬ СТАТЬЮ"
bot.action('suggest_article', checkSubscription, (ctx) => {
    waitingForLink.set(ctx.from.id, true);
    fromSuggestArticle.set(ctx.from.id, true); // Устанавливаем флаг, что пользователь в "ПРЕДЛОЖИТЬ СТАТЬЮ"
    ctx.reply('Отправьте ссылку на статью, которую вы хотите предложить:');
});

// Обработка сообщений от пользователя
bot.on('text', (ctx) => {
    if (waitingForLink.get(ctx.from.id)) {
        const messageText = ctx.message.text;
        const urlRegex = /(https?:\/\/[^\s]+)/;
        if (urlRegex.test(messageText)) {
            ctx.reply('✅ Ваше предложение отправлено на рассмотрение!', {
                reply_markup: {
                    inline_keyboard: [[{ text: 'Вернуться в меню', callback_data: 'main_menu' }]]
                }
            });
            
            bot.telegram.sendMessage(
                ADMIN_ID,
                `Новое предложение статьи от @${ctx.from.username || ctx.from.id}:\n${messageText}`
            );
            
            waitingForLink.delete(ctx.from.id);
            // Оставляем fromSuggestArticle до нажатия "Вернуться в меню"
        } else {
            ctx.reply('Пожалуйста, отправьте корректную ссылку (начиная с http:// или https://)');
        }
    }
});

// Обработка возвращения в главное меню
bot.action('main_menu', async (ctx) => {
    try {
        await ctx.deleteMessage();
        // Проверяем, был ли пользователь в разделе "ПРЕДЛОЖИТЬ СТАТЬЮ"
        if (fromSuggestArticle.get(ctx.from.id)) {
            sendMainMenu(ctx);
            fromSuggestArticle.delete(ctx.from.id); // Удаляем флаг после возвращения
        }
        // Для других разделов просто удаляем сообщение
    } catch (error) {
        console.error('Ошибка при удалении сообщения:', error);
        if (fromSuggestArticle.get(ctx.from.id)) {
            sendMainMenu(ctx);
            fromSuggestArticle.delete(ctx.from.id);
        }
    }
});

// Команда для рассылки сообщений
bot.command('broadcast', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        ctx.reply('У вас нет прав на выполнение этой команды.');
        return;
    }

    const message = await getBroadcastMessage();
    if (!message) {
        ctx.reply('Сообщение для рассылки не найдено в таблице.');
        return;
    }

    for (const userId of userIds) {
        try {
            await bot.telegram.sendMessage(userId, message);
        } catch (error) {
            console.error(`Не удалось отправить сообщение пользователю ${userId}:`, error);
        }
    }

    ctx.reply('Рассылка завершена!');
});

bot.command('base', checkSubscription, (ctx) => sendSectionData(ctx, 'ОСНОВА', 'ОСНОВА!A2:D'));
bot.command('retro', checkSubscription, (ctx) => sendSectionData(ctx, 'РЕТРО', 'РЕТРО!A2:D'));
bot.command('memecoins', checkSubscription, (ctx) => sendSectionData(ctx, 'МЕМКОИНЫ', 'МЕМКОИНЫ!A2:D'));
bot.command('coding', checkSubscription, (ctx) => sendSectionData(ctx, 'КОДИНГ', 'КОДИНГ!A2:D'));
bot.command('defi', checkSubscription, (ctx) => sendSectionData(ctx, 'DEFI', 'DEFI!A2:D'));
bot.command('ai', checkSubscription, (ctx) => sendSectionData(ctx, 'AI', 'AI!A2:D'));

bot.action('basic', async (ctx) => {
    const chatMember = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
        sendSectionData(ctx, 'ОСНОВА', 'ОСНОВА!A2:D');
    } else {
        ctx.reply(
            `Привет! Чтобы получить доступ, подпишись на канал: https://t.me/dennyfun\n\nПосле подписки нажми "ПОДТВЕРДИТЬ"`,
            {
                reply_markup: {
                    inline_keyboard: [[{ text: 'ПОДТВЕРДИТЬ', callback_data: 'check_subscription' }]]
                }
            }
        );
    }
});

bot.action('retro', async (ctx) => {
    const chatMember = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
        sendSectionData(ctx, 'РЕТРО', 'РЕТРО!A2:D');
    } else {
        ctx.reply(
            `Привет! Чтобы получить доступ, подпишись на канал: https://t.me/dennyfun\n\nПосле подписки нажми "ПОДТВЕРДИТЬ"`,
            {
                reply_markup: {
                    inline_keyboard: [[{ text: 'ПОДТВЕРДИТЬ', callback_data: 'check_subscription' }]]
                }
            }
        );
    }
});

bot.action('memecoins', async (ctx) => {
    const chatMember = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
        sendSectionData(ctx, 'МЕМКОИНЫ', 'МЕМКОИНЫ!A2:D');
    } else {
        ctx.reply(
            `Привет! Чтобы получить доступ, подпишись на канал: https://t.me/dennyfun\n\nПосле подписки нажми "ПОДТВЕРДИТЬ"`,
            {
                reply_markup: {
                    inline_keyboard: [[{ text: 'ПОДТВЕРДИТЬ', callback_data: 'check_subscription' }]]
                }
            }
        );
    }
});

bot.action('coding', async (ctx) => {
    const chatMember = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
        sendSectionData(ctx, 'КОДИНГ', 'КОДИНГ!A2:D');
    } else {
        ctx.reply(
            `Привет! Чтобы получить доступ, подпишись на канал: https://t.me/dennyfun\n\nПосле подписки нажми "ПОДТВЕРДИТЬ"`,
            {
                reply_markup: {
                    inline_keyboard: [[{ text: 'ПОДТВЕРДИТЬ', callback_data: 'check_subscription' }]]
                }
            }
        );
    }
});

bot.action('defi', async (ctx) => {
    const chatMember = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
        sendSectionData(ctx, 'DEFI', 'DEFI!A2:D');
    } else {
        ctx.reply(
            `Привет! Чтобы получить доступ, подпишись на канал: https://t.me/dennyfun\n\nПосле подписки нажми "ПОДТВЕРДИТЬ"`,
            {
                reply_markup: {
                    inline_keyboard: [[{ text: 'ПОДТВЕРДИТЬ', callback_data: 'check_subscription' }]]
                }
            }
        );
    }
});

bot.action('ai', async (ctx) => {
    const chatMember = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
        sendSectionData(ctx, 'AI', 'AI!A2:D');
    } else {
        ctx.reply(
            `Привет! Чтобы получить доступ, подпишись на канал: https://t.me/dennyfun\n\nПосле подписки нажми "ПОДТВЕРДИТЬ"`,
            {
                reply_markup: {
                    inline_keyboard: [[{ text: 'ПОДТВЕРДИТЬ', callback_data: 'check_subscription' }]]
                }
            }
        );
    }
});

bot.telegram.setMyCommands([
    { command: 'start', description: 'Запустить бота' },
    { command: 'menu', description: 'Открыть главное меню' },
    { command: 'base', description: 'Перейти в раздел ОСНОВА' },
    { command: 'memecoins', description: 'Перейти в раздел МЕМКОИНЫ' },
    { command: 'retro', description: 'Перейти в раздел РЕТРО' },
    { command: 'coding', description: 'Перейти в раздел КОДИНГ' },
    { command: 'defi', description: 'Перейти в раздел DEFI' },
    { command: 'ai', description: 'Перейти в раздел AI' }
]);

bot.launch().then(() => console.log('🚀 Бот запущен'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
