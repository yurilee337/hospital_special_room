# ระบบประเมินความพึงพอใจห้องพิเศษ

ระบบแยก Frontend React/Vite, Backend Node.js/Express REST API และฐานข้อมูล MySQL ใช้งานกับ MySQL ที่เปิดผ่าน XAMPP ได้ 

## สิ่งที่ต้องติดตั้ง

- Node.js 18 ขึ้นไป และ npm
- XAMPP โดยเปิด MySQL จาก XAMPP Control Panel
- phpMyAdmin (ใช้สำหรับนำเข้า SQL เท่านั้น)

## 1. สร้างฐานข้อมูล

1. เปิด XAMPP Control Panel แล้วกด **Start** ที่ MySQL
2. เปิด phpMyAdmin แล้วเลือก **Import**
3. เลือกไฟล์ `database/hospital_special_room.sql` และกด **Import** ไฟล์นี้จะลบและสร้างตารางใหม่ พร้อมเติมประเภทปัญหา ตึก และห้องตัวอย่าง
   **คำเตือน: การนำเข้าไฟล์นี้จะลบข้อมูลเดิมทั้งหมดในตารางของระบบ**
4. เพิ่มหรือแก้ไขตึกและห้องจากหน้าผู้ดูแลระบบหลังจากเริ่มระบบ

## 2. ติดตั้ง Dependencies และตั้งค่า Backend

จากโฟลเดอร์หลักของโปรเจกต์ ติดตั้ง Dependencies ของทั้งโปรเจกต์:

```bash
npm install
```

คัดลอก `backend/.env.example` เป็น `backend/.env` แล้วตรวจสอบค่าการเชื่อมต่อ MySQL ตัวอย่างค่าเริ่มต้นของ XAMPP:

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

หากตั้งรหัสผ่าน MySQL ใน XAMPP ให้กรอกค่าใน `DB_PASSWORD` ด้วย จากนั้นสร้างบัญชีผู้ดูแลจากโฟลเดอร์ `backend` (รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร; ระบุชื่อเต็มได้เป็นอาร์กิวเมนต์ที่ 3):

```bash
cd backend
npm run admin:create -- admin รหัสผ่านที่คาดเดายาก "ชื่อผู้ดูแลระบบ"
cd ..
```

## 3. เริ่มระบบสำหรับพัฒนา

หลัง Import ฐานข้อมูลและ Migration แล้ว ให้เปิด Terminal ที่โฟลเดอร์หลักของโปรเจกต์และรันคำสั่งเดียว:

```bash
npm run dev
```

คำสั่งนี้จะเริ่ม Backend และ Frontend พร้อมกัน โดย Backend ให้บริการที่ `http://localhost:3001` และ Frontend ที่ `http://localhost:5173`. Frontend เรียก API ผ่าน Vite proxy ที่ `/api` (เช่น `http://localhost:5173/api/health`) ซึ่งส่งต่อไป Backend พอร์ต 3001 กด `Ctrl+C` เพื่อหยุดทั้งสองระบบ

หากต้องการเปิดแยก Terminal ให้รัน `npm run dev:backend` หรือ `npm run dev:frontend` จากโฟลเดอร์หลัก หรือเข้าโฟลเดอร์ `backend`/`frontend` แล้วใช้ `npm run dev`. เริ่ม Backend แบบปกติได้ด้วย `npm start` ใน `backend`. Vite เปิดรับการเชื่อมต่อจากเครือข่ายในเครื่องแล้ว หากทดสอบผ่านมือถือให้ใช้ IP ของคอมพิวเตอร์แทน `localhost` และให้มือถือกับคอมพิวเตอร์อยู่เครือข่ายเดียวกัน

## อัปเดตฐานข้อมูลเดิมและนำเข้า Ward/เตียง

> **ห้าม Import `database/hospital_special_room.sql` ทับฐานข้อมูลที่ใช้งานอยู่** เพราะไฟล์เริ่มต้นลบและสร้างตารางใหม่ รวมถึงลบประวัติเดิม

1. ตั้งค่า `backend/.env` และติดตั้ง Dependencies ตามขั้นตอนข้างต้น
2. สำรองฐานข้อมูลก่อน Migration:

   ```powershell
   npm run db:backup --prefix backend
   ```

   ไฟล์สำรองเต็มฐานข้อมูลจะอยู่ใน `backend/backups/` และไม่ถูกนำเข้า Git
3. ใน phpMyAdmin เลือกฐานข้อมูล `hospital_special_room` แล้ว Import `database/migrations/20261111_ward_beds_qr.sql` หนึ่งครั้ง Migration นี้เพิ่มข้อมูล Ward/QR และเปลี่ยนชื่อตารางเดิมเป็น `wards`/`beds` โดยคง ID และความสัมพันธ์ประวัติไว้
4. Import `database/migrations/20261112_qr_bed_assignment.sql` ต่อจาก Migration ข้อ 3 เพื่อเปิดใช้ QR Code แบบล็อกเตียง
5. ตรวจไฟล์ Excel แบบไม่เปลี่ยนข้อมูลก่อน:

   ```powershell
   npm run data:import --prefix backend -- --wards "C:\Users\USER\Downloads\ward.xls" --beds "C:\Users\USER\Downloads\bed_room_link.xls" --dry-run
   ```

