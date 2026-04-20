# הגדרת LM Studio לבדיקות מקומיות

PulseCV יכול להריץ בדיקת AI מקומית דרך LM Studio בלי לחשוף API keys לדפדפן.
הבדיקה הזו אופציונלית ולא חוסמת commit: אם LM Studio לא פעיל, שאר הבדיקות עדיין רצות.

## 1. פתח את LM Studio

פתח את LM Studio במחשב המקומי.

## 2. טען מודל

- עבור ל־`My Models`.
- בחר מודל מתאים לניתוח טקסט, למשל DeepSeek-R1 או Gemma 3.
- לחץ `Load`.

## 3. הפעל את Local Server

- עבור ל־`Local Server`.
- לחץ `Start Server`.
- ודא שהשרת רץ בכתובת:

```text
http://localhost:1234
```

ה־runner משתמש ב־OpenAI-compatible API:

```text
GET http://localhost:1234/v1/models
POST http://localhost:1234/v1/chat/completions
```

## 4. הרץ את הבדיקות

```bat
run_tests.bat
```

הסקריפט מזהה אוטומטית:

- האם LM Studio Server פועל על port `1234`.
- איזה מודל טעון דרך `GET /v1/models`.
- האם יש DeepSeek-R1 טעון, ואם כן הוא מועדף.
- אם אין DeepSeek-R1, הוא יעדיף Gemma 3 אם היא טעונה.
- אם אין שניהם, הוא ישתמש במודל הראשון שמוחזר מהשרת.

## מודלים מומלצים לבדיקה

| מודל | RAM מומלץ | איכות reasoning | הערה |
|---|---:|---:|---|
| DeepSeek-R1-Distill-Qwen-7B | 8GB | גבוהה | מומלץ לבדיקות reasoning מקומיות |
| DeepSeek-R1-Distill-Qwen-14B | 16GB | גבוהה מאוד | איכותי יותר, איטי יותר |
| DeepSeek-R1-Distill-Llama-8B | 8GB | גבוהה | חלופה טובה |
| Gemma 3 | 8GB+ | טובה | מתאים לשכתובים והסברים, אם טעון ב־LM Studio |

## מודל Gemma 3 שנמצא במחשב הזה

נמצא מודל מקומי תחת MSTY:

```text
C:\Users\user\AppData\Roaming\Msty\models\manifests\registry.ollama.ai\library\gemma3\latest
```

שם המודל לפי המניפסט:

```text
gemma3:latest
```

קובץ ה־blob המרכזי נמצא כאן:

```text
C:\Users\user\AppData\Roaming\Msty\models\blobs\sha256-aeda25e63ebd698fab8638ffb778e68bed908b960d39d0becc650fa981609d25
```

גודל ה־blob הוא כ־3.34GB.

שים לב: זה מוכיח שהמודל נמצא בדיסק דרך MSTY, אבל כדי ש־`run_tests.bat` ישתמש בו דרך LM Studio צריך לטעון אותו בתוך LM Studio או להשתמש בשרת מקומי אחר שחושף אותו דרך OpenAI-compatible API.

## פתרון בעיות

**הסקריפט אומר `LM Studio server not running`:**

פתח LM Studio, עבור ל־`Local Server`, ולחץ `Start Server`.

**הסקריפט אומר `No model loaded`:**

פתח LM Studio, עבור ל־`My Models`, בחר מודל ולחץ `Load`.

**הניתוח לוקח הרבה זמן:**

זה נורמלי על CPU. מודלי reasoning יכולים לקחת עד 90 שניות.
ה־timeout מוגדר ל־90 שניות ולא מפיל את כל הבדיקה.

**בדיקת AI נכשלה אבל שאר הבדיקות עברו:**

זה תקין. בדיקת AI היא non-blocking. אם lint, build, bundle audit, assets, server ו־SSRF עברו, אפשר להמשיך לעבוד.
