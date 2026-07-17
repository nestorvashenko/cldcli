# cldcli

CLI для сборки приложений ColdOS из TypeScript.

## Установка

```bash
npm install -g cldcli
```

## Быстрый старт

```bash
# Создать новый проект
cldcli init myapp
```
# Перейти в папку проекта
cd myapp

# Положить иконки в assets/
# - icon.png
# - icon@dark.png
# - icon@darktransparent.png
# - icon@transparent.png

# Собрать приложение
```bash
cldcli build
```

## Команды

### `cldcli init <name>`

Создает новый проект ColdOS.

**Интерактивный режим:**
- Display name (отображаемое имя)
- Описание приложения
- Автор (по умолчанию: системное имя пользователя)
- Категория (Development, Games, Utilities, etc)

**Структура проекта:**
```
myapp/
├── src/
│   ├── main.ts          # Основной код приложения
│   ├── index.css        # Стили
│   └── coldos.d.ts      # TypeScript декларации ColdOS API
├── assets/
│   ├── icon.png         # Светлая иконка
│   ├── icon@dark.png    # Темная иконка
│   ├── icon@darktransparent.png
│   └── icon@transparent.png
├── package.json
├── tsconfig.json
└── README.md
```

### `cldcli build`

Собирает приложение в пакет `.cuapp`.

**Что делает:**
1. Компилирует TypeScript в JavaScript с помощью esbuild
2. Копирует CSS в папку Core
3. Переименовывает иконки в формат `appid_*.png`
4. Генерирует метаданные (Info.cfg, Description.txt, LICENSE)
5. Упаковывает все в архив `.cuapp`

**Результат:**
```
build/
├── myapp.cuapp          # Готовый пакет для установки
└── unpackaged/          # Исходная структура для отладки
    ├── Core/
    │   ├── myapp.js
    │   ├── myapp.css
    │   ├── myapp.png
    │   ├── myapp_dark.png
    │   ├── myapp_darktransparent.png
    │   └── myapp_transparent.png
    ├── Info.cfg
    ├── Description.txt
    └── LICENSE
```

## Шаблоны

Проект использует шаблон из репозитория:
[https://github.com/nestorvashenko/cuapp-ts](https://github.com/nestorvashenko/cuapp-ts)

## Требования

- Node.js >= 18
- Git (для клонирования шаблона)

## Разработка

```bash
# Клонировать репозиторий
git clone https://github.com/nestorvashenko/cldcli

# Установить зависимости
npm install

# Запустить в режиме разработки
node src/index.js init testapp
```

## Автор

Nestor

## Лицензия

Apache 2.0

## Поддержка

Если у вас возникли проблемы или предложения, создайте issue на GitHub.