6. เมื่อตรวจสอบผ่าน ให้นำเข้าจริง:

   ```powershell
   npm run data:import --prefix backend -- --wards "C:\Users\USER\Downloads\ward.xls" --beds "C:\Users\USER\Downloads\bed_room_link.xls"
   ```

   คำสั่งนำเข้าจะสำรองฐานข้อมูลให้อีกครั้งก่อนเริ่ม Transaction ตรวจ Ward/เตียงซ้ำและ Ward ที่ไม่มีอยู่ก่อนเขียนข้อมูล โดยไม่ลบ Ward/เตียงเดิม แต่ปิดใช้งานรายการที่ไม่อยู่ในไฟล์ และไม่ลบประวัติการประเมิน ผู้ใช้ หรือข้อมูลส่วนอื่น `bedcount` เก็บเป็นข้อมูล Ward เท่านั้น ไม่ใช้สร้างเตียง; รายการเตียงมาจาก `bed_room_link.xls` เท่านั้น หากต้องการระบุไฟล์สำรองเอง เพิ่ม `--backup-file "C:\path\to\backup.sql"`

หากเคยสร้างฐานข้อมูลจาก SQL ก่อนหน้านี้ ให้ Import `database/migrations/20261111_delete_ward59_if_unreferenced.sql` ใน phpMyAdmin เพื่อลบ Ward code `59` พร้อมเตียง เฉพาะเมื่อไม่มีแบบประเมินหรือ QR Code อ้างอิงอยู่ หากยังมีข้อมูลอ้างอิง สคริปต์จะแจ้งผลและไม่ลบข้อมูล เพื่อป้องกันประวัติเสียหาย

### รีเซ็ต ID หลังลบข้อมูลจากฐานข้อมูล

MySQL จะไม่รีเซ็ต `AUTO_INCREMENT` เมื่อใช้ `DELETE` แม้ลบข้อมูลในตารางนั้นหมดแล้ว หลังลบข้อมูลใน phpMyAdmin/SQL ให้หยุดการเขียนข้อมูลจากแอปชั่วคราว แล้วรัน:

```powershell
npm run db:reset-empty-ids --prefix backend
```

คำสั่งนี้ตรวจทุกตารางในฐานข้อมูลที่มี `AUTO_INCREMENT` และรีเซ็ตเฉพาะตารางที่ว่างให้เริ่ม ID ที่ 1 ส่วนตารางที่ยังมีข้อมูลจะคงตัวนับเดิมไว้ และคำสั่งนี้จะไม่ลบข้อมูลใด ๆ หากใช้ `TRUNCATE TABLE` ตารางที่ถูกลบจะเริ่ม ID ที่ 1 อยู่แล้ว

## ตั้งค่า QR Code อาคาร

หลังเริ่มระบบและเข้าสู่ระบบผู้ดูแล เปิดเมนู **QR Code อาคารและเตียง** ที่ `/admin/qr-codes` เลือก Ward แล้วเลือกได้ว่าจะสร้าง QR สำหรับทุกเตียง (แยกหนึ่ง QR ต่อเตียง), เตียงใดเตียงหนึ่ง หรือไม่ผูกเตียงเพื่อให้ผู้ประเมินเลือกเอง เมื่อสแกน QR แบบผูกเตียง ระบบจะแสดงและล็อก Ward/เตียงให้อัตโนมัติ ส่วน QR แบบไม่ผูกเตียงยังเลือกเตียงในหน้าแบบประเมินได้

หลังสร้าง QR สามารถพิมพ์แยกรายการหรือพิมพ์ทั้งหมดได้ โดยใช้เทมเพลต A4 ที่ `frontend/public/templates/qr-ward-template.pdf` เป็นพื้นหลัง ชื่อ Ward และชื่อเตียงจะถูกวางทับบนเทมเพลต; QR แบบไม่ผูกเตียงจะแสดงคำว่า “สแกนตรงนี้” ในป้ายเตียง ต้องใช้ Migration `20261112_qr_bed_assignment.sql` ก่อนจึงจะสร้าง QR แบบผูกเตียงได้

ระบบไม่อนุมานอาคารจากชื่อ Ward และไม่สร้าง Mapping ให้อัตโนมัติ Ward ที่เปิดใช้งานแต่ยังไม่มี QR จะแสดงเป็นรายการที่ผู้ดูแลต้องกำหนด

