# คู่มือใช้งาน FoliMarkdown CLI

CLI ใช้ตัวเรนเดอร์และตัวส่งออกเดียวกับ FoliMarkdown เพื่อแปลง Markdown เป็น DOCX และ PDF รวมถึงเปิดเป็น HTTP API สำหรับโปรแกรมอื่นเรียกใช้ได้ นอกจากนี้ยังใช้ Handlebars ผูกข้อมูล JSON เข้ากับ Markdown template เพื่อสร้างรายงานซ้ำจากระบบอื่นได้ รองรับตาราง แผนภูมิ Mermaid, `::: row` / `::: col`, `::: absolute`, รูปภาพ และการขึ้นหน้าใหม่ตามที่แอปรองรับ

ในแอป เมื่อเปิดเอกสารที่มี `{{field}}` ให้เลือกแท็บ **Data** แล้วกด **Bind data** เพื่อเปิด modal ระบบจะสร้าง JSON skeleton จาก field แบบซ้อนและรายการ `{{#each ...}}` (พร้อม object ตัวอย่างหนึ่งแถว) ให้ กรอกค่าแล้วกด **Apply data** เพื่ออัปเดตเฉพาะ preview โดยไม่เปลี่ยน Markdown ต้นฉบับ กด **Reset preview** เพื่อกลับไปดู template เดิม ส่วน CLI/API ใช้ `data` bind template เพื่อสร้างไฟล์ผลลัพธ์

## เตรียมเครื่อง

ติดตั้ง Node.js **22.12 ขึ้นไป** และ Chrome หรือ Chromium จากนั้นที่โฟลเดอร์โปรเจกต์ให้ติดตั้ง dependencies:

```sh
npm ci
```

รันจากโปรเจกต์ด้วย `npm run convert --` หรือใช้ `npm link` หนึ่งครั้งเพื่อเรียกคำสั่ง `folimarkdown` ได้จาก PATH:

```sh
npm link
folimarkdown --help
```

ตัวอย่างด้านล่างใช้ `folimarkdown` หากไม่ได้ทำ `npm link` ให้เปลี่ยนส่วนต้นของคำสั่งเป็น `npm run convert --` สำหรับการแปลงไฟล์ และ `npm run serve:cli --` สำหรับ server mode

## แปลงไฟล์

```sh
folimarkdown document.md
```

ค่าเริ่มต้นจะสร้าง `document.docx` และ `document.pdf` ในโฟลเดอร์เดียวกับ `document.md` รองรับไฟล์ต้นทางนามสกุล `.md`, `.markdown` และ `.txt` หากไฟล์ผลลัพธ์มีอยู่แล้ว คำสั่งจะหยุดเพื่อป้องกันการเขียนทับ ใช้ `--force` เมื่อต้องการแทนที่

```sh
# สร้าง PDF อย่างเดียว
folimarkdown invoice.md --format pdf

# ตั้งชื่อไฟล์ผลลัพธ์เอง (ใช้กับ format เดียว)
folimarkdown invoice.md --format docx --output exports/invoice-final.docx

# สร้างทั้งสอง format ในโฟลเดอร์ที่ระบุ
folimarkdown proposal.md --out-dir exports

# เขียนทับผลลัพธ์เดิม
folimarkdown proposal.md --format pdf --force
```

`--output` ใช้ร่วมกับ `--format pdf` หรือ `--format docx` เท่านั้น นามสกุลไฟล์ต้องตรงกับ format และใช้ร่วมกับ `--out-dir` ไม่ได้ `--title` เปลี่ยนชื่อเอกสารและค่า `{title}` ใน header/footer แต่ชื่อไฟล์ผลลัพธ์ยังอิงชื่อไฟล์ต้นทางหากไม่ได้กำหนด `--output`

### ตัวเลือกสำหรับแปลงไฟล์

