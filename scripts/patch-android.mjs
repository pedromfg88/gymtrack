// Corre depois de "npx cap add android": aplica ao projeto Android gerado tudo o que é
// específico desta app (plugin do login Google, assinatura, ícones, cores, etc.).
// Se algum ponto de ancoragem não for encontrado (ex.: o Capacitor mudou o modelo),
// falha com uma mensagem clara em vez de produzir um APK a meio.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const APP = 'android/app';
const MAIN = join(APP, 'src/main');
const RES = join(MAIN, 'res');
const MARK = 'GYMTRACK_PATCH';

function read(p) { return readFileSync(p, 'utf8'); }
function write(p, s) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); }

function edit(file, find, replace, label) {
  const s = read(file);
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error(`[${label}] âncora encontrada ${n} vez(es) em ${file} (esperado: 1)`);
  write(file, s.replace(find, () => replace));
  console.log('  ok', label);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

if (!existsSync(APP)) throw new Error('Pasta android/ não existe — corre primeiro "npx cap add android".');

const GRADLE = join(APP, 'build.gradle');
if (read(GRADLE).includes(MARK)) {
  console.log('Projeto Android já tinha sido preparado — nada a fazer.');
  process.exit(0);
}
console.log('A preparar o projeto Android…');

// 1) Código Java: Activity + plugin do login Google
for (const f of readdirSync('native/java')) {
  copyFileSync(join('native/java', f), join(MAIN, 'java/pt/pedrogoncalves/gymtrack', f));
}
console.log('  ok código Java (MainActivity + DriveAuthPlugin)');

// 2) app/build.gradle: versão, assinatura e dependência do Google Play Services
edit(GRADLE, "apply plugin: 'com.android.application'\n",
`apply plugin: 'com.android.application'

// ${MARK} — valores passados pelo GitHub Actions
def vcode = (System.getenv("VERSION_CODE") ?: "1") as Integer
def vname = System.getenv("VERSION_NAME") ?: "1.0"
`, 'versão (variáveis)');
edit(GRADLE, 'versionCode 1\n        versionName "1.0"', 'versionCode vcode\n        versionName vname', 'versão (defaultConfig)');
edit(GRADLE,
`    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }`,
`    signingConfigs {
        release {
            def ksPath = System.getenv("KEYSTORE_PATH")
            if (ksPath) {
                storeFile file(ksPath)
                storePassword System.getenv("KEYSTORE_PASSWORD")
                keyAlias System.getenv("KEY_ALIAS")
                keyPassword System.getenv("KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
            if (System.getenv("KEYSTORE_PATH")) {
                signingConfig signingConfigs.release
            }
        }
    }`, 'assinatura do APK');
edit(GRADLE, "    implementation project(':capacitor-android')\n",
"    implementation project(':capacitor-android')\n    implementation 'com.google.android.gms:play-services-auth:22.0.0'\n", 'dependência play-services-auth');

// 3) Gradle com mais memória (a compilação do Kotlin da câmara + AGP precisa)
edit('android/gradle.properties', 'org.gradle.jvmargs=-Xmx1536m', 'org.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8', 'memória do Gradle');

// 4) Manifesto: sem backup automático (a sessão vive no Drive) e heap grande (fotografias)
edit(join(MAIN, 'AndroidManifest.xml'), 'android:allowBackup="true"', 'android:allowBackup="false"\n        android:largeHeap="true"', 'manifesto (backup/heap)');

// 4b) Alarme do temporizador de descanso: recetor do alarme (manifesto), vibração e alarmes exatos
edit(join(MAIN, 'AndroidManifest.xml'), '    </application>', '        <receiver android:name=".RestAlarmReceiver" android:exported="false" />\n    </application>', 'manifesto (recetor do alarme)');
edit(join(MAIN, 'AndroidManifest.xml'), '<uses-permission android:name="android.permission.INTERNET" />', '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.VIBRATE" />', 'manifesto (vibração)');
// Sem esta permissão o Android 12+ recusa o AlarmManager.setAlarmClock e o alarme nunca é agendado.
// USE_EXACT_ALARM (Android 13+) é concedida na instalação; SCHEDULE_EXACT_ALARM cobre o Android 12.
edit(join(MAIN, 'AndroidManifest.xml'), '<uses-permission android:name="android.permission.VIBRATE" />', '<uses-permission android:name="android.permission.VIBRATE" />\n    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />\n    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" android:maxSdkVersion="32" />', 'manifesto (alarmes exatos)');

// 5) Cores e temas: cor da app em toda a janela (barras do sistema) e no arranque
write(join(RES, 'values/ic_launcher_background.xml'),
`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0E0F11</color>
</resources>
`);
edit(join(RES, 'values/styles.xml'),
`        <item name="android:background">@null</item>
    </style>`,
`        <item name="android:background">@null</item>
        <item name="android:windowBackground">@color/ic_launcher_background</item>
    </style>`, 'tema principal (cor da janela)');
edit(join(RES, 'values/styles.xml'),
`        <item name="android:background">@drawable/splash</item>
    </style>`,
`        <item name="android:background">@drawable/splash</item>
        <item name="windowSplashScreenBackground">@color/ic_launcher_background</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>`, 'tema de arranque');

// 6) Ícones e ecrã de arranque
let n = 0;
for (const f of walk('native/res')) {
  if (f.endsWith('icon-512.png') || f.endsWith('splash.png')) continue;
  const rel = f.slice('native/res/'.length);
  copyFileSync(f, join(RES, rel));
  n++;
}
let splashes = 0;
for (const f of walk(RES)) {
  if (f.endsWith('/splash.png')) { copyFileSync('native/res/splash.png', f); splashes++; }
}
console.log(`  ok ícones (${n} ficheiros) e ecrã de arranque (${splashes} imagens)`);

console.log('Projeto Android preparado.');
