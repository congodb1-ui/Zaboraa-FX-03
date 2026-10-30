import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';
import os from 'os';
import path from 'path';

const testDataDir = path.join(os.tmpdir(), 'zaboraa_test_data');
process.env.ZABORAA_DATA_DIR = testDataDir;

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      env: {
        ZABORAA_DATA_DIR: testDataDir,
      },
    },
  })
);
