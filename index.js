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

const getHeaders = (users) => {
  const propertyNames = Object.keys(users[0].properties);
  propertyNames.push('notion_id', 'notion_url');
  return propertyNames;
};
const propertiesHandler = (properties) => {
  const isEmpty = (prop) => !prop || prop.length === 0;
  return Object.values(properties).map((prop) => {
    const { type } = prop;
    const rawValue = prop[type];
    switch (type) {
      case 'email':
      case 'phone_number':
      case 'url':
        return isEmpty(rawValue) ? '' : rawValue.trim();
      case 'rich_text':
      case 'title':
        return isEmpty(rawValue) ? ''
          : rawValue.map(({ plain_text }) => `"${plain_text.trim()}"`).join(';');
      case 'relation':
      case 'people':
        return isEmpty(rawValue) ? ''
          : rawValue.map(({ id }) => `"${id}"`).join(';');
      default:
        return (typeof rawValue === 'string') ? rawValue.trim() : JSON.stringify(rawValue);
    }
  });
};
const generateTSV = async (filepath, data) => {
  const file = fs.createWriteStream(filepath);
  const write = (row) => file.write(`${row}\n`, 'utf-8');
  const headersRow = getHeaders(data).join('\t');
  write(headersRow);
  data.forEach((record) => {
    const { id, url, properties } = record;
    const fields = propertiesHandler(properties);
    fields.push(id, url);
    const row = fields.join('\t');
    write(row);
  });
  file.end();
};

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

  const dbs = [
    ['users', USERS_DATABASE_ID],
    ['companies', COMPANIES_DATABASE_ID],
  ];

  for (const [dbName, dbId] of dbs) {
    l(`Скачиваю данные ${dbName}`);
    const filename = `${processDateTime}-${dbName}`;
    const dataPath = buildDataPath(filename);
    const backupPath = buildDataPath(filename, 'tsv');
    const data = await downloadData(dbId)
      .catch((err) => {
        errToLog(err, `Загрузка данных ${dbName}`);
        log.end();
        throw new Error(`Приложение остановлено. Смотрите логи: ${logsPath}`);
      });

    l(`Сохраняю в файл ${dataPath}`);
    await writeFile(dataPath, data)
      .catch((err) => {
        errToLog(err, `Запись в файл загруженных данных ${dbName}`);
        log.end();
        console.log('Полученные данные:', data);
        throw new Error(`Приложение остановлено. Смотрите логи: ${logsPath}`);
      });

    l(`Формирую бэкап ${backupPath}`);
    await generateTSV(backupPath, data)
      .catch((err) => {
        errToLog(err, `Формирование бэкапа ${dbName}`);
        log.end();
        throw new Error(`Приложение остановлено. Смотрите логи: ${logsPath}`);
      });
    log.end();

    return 'Работа приложения завершена корректно';
  }
};

export default app;
