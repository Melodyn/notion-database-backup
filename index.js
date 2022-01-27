import fs from 'fs';
import dotenv from 'dotenv';
import { Client } from '@notionhq/client';
import {
  prepareCatalogs,
  writeFile,
  wait,
  buildLogPath,
  buildDataPath,
} from './helpers.js';

const l = console.log;

const app = async () => {
  const { parsed: config, error } = dotenv.config();
  if (error) throw error;
  const {
    USERS_DATABASE_ID,
    COMPANIES_DATABASE_ID,
    NOTION_TOKEN,
  } = config;
  const notion = new Client({ auth: NOTION_TOKEN });
  const processDateTime = new Date().toISOString();
  const logsPath = buildLogPath(processDateTime);
  const usersPath = buildDataPath(`${processDateTime}-users`);
  const log = fs.createWriteStream(logsPath);
  const errToLog = (err, header = '') => log.write(
    `${(header && `${header} `)}${err.message} ${JSON.stringify(err, null, 1)}\n`,
    'utf-8',
  );

  const downloadData = async (database_id) => {
    const loadings = [];
    let start_cursor;
    let count = 0;

    let hasMore = true;
    do {
      const loaded = await notion.databases.query({
        database_id,
        start_cursor,
      })
        .catch((err) => errToLog(err, 'Запрос в Notion'));
      loadings.push(...loaded.results);
      start_cursor = loaded.next_cursor;
      hasMore = loaded.has_more;
      count += loaded.results.length;
      l({ count, hasMore });
      await wait(500);
    } while (hasMore);

    return loadings;
  };

  l('Подготавливаю каталоги');
  await prepareCatalogs();

  l('Скачиваю данные');
  const users = await downloadData(USERS_DATABASE_ID)
    .catch((err) => {
      errToLog(err, 'Загрузка данных');
      log.end();
      throw new Error(`Приложение остановлено. Смотрите логи: ${logsPath}`);
    });

  l('Сохраняю в файл');
  return writeFile(usersPath, users)
    .then(() => {
      log.end();
      return `Успешно завершено! Данные загружены: ${usersPath}`;
    })
    .catch((err) => {
      errToLog(err, 'Запись в файл загруженных данных');
      log.end();
      console.log('Полученные данные:', users);
      throw new Error(`Приложение остановлено. Смотрите логи: ${logsPath}`);
    });
};

export default app;