| ตัวเลือก | ความหมาย |
| --- | --- |
| `-f, --format docx\|pdf\|both` | รูปแบบผลลัพธ์; ค่าเริ่มต้น `both` |
| `-o, --output FILE` | ที่อยู่และชื่อไฟล์ผลลัพธ์เมื่อเลือก format เดียว |
| `--out-dir DIR` | โฟลเดอร์ผลลัพธ์; ค่าเริ่มต้นคือโฟลเดอร์ของไฟล์ต้นทาง |
| `--title TEXT` | ชื่อเอกสารและค่าของ `{title}` |
| `--paper a4\|letter` | ขนาดกระดาษ |
| `--orientation portrait\|landscape` | แนวกระดาษ |
| `--margin normal\|narrow\|wide` | ระยะขอบ |
| `--header TEXT`, `--footer TEXT` | ข้อความหัว/ท้ายกระดาษ; ใช้ `{title}`, `{page}`, `{pages}` ได้ |
| `--no-header`, `--no-footer` | ล้างหัว/ท้ายกระดาษที่กำหนดไว้ในเอกสาร |
| `--page-numbers`, `--no-page-numbers` | เปิด/ปิดเลขหน้า |
| `--first-page-blank`, `--no-first-page-blank` | ซ่อน/แสดง header และ footer ในหน้าแรก |
| `--font NAME` | `system`, `Sarabun`, `Prompt`, `Kanit`, `Noto Sans Thai`, `Noto Serif Thai`, `IBM Plex Sans Thai` |
| `--chrome PATH` | ระบุไฟล์รัน Chrome/Chromium หากค้นหาอัตโนมัติไม่พบ |
| `--timeout SECONDS` | เวลารอโหลดภาพ/แผนภูมิ 1–600 วินาที; ค่าเริ่มต้น 30 |
| `--force` | เขียนทับไฟล์ผลลัพธ์เดิม |
| `-h, --help` | แสดงวิธีใช้ |

การตั้งค่าหน้ากระดาษที่บันทึกในไฟล์ Markdown ของ FoliMarkdown จะถูกอ่านอัตโนมัติ ตัวเลือก CLI ที่ระบุจะทับเฉพาะค่าของตัวเลือกนั้น ค่าที่ไม่ได้ระบุยังใช้ค่าจากเอกสาร

```sh
folimarkdown proposal.md --format pdf --paper letter \
  --orientation landscape --margin narrow \
  --header '{title}' --footer 'หน้า {page} / {pages}' --page-numbers

folimarkdown invitation.md --format docx --title 'คำเชิญ' \
  --font 'Noto Serif Thai' --no-header --no-footer \
  --no-page-numbers --first-page-blank
```

ควรครอบข้อความที่มีช่องว่างหรือ `{...}` ด้วยเครื่องหมาย quote เพื่อให้ shell ส่งค่าไปครบ

## สร้างรายงานจาก Handlebars template

ไฟล์ `.md` ที่ได้จากเทมเพลตในแอปเก็บ `{{...}}` ไว้สำหรับ bind ภายหลัง ส่ง Markdown และ JSON ด้วย `--data`:

```sh
folimarkdown invoice.md \
  --data examples/invoice-data.json \
  --format pdf --out-dir exports --title 'Invoice INV-2026-042'
```

ในแอปให้เลือก **Create document** แล้วใช้ **Download Markdown** เพื่อบันทึก source ที่มี `{{...}}`; จากนั้นส่งไฟล์นั้นกับ JSON เข้า CLI หรือ API เมื่อพร้อมสร้างรายงานจริง

ดู data schema ตัวอย่างของ Invoice ได้ที่ [`examples/invoice-data.json`](../examples/invoice-data.json) ชื่อ field ใน JSON ต้องตรงกับ binding ใน Markdown เช่น `{{invoice.number}}` หรือรายการ `{{#each items}}...{{/each}}`

หรือใช้ไฟล์ `.hbs` แยกต่างหาก:

```sh
folimarkdown examples/monthly-report.hbs \
  --data examples/monthly-report.json \
  --format pdf --out-dir exports --title 'Monthly report'
```

ตัวอย่างเต็มอยู่ใน [`examples/monthly-report.hbs`](../examples/monthly-report.hbs) และ [`examples/monthly-report.json`](../examples/monthly-report.json) ใช้ไวยากรณ์ Handlebars มาตรฐาน เช่น `{{field}}`, `{{#if condition}}...{{/if}}`, `{{#each rows}}...{{/each}}` และ field แบบซ้อน `{{customer.name}}` ระบบจะ render template เป็น Markdown ก่อนอ่าน page settings และส่งออกเอกสาร

