-- Apply once to an existing hospital_special_room database after taking a full backup.
-- Existing building/room IDs are preserved as Ward/bed IDs, including evaluation links.

ALTER TABLE buildings
  ADD COLUMN ward_code VARCHAR(30) NULL,
  ADD COLUMN ward_shortname VARCHAR(60) NULL,
  ADD COLUMN ward_shortname2 VARCHAR(60) NULL,
  ADD COLUMN bedcount INT UNSIGNED NOT NULL DEFAULT 0,
  ADD UNIQUE KEY uq_buildings_ward_code (ward_code);

UPDATE buildings
SET ward_code = SUBSTRING(building_code, 5)
WHERE ward_code IS NULL
  AND building_code LIKE 'ward%'
  AND SUBSTRING(building_code, 5) REGEXP '^[0-9]+$';

ALTER TABLE evaluations
  MODIFY COLUMN room_id INT NULL,
  ADD COLUMN building_id INT NULL AFTER room_id,
  ADD COLUMN qr_code_id BIGINT UNSIGNED NULL AFTER building_id,
  ADD INDEX idx_evaluation_building (building_id),
  ADD INDEX idx_evaluation_qr (qr_code_id);

UPDATE evaluations e
JOIN rooms r ON r.room_id = e.room_id
SET e.building_id = r.building_id
WHERE e.building_id IS NULL;

ALTER TABLE evaluations
  DROP FOREIGN KEY fk_evaluations_rooms,
  DROP INDEX idx_evaluation_room;

ALTER TABLE rooms
  DROP FOREIGN KEY fk_rooms_buildings,
  DROP INDEX unique_building_room,
  DROP INDEX idx_room_building;

ALTER TABLE buildings
  CHANGE COLUMN building_id ward_id INT NOT NULL AUTO_INCREMENT,
  CHANGE COLUMN building_name ward_name VARCHAR(150) NOT NULL,
  DROP INDEX uq_buildings_ward_code,
  DROP COLUMN building_code,
  ADD UNIQUE KEY uq_wards_ward_code (ward_code);

ALTER TABLE rooms
  CHANGE COLUMN room_id bed_id INT NOT NULL AUTO_INCREMENT,
  CHANGE COLUMN building_id ward_id INT NOT NULL,
  CHANGE COLUMN room_number bed_name VARCHAR(30) NOT NULL;

ALTER TABLE evaluations
  CHANGE COLUMN room_id bed_id INT NULL,
  CHANGE COLUMN building_id ward_id INT NULL,
  DROP INDEX idx_evaluation_building,
  ADD INDEX idx_evaluation_bed (bed_id),
  ADD INDEX idx_evaluation_ward (ward_id);

RENAME TABLE buildings TO wards, rooms TO beds;

ALTER TABLE beds
  ADD UNIQUE KEY uq_beds_ward_name (ward_id, bed_name),
  ADD INDEX idx_beds_ward (ward_id),
  ADD CONSTRAINT fk_beds_wards
    FOREIGN KEY (ward_id) REFERENCES wards(ward_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE TABLE survey_qr_codes (
  qr_code_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  qr_token VARCHAR(128) NOT NULL UNIQUE,
  building_name VARCHAR(150) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE survey_qr_wards (
  qr_code_id BIGINT UNSIGNED NOT NULL,
  ward_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (qr_code_id, ward_id),
  INDEX idx_survey_qr_wards_ward (ward_id),
  CONSTRAINT fk_survey_qr_wards_qr
    FOREIGN KEY (qr_code_id) REFERENCES survey_qr_codes(qr_code_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_survey_qr_wards_wards
    FOREIGN KEY (ward_id) REFERENCES wards(ward_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE evaluations
  ADD CONSTRAINT fk_evaluations_beds
    FOREIGN KEY (bed_id) REFERENCES beds(bed_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_evaluations_wards
    FOREIGN KEY (ward_id) REFERENCES wards(ward_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_evaluations_survey_qr
    FOREIGN KEY (qr_code_id) REFERENCES survey_qr_codes(qr_code_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;
