import fs from 'fs';
import dotenv from 'dotenv';
import { Client } from '@notionhq/client';
import {
  prepareCatalogs,
  writeFile,
  wait,
  buildLogPath,
  buildDataPath,
  convertToHumanReadableEntries,
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
  const log = fs.createWriteStream(logsPath);
  const errToLog = (err, header = '') => log.write(
    `${(header && `${header} `)}${err.message} ${JSON.stringify(err, null, 1)}\n`,
    'utf-8',
  );

  // Notion выдаёт данные частями (пагинация), но ограничиает количество запросов в минуту
  // Поэтому реализовано чанкование с ожиданием в полсекунды.
  const downloadData = async (database_id) => {
    const loadings = [];
    let start_cursor;
    let count = 0;

    let hasMore = true;
    do {
      const loaded = await notion.databases.query({
        database_id,
        start_cursor,
      });
      loadings.push(...loaded.results);
      start_cursor = loaded.next_cursor;
      hasMore = loaded.has_more;
      count += loaded.results.length;
      l({ count, hasMore });
      await wait(500);
    } while (hasMore);

    return loadings;
  };

  l('Prepare catalogs');
  await prepareCatalogs();

  const databases = [
    ['users', USERS_DATABASE_ID],
    ['companies', COMPANIES_DATABASE_ID],
  ];

  for (let i = 0; i < databases.length; i += 1) {
    const [dbName, dbId] = databases[i];
    l(`Download data ${dbName}`);
    const filename = `${processDateTime}-${dbName}`;
    const dataPath = buildDataPath(filename);
    const backupPath = buildDataPath(filename, 'tsv');
    const data = await downloadData(dbId)
      .catch((err) => {
        errToLog(err, `Download data ${dbName}`);
        log.end();
        throw new Error(`App was stopped. See logs: ${logsPath}`);
      });

    l(`Write raw data to file ${dataPath}`);
    await writeFile(dataPath, JSON.stringify(data, null, 1))
      .catch((err) => {
        errToLog(err, `Write raw data ${dbName}`);
        log.end();
        console.error(err);
        throw new Error(`App was stopped. See logs: ${logsPath}`);
      });

    l(`Create tsv-backup ${backupPath}`);
    const tsvData = convertToHumanReadableEntries(data)
      .map((row) => row.join('\t')) // столбцы разделены табуляцией, потому что точка с запятой используются в propertiesHandler
      .join('\n');
    await writeFile(backupPath, tsvData)
      .catch((err) => {
        errToLog(err, `Create backup ${dbName}`);
        log.end();
        console.error(err);
        throw new Error(`App was stopped. See logs: ${logsPath}`);
      });
  }

  log.end();
  return 'Success!';
};

export default app;