- `{{value}}` จะใช้ HTML escaping ตามค่าเริ่มต้นของ Handlebars ส่วน `{{{value}}}` จะใส่ค่าตามเดิม ใช้ triple braces เฉพาะกับเนื้อหาที่เชื่อถือได้และต้องการ Markdown/HTML ที่เขียนไว้แล้ว
- ส่งตัวเลขเป็น JSON number หรือข้อความตัวเลข และส่งวันเวลาเป็น ISO 8601 แล้วใช้ formatting helpers ควบคุมรูปแบบที่แสดงในรายงาน
- ไฟล์รูปสัมพัทธ์ใน Markdown อ้างจากโฟลเดอร์ของไฟล์ `.hbs`; ข้อมูล JSON ที่ส่งผ่าน `--data` อ้าง path จาก working directory ที่รันคำสั่ง
- `.hbs` ต้องใช้คู่กับ `--data <file.json>`; ไฟล์ `.md`, `.markdown` และ `.txt` ใช้ `--data` ได้เมื่อต้องการ bind Handlebars ด้วย JSON ชั้นบนสุดต้องเป็น object
- เทมเพลตในแอปยังคง `{{...}}` ใน Markdown ที่บันทึกไว้ ถ้าส่งออก PDF/DOCX จากแอปโดยตรงก่อน bind จะเห็น expression เหล่านี้ตามตัวอักษร ให้ใช้ CLI/API พร้อม JSON ก่อนสร้างเอกสารฉบับสุดท้าย

### จัดรูปแบบค่าด้วย helpers

ใช้ formatting helpers กับ field ได้โดยตรงใน template; ใช้ได้ทั้งแท็บ **Data**, CLI และ API:

```hbs
{{formatNumber quantity minimumFractionDigits=0}}
{{formatCurrency total "THB" "th-TH"}}
{{formatDate issuedAt style="long" locale="th-TH" timeZone="Asia/Bangkok"}}
{{formatTime startsAt style="short" locale="th-TH" timeZone="Asia/Bangkok"}}
{{formatPercent completion maximumFractionDigits=1}}
{{uppercase customer.name}}
{{join tags ", "}}
{{multiply quantity unitPrice}}
{{formatCurrency (add subtotal tax) "THB" locale="th-TH"}}
{{formatNumber (average scores) maximumFractionDigits=1}}
{{foli "round(totals.revenue / totals.units, 2)"}}
```

มี helper สำหรับสูตร `add`, `sum`, `subtract`, `multiply`, `divide`, `average`, `min`, `max`, `round`, `ceil`, `floor`, `abs`, `power`, `mod` และ `percent` ซึ่งรับตัวเลขหลายค่าได้ เช่น `{{multiply quantity unitPrice}}` หรือ `{{formatCurrency (add subtotal tax) "THB" locale="th-TH"}}`; `sum` และ `average` รับ array ได้ด้วย ส่วน `percent amount rate` คำนวณ amount × rate ÷ 100 ใช้สูตรซ้อนในวงเล็บเพื่อส่งผลคำนวณเข้า formatter ได้

**Foli Script** เป็น JavaScript expression แบบย่อ เรียกจาก Handlebars ด้วย `{{foli "expression"}}` เช่น `{{foli "round(totals.revenue / totals.units, 2)"}}` รองรับการอ้าง field แบบ dot path, วงเล็บ, ตัวดำเนินการ `+ - * / % **`, เปรียบเทียบ, `&&` / `||` และฟังก์ชันคำนวณ `abs`, `ceil`, `floor`, `round`, `min`, `max`, `sum`, `average`, `percent` โดยไม่รองรับคำสั่งหรือการเรียก JavaScript ทั่วไป ตัวอย่างใน [`examples/monthly-report.hbs`](../examples/monthly-report.hbs) แสดงรายได้เฉลี่ยต่อหน่วย

