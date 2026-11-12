/** Local staging APK only. Never starts EAS or GitHub Actions. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
require('@expo/env').load(root);
process.env.EXPO_PUBLIC_APP_ENV = 'preview';
process.env.SHALEAN_LOCAL_PREVIEW = '1';
process.env.CI = '1';
function fail(message) { console.error(message); process.exit(1); }
for (const name of ['EXPO_PUBLIC_API_BASE_URL', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_BUILD_NUMBER']) {
  if (!process.env[name]?.trim()) fail(`Missing ${name}; configure the approved staging environment locally.`);
}
// Evaluate the same safety guards used during native generation before any build.
require('@expo/config').getConfig(root);
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk || !fs.existsSync(sdk)) fail('Set ANDROID_HOME to an installed Android SDK.');
const javac = process.env.JAVA_HOME
  ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac')
  : 'javac';
const compiler = spawnSync(javac, ['-version'], { encoding: 'utf8' });
if (compiler.error || compiler.status !== 0) {
  fail('A full JDK is required (a Java runtime is insufficient). Set JAVA_HOME to JDK 17 with bin/javac.');
}
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
run('npm', ['run', 'typecheck']);
run('npm', ['run', 'lint']);
run('npx', ['--no-install', 'expo', 'prebuild', '--platform', 'android', '--no-install']);
run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', [
  ':app:assembleRelease', '--no-daemon', '--max-workers=1',
  '--init-script', path.join('..', 'scripts', 'local-preview.gradle'),
  '-Dorg.gradle.jvmargs=-Xmx1536m',
], path.join(root, 'android'));
const apk = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk');
if (!fs.existsSync(apk)) fail('Gradle did not produce the expected APK.');
console.log(`Staging test APK: ${apk}`);
console.log('Uses local test signing and a separate staging package. Future staging updates must use the same signing key.');
