require('dotenv').config();
const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

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
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
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
            await next(); // Вызываем next без return
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

bot.start((ctx) => {
    saveUserId(ctx.from.id);
    
    // Проверяем подписку
    ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id)
        .then(chatMember => {
            if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
                sendMainMenu(ctx);
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
        })
        .catch(error => {
            console.error('Ошибка проверки подписки:', error);
            ctx.reply('Произошла ошибка при проверки подписки. Попробуйте позже.');
        });
});

bot.command('menu', (ctx) => {
    saveUserId(ctx.from.id);
    
    // Проверяем подписку
    ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id)
        .then(chatMember => {
            if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
                sendMainMenu(ctx);
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
        })
        .catch(error => {
            console.error('Ошибка проверки подписки:', error);
            ctx.reply('Произошла ошибка при проверки подписки. Попробуйте позже.');
        });
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
                    { text: 'NFT', callback_data: 'nft' },
                    { text: 'МЕДИЙКА', callback_data: 'media' }
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
        // Проверяем подписку
        const chatMember = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
        if (!['member', 'administrator', 'creator'].includes(chatMember.status)) {
            ctx.reply(
                `Привет! Чтобы получить доступ, подпишись на канал: https://t.me/dennyfun\n\nПосле подписки нажми "ПОДТВЕРДИТЬ"`,
                {
                    reply_markup: {
                        inline_keyboard: [[{ text: 'ПОДТВЕРДИТЬ', callback_data: 'check_subscription' }]]
                    }
                }
            );
            return;
        }

        // Если подписка есть - показываем данные
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

// Перемещаем обработчик текстовых сообщений в конец файла, перед bot.launch()
// Но сначала оставляем здесь комментарий для ясности
// Обработчик текстовых сообщений перемещен в конец файла

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

// Обработчик команд и функция sendSectionData
bot.command('base', async (ctx) => sendSectionData(ctx, 'ОСНОВА', 'ОСНОВА!A2:D'));
bot.command('retro', async (ctx) => sendSectionData(ctx, 'РЕТРО', 'РЕТРО!A2:D'));
bot.command('memecoins', async (ctx) => sendSectionData(ctx, 'МЕМКОИНЫ', 'МЕМКОИНЫ!A2:D'));
bot.command('coding', async (ctx) => sendSectionData(ctx, 'КОДИНГ', 'КОДИНГ!A2:D'));
bot.command('defi', async (ctx) => sendSectionData(ctx, 'DEFI', 'DEFI!A2:D'));
bot.command('ai', async (ctx) => sendSectionData(ctx, 'AI', 'AI!A2:D'));
bot.command('nft', async (ctx) => sendSectionData(ctx, 'NFT', 'NFT!A2:D'));
bot.command('media', async (ctx) => sendSectionData(ctx, 'МЕДИЙКА', 'МЕДИЙКА!A2:D'));

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

bot.action('nft', async (ctx) => {
    const chatMember = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
        sendSectionData(ctx, 'NFT', 'NFT!A2:D');
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

bot.action('media', async (ctx) => {
    const chatMember = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
        sendSectionData(ctx, 'МЕДИЙКА', 'МЕДИЙКА!A2:D');
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
    { command: 'ai', description: 'Перейти в раздел AI' },
    { command: 'nft', description: 'Перейти в раздел NFT' },
    { command: 'media', description: 'Перейти в раздел МЕДИЙКА' }
]);

// Добавляем специальную команду для отладки
bot.command('debug', async (ctx) => {
    logToFile(`Получена команда /debug от пользователя ${ctx.from.id}`);
    
    try {
        // Проверим переменные состояния
        logToFile(`Состояние waitingForLink для пользователя ${ctx.from.id}: ${waitingForLink.get(ctx.from.id)}`);
        logToFile(`Состояние fromSuggestArticle для пользователя ${ctx.from.id}: ${fromSuggestArticle.get(ctx.from.id)}`);
        
        // Проверим статус подписки
        const chatMember = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
        logToFile(`Статус подписки пользователя ${ctx.from.id}: ${chatMember.status}`);
        
        // Ответим пользователю
        ctx.reply(`Диагностика:\n- ID: ${ctx.from.id}\n- Ожидание ссылки: ${waitingForLink.get(ctx.from.id) ? 'Да' : 'Нет'}\n- Статус: ${chatMember.status}\n\nИнформация записана в лог.`);
        
        // Проверим зарегистрированные команды
        const commands = await ctx.telegram.getMyCommands();
        logToFile(`Зарегистрированные команды: ${JSON.stringify(commands)}`);
    } catch (error) {
        logToFile(`ОШИБКА в команде /debug: ${error.message}`);
        ctx.reply(`Ошибка отладки: ${error.message}`);
    }
});

// Обработка сообщений от пользователя - перемещена вниз после всех команд
bot.on('text', (ctx) => {
    // Проверяем, ожидаем ли мы ссылку от этого пользователя
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
    // Если мы не ждем ссылку - ничего не делаем, чтобы команды могли обрабатываться
});

// Инициализируем логирование при запуске
bot.launch().then(() => {
    logToFile('🚀 Бот запущен');
    console.log('🚀 Бот запущен');
});

process.once('SIGINT', () => {
    logToFile('Получен сигнал SIGINT, завершаем работу');
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    logToFile('Получен сигнал SIGTERM, завершаем работу');
    bot.stop('SIGTERM');
});
