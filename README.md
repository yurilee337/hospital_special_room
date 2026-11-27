# ระบบประเมินความพึงพอใจห้องพิเศษ

เว็บแอปสำหรับรับความคิดเห็นและแจ้งปัญหาการใช้บริการห้องพิเศษ โดยผู้ป่วยหรือญาติสแกน QR Code เพื่อประเมิน ส่วนผู้ดูแลระบบใช้ Dashboard ตรวจผลประเมิน จัดการ QR Code และติดตามรายงานปัญหา

## ความสามารถ

- แบบประเมินให้คะแนน 3 หัวข้อ ตั้งแต่ 1–5 พร้อมข้อเสนอแนะและประเภทผู้ตอบ
- แจ้งปัญหาพร้อมรายละเอียด หมวดหมู่ และรูปภาพประกอบ
- QR Code เชื่อมอาคารกับ Ward ได้หลายรายการ และเลือกได้ว่าจะล็อกไว้กับเตียงหรือให้ผู้ประเมินเลือกเอง
- Dashboard สรุปผลตามช่วงเวลาและอาคาร พร้อมแนวโน้มรายเดือนและห้องที่มีการประเมินสูง
- ค้นหา กรอง แบ่งหน้า และดูรายละเอียดผลประเมิน/รายงานปัญหา พร้อมส่งออกผลประเมินเป็น CSV
- จัดการ QR Code และเปิด/ปิด Ward โดยเก็บข้อมูลเดิมและประวัติการประเมินไว้
- พิมพ์ QR Code ลงเทมเพลต A4 ที่ `frontend/public/templates/qr-ward-template.pdf`

## เทคโนโลยีและโครงสร้าง

- Frontend: React 18, Vite, React Router, Bootstrap, Chart.js
- Backend: Node.js, Express, Session และ REST API
- Database: MySQL หรือ MariaDB (ทดสอบใช้งานกับ XAMPP)

```text
backend/     Express API, scripts และไฟล์รูปภาพที่อัปโหลด
database/    SQL ตั้งต้นและ database migrations
frontend/    React application และเทมเพลตพิมพ์ QR Code
```

## สิ่งที่ต้องมี

- Node.js 18 ขึ้นไป และ npm
- MySQL หรือ MariaDB; ใช้ XAMPP ได้
- phpMyAdmin หรือ MySQL client สำหรับนำเข้า SQL

## เริ่มใช้งานในเครื่อง

### 1. สร้างฐานข้อมูล

1. เริ่ม MySQL แล้วเปิด phpMyAdmin
2. เลือก **Import** และนำเข้า `database/hospital_special_room.sql`
3. ในฐานข้อมูล `hospital_special_room` นำเข้า migration ตามลำดับ:
   - `database/migrations/20261111_ward_beds_qr.sql`
   - `database/migrations/20261112_qr_bed_assignment.sql`

ไฟล์ SQL ตั้งต้นจะสร้างฐานข้อมูลและตารางใหม่ หากนำเข้าอีกครั้งจะลบข้อมูลเดิมในตารางของระบบ **ห้ามนำเข้าไฟล์นี้ทับฐานข้อมูลที่ใช้งานอยู่** สำหรับฐานข้อมูลเดิมที่ยังไม่เคยเปลี่ยนโครงสร้าง ให้สำรองข้อมูลก่อน แล้วจึงทำ migration ที่ยังขาดอยู่เพียงครั้งเดียว Migration แรกเปลี่ยนโครงสร้างเดิมจากอาคาร/ห้องเป็น Ward/เตียง โดยคง ID และความสัมพันธ์ของประวัติไว้

### 2. ติดตั้ง Dependencies และตั้งค่า Backend

รันจากโฟลเดอร์หลักของโปรเจกต์:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

คัดลอก `backend/.env.example` เป็น `backend/.env` แล้วตั้งค่าการเชื่อมต่อฐานข้อมูลและ Session:

```dotenv
PORT=3001
FRONTEND_ORIGIN=http://localhost:5173
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=hospital_special_room
SESSION_SECRET=ใส่ค่าสุ่มที่คาดเดายาก
SESSION_SECURE=false
```

`PORT` และ `FRONTEND_ORIGIN` เป็นค่าทางเลือก โดยค่าเริ่มต้นคือ `3001` และ `http://localhost:5173` ตามลำดับ หาก MySQL มีรหัสผ่านให้กรอกที่ `DB_PASSWORD` ด้วย เมื่อนำขึ้นใช้งานจริงให้กำหนด `SESSION_SECRET` ที่คาดเดายาก และตั้ง `SESSION_SECURE=true` เมื่อให้บริการผ่าน HTTPS