ในแอป เลือก **Data → Functions** เพื่อสร้าง reusable function จากชื่อ พารามิเตอร์ และ expression เช่น ชื่อ `netAmount`, พารามิเตอร์ `amount, discount`, expression `round(amount * (1 - discount / 100), 2)` แล้วเรียกใน template ด้วย `{{foli "netAmount(invoice.subtotal, invoice.discount)"}}` รายการ function บันทึกไว้ในเครื่องและใช้ซ้ำได้กับเอกสารในแอป; CLI/API รองรับ Foli built-in functions แต่ไม่ได้อ่าน function library ในเครื่อง

format helpers ได้แก่ `formatNumber`, `formatCurrency`, `formatDate`, `formatTime`, `formatPercent`, `uppercase`, `lowercase`, `capitalize`, `join`, `default` และ helper แบบรวม `format value "number|currency|date|time|percent"` ค่า locale ใช้รูปแบบ BCP 47 เช่น `en-US` หรือ `th-TH`; วันเวลาควรส่งเป็น ISO 8601 เพื่อให้ตีความได้แน่นอน `formatDate` รองรับ style `short`, `medium`, `long`, `full` ส่วน number/currency รองรับตัวเลือกของ `Intl.NumberFormat` เช่น `minimumFractionDigits` และ `maximumFractionDigits`

### ใช้ template ผ่าน HTTP API

เรียก `POST /convert` ด้วย Markdown ที่ export จากแอปและ `data` เพื่อ bind ค่า หรือส่ง `template` และ `data` โดยตรง:

```json
{
  "template": "# รายงาน {{period}}\n\n{{#each rows}}\n- {{name}}: {{amount}}\n{{/each}}",
  "data": {
    "period": "ตุลาคม 2026",
    "rows": [
      { "name": "Product A", "amount": "฿240,000" },
      { "name": "Product B", "amount": "฿127,500" }
    ]
  },
  "format": "pdf",
  "title": "รายงานยอดขาย",
  "filename": "sales-october",
  "layout": {
    "paperSize": "a4",
    "orientation": "portrait",
    "margin": "normal",
    "font": "Sarabun",
    "header": "{title}",
    "footer": "หน้า {page} / {pages}",
    "pageNumbers": true
  }
}
```

