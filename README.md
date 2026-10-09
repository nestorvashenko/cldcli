# cldcli

CLI для сборки приложений [ColdOS](https://github.com/nestorvashenko/coldos).

> **Важно.** ColdOS исполняет JavaScript. Приложения можно писать на других
> языках, но `cldcli` конвертирует их в JS — это не полноценные компиляторы.
> Для TypeScript и JavaScript поддержка нативная, для остальных языков
> работает **ограниченное подмножество** (см. таблицу ниже).

## Установка

```bash
npm install -g @nestorvashenko/cldcli
```

## Использование

```bash
cldcli init myapp --lang python
cd myapp
cldcli build
```

## Команды

| Команда | Описание |
|---|---|
| `cldcli init <name>` | Создать проект приложения |
| `cldcli build` | Собрать `.cuapp` |
| `cldcli langs` | Показать поддерживаемые языки |

### Флаги `init`

| Флаг | Описание |
|---|---|
| `--lang <язык>` | `ts`, `js`, `python`, `kotlin`, `go`, `php` (по умолчанию `ts`) |
| `--desc <текст>` | Описание приложения |
| `--author <имя>` | Автор |
| `--category <категория>` | Категория (`Development` по умолчанию) |

Без флагов `cldcli init` задаёт вопросы интерактивно.

## Языки

| Язык | Как работает | Ограничения |
|---|---|---|
| `ts` | esbuild, нативно | нет |
| `js` | нативно | нет |
| `python` | `prpython.js` | нет классов, циклов, `try`, `async`, декораторов |
| `kotlin` | `prkotlin.js` | нет классов, лямбд, extension-функций |
| `go` | `prgo.js` | нет goroutine, `defer`, структур, циклов `for` |
| `php` | `prphp.js` | нет классов, `namespace`, замыканий, `fn()` |

Неподдерживаемая конструкция **не игнорируется**: сборка падает с указанием
строки и подсказкой. Молчаливый неверный результат хуже явной ошибки.

Поддерживаемое подмножество каждого языка описано в `README.md`
соответствующего шаблона (`cuapp-python`, `cuapp-go` и т.д.).

## Структура проекта

```
myapp/
├── src/
│   ├── main.py          # код приложения (язык по --lang)
│   ├── index.css        # стили
│   └── coldos.d.ts      # декларации ColdOS API
├── assets/              # иконки
├── package.json
└── README.md
```

Иконки:

- `icon.png` — светлая
- `icon@dark.png` — тёмная
- `icon@darktransparent.png` — тёмная прозрачная
- `icon@transparent.png` — прозрачная

## Архитектура CLI

```
src/
├── index.js              точка входа, разбор команд
├── cli/
│   ├── args.js           разбор аргументов и флагов
│   └── prompt.js         интерактивные вопросы
├── commands/
│   ├── init.js           создание проекта
│   └── build.js          сборка .cuapp
├── core/
│   ├── logger.js         вывод в терминал
│   └── errors.js         типы ошибок, вывод без стектрейса
├── lang/
│   └── index.js          реестр языков: репозиторий, entry, парсер
├── parsers/
│   ├── prts.js           TypeScript -> JS
│   ├── prjs.js           JavaScript -> JS
│   ├── prpython.js       Python -> JS
│   ├── prkotlin.js       Kotlin -> JS
│   ├── prgo.js           Go -> JS
│   ├── prphp.js          PHP -> JS
│   └── shared/
│       ├── scanner.js    разбор строк, строк и комментариев
│       ├── emit.js       генерация JS-литералов
│       └── entry.js      точка входа приложения
├── utils/
│   ├── config.js         чтение/запись package.json
│   └── template.js       клонирование шаблона, плейсхолдеры
└── constants.js
```

Чтобы добавить язык: создайте `parsers/pr<lang>.js`, запись в
`lang/index.js` и шаблон-репозиторий `cuapp-<lang>`.

## Шаблоны

Каждый шаблон — отдельный репозиторий:

- [`cuapp-ts`](https://github.com/nestorvashenko/cuapp-ts)
- [`cuapp-js`](https://github.com/nestorvashenko/cuapp-js)
- [`cuapp-python`](https://github.com/nestorvashenko/cuapp-python)
- [`cuapp-kotlin`](https://github.com/nestorvashenko/cuapp-kotlin)
- [`cuapp-go`](https://github.com/nestorvashenko/cuapp-go)
- [`cuapp-php`](https://github.com/nestorvashenko/cuapp-php)

В шаблонах используются плейсхолдеры `__APP_ID__`, `__ENTRY_FN__`,
`__DISPLAY_NAME__`, `__DESCRIPTION__`, `__AUTHOR__`, `__CATEGORY__`.
`cldcli init` подставляет их при создании проекта.

## Результат сборки

```
build/
├── <app_id>.cuapp        готовый пакет для установки
└── unpackaged/
    ├── Core/
    │   ├── <app_id>.js
    │   ├── <app_id>.css
    │   └── <app_id>*.png
    ├── Info.cfg
    ├── Description.txt
    └── LICENSE
```

## License

MIT