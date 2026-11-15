import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const env = { ...process.env };
const localJdk = resolve('../.runtime/android-tools/jdk21');
if (existsSync(localJdk)) {
  const folder = readdirSync(localJdk, { withFileTypes: true }).find(
    (item) => item.isDirectory() && item.name.startsWith('jdk-21'),
  );
  if (folder) env.JAVA_HOME = resolve(localJdk, folder.name);
}
if (!env.ANDROID_HOME && env.LOCALAPPDATA)
  env.ANDROID_HOME = resolve(env.LOCALAPPDATA, 'Android/Sdk');
env.GRADLE_USER_HOME ||= resolve('.gradle-cache');
const result = spawnSync(
  process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
  [':app:assembleDebug'],
  {
    cwd: resolve('android'),
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
console.log('APK de teste: android/app/build/outputs/apk/debug/app-debug.apk');