Ward ที่ปิดใช้งานยังเก็บไว้ในระบบและในประวัติเดิม แสดงในหน้าจัดการ QR แต่เลือกสร้าง QR ใหม่ไม่ได้ และไม่แสดงเป็นตัวเลือกประเมินใหม่ ผู้ดูแลเปิด/ปิดได้ที่ระดับ Ward เท่านั้น โดยห้อง/เตียงใน Ward ที่ปิดใช้งานจะแสดงเป็นปิดใช้งานตามไปด้วย รายการ QR ในหน้าผู้ดูแลจัดกลุ่มตาม Ward และเลือกดู QR ตามเตียงได้ QR แบบไม่ผูกเตียงบันทึก `bed_id` เป็น `NULL` หากไม่เลือกเตียงในหน้าแบบประเมิน

หลัง Migration ระบบใช้ตาราง `wards` และ `beds` พร้อมคีย์ `ward_id`, `bed_id`, `bed_name` ตามความหมายจริง โดย Migration เปลี่ยนชื่อ table/column ของข้อมูลเดิมและคง ID กับ Foreign Key ไปยังประวัติแบบประเมินไว้ ส่วน `survey_qr_codes` แทนอาคารจริงและ `survey_qr_wards` เชื่อมอาคารกับ Ward โดยไม่อนุมานความสัมพันธ์จากชื่อ

## 4. Build Frontend สำหรับใช้งานจริง

```bash
npm run build
```

ไฟล์ Build จะอยู่ที่ `frontend/dist`. ระหว่างพัฒนา Vite proxy ส่งคำขอ `/api` ไป `http://localhost:3001` โดยค่าเริ่มต้น หาก Backend อยู่ที่อื่น ให้ตั้ง `VITE_API_PROXY_TARGET` เป็น origin ของ Backend (ไม่ต้องลงท้ายด้วย `/api`) ก่อนเริ่ม Frontend เช่น:

```bash
# macOS/Linux
VITE_API_PROXY_TARGET=https://example.com npm run dev:frontend

# PowerShell
$env:VITE_API_PROXY_TARGET="https://example.com"; npm run dev:frontend
```

## การใช้งาน

- ผู้ใช้: สแกน QR Code ของอาคาร เลือกเตียงจาก Ward ที่ผูกกับอาคาร (หรือเลือกไม่ระบุเตียง) ให้คะแนน และส่งข้อเสนอแนะ/แจ้งปัญหาได้
- ผู้ดูแล: เปิด `/admin/login` เพื่อดู Dashboard ผลประเมิน รายงานปัญหา ส่งออก CSV โดยเลือกกรอง Ward และสถานะมี/ไม่มีปัญหาได้ และกำหนด QR Code อาคารกับ Ward ผ่าน `/admin/qr-codes`
- เปลี่ยนรายการ Ward/เตียงด้วยคำสั่งนำเข้าด้านบน รายการที่เลิกใช้จะถูกปิดใช้งาน ไม่ลบแถวที่เชื่อมกับประวัติ

## API หลัก

Public API: `GET /api/qr/:token`, `GET /api/problem-categories`, `POST /api/evaluations` (ต้องส่ง `qr_token`; `bed_id` เลือกได้)

Admin API: `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/dashboard`, `GET /api/admin/evaluations`, `GET /api/admin/evaluations/:id`, `GET /api/admin/problem-reports`, `GET /api/admin/problem-reports/:id`, `GET /api/admin/wards`, `PUT /api/admin/wards/:id/status`, `GET/POST /api/admin/qr-codes`, `PUT/DELETE /api/admin/qr-codes/:id`, `GET /api/admin/export/csv`.

Admin API ที่เหลือต้องมี Session ผู้ดูแลที่ผ่านการยืนยันแล้ว รูปภาพรองรับ JPG/PNG/WEBP สูงสุด 3 รูป รูปละ 5 MB และอ่านรูปภาพได้เฉพาะผู้ดูแลที่เข้าสู่ระบบ แบบประเมินเก่าและผลประเมินที่ไม่ระบุเตียงยังแสดงในหน้ารายงานและส่งออกได้

นำไฟล์ใน `frontend/dist` ไปให้บริการผ่าน Web Server ที่รองรับ Single Page Application และกำหนดให้ Web Server ส่ง `index.html` สำหรับเส้นทาง Frontend ที่ไม่ใช่ไฟล์ static พร้อมตั้ง Web Server ให้ reverse proxy เส้นทาง `/api` ไปยัง Backend โดยใช้ origin เดียวกับ Frontend ในฝั่ง Backend ให้ตั้ง `SESSION_SECRET` ที่ปลอดภัย, `SESSION_SECURE=true` เมื่อให้บริการผ่าน HTTPS, จำกัด CORS ให้โดเมน Frontend ที่ถูกต้อง และกำหนดสิทธิ์/สำรองข้อมูล MySQL ตามนโยบายของโรงพยาบาล
