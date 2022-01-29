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

const getHeaders = (data) => {
  const propertyNames = Object.keys(data[0].properties);
  propertyNames.push('notion_id', 'notion_url', 'original_data');
  return propertyNames;
};
const propertiesHandler = (properties) => {
  const isEmpty = (prop) => !prop || prop.length === 0;
  return Object.values(properties).map((prop) => {
    const { type } = prop;
    const rawValue = prop[type];
    if (isEmpty(rawValue)) return '';
    switch (type) {
      case 'email':
      case 'phone_number':
      case 'url':
        return rawValue.trim();
      case 'rich_text':
      case 'title':
        return rawValue.map(({ plain_text }) => `"${plain_text.trim()}"`).join(';');
      case 'people':
        return rawValue.map(({ name, people = { email: '' } }) => `"${name.trim()} | ${people.email}"`)
          .join(';');
      case 'relation':
        return rawValue.map(({ id }) => `"${id}"`).join(';');
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
    const originalData = JSON.stringify(properties);
    fields.push(id, url, originalData);
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
        .catch((err) => errToLog(err, 'Notion request'));
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

  const dbs = [
    ['users', USERS_DATABASE_ID],
    ['companies', COMPANIES_DATABASE_ID],
  ];

  for (const [dbName, dbId] of dbs) {
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
    await writeFile(dataPath, data)
      .catch((err) => {
        errToLog(err, `Write raw data ${dbName}`);
        log.end();
        console.log('Data:', data);
        throw new Error(`App was stopped. See logs: ${logsPath}`);
      });

    l(`Create backup ${backupPath}`);
    await generateTSV(backupPath, data)
      .catch((err) => {
        errToLog(err, `Create backup ${dbName}`);
        log.end();
        throw new Error(`App was stopped. See logs: ${logsPath}`);
      });
  }

  log.end();
  return 'Success!';
};

export default app;