สร้างบัญชีผู้ดูแลหลังตั้งค่าฐานข้อมูลแล้ว (รหัสผ่านอย่างน้อย 8 ตัวอักษร):

```bash
npm run admin:create --prefix backend -- admin "รหัสผ่านที่คาดเดายาก" "ชื่อผู้ดูแลระบบ"
```

### 3. เริ่มระบบ

จากโฟลเดอร์หลัก:

```bash
npm run dev
```

Frontend เปิดที่ `http://localhost:5173` และ Backend API เปิดที่ `http://localhost:3001` โดย Vite ส่งคำขอ `/api` ไปยัง Backend ตรวจสอบสถานะ API ได้ที่ `http://localhost:5173/api/health` กด `Ctrl+C` เพื่อหยุดระบบ

หากต้องการเปิดแยกกัน ใช้ `npm run dev:backend` หรือ `npm run dev:frontend` จากโฟลเดอร์หลัก หรือรัน `npm run dev` ภายในโฟลเดอร์ `backend`/`frontend` ตามลำดับ

Vite เปิดให้เข้าถึงจากอุปกรณ์ในเครือข่ายเดียวกันได้ หากทดสอบผ่านมือถือ ให้ใช้ IP ของคอมพิวเตอร์แทน `localhost` และตั้ง `FRONTEND_ORIGIN` ใน `backend/.env` ให้ตรงกับ URL ที่มือถือใช้เปิดเว็บ

## จัดการ Ward และเตียงจากไฟล์ Excel

คำสั่งนำเข้าต้องใช้ migration ทั้งสองรายการข้างต้นก่อน ไฟล์ Excel ต้องมีหัวคอลัมน์ในชีตแรกดังนี้:

- ไฟล์ Ward: `ward`, `name`, `bedcount`, `shortname`, `shortname2`, `is_active`
- ไฟล์เตียง: `bed_name`, `ward`
- `is_active` ใช้ `Y` หรือ `N`; รหัส Ward และคู่ Ward/เตียงในไฟล์ต้องไม่ซ้ำกัน

ตรวจสอบไฟล์โดยยังไม่เปลี่ยนฐานข้อมูล:

```powershell
npm run data:import --prefix backend -- --wards "C:\path\to\ward.xls" --beds "C:\path\to\bed_room_link.xls" --dry-run
```

เมื่อตรวจสอบผ่านแล้ว นำเข้าจริง:

```powershell
npm run data:import --prefix backend -- --wards "C:\path\to\ward.xls" --beds "C:\path\to\bed_room_link.xls"
```

การนำเข้าจริงจะสำรองฐานข้อมูลก่อนและเขียนข้อมูลภายใน Transaction โดยไม่ลบ Ward/เตียงหรือประวัติที่มีอยู่ รายการเดิมที่ไม่อยู่ในไฟล์จะถูกปิดใช้งาน ไม่ใช่ลบ `bedcount` เป็นเพียงข้อมูลจำนวนเตียงของ Ward; รายการเตียงจริงต้องมาจากไฟล์เตียง หากต้องการระบุชื่อไฟล์สำรองเอง เพิ่ม `--backup-file "C:\path\to\backup.sql"` ในคำสั่ง

## สำรองและดูแลฐานข้อมูล

สำรองฐานข้อมูลด้วย:

```powershell
npm run db:backup --prefix backend
```

ไฟล์ `.sql` จะถูกบันทึกใน `backend/backups/` โดยต้องมี `mysqldump` ใน PATH (หรือกำหนด `MYSQLDUMP_PATH` ใน environment) การสำรองฐานข้อมูล **ไม่รวมรูปภาพ** ให้สำรอง `backend/src/uploads/` แยกต่างหากด้วย

หากลบข้อมูลจนตารางที่มี `AUTO_INCREMENT` ว่างทั้งหมดและต้องการให้ ID เริ่มที่ 1:

```powershell
npm run db:reset-empty-ids --prefix backend
```

คำสั่งนี้รีเซ็ตเฉพาะตารางที่ว่าง ไม่ลบแถวข้อมูล หากต้องลบ Ward code `59` ให้ใช้ `database/migrations/20261111_delete_ward59_if_unreferenced.sql` เฉพาะเมื่อเข้าเงื่อนไขในไฟล์ Migration และสำรองฐานข้อมูลไว้ก่อน