บันทึก JSON ข้างต้นเป็น `request.json` แล้วส่งด้วยคำสั่ง `curl` ในหัวข้อ [ส่งคำขอแปลงไฟล์](#ส่งคำขอแปลงไฟล์) ระบบรับ `template` เป็น source string ทุก request ดังนั้นระบบเรียก API สามารถเก็บ template ไว้ในไฟล์หรือฐานข้อมูลของตัวเองแล้วส่งพร้อม data แต่ละครั้ง ต้องส่ง `template` กับ `data` เป็นคู่ และห้ามส่ง `markdown` พร้อมกัน

### Markdown และรูปภาพ

- รูปที่อ้างด้วย path สัมพัทธ์ เช่น `![Photo](images/photo.png)` จะค้นหาจากโฟลเดอร์ของไฟล์ Markdown รองรับ PNG, JPEG, GIF, WebP และ AVIF
- รูปแบบ data URL ที่ฝังใน Markdown ใช้ได้โดยตรง หากส่งออก DOCX รูปแต่ละไฟล์ต้องไม่เกิน 20 MB
- `asset:` เป็นการอ้างรูปจากพื้นที่เก็บข้อมูลภายในแอป เปิดเอกสารใน FoliMarkdown แล้วใช้ **Save .md** เพื่อฝังรูปลงไฟล์ก่อนนำมาแปลงด้วย CLI
- Mermaid ต้องใช้อินเทอร์เน็ตเพื่อโหลดตัวเรนเดอร์ หากรูปหรือแผนภูมิเรนเดอร์ไม่สำเร็จ CLI จะแจ้งข้อผิดพลาด
- PDF ที่ได้จากคำสั่งนี้เป็นภาพของหน้าเอกสาร จึงค้นหาหรือเลือกข้อความใน PDF ไม่ได้ ส่วน DOCX สามารถแก้ไขเนื้อหาส่วนใหญ่ต่อได้

ดูรูปแบบคอลัมน์และตำแหน่งลอยเพิ่มเติมใน [README](../README.md#column-layouts) และ [Floating content](../README.md#floating-content)

## เปิด HTTP API

```sh
npm run serve:cli -- --port 3000
# หรือหลัง npm link
folimarkdown serve --port 3000
```

เซิร์ฟเวอร์ฟังที่ `127.0.0.1:3000` ตามค่าเริ่มต้น ต้องมี Chrome/Chromium เช่นเดียวกับการแปลงไฟล์ หาก port ถูกใช้แล้วให้เลือก `--port` ใหม่ ตรวจสถานะด้วย:

```sh
curl http://127.0.0.1:3000/health
```

เมื่อพร้อมใช้งานจะได้ `{"status":"ok"}` และ HTTP 200 หากตัวเรนเดอร์ใช้ไม่ได้จะได้ `{"status":"unavailable"}` และ HTTP 503

### ส่งคำขอแปลงไฟล์

สร้าง `request.json`:

```json
{
  "markdown": "# รายงาน\n\nเนื้อหา **ตัวหนา**",
  "format": "pdf",
  "title": "รายงานประจำวัน",
  "filename": "daily-report",
  "layout": {
    "paperSize": "a4",
    "orientation": "portrait",
    "margin": "normal",
    "header": "{title}",
    "footer": "หน้า {page} / {pages}",
    "pageNumbers": true,
    "firstPageBlank": false,
    "font": "Sarabun"
  }
}
```

แล้วเรียก API:

```sh
curl -fS http://127.0.0.1:3000/convert \
  -H 'Content-Type: application/json' \
  --data-binary @request.json \
  -o daily-report.pdf
```

เปลี่ยน `format` เป็น `docx` และบันทึกด้วย `-o daily-report.docx` เพื่อรับ DOCX หรือใช้ `both` และ `-o daily-report.zip` เพื่อรับ ZIP ที่มี DOCX กับ PDF เซิร์ฟเวอร์จะส่ง `Content-Type` และ `Content-Disposition` ตามรูปแบบผลลัพธ์ โดย `filename` ใช้กำหนดชื่อไฟล์ดาวน์โหลดใน response; `curl -o` ใช้ชื่อที่กำหนดฝั่ง client

| ฟิลด์ JSON | ความหมาย |
| --- | --- |
| `markdown` | เนื้อหา Markdown เป็น string; bind กับ `data` ได้ |
| `template` | source ของ Handlebars template ที่สร้าง Markdown; ใช้แทน `markdown` และต้องส่งคู่กับ `data` |
| `data` | JSON object สำหรับ bind กับ `markdown` หรือ `template` |
| `format` | `pdf` (ค่าเริ่มต้น), `docx` หรือ `both` |
| `title` | ชื่อเอกสารและค่า `{title}` |
| `filename` | ชื่อไฟล์ใน header ของ response; เซิร์ฟเวอร์ปรับให้เป็นชื่อไฟล์ที่ปลอดภัย |
| `layout` | object ของการตั้งค่าหน้ากระดาษตามตัวอย่าง; ทับเฉพาะค่าที่ระบุ |
| `images` | object ที่จับคู่ path รูปใน Markdown กับ data URL หรือข้อมูล base64 |

ต้องส่งอย่างใดอย่างหนึ่งระหว่าง `markdown` หรือ `template`; ส่ง `data` เมื่อมี Handlebars ที่ต้อง bind API จำกัด source ไว้ 1 MB และขนาด request รวมยังอยู่ภายใต้ `--max-input-mb`

หาก Markdown มี `![Photo](images/photo.png)` ให้ส่งรูปพร้อมคำขอ ตัวอย่างส่วนที่เพิ่มใน JSON:

```json
{
  "markdown": "# ประวัติ\n\n![Photo](images/photo.png)",
  "images": {
    "images/photo.png": "data:image/png;base64,iVBORw0KGgoAAA..."
  }
}
```

ค่า `images` ต้องมี key ตรงกับ path ใน Markdown ทั้งหมดที่อ้างเป็นไฟล์สัมพัทธ์ และใช้ข้อมูลรูปจริงแทน `...` สามารถส่ง base64 ล้วนได้เมื่อ path มีนามสกุลรูปที่รองรับ รูป data URL ที่อยู่ใน Markdown อยู่แล้วไม่ต้องส่งซ้ำใน `images` API ไม่อ่าน path รูปจากดิสก์ของเซิร์ฟเวอร์

### ตัวเลือกของเซิร์ฟเวอร์

| ตัวเลือก | ความหมาย |
| --- | --- |
| `--host ADDRESS` | IP/ชื่อที่ให้เซิร์ฟเวอร์ฟัง; ค่าเริ่มต้น `127.0.0.1` |
| `--port NUMBER` | port 0–65535; ค่าเริ่มต้น 3000 (ใช้ 0 ให้ระบบเลือก port) |
| `--token SECRET` | กำหนด Bearer token; ใช้ตัวแปร `FOLIMARKDOWN_API_TOKEN` แทนได้ |
| `--cors-origin ORIGIN` | อนุญาต browser origin เดียว เช่น `https://example.com`; ใช้ `*` เพื่ออนุญาตทุก origin |
| `--max-input-mb NUMBER` | ขนาด JSON สูงสุด 1–100 MB; ค่าเริ่มต้น 25 MB |
| `--max-concurrent NUMBER` | จำนวนงานแปลงพร้อมกัน 1–8; ค่าเริ่มต้น 2 |
| `--chrome PATH` | ไฟล์รัน Chrome/Chromium |
| `--timeout SECONDS` | เวลารอโหลดภาพ/แผนภูมิ 1–600 วินาที; ค่าเริ่มต้น 30 |
| `-h, --help` | แสดงวิธีใช้ |

การฟังบนที่อยู่ภายนอก localhost ต้องกำหนด token โดยเซิร์ฟเวอร์จะตรวจ `Authorization: Bearer <token>` บน `POST /convert`:

```sh
FOLIMARKDOWN_API_TOKEN='replace-with-a-long-secret' \
  npm run serve:cli -- --host 0.0.0.0 --port 3000

curl -fS http://127.0.0.1:3000/convert \
  -H 'Authorization: Bearer replace-with-a-long-secret' \
  -H 'Content-Type: application/json' \
  --data-binary @request.json \
  -o daily-report.pdf
```

หากให้เครื่องอื่นเรียกผ่านเครือข่าย ควรใช้งานผ่าน HTTPS ของ reverse proxy เพื่อไม่ให้ token ถูกส่งเป็นข้อความเปิดเผย `--cors-origin` จำเป็นเมื่อเว็บใน browser เรียก API ข้าม origin; การเรียกจาก `curl` ไม่ต้องใช้ CORS

### ข้อผิดพลาดที่พบบ่อย

API ตอบข้อผิดพลาดเป็น JSON รูปแบบ `{"error":"ข้อความอธิบาย"}`

| อาการ / HTTP status | วิธีตรวจสอบ |
| --- | --- |
| CLI แจ้งว่าเริ่ม Chrome/Chromium ไม่ได้ | ติดตั้ง browser หรือกำหนด `--chrome /path/to/browser` |
| CLI แจ้งว่า output มีอยู่แล้ว | เปลี่ยน `--output`/`--out-dir` หรือใช้ `--force` |
| รูปไม่พบ หรือ `asset:` | ตรวจ path จากตำแหน่งไฟล์ Markdown; สำหรับ `asset:` ให้ Save .md จากแอปก่อน |
| Mermaid ไม่แสดง | ตรวจ syntax, อินเทอร์เน็ต และเพิ่ม `--timeout` เมื่อโหลดช้า |
| `400` | ตรวจ JSON, ฟิลด์ `markdown`, `format` และค่าใน `layout` |
| `401` | ส่ง `Authorization: Bearer <token>` ให้ตรงกับเซิร์ฟเวอร์ |
| `413` | JSON ใหญ่เกิน `--max-input-mb` |
| `415` | เพิ่ม header `Content-Type: application/json` |
| `422` | ตรวจรูป/Markdown/การเรนเดอร์ และอ่านข้อความใน `error` |
| `429` | มีงานแปลงครบ `--max-concurrent` แล้ว; รอและลองใหม่ |
| `503` | ตัวเรนเดอร์ไม่พร้อม; ตรวจสถานะ `/health` และ log ของเซิร์ฟเวอร์ |

ดูรายการคำสั่งล่าสุดได้ด้วย `folimarkdown --help` หรือ `folimarkdown serve --help`
