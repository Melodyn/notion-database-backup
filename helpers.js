import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const buildDataPath = (filename, ext = 'json') => path.join(__dirname, 'data', `${filename}.${ext}`);
export const buildLogPath = (filename, ext = 'log') => path.join(__dirname, 'logs', `${filename}.${ext}`);

export const writeFile = (filepath, data) => fs.promises.writeFile(
  filepath,
  JSON.stringify(data, null, 1),
  { encoding: 'utf-8' },
);

export const readFile = (filepath) => fs.promises.readFile(filepath, 'utf-8').then((data) => JSON.parse(data));

export const wait = async (ms, cb = (() => {})) => new Promise((res) => {
  setTimeout(() => res(cb()), ms);
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
