require('dotenv').config();
const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_USERNAME = '@dennyfun';

// Файл для хранения ID пользователей
const USER_IDS_FILE = 'user_ids.json';

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
    keyFile: 'credentials.json', // Укажи путь к JSON-файлу
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function getSheetData(range) {
    const spreadsheetId = 'sheets_id_example'; // ID таблицы
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
    });
    return response.data.values || [];
}

// Функция для получения сообщения из листа "broadcast"
async function getBroadcastMessage() {
    const range = 'broadcast!A1:A'; // Считываем весь столбец A
    const data = await getSheetData(range);
    if (data.length > 0) {
        // Объединяем все строки в одно сообщение
        return data.map(row => row[0]).join('\n');
    }
    return null; // Если сообщение не найдено
}

async function checkSubscription(ctx, next) {
    try {
        const chatMember = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
        if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
            return next(); // Если подписан, переходим к следующему обработчику
        } else {
            ctx.reply(
                `Привет! Теперь все гайды по крипте от известных инфлюенсеров в одном месте и ты их не потеряешь! Чтобы получить доступ, подпишись на канал: https://t.me/dennyfun

После подписки нажми кнопку "ПОДТВЕРДИТЬ"`,
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
            setTimeout(() => sendMainMenu(ctx), 1000); // Задержка 1 секунда перед отправкой главного меню
        } else {
            ctx.reply('❌ Ты ещё не подписался! Подпишись на канал и попробуй снова.');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        ctx.reply('Произошла ошибка при проверки подписки. Попробуйте позже.');
    }
});

bot.start(checkSubscription, async (ctx) => {
    saveUserId(ctx.from.id); // Сохраняем ID пользователя
    sendMainMenu(ctx);
});

bot.command('menu', checkSubscription, (ctx) => {
    saveUserId(ctx.from.id); // Сохраняем ID пользователя
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
        let message = `Раздел ${section}:
\n`;
        data.forEach((row, index) => {
            message += `${index + 1}. "${row[0]}"
автор: ${row[1]}
канал: ${row[2]}
гайд: ${row[3]}
\n`;
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

// Команда для рассылки сообщений
bot.command('broadcast', async (ctx) => {
    // Проверяем, что команду вызвал администратор (ваш ID)
    const ADMIN_ID = admin_id_example; // Замените на ваш ID
    if (ctx.from.id !== ADMIN_ID) {
        ctx.reply('У вас нет прав на выполнение этой команды.');
        return;
    }

    // Получаем сообщение из Google Таблицы
    const message = await getBroadcastMessage();
    if (!message) {
        ctx.reply('Сообщение для рассылки не найдено в таблице.');
        return;
    }

    // Рассылка сообщения всем пользователям
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
            `Привет! Теперь все гайды по крипте от известных инфлюенсеров в одном месте и ты их не потеряешь! Чтобы получить доступ, подпишись на канал: https://t.me/dennyfun

После подписки нажми кнопку "ПОДТВЕРДИТЬ"`,
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
            `Привет! Теперь все гайды по крипте от известных инфлюенсеров в одном месте и ты их не потеряешь! Чтобы получить доступ, подпишись на канал: https://t.me/dennyfun

После подписки нажми кнопку "ПОДТВЕРДИТЬ"`,
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
            `Привет! Теперь все гайды по крипте от известных инфлюенсеров в одном месте и ты их не потеряешь! Чтобы получить доступ, подпишись на канал: https://t.me/dennyfun

После подписки нажми кнопку "ПОДТВЕРДИТЬ"`,
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
            `Привет! Теперь все гайды по крипте от известных инфлюенсеров в одном месте и ты их не потеряешь! Чтобы получить доступ, подпишись на канал: https://t.me/dennyfun

После подписки нажми кнопку "ПОДТВЕРДИТЬ"`,
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
            `Привет! Теперь все гайды по крипте от известных инфлюенсеров в одном месте и ты их не потеряешь! Чтобы получить доступ, подпишись на канал: https://t.me/dennyfun

После подписки нажми кнопку "ПОДТВЕРДИТЬ"`,
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
            `Привет! Теперь все гайды по крипте от известных инфлюенсеров в одном месте и ты их не потеряешь! Чтобы получить доступ, подпишись на канал: https://t.me/dennyfun

После подписки нажми кнопку "ПОДТВЕРДИТЬ"`,
            {
                reply_markup: {
                    inline_keyboard: [[{ text: 'ПОДТВЕРДИТЬ', callback_data: 'check_subscription' }]]
                }
            }
        );
    }
});

bot.action('main_menu', async (ctx) => {
    try {
        // Удаляем последнее сообщение
        await ctx.deleteMessage();
    } catch (error) {
        console.error('Ошибка при удалении сообщения:', error);
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