## การใช้งาน

- **ผู้ประเมิน:** สแกน QR Code เพื่อเปิดแบบประเมิน หาก QR ผูกกับเตียง ระบบจะเลือกเตียงให้อัตโนมัติ หากไม่ผูกเตียง ผู้ประเมินเลือก Ward/เตียงที่ QR นั้นรองรับได้ สามารถส่งข้อเสนอแนะหรือแจ้งปัญหาและแนบรูปได้สูงสุด 3 รูป (JPG, PNG หรือ WEBP; รูปละไม่เกิน 5 MB)
- **ผู้ดูแล:** เข้าสู่ระบบที่ `/admin/login` เพื่อดู Dashboard จัดการผลประเมินและรายงานปัญหา ส่งออก CSV และจัดการ QR Code ที่ `/admin/qr-codes` รูปภาพรายงานดูได้เมื่อเข้าสู่ระบบผู้ดูแลแล้ว

## API โดยสรุป

Public API:

| Method | Endpoint | รายละเอียด |
| --- | --- | --- |
| `GET` | `/api/health` | ตรวจสอบสถานะ Backend |
| `GET` | `/api/qr/:token` | ข้อมูล Ward/เตียงที่ QR รองรับ |
| `GET` | `/api/wards` | รายการ Ward ที่เปิดใช้งาน |
| `GET` | `/api/beds?ward_id=:id` | รายการเตียงของ Ward |
| `GET` | `/api/problem-categories` | หมวดหมู่ปัญหา |
| `POST` | `/api/evaluations` | ส่งแบบประเมินและรูปภาพ |

Admin API ใช้ Session หลังเข้าสู่ระบบ:

| Method | Endpoint | รายละเอียด |
| --- | --- | --- |
| `POST` | `/api/admin/login`, `/api/admin/logout` | เข้าสู่ระบบและออกจากระบบ |
| `GET` | `/api/admin/me`, `/api/admin/dashboard` | ตรวจ Session และดู Dashboard |
| `GET` | `/api/admin/evaluations`, `/api/admin/evaluations/:id` | รายการและรายละเอียดผลประเมิน |
| `GET` | `/api/admin/problem-reports`, `/api/admin/problem-reports/:id` | รายการและรายละเอียดรายงานปัญหา |
| `GET` | `/api/admin/problem-images/:id` | ดูรูปภาพประกอบรายงาน |
| `GET` | `/api/admin/wards`, `PUT /api/admin/wards/:id/status` | ดูและเปลี่ยนสถานะ Ward |
| `GET`, `POST` | `/api/admin/qr-codes` | ดูและสร้าง QR Code |
| `PUT`, `DELETE` | `/api/admin/qr-codes/:id` | แก้ไขและลบ QR Code |
| `GET` | `/api/admin/export/csv` | ส่งออกผลประเมินเป็น CSV |

## Build และติดตั้งใช้งานจริง

สร้างไฟล์ Frontend สำหรับเผยแพร่:

```bash
npm run build
```

ไฟล์จะอยู่ใน `frontend/dist` ให้นำไปให้บริการผ่าน Web Server ที่รองรับ Single Page Application และตั้งค่าให้:

- ส่ง `index.html` สำหรับเส้นทาง Frontend ที่ไม่ใช่ไฟล์ static
- Reverse proxy `/api` ไปยัง Backend
- ใช้ origin เดียวกันสำหรับ Frontend/API เพื่อให้ Session Cookie ทำงาน
- ตั้ง `FRONTEND_ORIGIN` ให้ตรงกับโดเมน Frontend, ใช้ HTTPS และกำหนด `SESSION_SECURE=true`
- เก็บรักษา `backend/src/uploads/` ให้คงอยู่และสำรองทั้งไฟล์รูปภาพกับฐานข้อมูล

ระหว่างพัฒนา หาก Backend ไม่ได้อยู่ที่ `http://localhost:3001` ให้กำหนด `VITE_API_PROXY_TARGET` เป็น origin ของ Backend ก่อนเริ่ม Frontend (ไม่ต้องลงท้ายด้วย `/api`) เช่นใน PowerShell:

```powershell
$env:VITE_API_PROXY_TARGET="https://example.com"; npm run dev:frontend
```
