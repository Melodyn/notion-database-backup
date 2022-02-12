import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const buildDataPath = (filename, ext = 'json') => path.join(__dirname, 'data', `${filename}.${ext}`);
export const buildLogPath = (filename, ext = 'log') => path.join(__dirname, 'logs', `${filename}.${ext}`);

export const writeFile = (filepath, data) => fs.promises.writeFile(
  filepath,
  data,
  { encoding: 'utf-8' },
);

export const readFile = (filepath) => fs.promises.readFile(filepath, 'utf-8').then((data) => JSON.parse(data));

export const wait = async (ms) => new Promise((res) => {
  setTimeout(res, ms);
});

export const take = (array, count) => {
  const chunk = array.filter((e, i) => i < count);
  const tail = array.filter((e, i) => i >= count);
  return { chunk, tail };
};

export const prepareCatalogs = () => {
  const paths = ['data', 'logs'].map((dirname) => path.resolve(__dirname, dirname));

  const promises = paths.map((dirpath) => fs.promises.mkdir(dirpath)
    .then(() => `Создано: ${dirpath}`)
    .catch(() => `Пропущено: ${dirpath}`));

  return Promise.all(promises);
};

// Notion helpers
const getHeaders = (data) => {
  const propertyNames = Object.keys(data[0].properties);
  propertyNames.push('notion_id', 'notion_url', 'original_data');
  return propertyNames;
};

// Чтобы вытащить из JSON данные в человекочитаемом виде
// Необходимо писать обработчик на каждый тип поля в Notion
const propertiesHandler = (properties) => {
  const isEmpty = (prop) => !prop || prop.length === 0;
  return Object.values(properties).map((prop) => {
    const { type } = prop;
    const rawValue = prop[type];
    if (isEmpty(rawValue)) return '""';
    switch (type) {
      case 'email':
      case 'phone_number':
      case 'url':
        return rawValue.trim();
      case 'rich_text':
      case 'title':
        return rawValue.map(({ plain_text }) => `${plain_text.trim()}`).join(';');
      case 'people':
        return rawValue.map(({ name, people = { email: '' } }) => `${name.trim()} | ${people.email}`)
          .join(';');
      case 'relation':
        return rawValue.map(({ id }) => `${id}`).join(';');
      case 'select':
        return rawValue.name;
      case 'rollup':
        return (rawValue.array.length > 0)
          ? rawValue.array
            .flatMap(({ title }) => title.map(({ plain_text }) => `${plain_text.trim()}`))
            .join(';')
          : '""';
      default:
        return (typeof rawValue === 'string') ? rawValue.trim() : JSON.stringify(rawValue);
    }
  });
};

/* Преобразовываем данные в массив массивов. Сначала заголовки, потом данные
[
  [Фамилия, Имя, Отчество],
  [Фу, Бар, Экземплеович],
  [Тота, Роббинс, Хекслетович],
]
 */
export const convertToHumanReadableEntries = (data) => {
  const rows = [];
  const headersRow = getHeaders(data);
  rows.push(headersRow);
  data.forEach((record) => {
    const { id, url, properties } = record;
    const fields = propertiesHandler(properties);
    const originalData = JSON.stringify(properties);
    fields.push(id, url, originalData);
    rows.push(fields);
  });
  return rows;
};
